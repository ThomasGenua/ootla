import {organizationDeliveryPolicy,organizationIsQuiet} from './organization-policy.js';
import type {PoolClient,QueryResultRow} from 'pg';
import type {AuthUser} from '../../shared/contracts.js';
import type {AutomationRunResult} from '../../shared/automation-contracts.js';
import {taskCreateSchema} from '../../shared/task-contracts.js';
import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import {conversationTransport,type ConversationTransport} from '../conversations/transport.js';
import {collectAutomationCandidates} from './automation-eligibility.js';
import {automationActor,automationKnowledgeValid,automationHash,automationIso,automationEvent} from './automation-access.js';
import {emptyAutomationResult} from './automation-core.js';
import {conversationQuietHours,conversationRequestId,publicConversationChannelAccess} from './conversations.js';
import {Tasks} from './tasks.js';
type Row=QueryResultRow;
export interface AutomationProcessOptions{organizationId?:string;limit?:number;transport?:ConversationTransport}
const recordKey=(j:Row)=>({page:1,pageSize:1,subjectKind:j.subject_kind,subjectId:j.subject_id});
async function lock(c:PoolClient,org:string):Promise<void>{await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ootla.automation:'+org]);}
async function paused(c:PoolClient,org:string):Promise<boolean>{await lock(c,org);return Boolean((await c.query('SELECT paused FROM organization_automation_settings WHERE organization_id=$1 FOR SHARE',[org])).rows[0]?.paused);}
function render(template:string,property:string,config:ServerConfig):string{return template.replace(/\{property\}/g,()=>property).replace(/\{portal\}/g,()=>config.appUrl+'/applicant/login').replace(/\{next_step\}/g,()=>'Sign in securely or contact the property team to agree the next step.');}
async function cancelQueued(c:PoolClient,rule:Row,job:Row,reason:string):Promise<void>{
 if(job.message_id){await c.query("UPDATE conversation_outbox SET state='cancelled',last_error=$2,updated_at=clock_timestamp() WHERE message_id=$1 AND state IN('queued','sent')",[job.message_id,reason]);await c.query("UPDATE conversation_messages SET status='cancelled' WHERE id=$1 AND status IN('queued','sent')",[job.message_id]);}
 await c.query("UPDATE automation_jobs SET status='cancelled',last_error=$2,updated_at=clock_timestamp() WHERE id=$1",[job.id,reason]);await automationEvent(c,rule,job,'cancelled',reason);
}
/** Shared final pre-delivery gate: ordinary conversation processing cannot bypass source/rule checks. */
export async function validateAutomationOutbox(c:PoolClient,config:ServerConfig,outbox:Row):Promise<boolean>{
 if(!outbox.automation_job_id)return true;
 const raw=(await c.query('SELECT * FROM automation_jobs WHERE id=$1 AND organization_id=$2',[outbox.automation_job_id,outbox.organization_id])).rows[0];if(!raw)return false;
 const isPaused=await paused(c,raw.organization_id),rule=(await c.query('SELECT * FROM automation_rules WHERE id=$1 AND organization_id=$2 FOR SHARE',[raw.rule_id,raw.organization_id])).rows[0],job=(await c.query('SELECT * FROM automation_jobs WHERE id=$1 FOR UPDATE',[raw.id])).rows[0];
 if(!rule||!job||job.status!=='queued')return false;
 const actor=await automationActor(c,config,rule);let reason:string|null=isPaused?'organization_paused':!rule.enabled?'rule_paused':rule.version!==job.rule_version?'rule_changed':!actor?'authorization_changed':!await automationKnowledgeValid(c,rule)?'approved_source_withdrawn':null;
 if(!reason&&actor){const found=await collectAutomationCandidates(c,actor,rule,recordKey(job)),source=found.items[0];if(!source||source.sourceState!==job.source_state||!source.eligible)reason=source?.blockedReason??'source_condition_changed';}
 if(reason){await cancelQueued(c,rule??{...job,id:job.rule_id},job,reason);return false;}
 const conversation=(await c.query('SELECT channel_id FROM customer_conversations WHERE id=$1 AND organization_id=$2',[job.conversation_id,job.organization_id])).rows[0];let channel:Row;
 try{if(!conversation)throw new Error('Missing conversation');channel=(await publicConversationChannelAccess(c,config,conversation.channel_id)).channel;}catch{await cancelQueued(c,rule,job,'public_channel_authorization_changed');return false;}
 if(job.attempts>=job.max_attempts){await c.query("UPDATE automation_jobs SET status='failed',last_error='automation_retry_limit' WHERE id=$1",[job.id]);await c.query("UPDATE conversation_outbox SET state='failed',last_error='automation_retry_limit' WHERE id=$1",[outbox.id]);await c.query("UPDATE conversation_messages SET status='failed' WHERE id=$1",[outbox.message_id]);return false;}
 if(new Date(job.due_at).getTime()>Date.now()||new Date(job.next_attempt_at).getTime()>Date.now()||new Date(outbox.next_attempt_at).getTime()>Date.now())return false;
 const deliveryPolicy=await organizationDeliveryPolicy(c,rule.organization_id);let deferMinutes=organizationIsQuiet(deliveryPolicy)?15:0;if(conversationQuietHours({quiet_start:rule.quiet_start,quiet_end:rule.quiet_end,time_zone:rule.time_zone})||conversationQuietHours({quiet_start:channel.quiet_start,quiet_end:channel.quiet_end,time_zone:channel.time_zone}))deferMinutes=15;
 const rate=Number((await c.query("SELECT count(*) AS n FROM automation_events WHERE organization_id=$1 AND kind IN('task_saved','delivery_attempt') AND created_at>clock_timestamp()-interval '1 minute'",[job.organization_id])).rows[0]!.n);if(rate>=20)deferMinutes=Math.max(deferMinutes,1);
 if(deferMinutes){await c.query("UPDATE automation_jobs SET next_attempt_at=clock_timestamp()+($2*interval '1 minute') WHERE id=$1",[job.id,deferMinutes]);await c.query("UPDATE conversation_outbox SET next_attempt_at=clock_timestamp()+($2*interval '1 minute') WHERE id=$1",[outbox.id,deferMinutes]);return false;}
 return true;
}
export async function recordAutomationDelivery(c:PoolClient,outbox:Row,outcome:'sent'|'delivered'|'temporary_failure'):Promise<void>{
 if(!outbox.automation_job_id)return;
 const job=(await c.query('SELECT * FROM automation_jobs WHERE id=$1 AND organization_id=$2 FOR UPDATE',[outbox.automation_job_id,outbox.organization_id])).rows[0];if(!job||job.status!=='queued')return;
 await automationEvent(c,{organization_id:job.organization_id,id:job.rule_id},job,'delivery_attempt','The local simulator attempted an approved generic response; no email or SMS was sent.');
 if(outcome==='temporary_failure'){const attempts=job.attempts+1,failed=attempts>=job.max_attempts;await c.query("UPDATE automation_jobs SET attempts=$2,status=$3,last_error='local_transport_temporary_failure',next_attempt_at=clock_timestamp()+($4*interval '1 second'),updated_at=clock_timestamp() WHERE id=$1",[job.id,attempts,failed?'failed':'queued',Math.min(120,10*2**(attempts-1))]);if(failed){await c.query("UPDATE conversation_outbox SET state='failed',last_error='automation_retry_limit' WHERE id=$1",[outbox.id]);await c.query("UPDATE conversation_messages SET status='failed' WHERE id=$1",[outbox.message_id]);}}
 else await c.query("UPDATE automation_jobs SET status=$2,last_error=NULL,next_attempt_at=clock_timestamp()+interval '5 seconds',updated_at=clock_timestamp() WHERE id=$1",[job.id,outcome==='delivered'?'completed':'queued']);
}
async function cancelTask(c:PoolClient,db:Database,actor:AuthUser|null,rule:Row,job:Row,reason:string):Promise<void>{
 if(job.task_id&&job.created_task_version!==null&&actor){const task=(await c.query('SELECT id,version,status FROM tasks WHERE organization_id=$1 AND id=$2 FOR UPDATE',[job.organization_id,job.task_id])).rows[0];if(task?.status==='open'&&task.version===job.created_task_version){await new Tasks(db).updateLinked(c,actor,task.id,{version:task.version,status:'cancelled'});}else if(task?.status==='open')reason+='; staff-modified task preserved';}
 await cancelQueued(c,rule,job,reason);
}
export async function discoverAutomationJobs(db:Database,config:ServerConfig,options:AutomationProcessOptions={}):Promise<AutomationRunResult>{
 const result=emptyAutomationResult(),limit=Math.min(50,Math.max(1,options.limit??25));
 const rules=(await db.query("SELECT id,organization_id FROM automation_rules WHERE enabled AND ($1::uuid IS NULL OR organization_id=$1) ORDER BY last_scan_at NULLS FIRST,id LIMIT $2",[options.organizationId??null,limit])).rows;
 for(const ref of rules)await db.transaction(async c=>{
  if(await paused(c,ref.organization_id))return;const rule=(await c.query('SELECT * FROM automation_rules WHERE id=$1 FOR SHARE',[ref.id])).rows[0];if(!rule?.enabled||!['in_app','website'].includes(rule.channel))return;
  const actor=await automationActor(c,config,rule);if(!actor||!await automationKnowledgeValid(c,rule))return;
  const scanPage=Number(rule.scan_page??1),candidates=await collectAutomationCandidates(c,actor,rule,{page:scanPage,pageSize:limit});result.scanned+=candidates.items.length;await c.query('UPDATE automation_rules SET scan_page=$2,last_scan_at=clock_timestamp() WHERE id=$1',[rule.id,scanPage*limit>=candidates.total?1:scanPage+1]);
  for(const source of candidates.items){if(!source.eligible)continue;
   const state=source.sourceState,body=render(rule.template,source.propertyName,config);
   const row=(await c.query("INSERT INTO automation_jobs(organization_id,rule_id,rule_version,property_id,subject_kind,subject_id,source_state,lead_id,contact_id,application_id,tour_id,conversation_id,label,reason,record_url,status,body,max_attempts,due_at,next_attempt_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19) ON CONFLICT(rule_id,subject_kind,subject_id,source_state) DO NOTHING RETURNING *",[rule.organization_id,rule.id,rule.version,source.propertyId,source.subjectKind,source.subjectId,state,source.leadId,source.contactId,source.applicationId,source.tourId,source.conversationId,source.label,source.reason,source.url,rule.requires_approval?'awaiting_approval':'queued',body,rule.max_attempts,source.eligibleAt])).rows[0];
   if(row){result.queued++;await automationEvent(c,rule,row,'eligible',source.reason);}
  }
 });return result;
}
async function processOne(db:Database,config:ServerConfig,id:string,options:AutomationProcessOptions,result:AutomationRunResult):Promise<void>{
 await db.transaction(async c=>{
  const raw=(await c.query('SELECT organization_id,rule_id FROM automation_jobs WHERE id=$1',[id])).rows[0];if(!raw)return;
  const isPaused=await paused(c,raw.organization_id),rule=(await c.query('SELECT * FROM automation_rules WHERE id=$1 FOR SHARE',[raw.rule_id])).rows[0],job=(await c.query('SELECT * FROM automation_jobs WHERE id=$1 FOR UPDATE SKIP LOCKED',[id])).rows[0];if(!rule||!job||['cancelled','failed'].includes(job.status))return;
  const actor=await automationActor(c,config,rule);let reason:string|null=isPaused?'organization_paused':!rule.enabled?'rule_paused':rule.version!==job.rule_version?'rule_changed':!actor?'authorization_changed':!await automationKnowledgeValid(c,rule)?'approved_source_withdrawn':null;
  let source;
  if(!reason&&actor){source=(await collectAutomationCandidates(c,actor,rule,recordKey(job))).items[0];if(!source||source.sourceState!==job.source_state||!source.eligible)reason=source?.blockedReason??'source_condition_changed';}
  if(reason){await cancelTask(c,db,actor,rule,job,reason);result.cancelled++;return;}
  if(job.status==='completed'||job.status==='awaiting_approval'){await c.query("UPDATE automation_jobs SET next_attempt_at=clock_timestamp()+interval '30 seconds' WHERE id=$1",[id]);result.deferred++;return;}
  if(new Date(job.due_at).getTime()>Date.now()){await c.query("UPDATE automation_jobs SET next_attempt_at=LEAST(due_at,clock_timestamp()+interval '30 seconds') WHERE id=$1",[id]);result.deferred++;return;}if(new Date(job.next_attempt_at).getTime()>Date.now()){result.deferred++;return;}
  const deliveryPolicy=await organizationDeliveryPolicy(c,rule.organization_id);if(organizationIsQuiet(deliveryPolicy)||rule.channel==='in_app'&&!deliveryPolicy.inAppEnabled||conversationQuietHours({quiet_start:rule.quiet_start,quiet_end:rule.quiet_end,time_zone:rule.time_zone})){await c.query("UPDATE automation_jobs SET next_attempt_at=clock_timestamp()+interval '15 minutes' WHERE id=$1",[id]);result.deferred++;return;}
  const rate=Number((await c.query("SELECT count(*) AS n FROM automation_events WHERE organization_id=$1 AND kind IN('task_saved','delivery_attempt') AND created_at>clock_timestamp()-interval '1 minute'",[job.organization_id])).rows[0]!.n);
  if(rate>=20){await c.query("UPDATE automation_jobs SET next_attempt_at=clock_timestamp()+interval '1 minute' WHERE id=$1",[id]);result.deferred++;return;}
  await c.query('SAVEPOINT automation_execution');
  try{
   if(rule.channel==='in_app'){
    if(job.subject_kind==='task'){
     await c.query("UPDATE automation_jobs SET status='completed',task_id=subject_id,created_task_version=NULL,updated_at=clock_timestamp() WHERE id=$1",[id]);
    }else{
     const emergency=job.subject_kind==='maintenance'?(await c.query("SELECT settings.emergency_staff_membership_id AS configured_owner,eligible.id AS owner FROM maintenance_requests mr JOIN resident_relationships rr ON rr.id=mr.resident_relationship_id AND rr.organization_id=mr.organization_id JOIN property_maintenance_settings settings ON settings.organization_id=mr.organization_id AND settings.property_id=mr.property_id LEFT JOIN LATERAL(SELECT m.id FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' WHERE m.id=settings.emergency_staff_membership_id AND m.organization_id=mr.organization_id AND m.active AND m.account_kind='staff' AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission='leasing.manage') AND (m.role='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=m.organization_id AND pa.property_id=mr.property_id AND pa.membership_id=m.id) AND NOT EXISTS(SELECT 1 FROM lead_property_interests li WHERE li.organization_id=rr.organization_id AND li.lead_id=rr.lead_id AND NOT EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=li.organization_id AND pa.property_id=li.property_id AND pa.membership_id=m.id))) FOR SHARE OF m,u) eligible ON true WHERE mr.id=$1 AND mr.organization_id=$2 AND mr.urgency='possible_emergency'",[job.subject_id,job.organization_id])).rows[0]??null:null;
     const task=await new Tasks(db).createLinked(c,actor!,taskCreateSchema.parse({propertyId:job.property_id,leadId:job.lead_id,contactId:job.contact_id,applicationId:job.application_id,tourId:job.tour_id,maintenanceRequestId:job.subject_kind==='maintenance'?job.subject_id:null,title:(rule.name+': '+job.label).slice(0,300),details:'Automation reminder: '+job.reason+'\nRule: '+rule.name+'\n'+job.body,dueAt:new Date().toISOString(),priority:'normal',assignment:emergency?'manual':rule.assignment,ownerMembershipId:emergency?emergency.owner??null:(rule.assignment==='manual'?rule.owner_membership_id:null)}),{namespace:'automation',requestKey:'automation:'+job.id,origin:'system',purpose:'crm'});
     await c.query("UPDATE automation_jobs SET status='completed',task_id=$2,created_task_version=$3,source_snapshot=$4,updated_at=clock_timestamp() WHERE id=$1",[id,task.id,task.version,JSON.stringify({leadStage:job.lead_id?(await c.query('SELECT pipeline_stage FROM leads WHERE id=$1 AND organization_id=$2',[job.lead_id,job.organization_id])).rows[0]?.pipeline_stage??null:null,taskTitle:task.title,taskDueAt:task.dueAt})]);
    }
    await automationEvent(c,rule,job,'task_saved','A normal staff task exists; reminders, snooze and reassignment use the native task policy.',actor!.id);result.completed++;
   }else if(rule.channel==='website'){
    const conversation=(await c.query("SELECT * FROM customer_conversations WHERE id=$1 AND organization_id=$2 FOR UPDATE",[job.conversation_id,job.organization_id])).rows[0];if(!conversation||!conversation.consent||conversation.ownership!=='ai_active')throw new Error('Conversation condition changed');
    if(!job.message_id){
     const message=(await c.query("INSERT INTO conversation_messages(organization_id,conversation_id,request_key,role,body,status,mode,sources,payload_hash) VALUES($1,$2,$3,'assistant',$4,'queued','simulation','[]',$5) ON CONFLICT(conversation_id,request_key,role) DO UPDATE SET body=conversation_messages.body RETURNING id",[job.organization_id,conversation.id,conversationRequestId('automation',job.id),job.body,automationHash({jobId:job.id,body:job.body})])).rows[0]!;
     await c.query("INSERT INTO conversation_outbox(organization_id,conversation_id,message_id,origin,automation_job_id) VALUES($1,$2,$3,'automation',$4) ON CONFLICT(message_id) DO NOTHING",[job.organization_id,conversation.id,message.id,job.id]);
     await c.query("UPDATE automation_jobs SET message_id=$2,next_attempt_at=clock_timestamp()+interval '1 second',updated_at=clock_timestamp() WHERE id=$1",[job.id,message.id]);await automationEvent(c,rule,job,'outbox_queued','An approved generic message was queued locally; no delivery was claimed.');result.queued++;
    }else{
     const outbox=(await c.query("SELECT * FROM conversation_outbox WHERE message_id=$1 FOR UPDATE",[job.message_id])).rows[0];
     if(!outbox||outbox.state==='cancelled'){await cancelTask(c,db,actor,rule,job,'conversation_cancelled');result.cancelled++;}
     else if(await validateAutomationOutbox(c,config,outbox)){
      const delivery=await(options.transport??conversationTransport('website')).deliver(job.message_id,'delivered',config.demoMode&&!config.production);
      const outcome=delivery.retryable?'temporary_failure':delivery.state==='delivered'?'delivered':'sent';
      if(outcome==='temporary_failure'){await c.query("UPDATE conversation_outbox SET attempts=attempts+1,last_error='local_transport_temporary_failure',next_attempt_at=clock_timestamp()+interval '10 seconds' WHERE id=$1",[outbox.id]);}
      else{await c.query('UPDATE conversation_outbox SET state=$2,provider_message_id=$3,updated_at=clock_timestamp() WHERE id=$1',[outbox.id,outcome,delivery.providerMessageId]);await c.query('UPDATE conversation_messages SET status=$2 WHERE id=$1',[job.message_id,outcome]);}
      await recordAutomationDelivery(c,outbox,outcome);if(outcome==='delivered')result.completed++;else if(outcome==='temporary_failure')result.failed++;else result.deferred++;
     }
    }
   }else throw new Error('Unsupported external channel');
   await c.query('RELEASE SAVEPOINT automation_execution');
  }catch{
   await c.query('ROLLBACK TO SAVEPOINT automation_execution');await c.query('RELEASE SAVEPOINT automation_execution');
   const attempts=job.attempts+1,failed=attempts>=job.max_attempts;await c.query("UPDATE automation_jobs SET attempts=$2,status=$3,last_error='native_action_failed',next_attempt_at=clock_timestamp()+($4*interval '1 second'),updated_at=clock_timestamp() WHERE id=$1",[job.id,attempts,failed?'failed':'queued',Math.min(120,10*2**(attempts-1))]);if(job.message_id){await c.query("UPDATE conversation_outbox SET state=$2,last_error='native_action_failed',next_attempt_at=clock_timestamp()+interval '10 seconds',updated_at=clock_timestamp() WHERE message_id=$1 AND state IN('queued','sent')",[job.message_id,failed?'failed':'queued']);if(failed)await c.query("UPDATE conversation_messages SET status='failed' WHERE id=$1 AND status IN('queued','sent')",[job.message_id]);}await automationEvent(c,rule,job,failed?'failed':'retry_scheduled','The native action failed. No successful action or delivery was claimed.');result.failed++;
  }
 });
}
export async function processAutomationJobs(db:Database,config:ServerConfig,options:AutomationProcessOptions={}):Promise<AutomationRunResult>{
 const limit=Math.min(100,Math.max(1,options.limit??25)),result=await discoverAutomationJobs(db,config,{...options,limit});
 const ids=(await db.query("SELECT id FROM automation_jobs WHERE ($1::uuid IS NULL OR organization_id=$1) AND next_attempt_at<=clock_timestamp() AND (status IN('queued','awaiting_approval') OR status='completed' AND created_task_version IS NOT NULL) ORDER BY next_attempt_at,id LIMIT $2",[options.organizationId??null,limit])).rows;
 for(const row of ids)await processOne(db,config,row.id,options,result);return result;
}
export {cancelTask as cancelAutomationJob};
