import '../server/config/environment.js';
import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import type {AuthUser} from '../shared/contracts.js';
import type {AiAdapter,AiProviderInput} from '../server/ai/adapter.js';
import {AskOotlaService} from '../server/services/ask-ootla.js';
import {Tasks} from '../server/services/tasks.js';
import {taskCreateSchema} from '../shared/task-contracts.js';
import {askMessageSchema} from '../shared/conversation-contracts.js';
import {formatAssistantDateTime} from '../shared/assistant-dates.js';
import {localDate,localDayBounds} from '../server/services/calendar-time.js';
import {withAskGenerationFixture} from './lib/ask-generation-fixture.js';
import {installLocalFixtureNetworkGuard} from './lib/local-network-guard.js';
const guard=installLocalFixtureNetworkGuard(),sha=(v:unknown)=>createHash('sha256').update(Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex'),priorFiles=['.local/ask-generation-provider-observations.json','.local/ask-generation-interruption-observations.json'],priorHashes=await Promise.all(priorFiles.map(async file=>sha(await readFile(file))));
let calls=0;
try {
 await withAskGenerationFixture(async f=>{
  assert(f.setup);const s=f.setup,{base}=await f.start(),response=await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:f.config.appUrl,'Content-Type':'application/json'},body:JSON.stringify({email:s.staffEmail,password:s.staffPassword})});assert.equal(response.status,200);const actor=(await response.json()as{user:AuthUser}).user,cookie=(response.headers.get('set-cookie')??'').split(';')[0],digest=createHmac('sha256',f.config.sessionSecret).update(cookie.split('=')[1]!).digest('hex');
  const organizationZone='America/New_York',propertyZone='Asia/Tokyo';
  await f.database.query('INSERT INTO organization_admin_settings(organization_id,time_zone,updated_by_user_id)VALUES($1,$2,$3)',[actor.organization.id,organizationZone,actor.id]);
  await f.database.query('INSERT INTO property_viewing_settings(organization_id,property_id,enabled,time_zone,duration_minutes,buffer_before_minutes,buffer_after_minutes,location)VALUES($1,$2,true,$3,30,0,0,$4)',[actor.organization.id,s.propertyId,propertyZone,'Owned fixture meeting point']);
  const now=new Date(),end=localDayBounds(localDate(now,organizationZone),organizationZone).until,today=new Date(end.getTime()-1800000).toISOString(),tomorrow=new Date(end.getTime()+1800000).toISOString(),tasks=new Tasks(f.database);
  const included=await tasks.create(actor,taskCreateSchema.parse({propertyId:s.propertyId,title:'OMITTED_TIMEZONE_TODAY_INCLUDED',dueAt:today,ownerMembershipId:actor.membershipId}));
  const excluded=await tasks.create(actor,taskCreateSchema.parse({propertyId:s.propertyId,title:'OMITTED_TIMEZONE_TOMORROW_EXCLUDED',dueAt:tomorrow,ownerMembershipId:actor.membershipId}));
  const before=(await f.database.query('SELECT * FROM tasks ORDER BY id')).rows,expectedDate=formatAssistantDateTime(today,organizationZone,now);let captured:AiProviderInput|undefined;
  const adapter:AiAdapter={async infer(input){calls++;captured=structuredClone(input);return{result:{response:'Review the linked task due '+today+'.',internalSummary:'Controlled omitted timezone response',sourceIds:input.sources.map(source=>source.id),proposedActions:[],handoffReason:null},usage:{inputTokens:100,outputTokens:50}};}};
  const config={...f.config,ai:{...f.config.ai,provider:'openai'as const,apiKey:'synthetic-code-only',model:'synthetic-controlled',maxRequestsPerMinute:1000,maxTokensPerRequest:16000,dailyTokenBudget:1000000,dailyCostBudgetMicros:1000000,inputCostMicrosPerMillion:1000,outputCostMicrosPerMillion:1000}},service=new AskOotlaService(f.database,config,adapter);
  const ask=async(reader:AskOotlaService)=>{const thread=await reader.create(actor,digest,{requestKey:randomUUID(),context:{page:'/admin/tasks',propertyId:s.propertyId}});const request=askMessageSchema.parse({requestKey:randomUUID(),message:'What needs my attention today?'});assert(!('timeZone'in request));return reader.message(actor,digest,thread.thread.id,request);};
  const live=await ask(service),answer=live.messages.items.filter(item=>item.role==='assistant').at(-1)!;assert.equal(answer.status,'completed');assert.equal(answer.mode,'live');assert(captured);assert.equal(captured.context.displayTimeZone,organizationZone);const facts=captured.context.facts as{day:string;recordCount:number;tasks:Array<{sourceId:string;due:string}>};assert.equal(facts.day,'Today');assert.equal(facts.recordCount,1);assert.equal(facts.tasks.length,1);assert(facts.tasks[0]!.sourceId.includes(included.id));assert(!JSON.stringify(captured.context).includes(excluded.title));assert.equal(facts.tasks[0]!.due,expectedDate);assert.equal(answer.body,'Review the linked task due '+expectedDate+'.');assert(answer.sources.some(source=>source.id.includes(included.id)));assert(!answer.sources.some(source=>source.id.includes(excluded.id)));assert(!/\d{4}-\d\d-\d\dT\d\d:|America\/New_York|Asia\/Tokyo/.test(answer.body));
  const native=await ask(new AskOotlaService(f.database,{...f.config,ai:{...f.config.ai,maxRequestsPerMinute:1000}},adapter)),nativeAnswer=native.messages.items.filter(item=>item.role==='assistant').at(-1)!;assert.equal(nativeAnswer.mode,'not_configured');assert(nativeAnswer.body.includes(expectedDate));assert(!nativeAnswer.body.includes(excluded.title));assert(!/\d{4}-\d\d-\d\dT\d\d:|America\/New_York|Asia\/Tokyo/.test(nativeAnswer.body));assert.equal(calls,1);assert.deepEqual((await f.database.query('SELECT * FROM tasks ORDER BY id')).rows,before);
 },{onLoopbackOrigin:guard.allow});
 for(let i=0;i<priorFiles.length;i++)assert.equal(sha(await readFile(priorFiles[i]!)),priorHashes[i]);
 await writeFile('.local/ask-generation-omitted-timezone-observations.json',JSON.stringify({verifiedAt:new Date().toISOString(),groups:['Omitted client timezone resolves organization New York consistently for today cutoff, facts, sources, provider context and both generated/native answer dates despite Tokyo property timezone; stored task rows/timestamps remain unchanged'],ownedProductionEligibleFixture:true,controlledProviderCalls:calls,externalProviderCalls:0,retainedBusinessWrites:0,priorEightAndThreeGroupReceiptsUnchanged:true,ownedDatabaseAndRoleCleaned:true},null,2)+'\n');console.log('PASS omitted-client-timezone: organization-local cutoff, provider/fallback dates and unchanged stored timestamps. Prior8/3 receipts unchanged.');
} catch(issue){console.error('Omitted-timezone check failed. '+(issue instanceof Error?issue.message.slice(0,2000):String(issue)));process.exitCode=1;}
finally {guard.restore();}
