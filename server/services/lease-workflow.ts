import {createHash} from 'node:crypto';
import type {PoolClient,QueryResultRow} from 'pg';
import type {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import {leaseStageLabels,leaseWorkflowStages,type LeaseWorkflowStage,type LeaseEvidenceKind,type LeaseWorkflowWorkspace,type LeaseWorkflowSettings,type MoveInTaskTemplate,type leaseWorkflowCreateSchema,type leaseWorkflowTransitionSchema,type leaseWorkflowActionSchema,type leaseWorkflowSettingsSchema} from '../../shared/lease-workflow-contracts.js';
import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import {ApiError} from '../http/errors.js';
import {staffApplicationAccess,staffOrganizationAccess,isApplicationReviewer,type ApplicationRow} from './application-access.js';
import {isIsolatedDemo,requireIsolatedDemo} from './demo-environment.js';
import {assertFieldOwnership} from './property-foundation.js';
import {syncLeadApplicationSummary,leadStageGraphs} from './leads.js';
import {Tasks} from './tasks.js';
import {addLocalDays,localDate,localMinute,localInstants} from './calendar-time.js';
type Row=QueryResultRow;
const iso=(v:unknown):string|null=>v?(v instanceof Date?v:new Date(String(v))).toISOString():null;
const day=(v:unknown):string|null=>v instanceof Date?[v.getFullYear(),String(v.getMonth()+1).padStart(2,'0'),String(v.getDate()).padStart(2,'0')].join('-'):v?String(v).slice(0,10):null;
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const defaultTemplates:MoveInTaskTemplate[]=[{key:'welcome',title:'Confirm move-in arrangements',dayOffset:-1,priority:'normal'},{key:'handover',title:'Complete move-in handover',dayOffset:0,priority:'high'}];
export const leaseWorkflowGraph:Record<LeaseWorkflowStage,LeaseWorkflowStage[]>={lease_preparation:['signature_requested'],signature_requested:['partially_signed'],partially_signed:['fully_signed'],fully_signed:['move_in_scheduled'],move_in_scheduled:['completed'],completed:[]};
export class LeaseWorkflowService{
 constructor(private readonly database:Database,private readonly config:ServerConfig){}
 private async demoAvailable(c:PoolClient,a:ApplicationRow):Promise<boolean>{return await isIsolatedDemo(this.config,c)&&Boolean((await c.query("SELECT id FROM organizations WHERE id=$1 AND environment='demo'",[a.organization_id])).rowCount);}
 private async providerOwned(c:PoolClient,a:ApplicationRow):Promise<boolean>{return a.source_system==='yardi'||Array.isArray(a.source_owned_fields)&&a.source_owned_fields.length>0||Boolean((await c.query("SELECT id FROM external_record_mappings WHERE organization_id=$1 AND application_id=$2 AND provider='yardi'",[a.organization_id,a.id])).rowCount);}
 private async local(c:PoolClient,u:AuthUser,a:ApplicationRow):Promise<void>{if(await this.providerOwned(c,a))throw new ApiError(409,'SOURCE_OWNED_FIELD','The configured provider owns this application. Its lease/signature transport has not been verified; no upstream update is attempted.');await assertFieldOwnership(c,u,'application',a.id,['status']);}
 private async decision(c:PoolClient,a:ApplicationRow):Promise<Row|null>{return(await c.query('SELECT decision,created_at FROM application_decisions WHERE organization_id=$1 AND application_id=$2 ORDER BY created_at DESC,id LIMIT 1',[a.organization_id,a.id])).rows[0]??null;}
 private async approved(c:PoolClient,a:ApplicationRow):Promise<void>{if(!['submitted','staff_review'].includes(a.status)||(await this.decision(c,a))?.decision!=='approved')throw new ApiError(409,'STAFF_APPROVAL_REQUIRED','An authorized staff application approval is required before progressing this lease. Screening and payment results do not approve an application.');}
 private async settingsRow(c:PoolClient,organizationId:string):Promise<Row|null>{return(await c.query('SELECT * FROM organization_lease_settings WHERE organization_id=$1',[organizationId])).rows[0]??null;}
 private settingsDto(row:Row|null,demo=false):LeaseWorkflowSettings{return{configured:Boolean(row),leasedMilestone:row?.leased_milestone??'fully_signed',moveInTasks:row?.move_in_tasks??(demo?defaultTemplates:[]),notice:row?'Settings are copied to each new workflow. Existing workflow evidence and configured milestones remain unchanged.':demo?'Isolated demonstration defaults will be saved only when authorized staff creates a lease workflow.':'An organization administrator must configure the lease milestone and move-in tasks. Live signing transport is not configured; any supported local process requires explicit staff attestation.'};}
 private async event(c:PoolClient,a:ApplicationRow,u:AuthUser,kind:string,summary:string,metadata:Record<string,unknown>):Promise<void>{
  await c.query('INSERT INTO application_portal_events(organization_id,application_id,actor_user_id,actor_kind,kind,summary,metadata) VALUES($1,$2,$3,\'staff\',$4,$5,$6)',[a.organization_id,a.id,u.id,kind,summary,JSON.stringify(metadata)]);
  await c.query('INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,$3,$4)',[a.organization_id,u.id,'application.'+kind,JSON.stringify({applicationId:a.id,...metadata})]);
 }
 private async receipt(c:PoolClient,a:ApplicationRow,u:AuthUser,key:string,operation:string,payload:unknown,run:()=>Promise<Row>):Promise<Row>{
  const payloadHash=hash(payload),prior=(await c.query('SELECT * FROM lease_action_receipts WHERE organization_id=$1 AND application_id=$2 AND request_key=$3',[a.organization_id,a.id,key])).rows[0];
  if(prior){if(prior.actor_user_id!==u.id||prior.operation!==operation||prior.payload_hash!==payloadHash)throw new ApiError(409,'REQUEST_KEY_REUSED','Use a new request identifier for a different lease action.');return prior.result;}
  const result=await run();await c.query('INSERT INTO lease_action_receipts(organization_id,application_id,request_key,actor_user_id,operation,payload_hash,result) VALUES($1,$2,$3,$4,$5,$6,$7)',[a.organization_id,a.id,key,u.id,operation,payloadHash,JSON.stringify(result)]);return result;
 }
 private async workflow(c:PoolClient,a:ApplicationRow):Promise<Row|null>{return(await c.query('SELECT w.*,l.starts_on::text AS starts_on,l.ends_on::text AS ends_on,l.status AS lease_status,l.source_system,l.source_owned_fields,l.contact_id,l.property_id,l.unit_id,l.lead_id,l.application_id AS lease_application_id FROM lease_workflows w JOIN leases l ON l.id=w.lease_id AND l.organization_id=w.organization_id WHERE w.organization_id=$1 AND w.application_id=$2 FOR UPDATE OF w',[a.organization_id,a.id])).rows[0]??null;}
 private async zone(c:PoolClient,a:ApplicationRow):Promise<string>{return(await c.query('SELECT time_zone FROM property_viewing_settings WHERE organization_id=$1 AND property_id=$2',[a.organization_id,a.property_id])).rows[0]?.time_zone??'Africa/Lagos';}
 async settings(u:AuthUser,digest:string):Promise<LeaseWorkflowSettings>{return this.database.transaction(async c=>{const actor=await staffOrganizationAccess(c,this.config,u,digest);if(actor.organization.role!=='organization_admin')throw new ApiError(403,'LEASE_ADMIN_REQUIRED','An organization administrator must configure lease policy.');return this.settingsDto(await this.settingsRow(c,actor.organization.id),await isIsolatedDemo(this.config,c));});}
 async saveSettings(u:AuthUser,digest:string,input:z.infer<typeof leaseWorkflowSettingsSchema>):Promise<LeaseWorkflowSettings>{
  return this.database.transaction(async c=>{
   const actor=await staffOrganizationAccess(c,this.config,u,digest);if(actor.organization.role!=='organization_admin')throw new ApiError(403,'LEASE_ADMIN_REQUIRED','An organization administrator must configure lease policy.');
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ootla.lease.settings:'+actor.organization.id]);
   const payload=hash({leasedMilestone:input.leasedMilestone,moveInTasks:input.moveInTasks}),prior=(await c.query('SELECT * FROM lease_configuration_receipts WHERE organization_id=$1 AND request_key=$2',[actor.organization.id,input.requestKey])).rows[0];
   if(prior){if(prior.actor_user_id!==actor.id||prior.payload_hash!==payload)throw new ApiError(409,'REQUEST_KEY_REUSED','Use a new request key for different lease settings.');return this.settingsDto(await this.settingsRow(c,actor.organization.id));}
   await c.query('INSERT INTO organization_lease_settings(organization_id,leased_milestone,move_in_tasks,configured_by_user_id) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id) DO UPDATE SET leased_milestone=EXCLUDED.leased_milestone,move_in_tasks=EXCLUDED.move_in_tasks,configured_by_user_id=EXCLUDED.configured_by_user_id,updated_at=now()',[actor.organization.id,input.leasedMilestone,JSON.stringify(input.moveInTasks),actor.id]);
   await c.query('INSERT INTO lease_configuration_receipts(organization_id,request_key,actor_user_id,payload_hash) VALUES($1,$2,$3,$4)',[actor.organization.id,input.requestKey,actor.id,payload]);
   await c.query("INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,'lease.settings_configured',$3)",[actor.organization.id,actor.id,JSON.stringify({leasedMilestone:input.leasedMilestone,templateKeys:input.moveInTasks.map(t=>t.key)})]);
   return this.settingsDto(await this.settingsRow(c,actor.organization.id));
  });
 }
 private async snapshot(c:PoolClient,u:AuthUser,a:ApplicationRow):Promise<LeaseWorkflowWorkspace>{
  const demo=await this.demoAvailable(c,a),owned=await this.providerOwned(c,a),review=isApplicationReviewer(u.organization.role),w=await this.workflow(c,a),settings=this.settingsDto(await this.settingsRow(c,a.organization_id),demo),decision=await this.decision(c,a);
  const canAdvance=review&&!owned&&decision?.decision==='approved'&&['submitted','staff_review'].includes(a.status);
  const events=w?(await c.query('SELECT e.*,u.display_name FROM lease_workflow_events e JOIN users u ON u.id=e.actor_user_id WHERE e.organization_id=$1 AND e.workflow_id=$2 ORDER BY e.created_at DESC,e.id LIMIT 100',[a.organization_id,w.id])).rows.map(e=>({id:e.id,fromStage:e.previous_stage,toStage:e.stage,evidenceKind:e.evidence_kind,reference:e.evidence_reference,actorName:e.display_name,occurredAt:iso(e.created_at)!,simulated:demo||e.evidence_kind==='demo_event'})):[];
  const tasks=w?(await c.query("SELECT t.id,t.title,t.due_at,t.status,u.display_name FROM task_creation_receipts r JOIN tasks t ON t.id=r.task_id AND t.organization_id=r.organization_id LEFT JOIN organization_memberships m ON m.id=t.owner_membership_id AND m.organization_id=t.organization_id LEFT JOIN users u ON u.id=m.user_id WHERE r.organization_id=$1 AND r.namespace='lease_move_in' AND r.request_key LIKE $2 ORDER BY t.due_at,t.id",[a.organization_id,w.id+':%'])).rows.map(t=>({id:t.id,title:t.title,dueAt:iso(t.due_at)!,status:t.status,ownerName:t.display_name??null})):[];
  const residentCount=w?Number((await c.query('SELECT count(*) AS total FROM resident_relationships WHERE organization_id=$1 AND lease_id=$2',[a.organization_id,w.lease_id])).rows[0]!.total):0;
  const mode=owned?'unsupported_provider':demo?'demo':settings.configured?'manual':'not_configured';
  return{applicationId:a.id,mode,workflow:w?{id:w.id,leaseId:w.lease_id,stage:w.stage,stageLabel:leaseStageLabels[w.stage as LeaseWorkflowStage],startsOn:day(w.starts_on)!,endsOn:day(w.ends_on),moveInAt:iso(w.move_in_at),version:w.version,leasedMilestone:w.leased_milestone,signatureEvidenceKind:w.signature_evidence_kind,signatureVerifiedAt:iso(w.signature_verified_at),leadId:a.lead_id,residentCount,simulated:demo||w.signature_evidence_kind==='demo_event'}:null,latestDecision:decision?{decision:decision.decision,createdAt:iso(decision.created_at)!}:null,propertyTimeZone:await this.zone(c,a),allowedTransitions:canAdvance&&w?leaseWorkflowGraph[w.stage as LeaseWorkflowStage].map(key=>({key,label:leaseStageLabels[key]})):[],evidenceKinds:demo?['demo_event','manual_attestation']:['manual_attestation'],events,tasks,settings,notice:owned?'Provider-owned lease/signature transport is not configured. No local action can replace authoritative provider evidence.':demo?'Isolated lease and move-in demonstration. Synthetic signature events are distinct from authorized manual attestation; no live signing API is connected.':'Manual staff-attested lease process. No live signing API is connected. A PDF upload is not verified signature evidence.',access:{canCreate:canAdvance&&!w&&(demo||settings.configured),canTransition:Boolean(canAdvance&&w&&leaseWorkflowGraph[w.stage as LeaseWorkflowStage].length),canReopen:review&&!owned&&!w&&decision?.decision==='request_information'&&a.status!=='draft',canConfigure:u.organization.role==='organization_admin'}};
 }
 async workspace(u:AuthUser,digest:string,id:string):Promise<LeaseWorkflowWorkspace>{return this.database.transaction(async c=>{const{actor,application:a}=await staffApplicationAccess(c,this.config,u,digest,id);return this.snapshot(c,actor,a);});}
 private async leadPending(c:PoolClient,u:AuthUser,a:ApplicationRow):Promise<Row|null>{
  if(!a.lead_id)return null;
  const lead=(await c.query('SELECT * FROM leads WHERE organization_id=$1 AND id=$2 FOR UPDATE',[a.organization_id,a.lead_id])).rows[0];
  if(!lead||lead.intent!=='leasing'||['lost_closed','won','leased'].includes(lead.pipeline_stage))throw new ApiError(409,'LEASE_LEAD_CONTEXT_INVALID','Use an open leasing lead with this application and canonical contact.');
  const path:Record<string,string>={new_inquiry:'contacted',contacted:'application_started',tour_scheduled:'application_started',application_started:'application_submitted',application_submitted:'staff_review',staff_review:'lease_pending'};
  while(lead.pipeline_stage!=='lease_pending'){
   const target=path[lead.pipeline_stage];
   if(!target||!leadStageGraphs.leasing[lead.pipeline_stage]?.includes(target))throw new ApiError(409,'LEASE_LEAD_STAGE_INVALID','The lead cannot reconcile through the required application milestones.');
   const previous=lead.pipeline_stage;await c.query('UPDATE leads SET pipeline_stage=$3,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2',[a.organization_id,lead.id,target]);
   await c.query("INSERT INTO lead_events(organization_id,lead_id,kind,previous_stage,stage,actor_user_id,actor_membership_id,metadata) VALUES($1,$2,'stage_changed',$3,$4,$5,$6,$7)",[a.organization_id,lead.id,previous,target,u.id,u.membershipId,JSON.stringify({source:'application_lease_workflow',applicationId:a.id,reason:'Staff-approved application milestone reconciliation'})]);
   lead.pipeline_stage=target;
  }return lead;
 }
 async create(u:AuthUser,digest:string,id:string,input:z.infer<typeof leaseWorkflowCreateSchema>):Promise<LeaseWorkflowWorkspace>{
  await this.database.transaction(async c=>{
   const{actor,application:a}=await staffApplicationAccess(c,this.config,u,digest,id,{lock:true,review:true});await this.local(c,actor,a);await this.approved(c,a);
   await this.receipt(c,a,actor,input.requestKey,'create',{startsOn:input.startsOn,endsOn:input.endsOn},async()=>{
    const existing=await this.workflow(c,a);if(existing){if(day(existing.starts_on)!==input.startsOn||day(existing.ends_on)!==input.endsOn)throw new ApiError(409,'LEASE_WORKFLOW_EXISTS','This application already has a lease workflow with recorded dates.');return{workflowId:existing.id};}
    let settings=await this.settingsRow(c,a.organization_id);
    if(!settings){if(!await this.demoAvailable(c,a))throw new ApiError(503,'LEASE_SETTINGS_REQUIRED','An organization administrator must configure the valid lease milestone and move-in tasks.');await c.query("INSERT INTO organization_lease_settings(organization_id,leased_milestone,move_in_tasks,configured_by_user_id) VALUES($1,'fully_signed',$2,$3) ON CONFLICT(organization_id) DO NOTHING",[a.organization_id,JSON.stringify(defaultTemplates),actor.id]);settings=await this.settingsRow(c,a.organization_id);}
    await c.query("UPDATE applications SET status='staff_review',portal_version=portal_version+1,updated_at=now() WHERE id=$1 AND organization_id=$2 AND status<>'staff_review'",[a.id,a.organization_id]);a.status='staff_review';await syncLeadApplicationSummary(c,actor,[a.lead_id]);await this.leadPending(c,actor,a);
    const leases=(await c.query('SELECT *,starts_on::text AS starts_on,ends_on::text AS ends_on FROM leases WHERE organization_id=$1 AND application_id=$2 ORDER BY created_at,id FOR UPDATE',[a.organization_id,a.id])).rows;
    if(leases.length>1)throw new ApiError(409,'AMBIGUOUS_APPLICATION_LEASES','Multiple existing leases need authorized staff reconciliation before this workflow can start.');
    let lease=leases[0];
    if(lease){if(lease.status!=='draft'||lease.source_system!=='local'||lease.source_owned_fields.length||lease.contact_id!==a.contact_id||lease.property_id!==a.property_id||lease.unit_id!==a.unit_id||lease.lead_id!==a.lead_id)throw new ApiError(409,'EXISTING_LEASE_REQUIRES_REVIEW','The existing lease cannot be safely adopted by this local draft workflow.');await assertFieldOwnership(c,actor,'lease',lease.id,['status','startsOn','endsOn']);await c.query('UPDATE leases SET starts_on=$2,ends_on=$3,updated_at=now() WHERE id=$1',[lease.id,input.startsOn,input.endsOn]);}
    else lease=(await c.query("INSERT INTO leases(organization_id,contact_id,property_id,unit_id,application_id,lead_id,status,starts_on,ends_on,source_system) VALUES($1,$2,$3,$4,$5,$6,'draft',$7,$8,'local') RETURNING *",[a.organization_id,a.contact_id,a.property_id,a.unit_id,a.id,a.lead_id,input.startsOn,input.endsOn])).rows[0]!;
    const w=(await c.query('INSERT INTO lease_workflows(organization_id,application_id,lease_id,leased_milestone,move_in_task_templates,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[a.organization_id,a.id,lease.id,settings!.leased_milestone,JSON.stringify(settings!.move_in_tasks),actor.id])).rows[0]!;
    await c.query("INSERT INTO lease_workflow_events(organization_id,workflow_id,previous_stage,stage,actor_user_id,actor_membership_id,request_key) VALUES($1,$2,NULL,'lease_preparation',$3,$4,$5)",[a.organization_id,w.id,actor.id,actor.membershipId,input.requestKey]);
    await this.event(c,a,actor,'lease_preparation_created','Authorized staff opened lease preparation from the approved CRM application.',{workflowId:w.id,leaseId:lease.id,simulated:await this.demoAvailable(c,a)});
    return{workflowId:w.id};
   });
  });return this.workspace(u,digest,id);
 }
 private async ensureLease(c:PoolClient,u:AuthUser,a:ApplicationRow,w:Row):Promise<Row>{
  const l=(await c.query('SELECT *,starts_on::text AS starts_on,ends_on::text AS ends_on FROM leases WHERE id=$1 AND organization_id=$2 AND application_id=$3 AND property_id=$4 AND contact_id=$5 AND lead_id IS NOT DISTINCT FROM $6::uuid AND unit_id IS NOT DISTINCT FROM $7::uuid FOR UPDATE',[w.lease_id,a.organization_id,a.id,a.property_id,a.contact_id,a.lead_id,a.unit_id])).rows[0];
  if(!l||l.source_system!=='local'||l.source_owned_fields.length)throw new ApiError(409,'LEASE_CONTEXT_CHANGED','The local lease identity or source changed. Staff must reconcile it before advancing.');
  await assertFieldOwnership(c,u,'lease',l.id,['status','startsOn','endsOn','applicationId','contactId','propertyId','unitId','leadId']);return l;
 }
 private async residents(c:PoolClient,a:ApplicationRow,w:Row,kind:LeaseEvidenceKind,complete=false):Promise<void>{
  const people=(await c.query("SELECT ap.contact_id FROM application_participants ap WHERE ap.organization_id=$1 AND ap.application_id=$2 AND ap.active AND ap.property_id=$3 AND (ap.role='primary' AND ap.contact_id=$4 OR ap.role='co_applicant' AND $5) AND EXISTS(SELECT 1 FROM contact_property_links cp WHERE cp.contact_id=ap.contact_id AND cp.organization_id=ap.organization_id AND cp.property_id=ap.property_id)",[a.organization_id,a.id,a.property_id,a.contact_id,a.co_applicants_enabled])).rows.map(p=>p.contact_id);
  for(const contactId of new Set([a.contact_id,...people]))await c.query('INSERT INTO resident_relationships(organization_id,contact_id,property_id,unit_id,application_id,lease_id,lead_id,source,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(organization_id,lease_id,contact_id) DO NOTHING',[a.organization_id,contactId,a.property_id,a.unit_id,a.id,w.lease_id,a.lead_id,kind,complete?'active':'pending_move_in']);
  if(complete)await c.query("UPDATE resident_relationships SET status='active' WHERE organization_id=$1 AND lease_id=$2",[a.organization_id,w.lease_id]);
 }
 private async milestone(c:PoolClient,u:AuthUser,a:ApplicationRow,w:Row,kind:LeaseEvidenceKind,reference:string):Promise<void>{
  if(!a.lead_id)return;
  const lease=await this.ensureLease(c,u,a,w),lead=(await c.query('SELECT * FROM leads WHERE organization_id=$1 AND id=$2 FOR UPDATE',[a.organization_id,a.lead_id])).rows[0];
  if(!lead||lead.intent!=='leasing'||!['lease_pending','leased'].includes(lead.pipeline_stage))throw new ApiError(409,'LEASE_LEAD_STAGE_INVALID','The lead must have the reviewed application and lease-pending milestones before becoming Leased.');
  if(lease.status!=='active'||!lease.starts_on)throw new ApiError(409,'LEASE_NOT_ACTIVE','A signature-attested active lease with a start date is required.');
  const inserted=await c.query('INSERT INTO lease_verified_milestones(organization_id,lead_id,lease_id,property_id,contact_id,evidence_reference,verified_by_user_id,verified_by_membership_id,lease_updated_at,evidence_kind) VALUES($1,$2,$3,$4,$5,$6,$7,$8,(SELECT updated_at FROM leases WHERE id=$3 AND organization_id=$1),$9) ON CONFLICT(organization_id,lease_id,lease_updated_at) DO NOTHING RETURNING id',[a.organization_id,a.lead_id,lease.id,a.property_id,a.contact_id,reference,u.id,u.membershipId,kind]);
  if(inserted.rowCount)await c.query("INSERT INTO lead_events(organization_id,lead_id,kind,stage,actor_user_id,actor_membership_id,metadata) VALUES($1,$2,'lease_verified',$3,$4,$5,$6)",[a.organization_id,a.lead_id,lead.pipeline_stage,u.id,u.membershipId,JSON.stringify({leaseId:lease.id,workflowId:w.id,evidenceKind:kind,simulated:kind==='demo_event',configuredMilestone:w.leased_milestone})]);
  if(lead.pipeline_stage!=='leased'){
   await c.query("UPDATE leads SET pipeline_stage='leased',version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2",[a.organization_id,a.lead_id]);
   await c.query("INSERT INTO lead_events(organization_id,lead_id,kind,previous_stage,stage,actor_user_id,actor_membership_id,metadata) VALUES($1,$2,'stage_changed','lease_pending','leased',$3,$4,$5)",[a.organization_id,a.lead_id,u.id,u.membershipId,JSON.stringify({source:'lease_workflow',workflowId:w.id,evidenceKind:kind,simulated:kind==='demo_event',configuredMilestone:w.leased_milestone})]);
  }
 }
 private taskDue(moveInAt:Date,offset:number,zone:string):string{
  const targetDate=addLocalDays(localDate(moveInAt,zone),offset),candidates=localInstants(targetDate,localMinute(moveInAt,zone),zone);
  if(candidates.length!==1)throw new ApiError(409,'MOVE_IN_TASK_TIME_UNAVAILABLE','A configured task offset falls in an ambiguous or missing property-local time. Choose a different move-in time or task offset.');
  return new Date(candidates[0]!.getTime()+moveInAt.getUTCSeconds()*1000+moveInAt.getUTCMilliseconds()).toISOString();
 }
 async transition(u:AuthUser,digest:string,id:string,input:z.infer<typeof leaseWorkflowTransitionSchema>):Promise<LeaseWorkflowWorkspace>{
  await this.database.transaction(async c=>{
   const{actor,application:a}=await staffApplicationAccess(c,this.config,u,digest,id,{lock:true,review:true});await this.local(c,actor,a);await this.approved(c,a);
   if(input.evidence.kind==='demo_event')await requireIsolatedDemo(this.config,c);
   await this.receipt(c,a,actor,input.requestKey,'transition',{stage:input.stage,evidence:input.evidence,moveInAt:input.moveInAt??null},async()=>{
    const w=await this.workflow(c,a);if(!w)throw new ApiError(409,'LEASE_WORKFLOW_REQUIRED','Create this application lease workflow first.');
    const lease=await this.ensureLease(c,actor,a,w);
    if(w.stage===input.stage){
     const latest=(await c.query('SELECT evidence_kind,evidence_reference FROM lease_workflow_events WHERE workflow_id=$1 AND organization_id=$2 ORDER BY created_at DESC,id LIMIT 1',[w.id,a.organization_id])).rows[0];
     if(latest?.evidence_kind===input.evidence.kind&&latest?.evidence_reference===input.evidence.reference&&(!input.moveInAt||iso(w.move_in_at)===new Date(input.moveInAt).toISOString()))return{workflowId:w.id};
     throw new ApiError(409,'LEASE_STAGE_ALREADY_RECORDED','This stage already has different immutable evidence. Staff must review it.');
    }
    if(!leaseWorkflowGraph[w.stage as LeaseWorkflowStage].includes(input.stage))throw new ApiError(409,'LEASE_STAGE_TRANSITION_DENIED','Complete the next required lease stage; stage skips are not permitted.');
    const zone=await this.zone(c,a);let moveInAt:Date|null=w.move_in_at?new Date(w.move_in_at):null;
    if(input.stage==='move_in_scheduled'){
     if(!input.moveInAt)throw new ApiError(400,'MOVE_IN_TIME_REQUIRED','Record the agreed property-local move-in date and time.');
     moveInAt=new Date(input.moveInAt);if(localDate(moveInAt,zone)<day(lease.starts_on)!)throw new ApiError(409,'MOVE_IN_BEFORE_LEASE','Move-in cannot precede the lease start date.');
    }else if(input.moveInAt)throw new ApiError(400,'MOVE_IN_TIME_NOT_APPLICABLE','Set the move-in time only at the Move-in scheduled stage.');
    if(input.stage==='completed'&&(!moveInAt||input.evidence.kind==='manual_attestation'&&moveInAt.getTime()>Date.now()))throw new ApiError(409,'MOVE_IN_NOT_OCCURRED','Record completion only after the scheduled move-in. Isolated demonstration events must be labeled explicitly.');
    if(input.stage==='fully_signed'){
     if(!lease.starts_on)throw new ApiError(409,'LEASE_START_REQUIRED','Record the lease start date before signature completion.');
     if(lease.unit_id){
      if(!(await c.query('SELECT id FROM units WHERE organization_id=$1 AND property_id=$2 AND id=$3 FOR UPDATE',[a.organization_id,a.property_id,lease.unit_id])).rowCount)throw new ApiError(409,'LEASE_UNIT_UNAVAILABLE','The recorded unit is unavailable in this property context.');
      if((await c.query("SELECT id FROM leases WHERE organization_id=$1 AND unit_id=$2 AND id<>$3 AND status='active' AND daterange(starts_on,ends_on,'[]') && daterange($4::date,$5::date,'[]') LIMIT 1",[a.organization_id,lease.unit_id,lease.id,day(lease.starts_on),day(lease.ends_on)])).rowCount)throw new ApiError(409,'LEASE_UNIT_CONFLICT','Another active lease overlaps these dates for this unit. Staff must reconcile the lease records.');
     }
     await c.query("UPDATE leases SET status='active',updated_at=now() WHERE id=$1",[lease.id]);
     await c.query('UPDATE lease_workflows SET signature_evidence_kind=$2,signature_evidence_reference=$3,signature_verified_at=clock_timestamp() WHERE id=$1',[w.id,input.evidence.kind,input.evidence.reference]);
     w.signature_evidence_kind=input.evidence.kind;w.signature_evidence_reference=input.evidence.reference;
     await this.residents(c,a,w,input.evidence.kind);
    }
    await c.query('UPDATE lease_workflows SET stage=$2,move_in_at=$3,version=version+1,updated_at=now() WHERE id=$1',[w.id,input.stage,moveInAt]);
    await c.query('INSERT INTO lease_workflow_events(organization_id,workflow_id,previous_stage,stage,evidence_kind,evidence_reference,actor_user_id,actor_membership_id,request_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[a.organization_id,w.id,w.stage,input.stage,input.evidence.kind,input.evidence.reference,actor.id,actor.membershipId,input.requestKey]);
    const oldStage=w.stage;w.stage=input.stage;w.move_in_at=moveInAt;
    if(input.stage===w.leased_milestone){const kind=w.signature_evidence_kind==='demo_event'||input.evidence.kind==='demo_event'?'demo_event':'manual_attestation';await this.milestone(c,actor,a,w,kind,input.evidence.reference);}
    if(input.stage==='move_in_scheduled'){
     for(const template of w.move_in_task_templates as MoveInTaskTemplate[])await new Tasks(this.database).createLinked(c,actor,{propertyId:a.property_id,leadId:a.lead_id,contactId:a.contact_id,applicationId:a.id,tourId:null,title:template.title,details:'Move-in task linked to the existing application and lease workflow.',dueAt:this.taskDue(moveInAt!,template.dayOffset,zone),priority:template.priority,ownerMembershipId:null,assignment:'routing'},{requestKey:w.id+':'+template.key,namespace:'lease_move_in',origin:'system',purpose:'move_in'});
    }
    if(input.stage==='completed')await this.residents(c,a,w,w.signature_evidence_kind==='demo_event'||input.evidence.kind==='demo_event'?'demo_event':'manual_attestation',true);
    await this.event(c,a,actor,'lease_workflow_transition','Authorized staff recorded '+leaseStageLabels[input.stage]+'. Signature evidence, application decisions and payment status remain distinct.',{workflowId:w.id,leaseId:w.lease_id,previousStage:oldStage,stage:input.stage,evidenceKind:input.evidence.kind,simulated:input.evidence.kind==='demo_event'});
    return{workflowId:w.id};
   });
  });return this.workspace(u,digest,id);
 }
 async reopen(u:AuthUser,digest:string,id:string,input:z.infer<typeof leaseWorkflowActionSchema>):Promise<LeaseWorkflowWorkspace>{
  await this.database.transaction(async c=>{
   const{actor,application:a}=await staffApplicationAccess(c,this.config,u,digest,id,{lock:true,review:true});await this.local(c,actor,a);
   await this.receipt(c,a,actor,input.requestKey,'reopen',{},async()=>{
    if((await this.decision(c,a))?.decision!=='request_information'||await this.workflow(c,a))throw new ApiError(409,'APPLICATION_REOPEN_DENIED','Reopening requires a staff information request and no active lease workflow.');
    if(a.status==='draft')return{reopened:true};
    await c.query("UPDATE applications SET status='draft',portal_submitted_at=NULL,portal_version=portal_version+1,updated_at=now() WHERE organization_id=$1 AND id=$2",[a.organization_id,a.id]);
    await c.query('UPDATE application_participants SET ready_at=NULL,version=version+1,updated_at=now() WHERE organization_id=$1 AND application_id=$2 AND active',[a.organization_id,a.id]);
    await syncLeadApplicationSummary(c,actor,[a.lead_id]);
    await this.event(c,a,actor,'application_reopened','Authorized staff reopened this application for requested information. Existing documents, consents and history were retained.',{reason:'staff_information_request'});
    return{reopened:true};
   });
  });return this.workspace(u,digest,id);
 }
}
