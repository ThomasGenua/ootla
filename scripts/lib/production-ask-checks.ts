import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {AuthUser} from '../../shared/contracts.js';
import type {AiAdapter} from '../../server/ai/adapter.js';
import {AskOotlaService} from '../../server/services/ask-ootla.js';
import {AiOrchestrationService} from '../../server/services/ai-orchestration.js';
import type {CustomerRuntimeFixture} from './customer-runtime-fixture.js';

export async function checkProductionAskDrafts(f:CustomerRuntimeFixture,actor:AuthUser,digest:string,leadId:string):Promise<void>{
 assert(f.setup);const propertyId=f.setup.propertyId,before=Number((await f.database.query('SELECT count(*) AS n FROM tasks')).rows[0].n);
 await new AiOrchestrationService(f.database,f.config).createKnowledge(actor,digest,{requestKey:randomUUID(),propertyId,title:'Approved draft facts',body:'The office opens at 09:00 and closes at 17:00.',status:'approved',publicEnabled:false});
 const configured={...f.config,ai:{...f.config.ai,provider:'openai' as const,apiKey:'synthetic-code-only-key',model:'synthetic-controlled-model',timeoutMs:100,maxRequestsPerMinute:1000,dailyTokenBudget:1000000,dailyCostBudgetMicros:1000000,inputCostMicrosPerMillion:1000,outputCostMicrosPerMillion:1000}};
 for(const scenario of ['disabled','missing_key','failed','configured'] as const){
  let calls=0;const adapter:AiAdapter={async infer(input){calls++;if(scenario!=='configured')throw Error('Controlled provider failure.');return{result:{response:'Use only the approved facts in an unsent reply.',internalSummary:'Controlled reply draft',sourceIds:input.sources.filter(s=>s.kind==='knowledge').map(s=>s.id),proposedActions:[],handoffReason:null},usage:{inputTokens:100,outputTokens:100}};}};
  const config=scenario==='disabled'?f.config:scenario==='missing_key'?{...configured,ai:{...configured.ai,apiKey:''}}:configured;
  const service=new AskOotlaService(f.database,config,adapter),thread=await service.create(actor,digest,{requestKey:randomUUID(),context:{page:'/admin/leads',propertyId,leadId}});
  const response=await service.message(actor,digest,thread.thread.id,{requestKey:randomUUID(),message:'Draft a reply.'}),answer=response.messages.items.filter(m=>m.role==='assistant').at(-1);assert(answer);
  assert.notEqual(answer.mode,'simulated');assert(!/Thank you for getting in touch/i.test(answer.body));assert(!answer.action);
  assert.equal(calls,scenario==='disabled'||scenario==='missing_key'?0:1);
  if(scenario==='configured'){assert.equal(answer.mode,'live');assert.equal(answer.status,'completed');assert(answer.body.includes('Use only the approved facts in an unsent reply.'));assert(answer.sources.some(source=>source.kind==='knowledge'&&!source.simulated));}
  else if(scenario==='disabled'||scenario==='missing_key'){assert.equal(answer.mode,'not_configured');assert(answer.body.startsWith('Record-based answer (no language model).'));}
  else{assert(['handoff','failed'].includes(answer.status));assert(!answer.body.startsWith('Record-based answer'));}
 }
 const disabled=new AskOotlaService(f.database,f.config),unscoped=await disabled.create(actor,digest,{requestKey:randomUUID(),context:{page:'/admin'}});
 const contextReply=await disabled.message(actor,digest,unscoped.thread.id,{requestKey:randomUUID(),message:'Draft a reply.'}),noContext=contextReply.messages.items.filter(m=>m.role==='assistant').at(-1);assert(noContext);assert(['completed','handoff'].includes(noContext.status));assert.match(noContext.body,/property|lead|record|conversation/i);assert(!noContext.action);assert(!noContext.body.startsWith('Unsent reply for staff review'));assert(!noContext.body.includes('Synthetic AI prospect'));assert.notEqual(noContext.mode,'simulated');
 const summaryThread=await disabled.create(actor,digest,{requestKey:randomUUID(),context:{page:'/admin/leads',propertyId,leadId}}),summary=await disabled.message(actor,digest,summaryThread.thread.id,{requestKey:randomUUID(),message:'Summarize this lead.'}),native=summary.messages.items.filter(m=>m.role==='assistant').at(-1);assert(native);assert.equal(native.status,'completed');assert.notEqual(native.mode,'simulated');assert(native.sources.some(source=>source.kind==='lead'));assert(native.body.includes('Synthetic AI prospect'));
 assert.equal(Number((await f.database.query('SELECT count(*) AS n FROM tasks')).rows[0].n),before);
}
