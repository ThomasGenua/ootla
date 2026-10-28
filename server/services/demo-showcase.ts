import {createHash} from 'node:crypto';
import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import {ApiError} from '../http/errors.js';
import {requireIsolatedDemo} from './demo-environment.js';
import {hashPassword} from './passwords.js';
import {applicantDemoPassword} from './applicant-demo.js';

const dataset='demo.showcase.v1';
export const showcaseResidentEmail='showcase.resident@demo.ootla.test';
export const showcaseApplicantEmail='showcase.applicant@demo.ootla.test';
/** Stable IDs belong to this synthetic dataset only; no lookup or merge by a person's name/email. */
export function demoShowcaseId(organizationId:string,key:string):string {
 const hex=createHash('sha256').update('ootla:'+dataset+':'+organizationId+':'+key).digest('hex');
 return hex.slice(0,8)+'-'+hex.slice(8,12)+'-5'+hex.slice(13,16)+'-a'+hex.slice(17,20)+'-'+hex.slice(20,32);
}
export interface DemoShowcaseResult {organizationId:string;userId:string;membershipId:string;propertyIds:string[];applicationIds:string[];leaseId:string;relationshipId:string;changedRecords:number}
/** Additive explicit preparation, never imported by startup. One transaction creates a coherent dataset.
 * A completed receipt makes later runs true no-ops, even after staff edit/complete/cancel these records.
 * No existing lead, property, password, policy, provider record, consent or payment is rewritten.
 */
