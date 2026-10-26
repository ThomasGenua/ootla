import assert from 'node:assert/strict';
import type {PoolClient} from 'pg';
import type {AuthUser} from '../shared/contracts.js';
import {Conversations} from '../server/services/conversations.js';
import {Tasks} from '../server/services/tasks.js';
import {randomUUID,createHmac} from 'node:crypto';
import type {AskThreadDetail,AskMessage,PublicConversationStart,PublicConversationDetail,ConversationConfiguration,ConversationDetail} from '../shared/conversation-contracts.js';
import type {PublicCalendarInvitation,PublicCalendarConfirmation} from '../shared/calendar-contracts.js';
import {conversationTransport} from '../server/conversations/transport.js';
import {ApiError} from '../server/http/errors.js';
import {withConversationFixture} from './lib/conversation-fixture.js';
let groups=0,phase='isolated setup';
const pass=(label:string)=>{groups++;console.log('PASS '+label);};
const latest=(d:AskThreadDetail):AskMessage=>{const a=d.messages.items.filter(m=>m.role==='assistant').at(-1);assert(a,'A saved assistant response is required.');return a;};
try{
 await withConversationFixture('api',async f=>{
  if(process.env.CONVERSATION_DEBUG==='true'){const transaction=f.database.transaction.bind(f.database);f.database.transaction=async<T>(operation:(client:PoolClient)=>Promise<T>):Promise<T>=>transaction(async c=>{try{return await operation(c);}catch(issue){const pg=issue as{code?:string;constraint?:string;routine?:string};if(pg.code&&/^[A-Z0-9]{5}$/.test(pg.code))console.error('Scratch SQL diagnostic: '+pg.code+' '+(pg.constraint??'')+' '+(pg.routine??''));throw issue;}});}
  const{base}=await f.start();
  const request=(route:string,cookie='',method='GET',body?:unknown,headers:Record<string,string>={})=>fetch(base+route,{method,redirect:'manual',headers:{...(cookie?{Cookie:cookie}:{}),...(method==='GET'?{}:{Origin:f.config.appUrl}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const json=async<T=Record<string,unknown>>(route:string,cookie='',method='GET',body?:unknown,status:number|number[]=200):Promise<T>=>{const response=await request(route,cookie,method,body);assert((Array.isArray(status)?status:[status]).includes(response.status),method+' '+route.split('?')[0]+' expected '+JSON.stringify(status)+'; received '+response.status);return response.json() as Promise<T>;};
  const deny=async(route:string,cookie='',method='GET',body?:unknown,status:number|number[]=[400,401,403,404,409,410,501])=>{const response=await request(route,cookie,method,body);assert((Array.isArray(status)?status:[status]).includes(response.status),'Expected denial for '+method+' '+route.split('?')[0]+'; received '+response.status);return response;};
  const login=async(email:string,password:string)=>{const response=await request('/api/auth/login','','POST',{email,password});assert.equal(response.status,200);const cookie=response.headers.get('set-cookie')??'';assert(/HttpOnly/i.test(cookie)&&/SameSite=Lax/i.test(cookie));return cookie.split(';')[0]!;};
  const admin=await login(f.staffEmail,f.adminPassword),foreign=await login(f.foreignEmail,f.adminPassword),agent=await login(f.staff[0]!.email,f.staffPassword),otherAgent=await login(f.staff[1]!.email,f.staffPassword),analyst=await login(f.staff[2]!.email,f.staffPassword);
  const create=async(cookie:string,context:Record<string,unknown>)=>json<AskThreadDetail>('/api/ask/threads',cookie,'POST',{requestKey:randomUUID(),context},[200,201]);
  const ask=async(thread:string,message:string,cookie=admin,extra:Record<string,unknown>={})=>json<AskThreadDetail>('/api/ask/threads/'+thread+'/messages',cookie,'POST',{requestKey:randomUUID(),message,...extra},[200,201,202]);

  if(process.env.CONVERSATION_SAFETY_ONLY==='true'){
   phase='post-automation conversation locking and private capability safety';
   await json('/api/ai/knowledge',admin,'POST',{requestKey:randomUUID(),propertyId:f.propertyId,title:'Safety office hours',body:'The property office is open Monday to Friday from 09:00 to 17:00.',status:'approved',publicEnabled:true},201);
   const config=await json<ConversationConfiguration>('/api/conversations/channels',admin,'POST',{requestKey:randomUUID(),propertyId:f.propertyId,label:'Isolated locking safety channel',enabled:true,timeZone:'Africa/Lagos',quietStart:0,quietEnd:0},[200,201]);
   const channel=config.channels.find(c=>c.propertyId===f.propertyId);assert(channel);
   const startBody={requestKey:randomUUID(),channelId:channel.id,name:'Lock safety visitor',email:f.applicantEmail,message:'What are the office hours?',consent:false};
   const peopleBefore=Number((await f.database.query('SELECT count(*) AS n FROM contacts WHERE organization_id=$1',[f.organizationId])).rows[0].n);
   const [a,b]=await Promise.all([json<PublicConversationStart>('/api/public-conversations/start','','POST',startBody,[200,201]),json<PublicConversationStart>('/api/public-conversations/start','','POST',startBody,[200,201])]);
   assert.equal(a.token,b.token);assert.equal(a.detail.conversation.id,b.detail.conversation.id);
   assert.equal(Number((await f.database.query('SELECT count(*) AS n FROM contacts WHERE organization_id=$1',[f.organizationId])).rows[0].n),peopleBefore+1);
   assert(a.detail.messages.items.some(m=>m.role==='assistant'&&m.status==='delivered'));
   const detail=await json<ConversationDetail>('/api/conversations/'+a.detail.conversation.id,admin);
   assert.notEqual(detail.conversation.contactId,f.contactId);
   await json('/api/conversations/'+detail.conversation.id+'/messages',admin,'POST',{requestKey:randomUUID(),body:'SAFETY_INTERNAL_NOTE_20',kind:'internal_note'});
   const visible=await json<PublicConversationDetail>('/api/public-conversations/read','','POST',{token:a.token});
   assert(!JSON.stringify(visible).includes('SAFETY_INTERNAL_NOTE_20'));assert(!JSON.stringify(visible).includes('PRIVATE_STAFF_MARKER_20'));
   await deny('/api/conversations/'+detail.conversation.id,foreign,'GET',undefined,404);
   await deny('/api/public-conversations/read','','POST',{token:'0'.repeat(64)},[401,403,404,410]);
   pass('post-automation parallel inquiry replay returns one stable capability and one identity; requested public answers remain usable without follow-up consent and staff notes stay private');

   const simulated=await json<{detail:ConversationDetail;publicSession:{token:string;expiresAt:string}}>('/api/conversations/simulate',admin,'POST',{requestKey:randomUUID(),channelId:channel.id,name:'Synthetic takeover safety visitor',message:'What are the office hours?',consent:true},[200,201]);
   const id=simulated.detail.conversation.id;
   const auth=await json<{user:AuthUser}>('/api/auth/me',admin),digest=createHmac('sha256',f.config.sessionSecret).update(admin.slice('ootla.sid='.length)).digest('hex');
   let entered!:()=>void,release!:()=>void;const enteredModel=new Promise<void>(resolve=>{entered=resolve;}),releaseModel=new Promise<void>(resolve=>{release=resolve;});
   const delayed=new Conversations(f.database,f.config,{async infer(input){entered();await releaseModel;return{result:{response:'Synthetic bounded answer.',internalSummary:'Synthetic locking check.',sourceIds:input.sources.map(s=>s.id),proposedActions:[],handoffReason:null},usage:{inputTokens:100,outputTokens:50,estimated:true}};}});
   const eventKey=randomUUID(),running=delayed.simulateInbound(auth.user,digest,id,{requestKey:eventKey,message:'What are the current office hours?'});
   await Promise.race([enteredModel,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Isolated inference barrier did not start.')),5000))]);
   try{await json('/api/conversations/'+id+'/ownership',admin,'POST',{requestKey:randomUUID(),ownership:'staff_handling'});}finally{release();}
   await running;
   const processed=await json<ConversationDetail>('/api/conversations/'+id+'/process',admin,'POST',{requestKey:randomUUID(),outcome:'delivered'});
   assert.equal(processed.conversation.ownership,'staff_handling');
   assert(!processed.messages.items.some(m=>m.role==='assistant'&&['queued','sent','delivered'].includes(m.status)));
   assert.equal(Number((await f.database.query("SELECT count(*) AS n FROM conversation_outbox WHERE conversation_id=$1 AND state IN('queued','sent') AND origin IN('ai','automation')",[id])).rows[0].n),0);
   assert.equal(Number((await f.database.query("SELECT count(*) AS n FROM conversation_messages WHERE conversation_id=$1 AND request_key=$2 AND role='customer'",[id,eventKey])).rows[0].n),1);
   pass('shared per-organization locking allows takeover during inference and permanently cancels pending and late AI responses before delivery without losing the inbound event');
   return;
  }

  phase='staff scope and persisted context';
  await deny('/api/ask/threads');
  const normal=await create(admin,{page:'/admin/applications',applicationId:f.applicationId});
  assert.equal(normal.thread.context.propertyId,f.propertyId);assert.equal(normal.thread.context.leadId,f.leadId);assert.equal(normal.thread.context.applicationId,f.applicationId);
  const leadSummary=latest(await ask(normal.thread.id,'Summarize this lead.'));
  assert.equal(leadSummary.mode,'simulated');assert.match(leadSummary.body,/Demo Applicant|application|next action|assigned|checklist/i);assert(leadSummary.sources.some(s=>s.url.includes(f.leadId)));assert(!leadSummary.body.includes('PRIVATE_STAFF_MARKER_20'));
  const checklist=latest(await ask(normal.thread.id,'What documents are missing from this application?'));
  assert.match(checklist.body,/Identity document|Supporting document/i);assert(checklist.sources.some(s=>s.url.includes(f.applicationId)));
  assert.equal((await json<AskThreadDetail>('/api/ask/threads/'+normal.thread.id,admin)).messages.total,4);
  await deny('/api/ask/threads/'+normal.thread.id,foreign, 'GET',undefined,404);await deny('/api/ask/threads/'+normal.thread.id,otherAgent,'GET',undefined,404);
  await deny('/api/ask/threads',agent,'POST',{requestKey:randomUUID(),context:{page:'/admin/properties',propertyId:f.restrictedPropertyId}},[403,404]);
  await deny('/api/ask/threads',admin,'POST',{requestKey:randomUUID(),context:{page:'/admin/leads',propertyId:f.propertyId,leadId:f.restrictedLeadId}},[403,404]);
  const own=await create(agent,{page:'/admin/leads',leadId:f.leadId});
  await f.database.query('DELETE FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=$3',[f.organizationId,f.staff[0]!.membershipId,f.propertyId]);
  await deny('/api/ask/threads/'+own.thread.id,agent,'GET',undefined,[403,404]);
  const ownList=await json<{items:Array<{id:string}>}>('/api/ask/threads',agent);assert(!ownList.items.some(t=>t.id===own.thread.id));
  await f.database.query('INSERT INTO property_access_assignments(organization_id,membership_id,property_id) VALUES($1,$2,$3)',[f.organizationId,f.staff[0]!.membershipId,f.propertyId]);
  await f.database.query('INSERT INTO contact_property_links(organization_id,contact_id,property_id) VALUES($1,$2,$3)',[f.organizationId,f.contactId,f.restrictedPropertyId]);
  await f.database.query('INSERT INTO lead_property_interests(organization_id,lead_id,contact_id,property_id) VALUES($1,$2,$3,$4)',[f.organizationId,f.leadId,f.contactId,f.restrictedPropertyId]);
  await deny('/api/ask/threads/'+own.thread.id,agent,'GET',undefined,[403,404]);
  await f.database.query('DELETE FROM lead_property_interests WHERE organization_id=$1 AND lead_id=$2 AND property_id=$3',[f.organizationId,f.leadId,f.restrictedPropertyId]);
  pass('Ask Ootla persists actor-bound follow-ups, derives application/lead/property context, links real checklist facts and rechecks organization and every property grant on history reads');

  phase='action previews, domain-service execution and truthful priorities';
  const tasksBefore=Number((await f.database.query('SELECT count(*) AS n FROM tasks WHERE organization_id=$1',[f.organizationId])).rows[0].n);
  const actionThread=await create(admin,{page:'/admin/leads',leadId:f.leadId});
  const taskMessage={requestKey:randomUUID(),message:'Create a follow-up task.',task:{title:'Confirmed Ask Ootla follow-up 20',dueAt:new Date(Date.now()+86400000).toISOString(),priority:'high'}};
  const proposal=await json<AskThreadDetail>('/api/ask/threads/'+actionThread.thread.id+'/messages',admin,'POST',taskMessage);
  const action=latest(proposal).action;assert(action&&action.status==='proposed'&&!action.taskId);
  assert.equal(Number((await f.database.query('SELECT count(*) AS n FROM tasks WHERE organization_id=$1',[f.organizationId])).rows[0].n),tasksBefore);
  const replay=await json<AskThreadDetail>('/api/ask/threads/'+actionThread.thread.id+'/messages',admin,'POST',taskMessage);assert.equal(replay.messages.total,2);
  await deny('/api/ask/threads/'+actionThread.thread.id+'/actions/'+action.id+'/confirm',admin,'POST',{requestKey:randomUUID(),confirm:false},400);
  const confirm={requestKey:randomUUID(),confirm:true};
  const results=await Promise.all([json<AskThreadDetail>('/api/ask/threads/'+actionThread.thread.id+'/actions/'+action.id+'/confirm',admin,'POST',confirm),json<AskThreadDetail>('/api/ask/threads/'+actionThread.thread.id+'/actions/'+action.id+'/confirm',admin,'POST',confirm)]);
  const savedAction=latest(results[0]!).action;assert(savedAction?.status==='completed'&&savedAction.taskId);assert.equal(latest(results[1]!).action?.taskId,savedAction.taskId);
  const task=await json<{task:{title:string;leadId:string;contactId:string;propertyId:string;actionable:boolean;origin:string}}>('/api/tasks/'+savedAction.taskId,admin);
  assert.equal(task.task.title,taskMessage.task.title);assert.equal(task.task.leadId,f.leadId);assert.equal(task.task.contactId,f.contactId);assert.equal(task.task.propertyId,f.propertyId);assert(task.task.actionable);assert.equal(task.task.origin,'ai_simulation');
  assert.equal(Number((await f.database.query('SELECT count(*) AS n FROM tasks WHERE organization_id=$1',[f.organizationId])).rows[0].n),tasksBefore+1);
  const ownAction=latest(await ask(own.thread.id,'Create a follow-up task.',agent,{task:{...taskMessage.task,title:'Revoked proposal'}})).action;assert(ownAction);
  await f.database.query('DELETE FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=$3',[f.organizationId,f.staff[0]!.membershipId,f.propertyId]);
  await deny('/api/ask/threads/'+own.thread.id+'/actions/'+ownAction.id+'/confirm',agent,'POST',{requestKey:randomUUID(),confirm:true},[403,404]);
  await f.database.query('INSERT INTO property_access_assignments(organization_id,membership_id,property_id) VALUES($1,$2,$3)',[f.organizationId,f.staff[0]!.membershipId,f.propertyId]);

  const policy=await json<{allowTaskCreation:boolean;mutationConfirmation:string}>('/api/ask/policy',admin);assert.equal(policy.mutationConfirmation,'always');
  await deny('/api/ask/policy',agent,'PUT',{allowTaskCreation:false},403);
  await json('/api/ask/policy',admin,'PUT',{allowTaskCreation:false});
  await deny('/api/ask/threads/'+own.thread.id+'/actions/'+ownAction.id+'/confirm',agent,'POST',{requestKey:randomUUID(),confirm:true},403);
  await json('/api/ask/policy',admin,'PUT',{allowTaskCreation:true});
  await json('/api/tasks',admin,'POST',{propertyId:f.propertyId,leadId:f.leadId,contactId:f.contactId,title:'Priority real overdue task 20',dueAt:new Date(Date.now()-86400000).toISOString(),priority:'urgent',ownerMembershipId:f.staffMembershipId},[200,201]);
  const closedLead=(await f.database.query("INSERT INTO leads(organization_id,property_id,display_name,email,status,intent,pipeline_stage,source) VALUES($1,$2,'Closed synthetic inquiry','','contacted','leasing','lost_closed','demo') RETURNING id,contact_id",[f.organizationId,f.propertyId])).rows[0]!;
  await f.database.query("INSERT INTO tasks(organization_id,property_id,lead_id,contact_id,title,due_at,status,owner_membership_id) VALUES($1,$2,$3,$4,'NONACTIONABLE_CLOSED_PRIORITY_20',now()-interval '1 day','open',$5)",[f.organizationId,f.propertyId,closedLead.id,closedLead.contact_id,f.staffMembershipId]);
  const priorities=latest(await ask(normal.thread.id,'What needs my attention today?'));
  assert(priorities.body.includes('Priority real overdue task 20'));assert.match(priorities.body,/overdue/i);assert(!priorities.body.includes('NONACTIONABLE_CLOSED_PRIORITY_20'));
  assert(priorities.sources.every(s=>s.url.startsWith('/admin/')));assert(priorities.sources.some(s=>s.verifiedAt));
  const refused=latest(await ask(normal.thread.id,'Approve the applicant and authorize payment.'));assert.match(refused.body,/outside|policy|staff/i);assert(!refused.action);
  pass('task changes require explicit preview/confirmation, competing retries create exactly one normal-service task, execution rechecks grants and priorities exclude irrelevant closed work');


  phase='truthful saved action failure and deliberate recovery';
  const beforeFailure=Number((await f.database.query('SELECT count(*) AS n FROM tasks WHERE organization_id=$1',[f.organizationId])).rows[0].n),realCreate=Tasks.prototype.createLinked;
  try{
   Tasks.prototype.createLinked=async()=>{throw new ApiError(503,'SYNTHETIC_TASK_SERVICE_FAILURE','Synthetic fixture failure.');};
   const failedConfirmation=latest(await json<AskThreadDetail>('/api/ask/threads/'+own.thread.id+'/actions/'+ownAction.id+'/confirm',agent,'POST',{requestKey:randomUUID(),confirm:true}));
   assert.equal(failedConfirmation.action?.status,'failed');assert.equal(failedConfirmation.status,'failed');assert(!failedConfirmation.action?.taskId);assert.match(failedConfirmation.body,/could not|not.*completed|not.*saved/i);
  }finally{Tasks.prototype.createLinked=realCreate;}
  const failureRead=latest(await json<AskThreadDetail>('/api/ask/threads/'+own.thread.id,agent));assert.equal(failureRead.action?.status,'failed');
  assert.equal(Number((await f.database.query('SELECT count(*) AS n FROM tasks WHERE organization_id=$1',[f.organizationId])).rows[0].n),beforeFailure);
  const recovered=latest(await json<AskThreadDetail>('/api/ask/threads/'+own.thread.id+'/actions/'+ownAction.id+'/confirm',agent,'POST',{requestKey:randomUUID(),confirm:true}));
  assert.equal(recovered.action?.status,'completed');assert(recovered.action.taskId);assert.equal(Number((await f.database.query('SELECT count(*) AS n FROM tasks WHERE organization_id=$1',[f.organizationId])).rows[0].n),beforeFailure+1);
  pass('native task-service failure persists a truthful failed action with no partial task; read-only history does not retry and explicit confirmation recovers exactly once');

  phase='approved public knowledge and deliberate channels';
  const knowledge=async(propertyId:string,title:string,body:string,status='approved')=>json('/api/ai/knowledge',admin,'POST',{requestKey:randomUUID(),propertyId,title,body,status,publicEnabled:title==='Office hours'},201);
  await knowledge(f.propertyId,'Office hours','The property office is open Monday to Friday from 09:00 to 17:00. Please arrange viewings through the available booking slots.');
  await knowledge(f.propertyId,'Private draft','DRAFT_KNOWLEDGE_PRIVATE_20','draft');
  await knowledge(f.restrictedPropertyId,'Restricted office hours','OTHER_PROPERTY_PRIVATE_20');
  const publish=async(quietStart=0,quietEnd=0,enabled=true)=>json<ConversationConfiguration>('/api/conversations/channels',admin,'POST',{requestKey:randomUUID(),propertyId:f.propertyId,label:'Synthetic property questions',enabled,timeZone:'Africa/Lagos',quietStart,quietEnd},[200,201]);
  await deny('/api/conversations/config');
  await deny('/api/conversations/channels',agent,'POST',{requestKey:randomUUID(),propertyId:f.propertyId,label:'Not an admin publication',enabled:true},403);
  const config=await publish(),channel=config.channels.find(c=>c.propertyId===f.propertyId);assert(channel?.enabled);assert.equal(config.transports.email,'not_configured');assert.equal(config.transports.sms,'not_configured');
  const catalog=await json<{channels:Array<{id:string;propertyName:string}>}>('/api/public-conversations/catalog');assert(catalog.channels.some(c=>c.id===channel.id));assert(!JSON.stringify(catalog).includes(f.restrictedPropertyId));
  await deny('/api/conversations/provider/sms/callback','','POST',{eventId:'forged-provider-event'},[400,401,403,404,501]);
  const priorPeople=Number((await f.database.query('SELECT count(*) AS n FROM contacts WHERE organization_id=$1',[f.organizationId])).rows[0].n),priorLeads=Number((await f.database.query('SELECT count(*) AS n FROM leads WHERE organization_id=$1',[f.organizationId])).rows[0].n);
  const startBody={requestKey:randomUUID(),channelId:channel.id,name:'Synthetic Website Visitor',email:f.applicantEmail,message:'What are the property office hours?',consent:true};
  const started=await json<PublicConversationStart>('/api/public-conversations/start','','POST',startBody,[200,201]);
  assert(/^[a-f0-9]{64}$/.test(started.token));assert.equal(started.detail.conversation.identityVerified,false);
  assert.equal(started.detail.conversation.mode,'simulation');assert(!JSON.stringify(started).includes('PRIVATE_STAFF_MARKER_20'));assert(!JSON.stringify(started).includes('DRAFT_KNOWLEDGE_PRIVATE_20'));assert(!JSON.stringify(started).includes('OTHER_PROPERTY_PRIVATE_20'));
  const customer=await json<ConversationDetail>('/api/conversations/'+started.detail.conversation.id,admin);assert.equal(customer.conversation.property.id,f.propertyId);assert.notEqual(customer.conversation.contactId,f.contactId);
  const linked=(await f.database.query('SELECT l.contact_id,l.source,l.property_id,c.email FROM leads l JOIN contacts c ON c.organization_id=l.organization_id AND c.id=l.contact_id WHERE l.id=$1 AND l.organization_id=$2',[customer.conversation.leadId,f.organizationId])).rows[0]!;
  assert.equal(linked.contact_id,customer.conversation.contactId);assert.equal(linked.property_id,f.propertyId);assert.equal(linked.email,f.applicantEmail);
  assert.equal(Number((await f.database.query('SELECT count(*) AS n FROM contacts WHERE organization_id=$1',[f.organizationId])).rows[0].n),priorPeople+1);
  assert.equal(Number((await f.database.query('SELECT count(*) AS n FROM leads WHERE organization_id=$1',[f.organizationId])).rows[0].n),priorLeads+1);
  const startRetry=await json<PublicConversationStart>('/api/public-conversations/start','','POST',startBody,[200,201]);assert.equal(startRetry.detail.conversation.id,customer.conversation.id);assert.equal(startRetry.token,started.token);
  await deny('/api/public-conversations/start','','POST',{...startBody,name:'Different content under reused request'},409);
  const publicRead=()=>json<PublicConversationDetail>('/api/public-conversations/read','','POST',{token:started.token});
  const visible=await publicRead();assert(visible.messages.items.some(m=>m.role==='assistant'&&/09:00.*17:00/.test(m.body)));assert(visible.messages.items.flatMap(m=>m.sources).some(s=>s.title==='Office hours'));
  await deny('/api/conversations/'+customer.conversation.id,foreign,'GET',undefined,404);
  await deny('/api/public-conversations/read','','POST',{token:'0'.repeat(64)},[401,403,404,410]);
  const dbSession=(await f.database.query('SELECT session_digest FROM customer_conversations WHERE id=$1',[customer.conversation.id])).rows[0];assert(dbSession&&!JSON.stringify(dbSession).includes(started.token));
  pass('public inquiries deliberately publish scoped channels, create canonical linked identities without email/name merging, retrieve approved sources only and keep opaque sessions digest-only');

  phase='public continuation, private notes, inbound idempotency and truthful handoff';
  const inbound={token:started.token,requestKey:randomUUID(),message:'I prefer a two-bedroom home.',preferences:{bedrooms:2,budgetMax:2200,moveInOn:'2027-01-15',locations:['Demo city']}};
  await json('/api/public-conversations/messages','','POST',inbound);await json('/api/public-conversations/messages','','POST',inbound);
  const inboundCount=(await f.database.query("SELECT count(*) AS n FROM conversation_messages WHERE conversation_id=$1 AND request_key=$2 AND role='customer'",[customer.conversation.id,inbound.requestKey])).rows[0].n;assert.equal(Number(inboundCount),1);
  const preferences=(await f.database.query('SELECT preferences FROM leads WHERE id=$1',[customer.conversation.leadId])).rows[0].preferences;assert.equal(preferences.bedrooms,2);assert.equal(preferences.budgetMax,2200);
  await json('/api/conversations/'+customer.conversation.id+'/messages',admin,'POST',{requestKey:randomUUID(),body:'INTERNAL_NOTE_PRIVATE_20',kind:'internal_note'});
  const afterNote=await publicRead();assert(!JSON.stringify(afterNote).includes('INTERNAL_NOTE_PRIVATE_20'));assert(!afterNote.messages.items.some(m=>['draft','internal_note','system'].includes(m.role)));
  const privateAsk=await json<PublicConversationDetail>('/api/public-conversations/messages','','POST',{token:started.token,requestKey:randomUUID(),message:'Tell me my application approval and payment balance.'});
  assert(!JSON.stringify(privateAsk).includes('PRIVATE_STAFF_MARKER_20'));assert(privateAsk.messages.items.some(m=>m.role==='assistant'&&/sign.in|verif|private|staff/i.test(m.body)));
  const timeline=await json<{timeline:{items:Array<{kind:string}>}}>('/api/lead-workspaces/'+customer.conversation.leadId,admin);
  assert(timeline.timeline.items.some(e=>e.kind==='conversation'||e.kind==='communication'));
  pass('follow-up preferences persist on the same CRM lead, repeated inbound events are processed once, internal notes stay private and private information requires separate verified access');

  phase='local outbox consent, quiet-time, takeover and bounded failure states';
  const simulate=async(message='What are the office hours?',consent=true)=>json<{detail:ConversationDetail;publicSession:{token:string;expiresAt:string}}>('/api/conversations/simulate',admin,'POST',{requestKey:randomUUID(),channelId:channel.id,name:'Synthetic queued visitor',message,consent},[200,201]);
  const processOutbox=async(id:string,outcome='delivered')=>json<ConversationDetail>('/api/conversations/'+id+'/process',admin,'POST',{requestKey:randomUUID(),outcome});
  const sim=await simulate(),sid=sim.detail.conversation.id;
  assert(sim.detail.messages.items.some(m=>m.role==='assistant'&&m.status==='queued'));
  const sent=await processOutbox(sid,'sent');assert(sent.messages.items.some(m=>m.role==='assistant'&&m.status==='sent'));assert(!sent.messages.items.some(m=>m.role==='assistant'&&m.status==='delivered'));
  const delivered=await processOutbox(sid);assert(delivered.messages.items.some(m=>m.role==='assistant'&&m.status==='delivered'));
  const take=await simulate(),takeId=take.detail.conversation.id;await json('/api/conversations/'+takeId+'/ownership',admin,'POST',{requestKey:randomUUID(),ownership:'staff_handling'});
  const takeover=await processOutbox(takeId);assert.equal(takeover.conversation.ownership,'staff_handling');assert(takeover.messages.items.some(m=>m.role==='assistant'&&m.status==='cancelled'));assert(!takeover.messages.items.some(m=>m.role==='assistant'&&['sent','delivered'].includes(m.status)));
  await json('/api/conversations/'+takeId+'/simulate-inbound',admin,'POST',{requestKey:randomUUID(),message:'Another customer question during staff handling.'});
  const afterTake=await json<ConversationDetail>('/api/conversations/'+takeId,admin);assert(!afterTake.messages.items.some(m=>m.role==='assistant'&&m.status==='queued'));
  const noConsent=await simulate('What are the office hours?',false);const blocked=await processOutbox(noConsent.detail.conversation.id);assert(!blocked.messages.items.some(m=>m.role==='assistant'&&['sent','delivered'].includes(m.status)));
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Lagos',hour:'2-digit',hourCycle:'h23'}).format(new Date()));await publish(hour,(hour+1)%24);
  const quiet=await simulate(),quietResult=await processOutbox(quiet.detail.conversation.id);assert(!quietResult.messages.items.some(m=>m.role==='assistant'&&['sent','delivered'].includes(m.status)));
  await json('/api/public-conversations/consent','','POST',{token:quiet.publicSession.token,requestKey:randomUUID(),consent:false});const withdrawn=await json<ConversationDetail>('/api/conversations/'+quiet.detail.conversation.id,admin);assert(withdrawn.messages.items.some(m=>m.role==='assistant'&&m.status==='cancelled'));
  await publish();const failure=await simulate(),failId=failure.detail.conversation.id;
  for(let attempt=0;attempt<3;attempt++){await f.database.query("UPDATE conversation_outbox SET next_attempt_at=now()-interval '1 second' WHERE conversation_id=$1 AND state IN('queued','sent')",[failId]);await processOutbox(failId,'temporary_failure');}
  const failed=await json<ConversationDetail>('/api/conversations/'+failId,admin);assert(failed.messages.items.some(m=>m.role==='assistant'&&m.status==='failed'));
  const outbox=(await f.database.query('SELECT provider,state,attempts FROM conversation_outbox WHERE conversation_id=$1',[failId])).rows;assert(outbox.every(o=>o.provider==='local_simulator'&&o.attempts<=3));
  await json('/api/public-conversations/consent','','POST',{token:started.token,requestKey:randomUUID(),consent:false});
  assert.equal((await publicRead()).conversation.consent,false);
  const draft=await json<ConversationDetail>('/api/conversations/'+takeId+'/messages',admin,'POST',{requestKey:randomUUID(),body:'Reviewed synthetic draft',kind:'draft'});
  const draftMessage=draft.messages.items.find(m=>m.role==='draft'&&m.status==='proposed');assert(draftMessage);
  assert(!(await json<ConversationDetail>('/api/conversations/'+takeId,admin)).messages.items.some(m=>m.body==='Reviewed synthetic draft'&&m.status==='delivered'));
  await json('/api/conversations/'+takeId+'/drafts/'+draftMessage.id+'/approve',admin,'POST',{requestKey:randomUUID(),body:'Edited and approved synthetic reply'});
  pass('local outbox distinguishes queued/sent/delivered/failed, stops automated work on takeover or missing consent, obeys property quiet hours, bounds retries and requires deliberate draft approval');


  const auth=await json<{user:AuthUser}>('/api/auth/me',admin),adminDigest=createHmac('sha256',f.config.sessionSecret).update(admin.slice('ootla.sid='.length)).digest('hex');
  let entered!:()=>void,release!:()=>void;const enteredModel=new Promise<void>(resolve=>{entered=resolve;}),releaseModel=new Promise<void>(resolve=>{release=resolve;});
  const delayed=new Conversations(f.database,f.config,{async infer(input){entered();await releaseModel;return{result:{response:'Synthetic bounded answer.',internalSummary:'Synthetic race check.',sourceIds:input.sources.map(s=>s.id),proposedActions:[],handoffReason:null},usage:{inputTokens:100,outputTokens:50,estimated:true}};}});
  const raceKey=randomUUID(),running=delayed.simulateInbound(auth.user,adminDigest,failId,{requestKey:raceKey,message:'What are the current office hours?'});
  await Promise.race([enteredModel,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Race test inference did not begin.')),5000))]);
  await json('/api/conversations/'+failId+'/ownership',admin,'POST',{requestKey:randomUUID(),ownership:'staff_handling'});release();await running;
  const afterRace=(await f.database.query("SELECT role,status FROM conversation_messages WHERE conversation_id=$1 AND request_key=$2",[failId,raceKey])).rows;
  assert(afterRace.some(m=>m.role==='customer'));assert(!afterRace.some(m=>m.role==='assistant'&&['queued','sent','delivered'].includes(m.status)));
  assert.equal(Number((await f.database.query("SELECT count(*) AS n FROM conversation_outbox WHERE conversation_id=$1 AND state IN('queued','sent') AND origin IN('ai','automation')",[failId])).rows[0].n),0);
  pass('staff takeover during in-flight inference prevents its late reply from entering the outbox; organization action policy is checked again at confirmation');

  phase='native viewing availability, successful booking and concurrent conflicts';
  await json('/api/calendar/properties/'+f.propertyId+'/settings',admin,'PUT',{version:1,enabled:true,timeZone:'Africa/Lagos',durationMinutes:30,bufferBeforeMinutes:15,bufferAfterMinutes:15,location:'Synthetic property reception',publicBookingEnabled:true});
  await json('/api/calendar/properties/'+f.propertyId+'/staff/'+f.staffMembershipId+'/availability',admin,'PUT',{version:1,enabled:true,windows:Array.from({length:7},(_,weekday)=>({weekday,start:'09:00',end:'17:00'}))});
  const startChat=async(name:string)=>json<PublicConversationStart>('/api/public-conversations/start','','POST',{requestKey:randomUUID(),channelId:channel.id,name,message:'I would like a viewing.',consent:true},[200,201]);
  const a=await startChat('Synthetic booking visitor A'),b=await startChat('Synthetic booking visitor B');
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+86400000));
  const slots=await json<PublicCalendarInvitation>('/api/public-conversations/slots','','POST',{token:a.token,date,page:1,pageSize:10});
  const slotsB=await json<PublicCalendarInvitation>('/api/public-conversations/slots','','POST',{token:b.token,date,page:1,pageSize:10});
  assert(slots.slots.items.length);assert(!JSON.stringify(slots).includes(f.staffMembershipId));assert(!JSON.stringify(slots).includes(f.staffEmail));
  const selected=slots.slots.items[0]!,selectedB=slotsB.slots.items.find(s=>s.startsAt===selected.startsAt);assert(selectedB);
  const bookingRequests=[{token:a.token,requestKey:randomUUID(),startsAt:selected.startsAt,slotKey:selected.slotKey},{token:b.token,requestKey:randomUUID(),startsAt:selectedB.startsAt,slotKey:selectedB.slotKey}];
  const bookings=await Promise.all(bookingRequests.map(body=>request('/api/public-conversations/book','','POST',body)));
  assert.equal(bookings.filter(r=>[200,201].includes(r.status)).length,1);assert.equal(bookings.filter(r=>[409,410].includes(r.status)).length,1);
  const successful=bookings.findIndex(r=>[200,201].includes(r.status)),confirmation=await bookings[successful]!.json() as PublicCalendarConfirmation;assert.equal(confirmation.status,'booked');
  const bookedToken=successful===0?a.token:b.token,bookedDetail=await json<PublicConversationDetail>('/api/public-conversations/read','','POST',{token:bookedToken});assert.equal(bookedDetail.booking?.status,'scheduled');
  const unchanged=await json<PublicCalendarConfirmation>('/api/public-conversations/book','','POST',bookingRequests[successful],[200,201]);assert.equal(unchanged.startsAt,confirmation.startsAt);
  assert.equal(Number((await f.database.query("SELECT count(*) AS n FROM viewings WHERE organization_id=$1 AND property_id=$2 AND managed_by_ootla AND starts_at=$3",[f.organizationId,f.propertyId,selected.startsAt])).rows[0].n),1);
  const unsuccessful=successful===0?b:a,unbooked=await json<PublicConversationDetail>('/api/public-conversations/read','','POST',{token:unsuccessful.token});assert(!unbooked.booking);
  await f.database.query("UPDATE customer_conversations SET expires_at=now()-interval '1 minute' WHERE id=$1",[a.detail.conversation.id]);
  await deny('/api/public-conversations/read','','POST',{token:a.token},[401,403,404,410]);
  pass('website viewing options use native signed scheduling without staff-calendar disclosure; concurrent slot submissions persist one booking, conflicts never claim success and exact retries remain duplicate-safe');

  phase='headers, origin, session expiry and persisted privacy';
  for(const channel of ['email','sms'] as const){const transport=conversationTransport(channel);assert.equal(transport.capabilities.send,false);assert.equal(transport.capabilities.deliveryCallbacks,false);await assert.rejects(()=>transport.deliver(randomUUID(),'delivered',true),(issue:unknown)=>issue instanceof ApiError&&issue.status===501);}
  const local=conversationTransport('website'),messageId=randomUUID();await assert.rejects(()=>local.deliver(messageId,'delivered',false),(issue:unknown)=>issue instanceof ApiError&&issue.status===403);assert.equal((await local.deliver(messageId,'sent',true)).providerMessageId,(await local.deliver(messageId,'delivered',true)).providerMessageId);
  const privateRead=await request('/api/ask/threads/'+normal.thread.id,admin);assert.match(privateRead.headers.get('cache-control')??'',/no-store/);
  const forbiddenOrigin=await request('/api/ask/threads',admin,'POST',{requestKey:randomUUID(),context:{page:'/admin'}},{Origin:'https://foreign.example.test'});assert.equal(forbiddenOrigin.status,403);
  await f.database.query("UPDATE sessions SET created_at=now()-interval '1 hour',expires_at=now()-interval '1 minute' WHERE user_id=$1",[f.staff[0]!.userId]);
  await deny('/api/ask/threads/'+own.thread.id,agent,'GET',undefined,401);
  const rows=(await f.database.query('SELECT provider,count(*) AS n FROM conversation_outbox GROUP BY provider')).rows;assert(rows.length&&rows.every(r=>r.provider==='local_simulator'));
  const digest=createHmac('sha256',f.config.sessionSecret).update(admin.slice('ootla.sid='.length)).digest('hex');assert(/^[a-f0-9]{64}$/.test(digest));
  assert.equal((await f.database.query("SELECT count(*) AS n FROM applications WHERE id=$1 AND status='draft'",[f.applicationId])).rows[0].n,'1');
  assert.equal((await f.database.query('SELECT count(*) AS n FROM application_documents WHERE organization_id=$1',[f.organizationId])).rows[0].n,'0');
  pass('private responses are non-cacheable, foreign-origin changes and expired staff/public sessions fail closed, local simulator is the only transport and existing applicant records/documents remain unchanged');
 });
 console.log('Stage 20 conversation verification passed ('+groups+' focused groups).');
}catch(issue){
 console.error('Stage 20 verification failed during '+phase+'; secrets, bearer capabilities and raw database configuration are omitted.');
 if(issue instanceof assert.AssertionError)console.error(issue.message);
 else if(issue instanceof ReferenceError)console.error(issue.name+': '+issue.message);else console.error(issue instanceof Error?issue.name:'Unknown verification failure');
 process.exitCode=1;
}
