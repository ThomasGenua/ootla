import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {GoogleAnalyticsTransport,GoogleAnalyticsRemoteError,GOOGLE_ANALYTICS_SCOPE} from '../server/services/google-analytics-transport.js';
import type {ServerConfig} from '../server/config/env.js';
let groups=0,phase='official authorization';
const pass=(name:string)=>{groups++;console.log('PASS '+name);};
const config:ServerConfig['googleAnalytics']={enabled:true,clientId:'synthetic-ga-client.apps.googleusercontent.com',clientSecret:'synthetic-not-live-secret',redirectUri:'http://127.0.0.1:5198/api/google-analytics/oauth/callback',tokenEncryptionKey:randomBytes(32).toString('base64')};
type Call={url:URL;init:RequestInit};
const calls:Call[]=[];
let respond:(call:Call)=>Response|Promise<Response>=()=>new Response('{}',{status:200,headers:{'Content-Type':'application/json'}});
const fetcher:typeof fetch=async(input,init)=>{const call={url:new URL(String(input)),init:init??{}};calls.push(call);assert.equal(call.init.redirect,'error');assert(call.init.signal);assert(['accounts.google.com','oauth2.googleapis.com','analyticsadmin.googleapis.com','analyticsdata.googleapis.com'].includes(call.url.hostname));return respond(call);};
const transport=new GoogleAnalyticsTransport(fetcher),json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const metrics=(names:string[],values:string[],dimension?:{name:string;value:string},metadata:Record<string,unknown>={},total=1)=>({metricHeaders:names.map(name=>({name})),dimensionHeaders:dimension?[{name:dimension.name}]:[],rows:[{metricValues:values.map(value=>({value})),dimensionValues:dimension?[{value:dimension.value}]:[]}],rowCount:total,metadata:{timeZone:'Africa/Lagos',...metadata}});
const reject=async(run:()=>Promise<unknown>,code?:string)=>{await assert.rejects(run,(issue:unknown)=>issue instanceof GoogleAnalyticsRemoteError&&(!code||issue.code===code));};
try{
 const auth=new URL(transport.authorizationUrl(config,'opaque-state','synthetic-S256-challenge'));
 assert.equal(auth.origin+auth.pathname,'https://accounts.google.com/o/oauth2/v2/auth');assert.equal(auth.searchParams.get('scope'),GOOGLE_ANALYTICS_SCOPE);assert.equal(auth.searchParams.get('code_challenge_method'),'S256');assert.equal(auth.searchParams.get('state'),'opaque-state');assert.equal(auth.searchParams.get('access_type'),'offline');assert.equal(auth.searchParams.get('include_granted_scopes'),'false');assert(!auth.toString().includes(config.clientSecret));assert.equal(calls.length,0);
 pass('official OAuth authorization requests only analytics.readonly with offline access and PKCE, without exposing the client secret');

 phase='token exchange and refresh';respond=call=>{assert.equal(call.url.origin+call.url.pathname,'https://oauth2.googleapis.com/token');assert.equal(call.init.method,'POST');const form=new URLSearchParams(String(call.init.body));assert.equal(form.get('client_id'),config.clientId);assert.equal(form.get('client_secret'),config.clientSecret);if(form.get('grant_type')==='authorization_code'){assert.equal(form.get('code'),'synthetic-code');assert.equal(form.get('code_verifier'),'synthetic-verifier');assert.equal(form.get('redirect_uri'),config.redirectUri);}else{assert.equal(form.get('grant_type'),'refresh_token');assert.equal(form.get('refresh_token'),'synthetic-refresh');}return json({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600,token_type:'Bearer',scope:GOOGLE_ANALYTICS_SCOPE});};
 const exchanged=await transport.exchange(config,'synthetic-code','synthetic-verifier');assert.equal(exchanged.access_token,'synthetic-access');await transport.refresh(config,'synthetic-refresh');
 respond=call=>{assert.equal(call.url.origin+call.url.pathname,'https://oauth2.googleapis.com/revoke');assert.equal(new URLSearchParams(String(call.init.body)).get('token'),'synthetic-refresh');return json({});};await transport.revoke('synthetic-refresh');
 pass('code exchange, refresh and disconnect use fixed official token endpoints and form bodies through a deterministic fetch seam');

 phase='authorized properties and pagination';respond=call=>{assert.equal(call.url.origin+call.url.pathname,'https://analyticsadmin.googleapis.com/v1beta/accountSummaries');assert.equal(call.url.searchParams.get('pageSize'),'50');assert.equal(new Headers(call.init.headers).get('Authorization'),'Bearer synthetic-access');return call.url.searchParams.get('pageToken')?json({accountSummaries:[{propertySummaries:[{property:'properties/202',displayName:'Second authorized property'}]}]}):json({accountSummaries:[{propertySummaries:[{property:'properties/101',displayName:'First authorized property'}]}],nextPageToken:'opaque-next'});};
 const first=await transport.properties('synthetic-access');assert.equal(first.items[0]?.id,'properties/101');assert.equal(first.nextPageToken,'opaque-next');const second=await transport.properties('synthetic-access',first.nextPageToken!);assert.equal(second.items[0]?.id,'properties/202');assert.equal(second.nextPageToken,null);
 respond=call=>{assert.equal(call.url.origin+call.url.pathname,'https://analyticsadmin.googleapis.com/v1beta/properties/101');return json({name:'properties/101',displayName:'First authorized property',timeZone:'Africa/Lagos'});};assert.equal((await transport.property('synthetic-access','properties/101')).timeZone,'Africa/Lagos');
 respond=()=>json({name:'properties/202',displayName:'Wrong property'});await reject(()=>transport.property('synthetic-access','properties/101'),'property_unavailable');
 const beforeInvalid=calls.length;await reject(()=>transport.property('synthetic-access','https://unexpected.test/properties/101'),'invalid_property');assert.equal(calls.length,beforeInvalid);
 pass('property discovery follows bounded official pagination and validates the exact selected accessible property before use');

 phase='read-only report payloads';const from='2026-10-01',to='2026-10-14';
 for(const kind of ['summary','acquisition','landing','events'] as const){
  respond=call=>{assert.equal(call.url.origin+call.url.pathname,'https://analyticsdata.googleapis.com/v1beta/properties/101:runReport');assert.equal(call.init.method,'POST');const body=JSON.parse(String(call.init.body)) as Record<string,unknown>;assert.deepEqual(body.dateRanges,[{startDate:from,endDate:to}]);assert.equal(body.limit,kind==='summary'?'1':'10');assert.equal(body.offset,kind==='summary'?'0':'10');assert.equal(body.keepEmptyRows,false);const names=(body.metrics as Array<{name:string}>).map(m=>m.name);const dimension=kind==='acquisition'?'sessionSourceMedium':kind==='landing'?'landingPage':kind==='events'?'eventName':undefined;
   assert(!String(call.init.body).includes('PRIVATE_STAFF_MARKER'));assert(!String(call.init.body).includes('contact'));assert(!String(call.init.body).includes('person@example.test'));assert(!String(call.init.body).includes('documentContents'));
   if(kind==='landing'){assert.deepEqual(body.dimensions,[{name:'landingPage'}]);assert(!String(call.init.body).includes('landingPagePlusQueryString'));assert(body.dimensionFilter);}
   return json(metrics(names,names.map((_,i)=>String(i+1)),dimension?{name:dimension,value:kind==='landing'?'/apartments':kind==='events'?'viewing_request':'google / organic'}:undefined));
  };
  const report=await transport.report('synthetic-access','properties/101',kind,{from,to},2,10);assert(report.available);assert.equal(report.timeZone,'Africa/Lagos');assert.equal(report.rows.length,1);if(kind==='events'){assert.equal(report.rows[0]?.users,null);assert.equal(report.rows[0]?.sessions,null);}else if(kind!=='summary'){assert.equal(report.rows[0]?.events,null);assert.equal(report.rows[0]?.keyEvents,null);}
 }
 assert(calls.every(call=>!call.url.hostname.includes('google-analytics.com')&&!/collect|measurement|upload|userData/i.test(call.url.pathname)));
 pass('all four report kinds use native read-only runReport requests, explicit dates and server pagination with no CRM uploads or measurement calls');


 phase='configured key-event catalog';respond=call=>{assert.equal(call.url.origin+call.url.pathname,'https://analyticsadmin.googleapis.com/v1beta/properties/101/keyEvents');assert.equal(call.url.searchParams.get('pageSize'),'50');assert.equal(call.init.method,undefined);return call.url.searchParams.get('pageToken')?json({keyEvents:[{name:'properties/101/keyEvents/2',eventName:'contact_clicked',countingMethod:'ONCE_PER_SESSION'}]}):json({keyEvents:[{name:'properties/101/keyEvents/1',eventName:'viewing_requested',countingMethod:'ONCE_PER_EVENT'}],nextPageToken:'key-event-next'});};
 const keys=await transport.keyEvents('synthetic-access','properties/101');assert.equal(keys.items[0]?.eventName,'viewing_requested');assert.equal(keys.nextPageToken,'key-event-next');const keysNext=await transport.keyEvents('synthetic-access','properties/101',keys.nextPageToken!);assert.equal(keysNext.items[0]?.countingMethod,'ONCE_PER_SESSION');assert.equal(keysNext.nextPageToken,null);
 respond=()=>json({keyEvents:[{name:'properties/999/keyEvents/1',eventName:'viewing_requested'}]});await reject(()=>transport.keyEvents('synthetic-access','properties/101'),'invalid_response');
 pass('configured key events use the official read-only property catalog with bounded pagination and exact-property validation, separately from observed event activity');

 phase='missing data versus true zero';respond=()=>json({metricHeaders:['activeUsers','sessions','eventCount','keyEvents'].map(name=>({name})),dimensionHeaders:[],rowCount:0,metadata:{timeZone:'Africa/Lagos'}});
 const zero=await transport.report('synthetic-access','properties/101','summary',{from,to});assert(zero.available);assert.equal(zero.rows[0]?.users,0);assert.equal(zero.rows[0]?.sessions,0);
 respond=()=>json({metricHeaders:['activeUsers','sessions','eventCount','keyEvents'].map(name=>({name})),dimensionHeaders:[],rowCount:0,metadata:{timeZone:'Africa/Lagos',subjectToThresholding:true,emptyReason:'NO_DATA'}});
 const missing=await transport.report('synthetic-access','properties/101','summary',{from,to});assert.equal(missing.available,false);assert.equal(missing.rows[0]?.users,null);assert.equal(missing.rows[0]?.keyEvents,null);assert.equal(missing.metadata.thresholded,true);
 const count=calls.length;await reject(()=>transport.report('synthetic-access','properties/101','summary',{from:'2026-02-30',to}),'invalid_report');await reject(()=>transport.report('synthetic-access','properties/101','summary',{from:to,to:from}),'invalid_report');await reject(()=>transport.report('synthetic-access','properties/101','summary',{from,to},1,51),'invalid_report');assert.equal(calls.length,count);
 pass('valid empty totals remain zero while unavailable or thresholded data remains null; invalid dates and page sizes are rejected before a request');

 phase='safe remote dimensions';const labels=['/admin/applications','/applicant/private','/apartments?email=person%40example.test','/apartments/123456789','/apartments'];
 for(const label of labels){respond=()=>json(metrics(['activeUsers','sessions'],['1','2'],{name:'landingPage',value:label}));const value=(await transport.report('synthetic-access','properties/101','landing',{from,to})).rows[0]!.label;assert(!value.includes('example.test'));assert(!value.includes('123456789'));assert(!value.includes('/admin'));assert(!value.includes('/applicant'));if(label==='/apartments')assert.equal(value,'/apartments');}
 respond=()=>json(metrics(['eventCount','keyEvents'],['5','1'],{name:'eventName',value:'person@example.test'}));assert.equal((await transport.report('synthetic-access','properties/101','events',{from,to})).rows[0]?.label,'[Redacted value]');
 pass('remote dimensions omit query strings and redact private routes, email addresses, long identifiers and unrecognized event labels');

 phase='provider failures and bounded responses';for(const [status,body,code,retryable,revoked]of [[401,{error:{status:'UNAUTHENTICATED'}},'UNAUTHENTICATED',false,true],[429,{error:{status:'RESOURCE_EXHAUSTED'}},'RESOURCE_EXHAUSTED',true,false],[400,{error:'invalid_grant'},'invalid_grant',false,true],[503,{error:{status:'INTERNAL'}},'http_503',true,false]] as const){respond=()=>json(body,status);const n:number=calls.length;await assert.rejects(()=>transport.properties('synthetic-access'),(issue:unknown)=>issue instanceof GoogleAnalyticsRemoteError&&issue.code===code&&issue.retryable===retryable&&issue.revoked===revoked);assert.equal(calls.length,n+1);}
 respond=()=>new Response('x'.repeat(1024*1024+1));await reject(()=>transport.properties('synthetic-access'),'invalid_response');
 respond=()=>json({access_token:'synthetic',expires_in:3600,token_type:'Basic'});await reject(()=>transport.refresh(config,'synthetic-refresh'),'invalid_response');
 respond=()=>json({metricHeaders:[{name:'incorrectMetric'}],dimensionHeaders:[],rows:[]});await reject(()=>transport.report('synthetic-access','properties/101','summary',{from,to}),'invalid_response');
 assert(calls.every(call=>call.init.redirect==='error'));
 pass('revocation, quotas, transient failures and malformed or oversized data are classified without automatic retries or redirect following');
 console.log('Stage 22 Google Analytics transport verification passed ('+groups+' focused groups; zero network requests).');
}catch(issue){console.error('Google Analytics transport verification failed during '+phase+'.');console.error(issue instanceof Error?issue.message:'Unknown verification issue.');process.exitCode=1;}
