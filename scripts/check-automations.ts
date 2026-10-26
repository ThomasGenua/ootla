import assert from 'node:assert/strict';
import type {PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import type {AutomationRule,AutomationDetail,AutomationPreview,AutomationConfiguration,AutomationRunResult,AutomationJob,AutomationInsights} from '../shared/automation-contracts.js';
import type {ConversationConfiguration,ConversationDetail} from '../shared/conversation-contracts.js';
import type {Paginated} from '../shared/property-contracts.js';
import {processTaskReminders,Tasks} from '../server/services/tasks.js';
import {ApiError} from '../server/http/errors.js';
import {conversationTransport} from '../server/conversations/transport.js';
import {withConversationFixture} from './lib/conversation-fixture.js';
let groups=0,phase='isolated setup';const pass=(label:string)=>{groups++;console.log('PASS '+label);};
function fields(r:AutomationRule){return{name:r.name,propertyId:r.propertyId,trigger:r.trigger,delayMinutes:r.delayMinutes,assignment:r.assignment,ownerMembershipId:r.ownerMembershipId,channel:r.channel,template:r.template,knowledgeId:r.knowledgeId,maxAttempts:r.maxAttempts,quietStart:r.quietStart,quietEnd:r.quietEnd,timeZone:r.timeZone,requiresApproval:r.requiresApproval,enabled:r.enabled};}
try{await withConversationFixture('api',async f=>{
 if(process.env.AUTOMATION_DEBUG==='true'){const transaction=f.database.transaction.bind(f.database);f.database.transaction=async<T>(operation:(client:PoolClient)=>Promise<T>):Promise<T>=>transaction(async c=>{try{return await operation(c);}catch(issue){const pg=issue as{code?:string;constraint?:string;routine?:string};if(pg.code&&/^[A-Z0-9]{5}$/.test(pg.code))console.error('Scratch SQL diagnostic: '+pg.code+' '+(pg.constraint??'')+' '+(pg.routine??''));throw issue;}});}

 const{base}=await f.start(),request=(route:string,cookie='',method='GET',body?:unknown,extra:Record<string,string>={})=>fetch(base+route,{method,redirect:'manual',headers:{...(cookie?{Cookie:cookie}:{}),...(method==='GET'?{}:{Origin:f.config.appUrl}),...(body===undefined?{}:{'Content-Type':'application/json'}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const json=async<T=Record<string,unknown>>(route:string,cookie='',method='GET',body?:unknown,status:number|number[]=200):Promise<T>=>{const r=await request(route,cookie,method,body);assert((Array.isArray(status)?status:[status]).includes(r.status),method+' '+route.split('?')[0]+' expected '+JSON.stringify(status)+'; received '+r.status);return r.json() as Promise<T>;};
 const deny=async(route:string,cookie='',method='GET',body?:unknown,status:number|number[]=[400,401,403,404,409,410,501])=>{const r=await request(route,cookie,method,body);assert((Array.isArray(status)?status:[status]).includes(r.status),'Expected denial for '+method+' '+route.split('?')[0]+'; received '+r.status);};
 const login=async(email:string,password:string)=>{const r=await request('/api/auth/login','','POST',{email,password});assert.equal(r.status,200);return(r.headers.get('set-cookie')??'').split(';')[0]!;};
 const admin=await login(f.staffEmail,f.adminPassword),foreign=await login(f.foreignEmail,f.adminPassword),agent=await login(f.staff[0]!.email,f.staffPassword),analyst=await login(f.staff[2]!.email,f.staffPassword);
 const create=async(extra:Record<string,unknown>={})=>{const{rule}=await json<{rule:AutomationRule}>('/api/automations/rules',admin,'POST',{requestKey:randomUUID(),name:'Controlled follow-up '+randomUUID().slice(0,8),propertyId:f.propertyId,trigger:'new_inquiry',delayMinutes:0,assignment:'manual',ownerMembershipId:f.staffMembershipId,channel:'in_app',template:'Review the saved inquiry and arrange the next step.',knowledgeId:null,maxAttempts:3,quietStart:0,quietEnd:0,timeZone:'Africa/Lagos',requiresApproval:false,enabled:true,templateApproved:true,...extra},[200,201]);return rule;};
 const update=async(r:AutomationRule,extra:Record<string,unknown>)=>(await json<{rule:AutomationRule}>('/api/automations/rules/'+r.id,admin,'PUT',{...fields(r),requestKey:randomUUID(),version:r.version,templateApproved:true,...extra})).rule;
 const evaluate=()=>json<AutomationRunResult>('/api/automations/evaluate',admin,'POST',{requestKey:randomUUID(),limit:100});
 const processJobs=()=>json<AutomationRunResult>('/api/automations/process',admin,'POST',{requestKey:randomUUID(),limit:100});
 const jobs=async(ruleId:string)=>(await json<Paginated<AutomationJob>>('/api/automations/activity?'+new URLSearchParams({ruleId,pageSize:'50'}),admin)).items;
 const jobRow=async(id:string)=>(await f.database.query('SELECT * FROM automation_jobs WHERE id=$1',[id])).rows[0]!;
 const lead=async(name:string,stage='new_inquiry')=>{const row=(await f.database.query("INSERT INTO leads(organization_id,property_id,display_name,email,status,intent,pipeline_stage,source,next_action,next_action_at,created_at) VALUES($1,$2,$3,'','new','leasing',$4,'website','Review the synthetic follow-up',now()-interval '1 hour',now()-interval '2 hours') RETURNING id,contact_id",[f.organizationId,f.propertyId,name,stage])).rows[0]!;return row;};
 const pause=async(paused:boolean)=>json<AutomationConfiguration>('/api/automations/pause',admin,'POST',{requestKey:randomUUID(),paused});

 if(process.env.AUTOMATION_PAGINATION_ONLY==='true'){
  phase='bounded rule discovery pagination';
  await f.database.query("INSERT INTO leads(organization_id,property_id,display_name,email,status,intent,pipeline_stage,source,created_at) SELECT $1,$2,'Bounded page inquiry '||lpad(n::text,3,'0'),'','new','leasing','new_inquiry','website',now()-n*interval '1 minute' FROM generate_series(1,105) n",[f.organizationId,f.propertyId]);
  const pagedRule=await create({name:'Bounded 105-record discovery 21',requiresApproval:true});
  for(let i=0;i<7;i++){const run=await json<AutomationRunResult>('/api/automations/evaluate',admin,'POST',{requestKey:randomUUID(),limit:25});assert(run.scanned<=25,'Each discovery pass must remain bounded.');}
  const aggregate=(await f.database.query('SELECT count(*) AS total,count(DISTINCT subject_id) AS subjects,count(*) FILTER(WHERE status=$2) AS awaiting FROM automation_jobs WHERE rule_id=$1',[pagedRule.id,'awaiting_approval'])).rows[0];assert.equal(aggregate.total,'105');assert.equal(aggregate.subjects,'105');assert.equal(aggregate.awaiting,'105');
  const preview=await json<AutomationPreview>('/api/automations/rules/'+pagedRule.id+'/preview?page=5&pageSize=25',admin);assert.equal(preview.candidates.total,105);assert.equal(preview.candidates.items.length,5);
  await json('/api/automations/evaluate',admin,'POST',{requestKey:randomUUID(),limit:25});assert.equal((await f.database.query('SELECT count(*) AS n FROM automation_jobs WHERE rule_id=$1',[pagedRule.id])).rows[0].n,'105');
  assert.equal((await f.database.query("SELECT count(*) AS n FROM task_creation_receipts WHERE namespace='automation'")).rows[0].n,'0');
  pass('persisted bounded discovery progresses beyond its first page to all 105 factual records, wraps safely without duplicate jobs and leaves approval-required actions unexecuted');return;
 }


 if(process.env.AUTOMATION_RETRY_ONLY==='true'){
  phase='terminal transport failure and durable outbox alignment';
  const channels=await json<ConversationConfiguration>('/api/conversations/channels',admin,'POST',{requestKey:randomUUID(),propertyId:f.propertyId,label:'Synthetic retry channel 21',enabled:true,timeZone:'Africa/Lagos',quietStart:0,quietEnd:0});
  const channel=channels.channels.find(c=>c.propertyId===f.propertyId)!;
  const simulation=await json<{detail:ConversationDetail}>('/api/conversations/simulate',admin,'POST',{requestKey:randomUUID(),channelId:channel.id,name:'Synthetic terminal retry visitor 21',message:'Please help me with this property inquiry.',consent:true},201),conversationId=simulation.detail.conversation.id;
  await json('/api/conversations/'+conversationId+'/ownership',admin,'POST',{requestKey:randomUUID(),ownership:'staff_handling'});await json('/api/conversations/'+conversationId+'/ownership',admin,'POST',{requestKey:randomUUID(),ownership:'ai_active'});
  const retryRule=await create({name:'Terminal transport retry limit 21',channel:'website',maxAttempts:2,template:'Please contact the {property} team for the next step.'});await evaluate();await processJobs();const retry=(await jobs(retryRule.id)).find(j=>j.conversationId===conversationId)!;assert(retry);assert((await jobRow(retry.id)).message_id);
  const native=conversationTransport('website'),transport={...native,async deliver(){throw new ApiError(503,'SYNTHETIC_TRANSPORT_FAILURE','Synthetic provider failure.');}},worker=await import('../server/services/automations.js');
  for(let i=0;i<2;i++){await f.database.query("UPDATE automation_jobs SET next_attempt_at=now()-interval '1 second' WHERE id=$1",[retry.id]);await f.database.query("UPDATE conversation_outbox SET next_attempt_at=now()-interval '1 second' WHERE automation_job_id=$1",[retry.id]);await worker.processAutomationJobs(f.database,f.config,{organizationId:f.organizationId,limit:25,transport});}
  const final=await jobRow(retry.id);assert.equal(final.status,'failed');assert.equal(final.attempts,2);const outbox=(await f.database.query('SELECT state,message_id FROM conversation_outbox WHERE automation_job_id=$1',[retry.id])).rows;assert.equal(outbox.length,1);assert.equal(outbox[0].state,'failed');assert.equal((await f.database.query('SELECT status FROM conversation_messages WHERE id=$1',[outbox[0].message_id])).rows[0].status,'failed');
  await worker.processAutomationJobs(f.database,f.config,{organizationId:f.organizationId,limit:25,transport});assert.equal((await jobRow(retry.id)).attempts,2);assert.equal((await f.database.query('SELECT count(*) AS n FROM conversation_outbox WHERE automation_job_id=$1',[retry.id])).rows[0].n,'1');
  pass('thrown transport failures stop at the configured attempt limit and persist matching failed job, message and outbox states without duplicate messages or automatic retries');return;
 }

 phase='configuration, permission checks and bounded rule preview';
 await deny('/api/automations/config');const config=await json<AutomationConfiguration>('/api/automations/config',admin);assert(config.canManage);assert.equal(config.channels.find(v=>v.key==='email')?.configured,false);assert.equal(config.channels.find(v=>v.key==='sms')?.configured,false);assert.equal(config.triggers.find(v=>v.key==='unassigned_maintenance')?.available,false);
 await pause(false);
 const target=await lead('Automation inquiry target 21');let rule=await create();
 await deny('/api/automations/rules',agent,'POST',{...fields(rule),requestKey:randomUUID(),templateApproved:true},403);
 await deny('/api/automations/rules/'+rule.id,foreign,'GET',undefined,404);
 await deny('/api/automations/rules/'+rule.id,analyst,'GET',undefined,[403,404]);
 await deny('/api/automations/rules',admin,'POST',{...fields(rule),requestKey:randomUUID(),propertyId:f.foreignPropertyId,templateApproved:true},[403,404]);
 await deny('/api/automations/rules',admin,'POST',{...fields(rule),requestKey:randomUUID(),maxAttempts:4,templateApproved:true},400);
 const countBefore=Number((await f.database.query('SELECT count(*) AS n FROM automation_jobs')).rows[0].n);
 const preview=await json<AutomationPreview>('/api/automations/rules/'+rule.id+'/preview?pageSize=1',admin);assert.equal(preview.candidates.pageSize,1);assert(preview.candidates.total>=1);assert(preview.candidates.items.length<=1);assert(preview.candidates.items.every(c=>c.reason&&c.url.startsWith('/admin/')));
 assert.equal(Number((await f.database.query('SELECT count(*) AS n FROM automation_jobs')).rows[0].n),countBefore);
 pass('rules expose truthful local/unconfigured channels, defer maintenance until Stage 24, enforce administration/property boundaries and preview real candidates without writing jobs');

 phase='parallel discovery, native tasks, reminders and stable eligibility receipts';
 await Promise.all([evaluate(),evaluate()]);let produced=(await jobs(rule.id)).filter(j=>j.subjectId===target.id);assert.equal(produced.length,1);assert.equal(produced[0]!.status,'queued');
 await Promise.all([processJobs(),processJobs()]);produced=(await jobs(rule.id)).filter(j=>j.subjectId===target.id);assert.equal(produced.length,1);const completed=produced[0]!;assert.equal(completed.status,'completed');assert(completed.taskId);
 const task=await json<{task:{id:string;title:string;details:string;status:string;version:number;owner:{membershipId:string}|null;origin:string;relatedUrl:string}}>('/api/tasks/'+completed.taskId,admin);
 assert.equal(task.task.origin,'system');assert.equal(task.task.owner?.membershipId,f.staffMembershipId);assert(task.task.details.includes(completed.reason));assert(task.task.relatedUrl.includes(target.id));assert.equal((await f.database.query('SELECT count(*) AS n FROM task_creation_receipts WHERE task_id=$1 AND namespace=$2',[completed.taskId,'automation'])).rows[0].n,'1');
 await evaluate();await processJobs();assert.equal((await jobs(rule.id)).filter(j=>j.subjectId===target.id).length,1);assert.equal((await f.database.query('SELECT count(*) AS n FROM automation_jobs WHERE rule_id=$1 AND task_id IS NOT NULL',[rule.id])).rows[0].n,'1');
 await processTaskReminders(f.database);const reminders=await json<Paginated<{id:string;taskId:string;canSnooze:boolean;relatedUrl:string}>>('/api/tasks/reminders',admin);const reminder=reminders.items.find(r=>r.taskId===completed.taskId);assert(reminder?.canSnooze);assert(reminder.relatedUrl.startsWith('/admin/'));
 const snoozed=await json<{reminder:{status:string;snoozeCount:number}}>('/api/tasks/reminders/'+reminder.id+'/snooze',admin,'POST',{minutes:15});assert.equal(snoozed.reminder.status,'snoozed');assert.equal(snoozed.reminder.snoozeCount,1);
 const thread=await json<{thread:{id:string}}>('/api/ask/threads',admin,'POST',{requestKey:randomUUID(),context:{page:'/admin/automations',propertyId:f.propertyId}},201);
 const answer=await json<{messages:{items:Array<{role:string;body:string;sources:Array<{url:string}>}>}}>('/api/ask/threads/'+thread.thread.id+'/messages',admin,'POST',{requestKey:randomUUID(),message:"Explain this property's outstanding work and why the automation reminder exists."});
 const assistant=answer.messages.items.filter(m=>m.role==='assistant').at(-1);assert(assistant);assert(assistant.body.includes(task.task.title)||assistant.body.includes(completed.reason));assert(assistant.sources.some(s=>s.url.includes(completed.taskId!)||s.url.includes('/admin/automations')));
 await json('/api/tasks/'+completed.taskId,admin,'PATCH',{version:task.task.version,status:'completed'});await processTaskReminders(f.database);assert(!(await json<Paginated<{taskId:string}>>('/api/tasks/reminders',admin)).items.some(r=>r.taskId===completed.taskId));
 rule=await update(rule,{enabled:false});
 pass('competing discovery and workers persist one normal task, automation self-updates do not requeue it, native reminders explain/link work and support snooze/completion, and Ask reads the same saved queue');


 phase='unassigned routing and preservation of subsequent staff work';
 const changedTarget=await lead('Staff-edited automation task target 21');
 let preservationRule=await create({assignment:'routing',ownerMembershipId:null});
 await evaluate();await processJobs();const preservationJobs=await jobs(preservationRule.id),changedJob=preservationJobs.find(j=>j.subjectId===changedTarget.id)!;assert(changedJob?.taskId);
 const beforeEdit=await json<{task:{version:number;owner:null|{membershipId:string};status:string}}>('/api/tasks/'+changedJob.taskId,admin);assert.equal(beforeEdit.task.owner,null,'Without a configured eligible routing target the saved task remains unassigned.');
 await json('/api/tasks/'+changedJob.taskId,admin,'PATCH',{version:beforeEdit.task.version,details:'Later staff work must be preserved.',ownerMembershipId:f.staffMembershipId,assignment:'manual'});
 preservationRule=await update(preservationRule,{enabled:false});
 const afterEdit=await json<{task:{status:string;details:string;owner:{membershipId:string}|null}}>('/api/tasks/'+changedJob.taskId,admin);assert.equal(afterEdit.task.status,'open');assert.equal(afterEdit.task.details,'Later staff work must be preserved.');assert.equal(afterEdit.task.owner?.membershipId,f.staffMembershipId);
 const untouched=preservationJobs.find(j=>j.id!==changedJob.id&&j.taskId);assert(untouched);assert.equal((await json<{task:{status:string}}>('/api/tasks/'+untouched.taskId,admin)).task.status,'cancelled');
 pass('routing leaves work unassigned when no eligible route exists; pausing cancels untouched generated tasks through the native service while retaining later staff edits and assignments');

 phase='explicit approval and cancellation when source workflow advances';
 const approvalTarget=await lead('Approval target 21');let approvalRule=await create({requiresApproval:true});await evaluate();let approval=(await jobs(approvalRule.id)).find(j=>j.subjectId===approvalTarget.id)!;assert(approval&&approval.status==='awaiting_approval');await processJobs();assert(!((await jobRow(approval.id)).task_id));
 await deny('/api/automations/jobs/'+approval.id+'/approve',foreign,'POST',{requestKey:randomUUID()},[403,404]);await deny('/api/automations/jobs/'+approval.id+'/approve',analyst,'POST',{requestKey:randomUUID()},[403,404]);
 await json('/api/automations/jobs/'+approval.id+'/approve',admin,'POST',{requestKey:randomUUID()});await f.database.query("UPDATE leads SET pipeline_stage='contacted',status='contacted',version=version+1 WHERE id=$1",[approvalTarget.id]);await processJobs();assert.equal((await jobRow(approval.id)).status,'cancelled');assert(!(await jobRow(approval.id)).task_id);
 approvalRule=await update(approvalRule,{enabled:false});
 pass('approval is a deliberate authorized step and execution cancels approved work after the underlying lead advances');

 phase='missing documents, completed source tasks and factual cancellation';
 let missingRule=await create({trigger:'missing_document',requiresApproval:false});await evaluate();const missing=(await jobs(missingRule.id)).find(j=>j.subjectId===f.applicationId);assert(missing,'The actual configured application has missing required documents.');
 const applicantResponse=await request('/api/applicant/auth/login','','POST',{email:f.applicantEmail,password:f.applicantPassword});assert.equal(applicantResponse.status,200);const applicantCookie=(applicantResponse.headers.get('set-cookie')??'').split(';')[0]!;
 const app=await json<{checklist:Array<{id:string;required:boolean}>}>('/api/applicant/applications/'+f.applicationId,applicantCookie);
 const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
 for(const item of app.checklist.filter(i=>i.required)){const upload=await fetch(base+'/api/applicant/applications/'+f.applicationId+'/documents?'+new URLSearchParams({checklistId:item.id,name:'Synthetic-reminder-evidence.pdf'}),{method:'POST',headers:{Cookie:applicantCookie,Origin:f.config.appUrl,'Content-Type':'application/pdf'},body:new Uint8Array(pdf)});assert.equal(upload.status,201);}
 await processJobs();assert.equal((await jobRow(missing.id)).status,'cancelled');assert(!(await jobRow(missing.id)).task_id);missingRule=await update(missingRule,{enabled:false});
 const sourceTask=await json<{task:{id:string;version:number}}>('/api/tasks',admin,'POST',{propertyId:f.propertyId,title:'Source overdue task 21',dueAt:new Date(Date.now()-3600000).toISOString(),ownerMembershipId:f.staffMembershipId},201);
 let overdueRule=await create({trigger:'overdue_task'});await evaluate();const overdue=(await jobs(overdueRule.id)).find(j=>j.subjectId===sourceTask.task.id);assert(overdue);
 await json('/api/tasks/'+sourceTask.task.id,admin,'PATCH',{version:sourceTask.task.version,status:'completed'});await processJobs();assert.equal((await jobRow(overdue.id)).status,'cancelled');overdueRule=await update(overdueRule,{enabled:false});
 pass('missing-document and overdue-task triggers read canonical records and cancel pending work when the required files arrive or the source task is resolved');

 phase='conversation follow-ups, final delivery eligibility, consent and staff takeover';
 const channels=await json<ConversationConfiguration>('/api/conversations/channels',admin,'POST',{requestKey:randomUUID(),propertyId:f.propertyId,label:'Automation safe channel',enabled:true,timeZone:'Africa/Lagos',quietStart:0,quietEnd:0});const channel=channels.channels.find(c=>c.propertyId===f.propertyId)!;
 const knowledge=await json<{knowledge:{id:string}}>('/api/ai/knowledge',admin,'POST',{requestKey:randomUUID(),propertyId:f.propertyId,title:'Approved reminder next step',body:'Please check the secure portal or ask the property team about the next step.',status:'approved',publicEnabled:true},201);
 const simulated=async(name:string)=>json<{detail:ConversationDetail;publicSession:{token:string}}>('/api/conversations/simulate',admin,'POST',{requestKey:randomUUID(),channelId:channel.id,name,message:'I would like more information about this property.',consent:true},201);
 const conversationRule=await create({channel:'website',template:'Please contact the {property} team about the next step.',knowledgeId:knowledge.knowledge.id});
 const cancellationCases=['reply','consent','takeover','rule_pause','organization_pause'] as const;
 let activeRule=conversationRule;
 for(const cause of cancellationCases){
  const cv=await simulated('Automation cancel '+cause),conversationId=cv.detail.conversation.id;
  // The initial local response is an unsent draft; the follow-up remains a separate durable action.
  await evaluate();const job=(await jobs(activeRule.id)).find(j=>j.conversationId===conversationId||j.subjectId===cv.detail.conversation.leadId);assert(job,'A waiting conversation must have a durable follow-up candidate for '+cause);
  await processJobs();const queued=await jobRow(job.id);assert(queued.message_id||queued.status==='queued');
  if(cause==='reply')await json('/api/conversations/'+conversationId+'/simulate-inbound',admin,'POST',{requestKey:randomUUID(),message:'I am replying now; please wait for staff.'});
  if(cause==='consent')await json('/api/public-conversations/consent','','POST',{token:cv.publicSession.token,requestKey:randomUUID(),consent:false});
  if(cause==='takeover')await json('/api/conversations/'+conversationId+'/ownership',admin,'POST',{requestKey:randomUUID(),ownership:'staff_handling'});
  if(cause==='rule_pause')activeRule=await update(activeRule,{enabled:false});
  if(cause==='organization_pause')await pause(true);
  const processed=await json<ConversationDetail>('/api/conversations/'+conversationId+'/process',admin,'POST',{requestKey:randomUUID(),outcome:'delivered'});await processJobs();
  assert.equal((await jobRow(job.id)).status,'cancelled',cause+' must cancel before delivery');
  assert(!processed.messages.items.some(m=>m.id===queued.message_id&&m.status==='delivered'),cause+' must not deliver the old automation message');
  if(cause==='rule_pause')activeRule=await update(activeRule,{enabled:true});
  if(cause==='organization_pause')await pause(false);
  await f.database.query("UPDATE leads SET pipeline_stage='contacted',status='contacted',version=version+1 WHERE id=$1",[cv.detail.conversation.leadId]);
 }
 activeRule=await update(activeRule,{enabled:false});
 pass('customer reply, consent withdrawal, staff takeover, rule pause and organization pause each cancel a durable queued follow-up before the conversation delivery service can send it');

 phase='timezone quiet hours, bounded retry failures and creator revocation';
 const quietTarget=await lead('Quiet-time target 21'),hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Pacific/Auckland',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
 let quietRule=await create({quietStart:hour,quietEnd:(hour+1)%24,timeZone:'Pacific/Auckland'});await evaluate();const quietJob=(await jobs(quietRule.id)).find(j=>j.subjectId===quietTarget.id)!;assert(quietJob);await processJobs();assert.equal((await jobRow(quietJob.id)).status,'queued');assert(!(await jobRow(quietJob.id)).task_id);
 quietRule=await update(quietRule,{enabled:false});
 const failedTarget=await lead('Bounded failure target 21');let failedRule=await create({maxAttempts:3});await evaluate();const failure=(await jobs(failedRule.id)).find(j=>j.subjectId===failedTarget.id)!;assert(failure);const originalCreate=Tasks.prototype.createLinked;
 try{Tasks.prototype.createLinked=async()=>{throw new ApiError(503,'SYNTHETIC_AUTOMATION_TASK_FAILURE','Synthetic test failure.');};for(let i=0;i<3;i++){await f.database.query("UPDATE automation_jobs SET next_attempt_at=now()-interval '1 second' WHERE id=$1",[failure.id]);await processJobs();}}
 finally{Tasks.prototype.createLinked=originalCreate;}
 assert.equal((await jobRow(failure.id)).status,'failed');assert.equal((await jobRow(failure.id)).attempts,3);assert(!(await jobRow(failure.id)).task_id);failedRule=await update(failedRule,{enabled:false});
 const revokedTarget=await lead('Revoked creator target 21'),revokedRule=await create();await evaluate();const revoked=(await jobs(revokedRule.id)).find(j=>j.subjectId===revokedTarget.id)!;assert(revoked);
 await f.database.query("UPDATE organization_memberships SET role='read_only_analyst' WHERE id=$1",[f.staffMembershipId]);
 const worker=await import('../server/services/automations.js');await worker.processAutomationJobs(f.database,f.config,{organizationId:f.organizationId,limit:100});
 assert.equal((await jobRow(revoked.id)).status,'cancelled');assert(!(await jobRow(revoked.id)).task_id);
 await f.database.query("UPDATE organization_memberships SET role='organization_admin' WHERE id=$1",[f.staffMembershipId]);
 pass('property-local quiet hours defer execution, transient task failures stop at the configured attempt cap and workers recheck the current rule creator role before acting');


 phase='shared final delivery gates, quiet-time bypass prevention and parallel rate limits';
 const rateConversation=await simulated('Automation final delivery gate 21'),rateId=rateConversation.detail.conversation.id;
 await json('/api/conversations/'+rateId+'/ownership',admin,'POST',{requestKey:randomUUID(),ownership:'staff_handling'});
 await json('/api/conversations/'+rateId+'/ownership',admin,'POST',{requestKey:randomUUID(),ownership:'ai_active'});
 let rateRule=await create({channel:'website',template:'Contact the {property} team to agree the next step.',knowledgeId:knowledge.knowledge.id});await evaluate();const rateJob=(await jobs(rateRule.id)).find(j=>j.conversationId===rateId)!;assert(rateJob);await processJobs();assert((await jobRow(rateJob.id)).message_id);
 const rateMessage=(await jobRow(rateJob.id)).message_id,localHour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Pacific/Auckland',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
 // This fixture changes only the stored quiet window, keeping the queued job/version fixed,
 // so the ordinary conversation delivery path must evaluate the actual rule timezone.
 await f.database.query("UPDATE automation_jobs SET next_attempt_at=now()-interval '1 second' WHERE id=$1",[rateJob.id]);await f.database.query("UPDATE conversation_outbox SET next_attempt_at=now()-interval '1 second' WHERE automation_job_id=$1",[rateJob.id]);await f.database.query('UPDATE automation_rules SET quiet_start=$2,quiet_end=$3,time_zone=$4 WHERE id=$1',[rateRule.id,localHour,(localHour+1)%24,'Pacific/Auckland']);
 await json('/api/conversations/'+rateId+'/process',admin,'POST',{requestKey:randomUUID(),outcome:'delivered'});assert.equal((await jobRow(rateJob.id)).status,'queued','The normal conversation delivery path must defer under the active automation rule limit.');assert.notEqual((await f.database.query('SELECT status FROM conversation_messages WHERE id=$1',[rateMessage])).rows[0].status,'delivered');
 await f.database.query("UPDATE automation_rules SET quiet_start=0,quiet_end=0,time_zone='Africa/Lagos' WHERE id=$1",[rateRule.id]);await f.database.query("UPDATE automation_jobs SET next_attempt_at=now()-interval '1 second' WHERE id=$1",[rateJob.id]);await f.database.query("UPDATE conversation_outbox SET next_attempt_at=now()-interval '1 second' WHERE automation_job_id=$1",[rateJob.id]);
 const inserted=(await f.database.query("INSERT INTO automation_events(organization_id,rule_id,kind,reason) SELECT $1,$2,'delivery_attempt','Synthetic rate cap fixture 21' FROM generate_series(1,20) RETURNING id",[f.organizationId,rateRule.id])).rows.map(r=>r.id);
 await json('/api/conversations/'+rateId+'/process',admin,'POST',{requestKey:randomUUID(),outcome:'delivered'});assert.equal((await jobRow(rateJob.id)).status,'queued');assert.notEqual((await f.database.query('SELECT status FROM conversation_messages WHERE id=$1',[rateMessage])).rows[0].status,'delivered');
 await f.database.query('DELETE FROM automation_events WHERE id=ANY($1::uuid[])',[inserted]);
 await f.database.query("UPDATE automation_jobs SET next_attempt_at=now()-interval '1 second' WHERE id=$1",[rateJob.id]);await f.database.query("UPDATE conversation_outbox SET next_attempt_at=now()-interval '1 second' WHERE automation_job_id=$1",[rateJob.id]);
 const race=await Promise.allSettled([processJobs(),json('/api/conversations/'+rateId+'/process',admin,'POST',{requestKey:randomUUID(),outcome:'delivered'})]);assert(race.every(r=>r.status==='fulfilled'),'Competing automation and conversation workers must not deadlock or fail.');
 assert.equal((await jobRow(rateJob.id)).status,'completed');assert.equal((await f.database.query('SELECT status FROM conversation_messages WHERE id=$1',[rateMessage])).rows[0].status,'delivered');assert.equal((await f.database.query('SELECT count(*) AS n FROM conversation_outbox WHERE message_id=$1',[rateMessage])).rows[0].n,'1');
 rateRule=await update(rateRule,{enabled:false});
 pass('the ordinary conversation delivery path enforces automation-rule timezone and rate caps; competing conversation/automation workers deliver one mapped message without deadlocks or duplicates');

 phase='remaining factual triggers and bounded private activity';
 const scheduled=await lead('Scheduled follow-up target 21','contacted');let scheduledRule=await create({trigger:'scheduled_follow_up'});const scheduledPreview=await json<AutomationPreview>('/api/automations/rules/'+scheduledRule.id+'/preview',admin);assert(scheduledPreview.candidates.items.some(c=>c.subjectId===scheduled.id));scheduledRule=await update(scheduledRule,{enabled:false});
 const tourLead=await lead('Missed viewing target 21','tour_scheduled');const tour=(await f.database.query("INSERT INTO viewings(organization_id,property_id,lead_id,starts_at,status) VALUES($1,$2,$3,now()-interval '1 day','no_show') RETURNING id",[f.organizationId,f.propertyId,tourLead.id])).rows[0]!;
 let missedRule=await create({trigger:'missed_viewing'});const missedPreview=await json<AutomationPreview>('/api/automations/rules/'+missedRule.id+'/preview',admin);assert(missedPreview.candidates.items.some(c=>c.subjectId===tour.id));missedRule=await update(missedRule,{enabled:false});

 await json('/api/calendar/properties/'+f.propertyId+'/settings',admin,'PUT',{version:1,enabled:true,timeZone:'Africa/Lagos',durationMinutes:30,bufferBeforeMinutes:15,bufferAfterMinutes:15,location:'Synthetic viewing reception',publicBookingEnabled:true});
 await json('/api/calendar/properties/'+f.propertyId+'/staff/'+f.staffMembershipId+'/availability',admin,'PUT',{version:1,enabled:true,windows:Array.from({length:7},(_,weekday)=>({weekday,start:'09:00',end:'17:00'}))});
 const invitedLead=await lead('Unbooked viewing invitation target 21','contacted');
 await json('/api/calendar/invitations',admin,'POST',{requestKey:randomUUID(),leadId:invitedLead.id,propertyId:f.propertyId,ownerMembershipId:f.staffMembershipId,expiresInHours:24},201);

 const bookedLead=await lead('Scheduled viewing follow-up target 21','tour_scheduled');const bookedTour=(await f.database.query("INSERT INTO viewings(organization_id,property_id,lead_id,starts_at,status) VALUES($1,$2,$3,now()+interval '1 day','scheduled') RETURNING id",[f.organizationId,f.propertyId,bookedLead.id])).rows[0]!;let requestedRule=await create({trigger:'tour_follow_up'});const requestedPreview=await json<AutomationPreview>('/api/automations/rules/'+requestedRule.id+'/preview',admin);assert(requestedPreview.candidates.items.some(c=>c.subjectId===bookedTour.id));assert(requestedPreview.candidates.items.some(c=>c.subjectId===invitedLead.id&&/no viewing is booked|selected time/i.test(c.reason)));assert.equal((await f.database.query('SELECT count(*) AS n FROM viewings WHERE lead_id=$1',[invitedLead.id])).rows[0].n,'0');requestedRule=await update(requestedRule,{enabled:false});
 const activity=await json<Paginated<AutomationJob>>('/api/automations/activity?page=1&pageSize=2',admin);assert(activity.total>2);assert.equal(activity.items.length,2);assert.equal(activity.pageSize,2);assert(activity.items.every(j=>j.reason&&j.url.startsWith('/admin/')));
 const foreignActivity=await json<Paginated<AutomationJob>>('/api/automations/activity?pageSize=50',foreign);assert(!foreignActivity.items.some(j=>j.propertyId===f.propertyId));
 await deny('/api/automations/rules',admin,'POST',{...fields(rule),requestKey:randomUUID(),channel:'sms',enabled:true,templateApproved:true},[400,409,501]);
 assert((await f.database.query('SELECT DISTINCT provider FROM conversation_outbox')).rows.every(r=>r.provider==='local_simulator'));
 pass('scheduled/missed-viewing triggers read dated CRM records, activity remains paginated and organization-scoped, and unavailable SMS transport cannot be activated');
 });console.log('Stage 21 automation verification passed ('+groups+' focused groups).');
}catch(issue){console.error('Stage 21 verification failed during '+phase+'; secrets and raw database configuration are omitted.');if(issue instanceof assert.AssertionError)console.error(issue.message);else if(issue instanceof ReferenceError)console.error(issue.name+': '+issue.message);else console.error(issue instanceof Error?issue.name:'Unknown verification failure');process.exitCode=1;}
