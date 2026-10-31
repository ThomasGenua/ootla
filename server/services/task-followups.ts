import {createHash}from'node:crypto';
import type {PoolClient,QueryResultRow}from'pg';
import type {z}from'zod';
import type {AuthUser}from'../../shared/contracts.js';
import type {FollowupEmail,FollowupResult,followupDraftSchema,followupSendSchema,followupCommentSchema}from'../../shared/task-followup-contracts.js';
import type {Database}from'../db/pool.js';
import type {ServerConfig}from'../config/env.js';
import {ApiError}from'../http/errors.js';
import {Tasks}from'./tasks.js';
import {RecordSuggestions}from'./record-suggestions.js';
import {formatAssistantDateTime,formatAssistantDate}from'../../shared/assistant-dates.js';
import {ApplicantPortal}from'./applicant-portal.js';
import {Leads}from'./leads.js';
import {AiOrchestrationService}from'./ai-orchestration.js';
import {isIsolatedDemo,requireIsolatedDemo}from'./demo-environment.js';
import {conversationTransport}from'../conversations/transport.js';
type Row=QueryResultRow;
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const conflict=()=>new ApiError(409,'TASK_VERSION_CONFLICT','This task changed. Refresh its current details before continuing.');
/** Private task history is canonical; outbound attempts use the existing shared outbox and transport. */
export class TaskFollowups{
 constructor(private db:Database,private config:ServerConfig){}
 private async receipt<T>(c:PoolClient,u:AuthUser,key:string,operation:string,payload:unknown,work:()=>Promise<T>):Promise<T>{
  const scope='task-followup:'+u.id+':'+u.membershipId;
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[u.organization.id+':'+scope+':'+key]);
  const prior=(await c.query('SELECT operation,payload_hash,result FROM conversation_action_receipts WHERE organization_id=$1 AND actor_scope=$2 AND request_key=$3',[u.organization.id,scope,key])).rows[0];
  if(prior){if(prior.operation!==operation||prior.payload_hash!==hash(payload))throw new ApiError(409,'REQUEST_KEY_REUSED','Use a new request identifier for different content.');return prior.result as T;}
  const result=await work();await c.query('INSERT INTO conversation_action_receipts(organization_id,actor_scope,request_key,operation,payload_hash,result)VALUES($1,$2,$3,$4,$5,$6)',[u.organization.id,scope,key,operation,hash(payload),JSON.stringify(result)]);return result;
 }
 private async prepareFacts(u:AuthUser,id:string){
  const {task}=await new Tasks(this.db).detail(u,id,{page:1,pageSize:1});
  if(!task.leadId||!task.contactId)throw new ApiError(409,'TASK_LEAD_REQUIRED','This follow-up needs a linked lead and contact.');
  const lead=(await new Leads(this.db).detail(u,task.leadId,{page:1,pageSize:1})).lead;
  const contact=(await this.db.query('SELECT display_name,email FROM contacts WHERE organization_id=$1 AND id=$2',[u.organization.id,task.contactId])).rows[0];
  if(!contact?.email)throw new ApiError(409,'CONTACT_EMAIL_REQUIRED','Add an email to this contact before preparing a reply.');
  const text=(task.title+' '+task.details).toLowerCase(),p=lead.preferences,questions:string[]=[];
  if(/budget|price|afford/.test(text))questions.push('your budget'+(p.budgetMax!==null?' (currently recorded as up to '+p.budgetMax+')':''));
  if(/bedroom|requirements|preference/.test(text))questions.push('your bedroom preference'+(p.bedrooms!==null?' (currently '+p.bedrooms+')':''));
  if(/move.in|completion date|timing/.test(text))questions.push((lead.intent==='sales'?'your preferred completion date':'your preferred move-in date')+(p.moveInOn?' (currently '+formatAssistantDate(p.moveInOn)+')':''));
  const doc=/document|checklist|application|required items/.test(text),viewing=/viewing|tour/.test(text),sales=lead.intent==='sales';
  const savedViewing=viewing?(await this.db.query("SELECT v.id,v.starts_at,v.time_zone,v.version FROM viewings v WHERE v.organization_id=$1 AND v.lead_id=$2 AND v.property_id=$3 AND v.status='scheduled' AND COALESCE(v.ends_at,v.starts_at)>clock_timestamp() ORDER BY v.starts_at,v.id LIMIT 1",[u.organization.id,lead.id,task.propertyId])).rows[0]??null:null;
  let missingDocuments:string[]|null=null,applicationSnapshot:{id:string;version:number}|null=null;
  if(doc&&lead.applicationSummary){
   const application=await new ApplicantPortal(this.db,this.config).staffDetail(u,lead.applicationSummary.id);
   applicationSnapshot={id:application.application.id,version:application.application.version};
   const participant=application.participants.find(person=>person.active&&person.contactId===task.contactId);
   if(participant)missingDocuments=application.checklist.filter(item=>item.required&&!participant.documents.some(document=>document.checklistId===item.id)).map(item=>item.label);
  }
  const intro=doc?missingDocuments?.length?'Could you please provide the outstanding checklist items for your application at '+task.propertyName+': '+missingDocuments.slice(0,10).join(', ')+'. Let us know if you need help.':missingDocuments?'We have received the required checklist documents for your application at '+task.propertyName+'. Staff will review the information and let you know the next step.':'I am following up on the information needed for your application at '+task.propertyName+'. Please check your application checklist and let us know if you need help with any outstanding required items.':questions.length?'Could you please confirm '+questions.join(', ')+', so we can help with your interest in '+task.propertyName+'?':'I am following up on your interest in '+task.propertyName+'. Please let us know how you would like to proceed.';
  const body='Hello '+contact.display_name+',\n\n'+intro+(savedViewing?'\n\nYour viewing is scheduled for '+formatAssistantDateTime(new Date(savedViewing.starts_at).toISOString(),savedViewing.time_zone??'UTC')+'. Please let us know if those arrangements need to change.':viewing?'\n\nWhat day and time would suit a viewing? We will check staff availability and confirm the booking with you.':'')+(sales&&!doc?'\n\nWe can also discuss suitable properties and your preferred next step.':'')+'\n\n'+(u.name==='Demo Administrator'?'Administrator':u.name);
  return{task,lead,contact,subject:(doc?'Your application at ':viewing?'Your viewing at ':'Following up on ')+task.propertyName,body,questions,doc,viewing,savedViewing,missingDocuments,applicationSnapshot};
 }
 private async verifyFacts(c:PoolClient,u:AuthUser,facts:{lead:{id:string;version:number};task:{propertyId:string};viewing:boolean;savedViewing:Row|null;applicationSnapshot:{id:string;version:number}|null}):Promise<void>{
  const lead=(await c.query('SELECT version FROM leads WHERE organization_id=$1 AND id=$2 FOR SHARE',[u.organization.id,facts.lead.id])).rows[0];if(lead?.version!==facts.lead.version)throw conflict();
  if(facts.viewing){
   const current=(await c.query("SELECT v.id,v.starts_at,v.time_zone,v.version FROM viewings v WHERE v.organization_id=$1 AND v.lead_id=$2 AND v.property_id=$3 AND v.status='scheduled' AND COALESCE(v.ends_at,v.starts_at)>clock_timestamp() ORDER BY v.starts_at,v.id LIMIT 1",[u.organization.id,facts.lead.id,facts.task.propertyId])).rows[0]??null;
   if(hash(current)!==hash(facts.savedViewing))throw conflict();
  }
  if(facts.applicationSnapshot){const current=(await c.query('SELECT portal_version FROM applications WHERE organization_id=$1 AND id=$2 AND lead_id=$3 FOR SHARE',[u.organization.id,facts.applicationSnapshot.id,facts.lead.id])).rows[0];if(current?.portal_version!==facts.applicationSnapshot.version)throw conflict();}
 }
 async savedDraft(u:AuthUser,id:string):Promise<{email:FollowupEmail|null}>{
  return this.db.transaction(async c=>{
   const {actor,task}=await new Tasks(this.db).lockForAction(c,u,id);
   if(task.status!=='open')return{email:null};
   const event=(await c.query("SELECT id,metadata FROM task_events WHERE organization_id=$1 AND task_id=$2 AND actor_user_id=$3 AND (metadata ? 'emailDraft' OR metadata ? 'correspondence') ORDER BY occurred_at DESC,id DESC LIMIT 1",[actor.organization.id,id,actor.id])).rows[0];
   const draft=event?.metadata?.emailDraft;
   if(!draft||typeof draft.to!=='string'||typeof draft.subject!=='string'||typeof draft.body!=='string')return{email:null};
   const contact=(await c.query('SELECT display_name,email FROM contacts WHERE organization_id=$1 AND id=$2 FOR SHARE',[actor.organization.id,task.contact_id])).rows[0];
   if(!contact?.email||contact.email!==draft.to)return{email:null};
   const delivery=await isIsolatedDemo(this.config,c)&&this.config.outboundMode==='simulation'&&/@[^@]+\.test$/i.test(contact.email)?'preview':'unavailable';
   return{email:{id:event.id,to:contact.email,recipientName:contact.display_name,subject:draft.subject,body:draft.body,version:task.version,generation:draft.generation==='live'?'live':'record_based',delivery}};
  });
 }
 async prepare(u:AuthUser,digest:string,id:string,input:z.infer<typeof followupDraftSchema>):Promise<FollowupResult>{
  const tasks=new Tasks(this.db);
  const prior=await this.db.transaction(async c=>{await tasks.lockForAction(c,u,id);const scope='task-followup:'+u.id+':'+u.membershipId;const row=(await c.query('SELECT operation,payload_hash,result FROM conversation_action_receipts WHERE organization_id=$1 AND actor_scope=$2 AND request_key=$3',[u.organization.id,scope,input.requestKey])).rows[0];if(row&&(row.operation!=='draft'||row.payload_hash!==hash({id,...input})))throw new ApiError(409,'REQUEST_KEY_REUSED','Use a new identifier for different content.');return row?.result as FollowupResult|undefined;});
  if(prior)return prior;
  const suggestions=await new RecordSuggestions(this.db,this.config).task(u,id);
  if(!suggestions.actions.some(a=>a.kind==='email_draft'))throw new ApiError(409,'SUGGESTION_UNAVAILABLE','A customer email is not the next step for this task.');
  const facts=await this.prepareFacts(u,id);if(facts.task.version!==input.version)throw conflict();
  let body=facts.body,generation:FollowupEmail['generation']='record_based';
  if(!this.config.demoMode&&this.config.ai.provider==='openai'&&this.config.ai.model&&this.config.ai.apiKey){
   const response=await new AiOrchestrationService(this.db,this.config).synthesizeNativeRead(u,digest,{requestKey:input.requestKey,propertyId:facts.task.propertyId,leadId:facts.lead.id,operation:'task_email_draft',message:'Write only a concise email draft for staff review using these supplied customer-safe facts. Do not claim you performed a send or booking. Mention an existing viewing only when supplied in savedViewing. Do not include internal notes, private documents, task instructions or internal status labels. Greet the supplied recipient; ask the supplied confirmation questions. No actions or links.',facts:{recipientName:facts.contact.display_name,propertyName:facts.task.propertyName,confirmationQuestions:facts.questions,applicationFollowup:facts.doc,viewingRequest:facts.viewing,savedViewing:facts.savedViewing?{when:formatAssistantDateTime(new Date(facts.savedViewing.starts_at).toISOString(),facts.savedViewing.time_zone??'UTC')}:null,missingRequiredChecklistLabels:facts.missingDocuments,exampleDraft:facts.body},sources:[{id:'task:'+id,kind:'task',title:facts.task.title,url:'/admin/tasks?task='+id,excerpt:'Customer follow-up draft for staff review.',verifiedAt:facts.task.updatedAt,simulated:false}],fallback:facts.body,authorize:async c=>{const current=await tasks.lockForAction(c,u,id);if(current.task.version!==input.version)throw conflict();await this.verifyFacts(c,u,facts);}});
   if(response.mode==='live'&&response.executionStatus==='completed'){body=response.response;generation='live';}else throw new ApiError(503,'AI_DRAFT_UNAVAILABLE','The assistant could not prepare a verified draft. Your task is unchanged; try again later.');
  }
  return this.db.transaction(async c=>{
   const{actor,task}=await tasks.lockForAction(c,u,id);
   return this.receipt(c,actor,input.requestKey,'draft',{id,...input},async()=>{
    if(task.version!==input.version||task.status!=='open'||task.contact_id!==facts.task.contactId||task.lead_id!==facts.lead.id)throw conflict();
    await this.verifyFacts(c,actor,facts);
    const contact=(await c.query('SELECT display_name,email FROM contacts WHERE organization_id=$1 AND id=$2 FOR SHARE',[actor.organization.id,task.contact_id])).rows[0];
    if(contact?.email!==facts.contact.email)throw new ApiError(409,'RECIPIENT_CHANGED','The contact email changed. Prepare a fresh draft.');
    const delivery=await isIsolatedDemo(this.config,c)&&this.config.outboundMode==='simulation'&&/\.test$/i.test(contact.email)?'preview':'unavailable';
    const email={to:contact.email,recipientName:contact.display_name,subject:facts.subject,body,generation,delivery,status:'draft'};
    const eventId=await tasks.recordAction(c,actor,task,{reason:'Email draft prepared for '+contact.display_name,emailDraft:email,deliveryState:'not_sent',fields:[]});
    await c.query('UPDATE tasks SET version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND organization_id=$2',[id,actor.organization.id]);
    return{version:task.version+1,eventId,state:'draft',message:'Draft ready for review.',email:{...email,id:eventId,version:task.version+1}} as FollowupResult;
   });
  });
 }
 async send(u:AuthUser,id:string,input:z.infer<typeof followupSendSchema>):Promise<FollowupResult>{
  return this.db.transaction(async c=>{
   const tasks=new Tasks(this.db),{actor,task}=await tasks.lockForAction(c,u,id);
   return this.receipt(c,actor,input.requestKey,'send',{id,...input},async()=>{
    if(task.version!==input.version||task.status!=='open')throw conflict();
    const event=(await c.query('SELECT metadata FROM task_events WHERE id=$1 AND task_id=$2 AND organization_id=$3 AND actor_user_id=$4 FOR SHARE',[input.draftId,id,actor.organization.id,actor.id])).rows[0],draft=event?.metadata?.emailDraft;
    if(!draft)throw new ApiError(404,'TASK_DRAFT_NOT_FOUND','This draft is unavailable in your task history.');
    const contact=(await c.query('SELECT display_name,email FROM contacts WHERE organization_id=$1 AND id=$2 FOR SHARE',[actor.organization.id,task.contact_id])).rows[0];
    if(!contact?.email||contact.email!==draft.to)throw new ApiError(409,'RECIPIENT_CHANGED','The contact email changed. Prepare a fresh draft.');
    if(input.saveOnly){
     const updated={...draft,subject:input.subject,body:input.body,status:'draft'};
     const eventId=await tasks.recordAction(c,actor,task,{reason:'Email draft updated for '+contact.display_name,emailDraft:updated,deliveryState:'not_sent',fields:[]});
     await c.query('UPDATE tasks SET version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND organization_id=$2',[id,actor.organization.id]);
     return{version:task.version+1,eventId,state:'draft',message:'Draft saved. Nothing has been sent.',email:{...updated,id:eventId,version:task.version+1}} as FollowupResult;
    }
    if((await c.query("SELECT 1 FROM task_events WHERE organization_id=$1 AND task_id=$2 AND metadata->>'originDraftId'=$3",[actor.organization.id,id,input.draftId])).rowCount)throw new ApiError(409,'DRAFT_ALREADY_PROCESSED','This draft has already been processed. Review the task history.');
    if(!await isIsolatedDemo(this.config,c)||this.config.outboundMode!=='simulation'||!/@[^@]+\.test$/i.test(contact.email))throw new ApiError(501,'EMAIL_NOT_CONFIGURED','Email delivery is not configured for this recipient. Your saved draft is unchanged.');
    await requireIsolatedDemo(this.config,c);
    const eventId=await tasks.recordAction(c,actor,task,{reason:'Email preview processed for '+contact.display_name,originDraftId:input.draftId,correspondence:{to:contact.email,subject:input.subject,body:input.body,channel:'email',state:'preview_processed',outboundSent:false},fields:[]});
    const outbox=(await c.query("INSERT INTO conversation_outbox(organization_id,origin,state,provider,task_id,task_event_id,task_contact_id)VALUES($1,'staff','queued','local_simulator',$2,$3,$4)RETURNING id",[actor.organization.id,id,eventId,task.contact_id])).rows[0];
    const delivered=await conversationTransport('email','demo_email').deliver(eventId,'delivered',true);
    await c.query("UPDATE conversation_outbox SET state=$2,provider_message_id=$3,attempts=1,updated_at=clock_timestamp() WHERE id=$1",[outbox.id,delivered.state,delivered.providerMessageId]);
    await c.query('UPDATE tasks SET version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND organization_id=$2',[id,actor.organization.id]);
    return{version:task.version+1,eventId,state:'preview_processed',message:'Email preview processed. No external email was sent.'};
   });
  });
 }
 async comment(u:AuthUser,id:string,input:z.infer<typeof followupCommentSchema>):Promise<FollowupResult>{
  return this.db.transaction(async c=>{
   const tasks=new Tasks(this.db),{actor,task}=await tasks.lockForAction(c,u,id);
   return this.receipt(c,actor,input.requestKey,'comment',{id,...input},async()=>{
    if(task.version!==input.version)throw conflict();
    if(input.complete){await tasks.updateLinked(c,actor,id,{version:input.version,status:'completed',completionComment:input.body});return{version:input.version+1,eventId:id,state:'completed',message:'Task completed and comment saved.'};}
    const eventId=await tasks.recordAction(c,actor,task,{reason:'Staff comment added',comment:input.body,fields:[]});
    await c.query('UPDATE tasks SET version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND organization_id=$2',[id,actor.organization.id]);
    return{version:input.version+1,eventId,state:'comment_saved',message:'Comment saved.'};
   });
  });
 }
}
