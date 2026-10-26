import {checkProductionAskDrafts} from './lib/production-ask-checks.js';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {AddressInfo} from 'node:net';
import type {Server} from 'node:http';
import express from 'express';
import type {AuthUser} from '../shared/contracts.js';
import type {AiResponse} from '../shared/ai-contracts.js';
import type {AiAdapter,AiProviderInput,AiProviderOutput} from '../server/ai/adapter.js';
import {SimulatedAiAdapter} from '../server/ai/simulated.js';
import {AiTransportError} from '../server/ai/openai.js';
import {AiOrchestrationService} from '../server/services/ai-orchestration.js';
import {SessionService} from '../server/services/sessions.js';
import {ApiError} from '../server/http/errors.js';
import {createAiRouter} from '../server/routes/ai.js';
import {withCustomerRuntimeFixture} from './lib/customer-runtime-fixture.js';
import {installLocalFixtureNetworkGuard} from './lib/local-network-guard.js';
const askOnly=process.env.PRODUCTION_AI_ASK_ONLY==='true';
const network=installLocalFixtureNetworkGuard(),originalSimulation=SimulatedAiAdapter.prototype.infer;
let phase='owned customer fixture',groups=0,simulationCalls=0;
const pass=(text:string)=>{groups++;console.log('PASS '+text);};
SimulatedAiAdapter.prototype.infer=async()=>{simulationCalls++;throw Error('Production must never invoke scripted preview inference.');};
const businessFailure=(r:AiResponse)=>{assert.notEqual(r.mode,'simulated');assert(['handoff','failed','refused'].includes(r.executionStatus));assert(!r.actions.some(a=>a.status==='completed'));assert(!r.response.includes('Simulated AI:'));assert(!r.response.includes('payment was paid'));assert(!r.response.includes('application approved'));};
try{
 await withCustomerRuntimeFixture(async f=>{
  assert(f.setup);const s=f.setup,{base}=await f.start();
  const send=(route:string,cookie='',method='GET',body?:unknown)=>fetch(base+route,{method,redirect:'manual',headers:{...(cookie?{Cookie:cookie}:{}),...(method==='GET'?{}:{Origin:f.config.appUrl,'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const login=await send('/api/auth/login','','POST',{email:s.staffEmail,password:s.staffPassword});assert.equal(login.status,200);const cookie=(login.headers.get('set-cookie')??'').split(';')[0]!,actor=(await login.json() as {user:AuthUser}).user;assert(cookie.startsWith('ootla-customer.sid='));
  const digest=createHmac('sha256',f.config.sessionSecret).update(cookie.split('=')[1]!).digest('hex');
  const countTasks=async()=>Number((await f.database.query('SELECT count(*) AS n FROM tasks WHERE organization_id=$1',[s.organizationId])).rows[0].n);
  const initialTasks=await countTasks();
  const lead=(await f.database.query("INSERT INTO leads(organization_id,property_id,display_name,email,status,intent,pipeline_stage,source,notes) VALUES($1,$2,'Synthetic AI prospect','ai-prospect@example.test','new','leasing','new_inquiry','website','Staff-private fixture note') RETURNING id,contact_id",[s.organizationId,s.propertyId])).rows[0];
  if(askOnly){phase='production Ask draft inference and handoff';await checkProductionAskDrafts(f,actor,digest,lead.id);pass('Ask draft disabled/missing-key/failure never uses a generic preview reply; configured inference runs once, unsent review and native summaries preserve truth without creating tasks');return;}
  const native=await send('/api/properties/'+s.propertyId,cookie);assert.equal(native.status,200);
  pass('fresh production-mode customer role authenticates normally and reads its persistent native CRM while model inference is disabled');

  phase='disabled and incomplete production AI';let disabledCalls=0;
  const never:AiAdapter={async infer(){disabledCalls++;throw Error('A disabled model cannot run.');}};
  const disabled=new AiOrchestrationService(f.database,f.config,never);
  const knowledge=await disabled.createKnowledge(actor,digest,{requestKey:randomUUID(),propertyId:s.propertyId,title:'Approved office hours',body:'The office opens at 09:00 and closes at 17:00.',status:'approved',publicEnabled:false});
  const input=()=>({requestKey:randomUUID(),message:'What are the office hours?',propertyId:s.propertyId});
  const unavailable=await disabled.request(actor,digest,input());businessFailure(unavailable);assert.equal(unavailable.mode,'not_configured');assert.equal(disabledCalls,0);assert(!unavailable.response.includes('09:00'));assert.equal(await countTasks(),initialTasks);
  const incomplete={...f.config,ai:{...f.config.ai,provider:'openai' as const,model:'synthetic-controlled-model',apiKey:''}};
  const noKey=await new AiOrchestrationService(f.database,incomplete,never).request(actor,digest,input());businessFailure(noKey);assert.equal(noKey.mode,'not_configured');assert.equal(disabledCalls,0);
  pass('disabled or missing-key production AI returns an honest handoff without invoking an adapter, using scripted property answers or creating tasks');

  const live={...f.config,ai:{...f.config.ai,provider:'openai' as const,apiKey:'synthetic-code-only-provider-key',model:'synthetic-controlled-model',timeoutMs:100,maxRequestsPerMinute:1000,dailyTokenBudget:1000000,dailyCostBudgetMicros:1000000,inputCostMicrosPerMillion:1000,outputCostMicrosPerMillion:1000}};
  phase='provider failures and refusal';
  for(const kind of ['failure','timeout','refusal'] as const){
   let calls=0;const adapter:AiAdapter={async infer(){calls++;if(kind==='timeout')return new Promise<AiProviderOutput>(()=>{});throw new AiTransportError(kind==='refusal'?'refused':'provider_failed');}};
   const response=await new AiOrchestrationService(f.database,live,adapter).request(actor,digest,input());assert.equal(calls,1);businessFailure(response);assert(response.trace.tools.some(t=>t.name==='model_inference'&&t.status==='failed'));assert.equal(await countTasks(),initialTasks);
  }
  assert.equal(simulationCalls,0);
  pass('configured provider failure, timeout and refusal remain explicit unsuccessful outcomes; none silently calls preview inference or creates staff work');

  phase='untrusted provider actions';
  const dangerous:AiAdapter={async infer(){return{result:{response:'Your application approved and payment was paid.',internalSummary:'Invalid tool proposal',sourceIds:[],proposedActions:[{name:'approve_application',arguments:{}}],handoffReason:null},usage:{inputTokens:100,outputTokens:100}};}};
  const refused=await new AiOrchestrationService(f.database,live,dangerous).request(actor,digest,input());businessFailure(refused);assert.equal(refused.executionStatus,'refused');assert.equal(await countTasks(),initialTasks);
  pass('untrusted provider action names and invented paid/approved claims fail strict validation before persistence or execution');

  phase='configured grounded response and retry';let successCalls=0;
  const grounded:AiAdapter={async infer(i){successCalls++;return{result:{response:'Use the approved saved office hours.',internalSummary:'Bounded property answer',sourceIds:i.sources.filter(v=>v.kind==='knowledge').map(v=>v.id),proposedActions:[],handoffReason:null},usage:{inputTokens:100,outputTokens:100}};}};
  const service=new AiOrchestrationService(f.database,live,grounded),stable=input(),answer=await service.request(actor,digest,stable);assert.equal(answer.mode,'live');assert.equal(answer.executionStatus,'completed');assert(answer.response.includes('09:00'));assert(answer.sources.some(source=>source.id==='knowledge:'+knowledge.knowledge.id&&!source.simulated));assert.equal(await countTasks(),initialTasks);
  assert.equal((await service.request(actor,digest,stable)).id,answer.id);assert.equal(successCalls,1);
  await assert.rejects(()=>service.request(actor,digest,{...stable,message:'A different question'}),(issue:unknown)=>issue instanceof ApiError&&issue.status===409);
  assert.equal((await f.database.query('SELECT mode,result FROM ai_requests WHERE id=$1',[answer.id])).rows[0].mode,'live');
  pass('a configured code-only live adapter produces grounded current-source facts and one durable result on stable retry, with conflicting retries refused');

  phase='actual HTTP confirmed native task';let taskCalls=0;
  const taskAdapter:AiAdapter={async infer(i:AiProviderInput){taskCalls++;assert(i.allowedActions.includes('create_staff_task'));const task=i.context.requestedTask;assert(task);return{result:{response:'A task is proposed for server verification.',internalSummary:'Explicit follow-up proposal',sourceIds:[],proposedActions:[{name:'create_staff_task',arguments:task}],handoffReason:null},usage:{inputTokens:100,outputTokens:100}};}};
  const app=express(),sessions=new SessionService(f.database,live);app.use(express.json({limit:'16kb'}));
  app.use('/api/ai',createAiRouter(live,f.database,async(req,res,next)=>{const user=await sessions.currentUser(req);if(!user)throw new ApiError(401,'AUTH_REQUIRED','Sign in.');res.locals.user=user;next();},taskAdapter));
  app.use(((issue:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status(issue instanceof ApiError?issue.status:500).json({error:{code:'CONTROLLED_TEST_ERROR',message:'The isolated request could not be completed.'}});}) as express.ErrorRequestHandler);
  const server=await new Promise<Server>((resolve,reject)=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));listener.once('error',reject);}),apiBase='http://127.0.0.1:'+(server.address() as AddressInfo).port;network.allow(apiBase);
  try{
   const taskInput={requestKey:randomUUID(),message:'Create a follow-up task for this lead.',propertyId:s.propertyId,leadId:lead.id,confirmAction:true,task:{title:'Production fixture follow-up',dueAt:new Date(Date.now()+86400000).toISOString(),priority:'normal'}};
   const post=()=>fetch(apiBase+'/api/ai/requests',{method:'POST',redirect:'manual',headers:{Cookie:cookie,Origin:live.appUrl,'Content-Type':'application/json'},body:JSON.stringify(taskInput)});
   const first=await post();assert.equal(first.status,200);const saved=await first.json() as AiResponse,action=saved.actions.find(a=>a.status==='completed');assert(action?.taskId);assert.equal(saved.executionStatus,'completed');assert.equal(await countTasks(),initialTasks+1);
   assert.equal((await send('/api/tasks/'+action.taskId,cookie)).status,200);
   const retry=await post();assert.equal(retry.status,200);assert.equal((await retry.json() as AiResponse).actions[0]?.taskId,action.taskId);assert.equal(taskCalls,1);assert.equal(await countTasks(),initialTasks+1);
   pass('only an explicitly confirmed actual AI HTTP request creates one verified native task; stable retry preserves its identity and does not execute twice');
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}

  phase='current organization and property scope';
  const foreignOrg=randomUUID();await f.database.query("INSERT INTO organizations(id,name,slug,environment) VALUES($1,'Separate synthetic customer',$2,'live')",[foreignOrg,'separate-customer-'+randomUUID()]);
  const foreignProperty=(await f.database.query("INSERT INTO properties(organization_id,name) VALUES($1,'Foreign synthetic property') RETURNING id",[foreignOrg])).rows[0].id as string;
  const callsBefore=successCalls;
  await assert.rejects(()=>service.request(actor,digest,{...input(),propertyId:foreignProperty}),(issue:unknown)=>issue instanceof ApiError&&[403,404].includes(issue.status));
  await f.database.query("UPDATE organization_memberships SET role='leasing_agent' WHERE id=$1",[s.staffMembershipId]);
  try{await assert.rejects(()=>service.request(actor,digest,input()),(issue:unknown)=>issue instanceof ApiError&&[403,404].includes(issue.status));}finally{await f.database.query("UPDATE organization_memberships SET role='organization_admin' WHERE id=$1",[s.staffMembershipId]);}
  assert.equal(successCalls,callsBefore);assert.equal(simulationCalls,0);
  pass('cross-organization properties and current-role/property revocation are denied before inference; no scripted adapter was invoked anywhere in the customer runtime');
  phase='production Ask draft inference and handoff';await checkProductionAskDrafts(f,actor,digest,lead.id);pass('Ask draft requires configured inference or an honest handoff; native summaries remain authoritative and no generic preview reply is used');
 },{onLoopbackOrigin:network.allow});
 await writeFile(path.resolve(askOnly?'.local/production-ai-ask-observations.json':'.local/production-ai-observations.json'),JSON.stringify({verifiedAt:new Date().toISOString(),passed:true,groups,productionMode:true,restrictedFreshRole:true,normalAuthentication:true,simulatedAdapterCalls:simulationCalls,realProviderCalls:0,explicitNativeTasksVerified:askOnly?0:1,stableRetriesVerified:true,scopeDenialsVerified:!askOnly,ownedDatabaseAndRoleCleaned:true,retainedDataChanged:false,limitations:['Model success/failure/refusal/timeout used controlled code-only adapters, not a live provider credential or paid request.','The ephemeral API uses HTTP only inside a guarded loopback test; it does not prove remote HTTPS or deployment.']},null,2)+'\n');
 console.log('Production AI verification passed ('+groups+' focused groups).');
}catch(issue){console.error('Production AI verification failed during '+phase+'.');console.error(issue instanceof ApiError?'Controlled API error '+issue.status+' '+issue.code:issue instanceof Error?issue.name+': '+issue.message.slice(0,300):'Unknown isolated error.');process.exitCode=1;}
finally{SimulatedAiAdapter.prototype.infer=originalSimulation;network.restore();}