export async function prepareDemoShowcase(db:Database,config:ServerConfig):Promise<DemoShowcaseResult> {
 await db.requireReady();
 return db.transaction(async c=>{
  await requireIsolatedDemo(config,c);
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended('ootla:demo:showcase:v1',0))");
  const admin=(await c.query<{organization_id:string;user_id:string;membership_id:string}>("SELECT o.id AS organization_id,u.id AS user_id,m.id AS membership_id FROM organizations o JOIN organization_memberships m ON m.organization_id=o.id AND m.active AND m.role='organization_admin' JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' AND u.is_demo WHERE o.slug='ootla-demo' AND o.environment='demo' AND u.email=$1",[config.demoAdminEmail])).rows[0];
  if(!admin)throw new ApiError(409,'DEMO_ADMIN_REQUIRED','Prepare the isolated demo administrator before loading the showcase. Existing accounts were not changed.');
  const org=admin.organization_id,uid=admin.user_id,mid=admin.membership_id,id=(key:string)=>demoShowcaseId(org,key),seed=(key:string)=>dataset+'.'+key;
  const applicationKeys=['leila','ethan','sofia','ben','alex'];
  const result:DemoShowcaseResult={organizationId:org,userId:uid,membershipId:mid,propertyIds:[id('property.cedar'),id('property.grove')],applicationIds:applicationKeys.map(k=>id('application.'+k)),leaseId:id('lease.alex'),relationshipId:id('relationship.alex'),changedRecords:0};
  const receipt=(await c.query("SELECT id FROM audit_events WHERE organization_id=$1 AND action='demo.showcase.prepared' AND metadata->>'dataset'=$2 LIMIT 1",[org,dataset])).rows[0];
  if(receipt)return result;
  let n=0;
  // Only table/column names defined by this module enter these statements. All values are bound.
  async function put(table:string,key:string,values:Record<string,unknown>):Promise<string>{
   const recordId=id(key);
   if((await c.query('SELECT id FROM '+table+' WHERE id=$1',[recordId])).rowCount)throw new ApiError(409,'DEMO_FIXTURE_CONFLICT','An incomplete showcase identity conflicts with an existing record. No records changed.');
   const columns=['id','organization_id',...Object.keys(values)],parameters=[recordId,org,...Object.values(values)];
   await c.query('INSERT INTO '+table+'('+columns.join(',')+') VALUES('+parameters.map((_,i)=>'$'+(i+1)).join(',')+')',parameters);n++;return recordId;
  }
  async function link(sql:string,values:unknown[]){n+=(await c.query(sql,values)).rowCount??0;}
  const now=new Date(),today=now.toISOString().slice(0,10),date=(days:number)=>new Date(Date.parse(today+'T12:00:00Z')+days*86400000).toISOString().slice(0,10),at=(days:number,hour=12)=>date(days)+'T'+String(hour).padStart(2,'0')+':00:00Z';
  const group=await put('property_groups','group.city',{name:'City neighbourhoods - showcase'});
  const cedar=await put('properties','property.cedar',{name:'Cedar House',address:'12 Cedar Walk - illustrative address',city:'Lagos',property_type:'apartments',source_system:'demo',group_id:group,seed_key:seed('property.cedar')});
  const grove=await put('properties','property.grove',{name:'Grove Lofts',address:'8 Grove Road - illustrative address',city:'Lagos',property_type:'apartments',source_system:'demo',group_id:group,seed_key:seed('property.grove')});
  const unitRows=[['cedar101',cedar,'101',1,1650,'available'],['cedar202',cedar,'202',2,2100,'available'],['cedar303',cedar,'303',2,2200,'reserved'],['grove1A',grove,'1A',1,1700,'available'],['grove2B',grove,'2B',2,2300,'available'],['grove3C',grove,'3C',2,2350,'occupied']] as const;
  for(const [key,property,label,bedrooms,rent,status]of unitRows)await put('units','unit.'+key,{property_id:property,label,bedrooms,monthly_rent:rent,status,source_system:'demo',availability_source:'demo',availability_verified_at:now,seed_key:seed('unit.'+key)});
  for(const property of [cedar,grove]){
   await link('INSERT INTO property_access_assignments(organization_id,membership_id,property_id,assigned_by_user_id) VALUES($1,$2,$3,$4)',[org,mid,property,uid]);
   await link("INSERT INTO property_viewing_settings(organization_id,property_id,enabled,time_zone,duration_minutes,buffer_before_minutes,buffer_after_minutes,location,public_booking_enabled) VALUES($1,$2,true,'Africa/Lagos',30,10,10,'Illustrative property reception',true) ON CONFLICT(property_id) DO NOTHING",[org,property]);
   await link('INSERT INTO viewing_staff_availability(organization_id,property_id,membership_id,enabled,windows) VALUES($1,$2,$3,true,$4) ON CONFLICT(property_id,membership_id) DO NOTHING',[org,property,mid,JSON.stringify(Array.from({length:7},(_,weekday)=>({weekday,start:'09:00',end:'17:00'})))]);
  }
  const prospects=[
   {key:'avery',name:'Avery Brooks',property:cedar,unit:'cedar101',stage:'new_inquiry',intent:'leasing',source:'website',bedrooms:1,budget:1800,action:'Arrange a viewing for Avery',due:at(0,15)},
   {key:'noah',name:'Noah Patel',property:cedar,unit:'cedar202',stage:'tour_scheduled',intent:'leasing',source:'referral',bedrooms:2,budget:2400,action:'Prepare Noah’s property viewing',due:at(1,9)},
   {key:'leila',name:'Leila Morgan',property:grove,unit:'grove1A',stage:'application_started',intent:'leasing',source:'portal',bedrooms:1,budget:1900,action:'Help Leila finish the document checklist',due:at(0,12)},
   {key:'ethan',name:'Ethan Lewis',property:cedar,unit:'cedar202',stage:'application_submitted',intent:'leasing',source:'website',bedrooms:2,budget:2300,action:'Review Ethan’s submitted application',due:at(-1,12)},
   {key:'sofia',name:'Sofia Ahmed',property:grove,unit:'grove2B',stage:'staff_review',intent:'leasing',source:'phone',bedrooms:2,budget:2500,action:'Complete Sofia’s staff review',due:at(1,13)},
   {key:'ben',name:'Ben Carter',property:cedar,unit:'cedar303',stage:'lease_pending',intent:'leasing',source:'referral',bedrooms:2,budget:2400,action:'Review Ben’s lease preparation',due:at(2,10)},
   {key:'alex',name:'Alex Taylor',property:grove,unit:'grove3C',stage:'leased',intent:'leasing',source:'website',bedrooms:2,budget:2500,action:'Confirm Alex’s move-in checklist',due:at(2,12)},
   {key:'riley',name:'Riley Williams',property:grove,unit:'grove2B',stage:'negotiation',intent:'sales',source:'referral',bedrooms:2,budget:3000,action:'Discuss Riley’s sales requirements',due:at(1,14)},
  ] as const;
  const applicantId=id('user.applicant');
  if((await c.query('SELECT id FROM users WHERE email=$1 OR id=$2',[showcaseApplicantEmail,applicantId])).rowCount)throw new ApiError(409,'DEMO_IDENTITY_CONFLICT','The reserved showcase applicant identity already belongs to another record. Existing accounts were preserved.');
  await c.query("INSERT INTO users(id,email,display_name,password_hash,account_kind,is_demo) VALUES($1,$2,'Ethan Lewis',$3,'applicant',true)",[applicantId,showcaseApplicantEmail,await hashPassword(applicantDemoPassword)]);n++;
  for(const p of prospects){
   const email=p.key==='alex'?showcaseResidentEmail:p.key==='ethan'?showcaseApplicantEmail:p.key+'.'+p.name.split(' ').at(-1)!.toLowerCase()+'@example.test';
   const contact=await put('contacts','contact.'+p.key,{display_name:p.name,email,phone:'+1 202 555 01'+String(prospects.indexOf(p)+10),source_system:'demo'});
   await link('INSERT INTO contact_property_links(organization_id,contact_id,property_id) VALUES($1,$2,$3)',[org,contact,p.property]);
   const household=await put('households','household.'+p.key,{name:p.name+' - illustrative household'});
   await link('INSERT INTO household_property_links(organization_id,household_id,property_id) VALUES($1,$2,$3)',[org,household,p.property]);
   await link("INSERT INTO household_members(organization_id,household_id,contact_id,relationship) VALUES($1,$2,$3,'primary contact')",[org,household,contact]);
   const applicationStatus=p.key==='leila'?'draft':p.key==='ethan'?'submitted':'staff_review',hasApplication=applicationKeys.includes(p.key);
   const lead=await put('leads','lead.'+p.key,{property_id:p.property,unit_id:id('unit.'+p.unit),contact_id:contact,display_name:p.name,email,status:p.stage==='new_inquiry'?'new':p.stage==='tour_scheduled'?'viewing_scheduled':'qualified',intent:p.intent,pipeline_stage:p.stage,owner_membership_id:mid,source:p.source,preferences:JSON.stringify({bedrooms:p.bedrooms,budgetMin:p.budget-400,budgetMax:p.budget,moveInOn:date(30),locations:['Lagos'],requirements:'A quiet home with good transport access. Illustrative preferences supplied by the customer.'}),next_action:p.action,next_action_at:p.due,notes:'Synthetic showcase record. Saved CRM data can be edited normally; no real customer or external communication is involved.',seed_key:seed('lead.'+p.key),...(hasApplication?{application_summary_id:id('application.'+p.key),application_summary_status:applicationStatus}:{})});
   await put('lead_events','lead.created.'+p.key,{lead_id:lead,kind:'created',stage:p.stage,actor_user_id:uid,actor_membership_id:mid,metadata:JSON.stringify({simulation:true,dataset}),occurred_at:at(-30,10)});
   await put('lead_workspace_events','note.'+p.key,{lead_id:lead,property_id:p.property,contact_id:contact,kind:'note',summary:'Illustrative private staff note: confirm stated budget, move-in date and property preferences before the next action.',actor_user_id:uid,actor_membership_id:mid,occurred_at:at(-2,11),metadata:JSON.stringify({simulation:true,dataset})});
   const content=Buffer.from('OOTLA SYNTHETIC DEMONSTRATION\nProperty preferences for '+p.name+'.\nThis invented file contains no real identity, financial or customer information.\n');
   await put('lead_documents','lead.document.'+p.key,{lead_id:lead,property_id:p.property,contact_id:contact,name:'Illustrative preferences - '+p.name+'.txt',media_type:'text/plain',size_bytes:content.length,sha256:createHash('sha256').update(content).digest('hex'),content,uploaded_by_user_id:uid,uploaded_by_membership_id:mid});
   if(hasApplication){
    const application=await put('applications','application.'+p.key,{property_id:p.property,unit_id:id('unit.'+p.unit),contact_id:contact,household_id:household,lead_id:lead,status:applicationStatus,source_system:'demo',portal_enabled:true,portal_submitted_at:applicationStatus==='draft'?null:at(-1,10)});
    const participant=await put('application_participants','participant.'+p.key,{application_id:application,contact_id:contact,role:'primary',invited_email:email,user_id:p.key==='ethan'?applicantId:null,details:JSON.stringify({displayName:p.name,phone:'+1 202 555 0100',currentAddress:'Synthetic address - demonstration only',moveInDate:date(30)}),ready_at:applicationStatus==='draft'?null:at(-1,9)});
    for(const [position,label]of ['Identity document - example only','Supporting document - example only'].entries()){
     const item=await put('application_checklist_items','checklist.'+p.key+'.'+position,{application_id:application,label,required:true,position});
     if(applicationStatus!=='draft'||position===0)await put('application_documents','application.document.'+p.key+'.'+position,{application_id:application,participant_id:participant,checklist_item_id:item,name:'Synthetic supporting example '+(position+1)+'.txt',media_type:'text/plain',size_bytes:content.length,sha256:createHash('sha256').update(content).digest('hex'),content,uploaded_by_user_id:uid});
    }
    await put('application_portal_events','application.event.'+p.key,{application_id:application,participant_id:participant,actor_user_id:uid,actor_kind:'staff',kind:'demo_prepared',summary:'Illustrative '+applicationStatus.replaceAll('_',' ')+' application. Staff can review private example files. No real applicant consent or external decision was created.',metadata:JSON.stringify({simulation:true,dataset})});
   }
   const completed=p.key==='riley',task=await put('tasks','task.'+p.key,{property_id:p.property,lead_id:lead,contact_id:contact,application_id:hasApplication?id('application.'+p.key):null,title:p.action,details:'Saved showcase work. Complete, reassign or change it through the normal task workflow.',due_at:p.due,status:completed?'completed':'open',priority:p.key==='ethan'?'high':'normal',origin:'demo',owner_membership_id:mid,created_by_user_id:uid,created_by_membership_id:mid,completed_at:completed?at(-1,15):null,completed_by_user_id:completed?uid:null,completed_by_membership_id:completed?mid:null,purpose:p.key==='alex'?'move_in':'crm',seed_key:seed('task.'+p.key)});
   await put('task_events','task.event.'+p.key,{task_id:task,kind:completed?'completed':'created',actor_user_id:uid,actor_membership_id:mid,metadata:JSON.stringify({simulation:true,dataset})});
   if(!completed&&p.stage!=='leased')await put('task_reminders','reminder.'+p.key,{task_id:task,generation:1,recipient_membership_id:mid,status:'pending',scheduled_at:p.due,next_attempt_at:p.due});
  }
  // Managed bookings are editable in the native Calendar; no Google invitation or outbound job is created.
  for(const [key,leadKey,property,unit,days,hour,status]of [['noah','noah',cedar,'cedar202',1,10,'scheduled'],['ethan','ethan',cedar,'cedar202',-3,11,'completed']] as const){
   const starts=at(days,hour),ends=new Date(Date.parse(starts)+1800000).toISOString(),viewing=await put('viewings','viewing.'+key,{property_id:property,lead_id:id('lead.'+leadKey),unit_id:id('unit.'+unit),starts_at:starts,ends_at:ends,time_zone:'Africa/Lagos',owner_membership_id:mid,duration_minutes:30,buffer_before_minutes:10,buffer_after_minutes:10,location:'Cedar House reception - illustrative viewing',status,managed_by_ootla:true,booking_origin:'staff',created_by_user_id:uid,created_by_membership_id:mid,seed_key:seed('viewing.'+key)});
   const event=await put('viewing_events','viewing.event.'+key,{viewing_id:viewing,kind:status==='completed'?'completed':'booked',origin:'staff',actor_user_id:uid,actor_membership_id:mid,metadata:JSON.stringify({simulation:true,dataset}),occurred_at:status==='completed'?ends:at(-1,10)});
   await link("INSERT INTO viewing_notification_receipts(event_id,organization_id,mode) VALUES($1,$2,'simulation')",[event,org]);
  }
  await put('lead_workspace_events','call.avery',{lead_id:id('lead.avery'),property_id:cedar,contact_id:id('contact.avery'),kind:'call',summary:'Illustrative call log: Avery asked about available one-bedroom homes. No real phone call was made.',actor_user_id:uid,actor_membership_id:mid,metadata:JSON.stringify({simulation:true,dataset}),occurred_at:at(-1,13)});
  const residentId=id('user.resident');
  if((await c.query('SELECT id FROM users WHERE email=$1 OR id=$2',[showcaseResidentEmail,residentId])).rowCount)throw new ApiError(409,'DEMO_IDENTITY_CONFLICT','The reserved showcase resident identity already belongs to another record. Existing accounts were preserved.');
  await c.query("INSERT INTO users(id,email,display_name,password_hash,account_kind,is_demo) VALUES($1,$2,'Alex Taylor',$3,'resident',true)",[residentId,showcaseResidentEmail,await hashPassword(config.demoAdminPassword)]);n++;
  for(const key of ['ben','alex']as const){
   const active=key==='alex',p=active?grove:cedar,unit=id('unit.'+(active?'grove3C':'cedar303'));
   const lease=await put('leases','lease.'+key,{contact_id:id('contact.'+key),household_id:id('household.'+key),property_id:p,unit_id:unit,application_id:id('application.'+key),lead_id:id('lead.'+key),status:active?'active':'draft',starts_on:active?date(-20):date(30),ends_on:active?date(345):date(395),source_system:active?'demo':'local'});
   const workflow=await put('lease_workflows','workflow.'+key,{application_id:id('application.'+key),lease_id:lease,stage:active?'completed':'lease_preparation',move_in_at:active?at(-19,12):null,leased_milestone:'fully_signed',move_in_task_templates:JSON.stringify([{key:'handover',title:'Confirm keys and move-in arrangements',dayOffset:0,priority:'normal'}]),signature_evidence_kind:active?'demo_event':null,signature_evidence_reference:active?'Synthetic demo lease milestone - no real signature':null,signature_verified_at:active?at(-20,10):null,created_by_user_id:uid});
   await put('lease_workflow_events','workflow.event.'+key,{workflow_id:workflow,stage:active?'completed':'lease_preparation',evidence_kind:active?'demo_event':null,evidence_reference:active?'Synthetic completed lease example':'',actor_user_id:uid,actor_membership_id:mid,request_key:id('workflow.request.'+key)});
   await put('application_decisions','decision.'+key,{application_id:id('application.'+key),decision:'approved',reason:'Synthetic staff-reviewed showcase decision. No real applicant was approved or screened.',actor_user_id:uid,actor_membership_id:mid,request_key:id('decision.request.'+key)});
   if(active){
    const leaseRow=(await c.query('SELECT updated_at FROM leases WHERE id=$1',[lease])).rows[0]!;
    await put('lease_verified_milestones','milestone.alex',{lead_id:id('lead.alex'),lease_id:lease,property_id:grove,contact_id:id('contact.alex'),lease_updated_at:leaseRow.updated_at,evidence_reference:'Synthetic demo signed lease evidence only',evidence_kind:'demo_event',verified_by_user_id:uid,verified_by_membership_id:mid,verified_at:at(-20,10)});
    await put('lead_events','lead.verified.alex',{lead_id:id('lead.alex'),kind:'lease_verified',previous_stage:'lease_pending',stage:'leased',actor_user_id:uid,actor_membership_id:mid,metadata:JSON.stringify({simulation:true,dataset,leaseId:lease}),occurred_at:at(-20,10)});
   }
  }
  const relation=await put('resident_relationships','relationship.alex',{contact_id:id('contact.alex'),property_id:grove,unit_id:id('unit.grove3C'),application_id:id('application.alex'),lease_id:id('lease.alex'),lead_id:id('lead.alex'),source:'demo_event',status:'active'});
  await put('resident_access_grants','resident.grant',{relationship_id:relation,user_id:residentId,account_kind:'resident',granted_by_user_id:uid});
  await link("INSERT INTO property_maintenance_settings(organization_id,property_id,enabled,emergency_instructions,emergency_staff_membership_id,configured_by_user_id) VALUES($1,$2,true,'Use verified property emergency contacts or appropriate emergency services when there is immediate danger. This demonstration does not dispatch responders.',$3,$4) ON CONFLICT(organization_id,property_id) DO NOTHING",[org,grove,mid,uid]);
  const request=await put('maintenance_requests','maintenance.fan',{property_id:grove,unit_id:id('unit.grove3C'),contact_id:id('contact.alex'),resident_relationship_id:relation,resident_user_id:residentId,category:'electrical',location:'Bathroom',description:'My bathroom fan has stopped working. This is an illustrative resident request.',urgency:'routine',contact_preferences:'Use the portal for updates.',access_preferences:'Weekday afternoon requested; staff must confirm an appointment.',status:'awaiting_assignment',due_at:at(2,12),source_state:'local',source_notice:'Native Ootla maintenance coordination; no external dispatch has occurred.'});
  await put('maintenance_messages','maintenance.message',{request_id:request,actor_user_id:residentId,actor_kind:'resident',visibility:'resident',body:'The bathroom fan stopped working yesterday. A weekday afternoon would be convenient; no visit is confirmed.'});
  await put('maintenance_events','maintenance.event',{request_id:request,kind:'submitted',summary:'Illustrative request saved. Awaiting staff assignment; access preference is not an appointment.',actor_user_id:residentId});
  const maintenanceTask=await put('tasks','task.maintenance',{property_id:grove,contact_id:id('contact.alex'),maintenance_request_id:request,title:'Assign the bathroom fan service request',details:'Check the request and contact the resident before confirming access. No technician appointment is booked.',due_at:at(1,11),status:'open',priority:'normal',origin:'demo',created_by_user_id:uid,created_by_membership_id:mid,assignment_notice:'Awaiting manual staff assignment',seed_key:seed('task.maintenance')});
  await put('task_events','task.maintenance.event',{task_id:maintenanceTask,kind:'created',actor_user_id:uid,actor_membership_id:mid,metadata:JSON.stringify({simulation:true,dataset})});
  await c.query("INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,'demo.showcase.prepared',$3)",[org,uid,JSON.stringify({dataset,changedRecords:n+1,synthetic:true,outboundSent:false,organizationScope:'ootla-demo'})]);n++;
  return{...result,changedRecords:n};
 });
}
