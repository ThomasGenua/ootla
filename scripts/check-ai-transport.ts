import assert from 'node:assert/strict';
import {createOpenAiAdapter,AiTransportError,openAiInputOverheadUpperBound} from '../server/ai/openai.js';
import {loadConfig} from '../server/config/env.js';
import type {AiProviderInput} from '../server/ai/adapter.js';
const config=loadConfig({NODE_ENV:'test',APP_URL:'http://127.0.0.1:5199',SESSION_SECRET:'transport-test-only-secret-with-at-least-32-characters',AI_PROVIDER:'openai',AI_MODEL:'operator-configured-test-model',AI_API_KEY:'test-only-never-a-real-secret',AI_INPUT_COST_MICROS_PER_MILLION:'1000000',AI_OUTPUT_COST_MICROS_PER_MILLION:'2000000',AI_TIMEOUT_MS:'100'});
const input:AiProviderInput={intent:'property_question',prompt:'Which entrance?',context:{property:{name:'Test Court'}},sources:[],allowedActions:[],requestId:'local-test'};
const limits={maxOutputTokens:256,timeoutMs:100};
const modelResult={response:'Use the east entrance.',internalSummary:'Property fact',sourceIds:[],proposedActions:[],handoffReason:null};
const completed={status:'completed',output:[{type:'reasoning',summary:[]},{type:'message',content:[{type:'output_text',text:JSON.stringify(modelResult)}]}],usage:{input_tokens:120,output_tokens:40}};
function fake(handler:(url:string|URL|Request,init?:RequestInit)=>Promise<Response>):typeof fetch{return handler as typeof fetch;}
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
async function rejects(fetcher:typeof fetch,code:string){let calls=0;const adapter=createOpenAiAdapter(config.ai,fake(async(url,init)=>{calls++;return fetcher(url,init);}));await assert.rejects(adapter.infer(input,limits),(error:unknown)=>error instanceof AiTransportError&&error.code===code&&!error.message.includes(config.ai.apiKey));assert.equal(calls,1);}
let calls=0;
const success=await createOpenAiAdapter(config.ai,fake(async(url,init)=>{
 calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');
 const body=JSON.parse(String(init?.body));assert.equal(body.store,false);assert.equal(body.model,config.ai.model);assert.equal(body.max_output_tokens,256);assert.equal(body.tools,undefined);assert.equal(body.text.format.strict,true);assert.equal(body.text.format.type,'json_schema');assert.equal(body.input.length,2);assert.equal(body.text.format.schema.additionalProperties,false);assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer '+config.ai.apiKey);
 return json(completed);
})).infer(input,limits);
assert.equal(calls,1);assert.deepEqual(success.result,modelResult);assert.deepEqual(success.usage,{inputTokens:120,outputTokens:40,estimated:false});assert(openAiInputOverheadUpperBound>=4096);
console.log('PASS: fixed HTTPS Responses transport, strict structured output, store:false, bounded output and exact usage (stub only).');
await rejects(fake(async()=>json({error:'private provider diagnostic'},500)),'provider_failed');
await rejects(fake(async()=>{throw new Error('network '+config.ai.apiKey);}),'provider_failed');
console.log('PASS: provider/network errors are redacted and never retried.');
await rejects(fake(async()=>json({...completed,status:'incomplete'})),'invalid_response');
await rejects(fake(async()=>json({...completed,output:[{type:'message',content:[{type:'refusal',refusal:'No'}]}]})),'refused');
await rejects(fake(async()=>json({...completed,output:[{type:'message',content:[{type:'output_text',text:'not json'}]}]})),'invalid_response');
console.log('PASS: incomplete, refused and malformed model output is rejected.');
await rejects(fake(async()=>json({...completed,usage:{input_tokens:-1,output_tokens:40}})),'invalid_response');
await rejects(fake(async()=>json({...completed,usage:{input_tokens:120,output_tokens:257}})),'invalid_response');
await rejects(fake(async()=>json({...completed,usage:undefined})),'invalid_response');
console.log('PASS: missing, invalid and over-limit usage is rejected.');
await rejects(fake(async()=>new Response('x'.repeat(262145))),'invalid_response');
console.log('PASS: oversized provider response is bounded.');
await rejects(fake((_url,init)=>new Promise<Response>((_resolve,reject)=>{init?.signal?.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});})),'timeout');
console.log('PASS: timed-out provider request aborts without retries or action success.');
let missingCalls=0;await assert.rejects(createOpenAiAdapter({...config.ai,apiKey:''},fake(async()=>{missingCalls++;return json(completed);})).infer(input,limits),(e:unknown)=>e instanceof AiTransportError&&e.code==='not_configured');assert.equal(missingCalls,0);
console.log('PASS: unconfigured credentials block transport before a request.');
console.log('7 transport check groups passed. No external request, credentials or paid inference used.');
