import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {AnalyticsStatus,AnalyticsReport,AnalyticsProperties,AnalyticsKeyEvents} from '../shared/google-analytics-contracts.js';
import {GoogleAnalyticsTransport,GoogleAnalyticsRemoteError,GOOGLE_ANALYTICS_SCOPE} from '../server/services/google-analytics-transport.js';
import type {AnalyticsRemoteReport} from '../server/services/google-analytics-transport.js';
import {hashPassword} from '../server/services/passwords.js';
import {withConversationFixture} from './lib/conversation-fixture.js';
const originalNetworkFetch=globalThis.fetch,allowedOrigins=new Set<string>();globalThis.fetch=async(input,init)=>{const target=new URL(input instanceof Request?input.url:String(input));if(target.hostname!=='127.0.0.1'||!allowedOrigins.has(target.origin))throw new Error('Unexpected external request prevented by the isolated analytics check.');return originalNetworkFetch(input,init);};
let groups=0,phase='safe isolated setup';const pass=(name:string)=>{groups++;console.log('PASS '+name);};
try{await withConversationFixture('api',async f=>{
 if(process.env.ANALYTICS_DEBUG==='true'){const transaction=f.database.transaction.bind(f.database);f.database.transaction=async<T>(operation:(client:PoolClient)=>Promise<T>):Promise<T>=>transaction(async c=>{try{return await operation(c);}catch(issue){const pg=issue as{code?:string;constraint?:string;routine?:string};if(pg.code&&/^[A-Z0-9]{5}$/.test(pg.code))console.error('Scratch SQL diagnostic: '+pg.code+' '+(pg.constraint??'')+' '+(pg.routine??''));throw issue;}});}
 const runtime=f.config as {-readonly[K in keyof typeof f.config]:typeof f.config[K]};
 let {base}=await f.start();allowedOrigins.add(base);await assert.rejects(()=>fetch('https://oauth2.googleapis.com/revoke'),/Unexpected external request prevented/);
 const request=(route:string,cookie='',method='GET',body?:unknown,headers:Record<string,string>={})=>fetch(base+route,{method,redirect:'manual',headers:{...(cookie?{Cookie:cookie}:{}),...(method==='GET'?{}:{Origin:f.config.appUrl}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const json=async<T=Record<string,unknown>>(route:string,cookie='',method='GET',body?:unknown,status:number|number[]=200):Promise<T>=>{const response=await request(route,cookie,method,body);assert((Array.isArray(status)?status:[status]).includes(response.status),method+' '+route.split('?')[0]+' expected '+JSON.stringify(status)+'; received '+response.status);return response.json() as Promise<T>;};
 const deny=async(route:string,cookie='',method='GET',body?:unknown,status:number|number[]=[400,401,403,404,409,410,501])=>{const response=await request(route,cookie,method,body);assert((Array.isArray(status)?status:[status]).includes(response.status),'Expected denial for '+method+' '+route.split('?')[0]+'; received '+response.status);return response;};
 const login=async(email:string,password:string)=>{const response=await request('/api/auth/login','','POST',{email,password});assert.equal(response.status,200);const cookie=response.headers.get('set-cookie')??'';assert(/HttpOnly/i.test(cookie)&&/SameSite=Lax/i.test(cookie));return cookie.split(';')[0]!;};
 const path='/api/google-analytics',range='from=2026-10-01&to=2026-10-14',reportPath=(kind='summary',extra='')=>path+'/report?'+range+'&kind='+kind+extra;

 if(process.env.ANALYTICS_OAUTH_RACE_ONLY==='true'){
  phase='stale OAuth callback race';
  const organizationId=randomUUID(),userId=randomUUID(),membershipId=randomUUID(),password='Synthetic-GA-race-'+randomUUID()+'!',email='ga-race-'+userId+'@example.test',hash=await hashPassword(password);
  await f.database.query("INSERT INTO organizations(id,name,slug,environment) VALUES($1,'Isolated OAuth race organization',$2,'live')",[organizationId,'ga-race-'+randomUUID()]);
  await f.database.query("INSERT INTO users(id,email,display_name,password_hash,is_demo,account_kind) VALUES($1,$2,'Synthetic OAuth race staff',$3,false,'staff')",[userId,email,hash]);
  await f.database.query("INSERT INTO organization_memberships(id,organization_id,user_id,role) VALUES($1,$2,$3,'organization_admin')",[membershipId,organizationId,userId]);
  runtime.demoMode=false;runtime.googleAnalytics={enabled:true,clientId:'synthetic-ga-race.apps.googleusercontent.com',clientSecret:'synthetic-race-secret',redirectUri:'http://ootla.test/api/google-analytics/oauth/callback',tokenEncryptionKey:randomBytes(32).toString('base64')};
  base=(await f.start()).base;allowedOrigins.add(base);runtime.appUrl=base;runtime.googleAnalytics={...f.config.googleAnalytics,redirectUri:base+'/api/google-analytics/oauth/callback'};
  const owner=await login(email,password),original=GoogleAnalyticsTransport.prototype.exchange,originalRevoke=GoogleAnalyticsTransport.prototype.revoke;GoogleAnalyticsTransport.prototype.revoke=async()=>{};
  let entered!:()=>void,release!:()=>void,pauseNext=false;
  let enteredPromise:Promise<void>,releasePromise:Promise<void>;
  const barrier=()=>{enteredPromise=new Promise<void>(resolve=>{entered=resolve;});releasePromise=new Promise<void>(resolve=>{release=resolve;});pauseNext=true;};
  GoogleAnalyticsTransport.prototype.exchange=async()=>{if(pauseNext){pauseNext=false;entered();await releasePromise;throw new GoogleAnalyticsRemoteError(503,'http_503',true);}return{access_token:'SYNTHETIC_FRESH_RACE_ACCESS',refresh_token:'SYNTHETIC_FRESH_RACE_REFRESH',expires_in:3600,token_type:'Bearer',scope:GOOGLE_ANALYTICS_SCOPE};};
  try{
   const start=async()=>new URL((await json<{authorizationUrl:string}>(path+'/oauth/start',owner,'POST',{requestKey:randomUUID()})).authorizationUrl).searchParams.get('state')!;
   const callback=(state:string)=>request(path+'/oauth/callback?state='+state+'&code=synthetic-code',owner);
   const stale=await start();barrier();const pending=callback(stale);await Promise.race([enteredPromise!,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('OAuth exchange barrier did not start.')),5000))]);
   const fresh=await start();assert.equal((await callback(fresh)).status,303);
   const protectedGrant=(await f.database.query('SELECT state,version,token_envelope,last_error FROM google_analytics_connections WHERE organization_id=$1',[organizationId])).rows[0];assert.equal(protectedGrant.state,'connected');release();assert.equal((await pending).status,303);
   assert.deepEqual((await f.database.query('SELECT state,version,token_envelope,last_error FROM google_analytics_connections WHERE organization_id=$1',[organizationId])).rows[0],protectedGrant);
   const disconnectedState=await start();barrier();const disconnectedPending=callback(disconnectedState);await Promise.race([enteredPromise!,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Second OAuth exchange barrier did not start.')),5000))]);
   await json(path+'/disconnect',owner,'POST',{requestKey:randomUUID()});release();assert.equal((await disconnectedPending).status,303);
   const afterDisconnect=(await f.database.query('SELECT state,token_envelope,last_error FROM google_analytics_connections WHERE organization_id=$1',[organizationId])).rows[0];assert.equal(afterDisconnect.state,'disconnected');assert.equal(afterDisconnect.token_envelope,null);assert.equal(afterDisconnect.last_error,null);
   pass('superseded failed OAuth callbacks cannot downgrade a newer connected grant or undo a deliberate disconnect while token exchange is in flight');
  }finally{release?.();GoogleAnalyticsTransport.prototype.exchange=original;GoogleAnalyticsTransport.prototype.revoke=originalRevoke;}
  return;
 }
 const admin=await login(f.staffEmail,f.adminPassword),foreign=await login(f.foreignEmail,f.adminPassword),analyst=await login(f.staff[2]!.email,f.staffPassword),agent=await login(f.staff[0]!.email,f.staffPassword);
 phase='honest unconfigured/demo data';
 await deny(path);await deny(reportPath());
 const initial=await json<AnalyticsStatus>(path,admin);assert.equal(initial.mode,'illustrative');assert.equal(initial.configured,false);assert.equal(initial.selectedProperty,null);assert.equal(initial.canReadReports,false);assert.equal(initial.scope,GOOGLE_ANALYTICS_SCOPE);
 await deny(path+'/oauth/start',admin,'POST',{requestKey:randomUUID()},[400,403,409,501]);
 const selected=await json<AnalyticsStatus>(path+'/selection',admin,'PUT',{requestKey:randomUUID(),propertyId:'demo',crmPropertyId:f.propertyId});assert.equal(selected.selectedProperty?.id,'demo');assert.equal(selected.selectedProperty.crmPropertyId,f.propertyId);assert.equal(selected.mode,'illustrative');
 const demo=await json<AnalyticsReport>(reportPath(),admin);assert.equal(demo.source.mode,'illustrative');assert.equal(demo.summary.users,266);assert.equal(demo.summary.sessions,364);assert.equal(demo.source.timeZone,'Africa/Lagos');assert.equal(demo.available,true);assert.equal(demo.range.from,'2026-10-01');assert.deepEqual(demo.comparisonRange,{from:'2026-09-17',to:'2026-09-30'});assert.match(demo.attributionNotice,/separate|not.*application|not.*lease/i);
 const databaseConnection=(await f.database.query('SELECT mode,token_envelope FROM google_analytics_connections WHERE organization_id=$1',[f.organizationId])).rows[0];assert.equal(databaseConnection.mode,'illustrative');assert.equal(databaseConnection.token_envelope,null);
 pass('demo analytics requires deliberate selection, stays explicitly illustrative with no token or live authorization, and returns sourced timezone/freshness and truthful website-only totals');

 phase='date comparisons and report pagination';
 for(const bad of ['from=2026-02-30&to=2026-03-02','from=2026-10-14&to=2026-10-01','from=2024-01-01&to=2026-10-14',range+'&pageSize=51',range+'&crmPropertyId='+f.foreignPropertyId])await deny(path+'/report?'+bad,admin,'GET',undefined,400);
 const noComparison=await json<AnalyticsReport>(reportPath('summary','&comparison=none'),admin);assert.equal(noComparison.comparisonRange,null);assert.equal(noComparison.comparison,null);
 const sources=await json<AnalyticsReport>(reportPath('acquisition','&page=2&pageSize=1'),admin);assert.equal(sources.rows.length,1);assert.equal(sources.rows[0]?.label,'(direct) / (none)');assert.equal(sources.total,3);assert.equal(sources.page,2);assert.equal(sources.totalPages,3);assert.equal(sources.rows[0]?.events,null);
 const demoKeys=await json<AnalyticsKeyEvents>(path+'/key-events',admin);assert.equal(demoKeys.source,'illustrative');assert(demoKeys.items.some(k=>k.eventName==='contact_clicked'));const events=await json<AnalyticsReport>(reportPath('events'),admin);assert(events.rows.some(r=>r.keyEvents===0));assert(events.rows.every(r=>r.users===null));
 const landing=await json<AnalyticsReport>(reportPath('landing'),admin);assert(landing.rows.every(r=>r.label.startsWith('/')&&!r.label.includes('?')));
 pass('inclusive equal-length comparisons, no-comparison mode and all four paginated report kinds validate dates and retain unavailable per-kind measures as null');

 phase='property mappings and cache permission isolation';
 await json<AnalyticsReport>(reportPath(),analyst);await deny(reportPath(),agent,'GET',undefined,403);await deny(path+'/selection',analyst,'PUT',{requestKey:randomUUID(),propertyId:'demo',crmPropertyId:f.propertyId},403);
 const otherStatus=await json<AnalyticsStatus>(path,foreign);assert.equal(otherStatus.selectedProperty,null);
 await deny(path+'/selection',admin,'PUT',{requestKey:randomUUID(),propertyId:'demo',crmPropertyId:f.foreignPropertyId},[403,404]);
 await f.database.query('DELETE FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=$3',[f.organizationId,f.staff[2]!.membershipId,f.propertyId]);await deny(reportPath(),analyst,'GET',undefined,[403,404]);
 await f.database.query('INSERT INTO property_access_assignments(organization_id,membership_id,property_id) VALUES($1,$2,$3)',[f.organizationId,f.staff[2]!.membershipId,f.propertyId]);
 await json(path+'/selection',admin,'PUT',{requestKey:randomUUID(),propertyId:'demo',crmPropertyId:f.restrictedPropertyId});await deny(reportPath(),analyst,'GET',undefined,[403,404]);
 await json(path+'/selection',admin,'PUT',{requestKey:randomUUID(),propertyId:'demo',crmPropertyId:null});await deny(reportPath(),analyst,'GET',undefined,[403,404]);
 await json(path+'/selection',admin,'PUT',{requestKey:randomUUID(),propertyId:'demo',crmPropertyId:f.propertyId});
 pass('organization configuration and mapped CRM property permissions are rechecked on reports and cached reads; revoked grants and organization-wide reports cannot leak to scoped staff');

 phase='disconnect and CRM separation';
 const crmBefore=(await f.database.query('SELECT status FROM applications WHERE id=$1',[f.applicationId])).rows[0].status;assert.equal(crmBefore,'draft');
 const disconnected=await json<AnalyticsStatus>(path+'/disconnect',admin,'POST',{requestKey:randomUUID()});assert.equal(disconnected.state,'disconnected');assert.equal(disconnected.canReadReports,false);
 const missingResponse=await request(reportPath(),admin);if(missingResponse.status===200){const missing=await missingResponse.json() as AnalyticsReport;assert.equal(missing.available,false);assert.equal(missing.summary.users,null);assert.equal(missing.summary.sessions,null);}else assert([403,409].includes(missingResponse.status));
 assert.equal((await f.database.query('SELECT status FROM applications WHERE id=$1',[f.applicationId])).rows[0].status,crmBefore);
 assert.equal(Number((await f.database.query('SELECT count(*) AS n FROM application_documents WHERE organization_id=$1',[f.organizationId])).rows[0].n),0);
 pass('disconnect invalidates access and returns unavailable values or explicit denial; analytics never changes application milestones, identity uploads or CRM outcomes');

 phase='isolated synthetic live-transport fixture';
 const organizationId=randomUUID(),ownerId=randomUUID(),ownerMembership=randomUUID(),readerId=randomUUID(),readerMembership=randomUUID(),secondOwnerId=randomUUID(),secondOwnerMembership=randomUUID(),propertyId=randomUUID(),otherPropertyId=randomUUID(),password='Synthetic-GA-'+randomUUID()+'!',passwordHash=await hashPassword(password),ownerEmail='ga-owner-'+ownerId+'@example.test',readerEmail='ga-reader-'+readerId+'@example.test',secondOwnerEmail='ga-second-'+secondOwnerId+'@example.test';
 await f.database.query("INSERT INTO organizations(id,name,slug,environment) VALUES($1,'Isolated GA transport organization',$2,'live')",[organizationId,'ga-'+randomUUID()]);
 await f.database.query("INSERT INTO organization_data_settings(organization_id,mode) VALUES($1,'standalone')",[organizationId]);
 for(const [id,email,membership,role]of [[ownerId,ownerEmail,ownerMembership,'organization_admin'],[readerId,readerEmail,readerMembership,'read_only_analyst'],[secondOwnerId,secondOwnerEmail,secondOwnerMembership,'organization_admin']]){
  await f.database.query("INSERT INTO users(id,email,display_name,password_hash,is_demo,account_kind) VALUES($1,$2,'Synthetic Analytics Staff',$3,false,'staff')",[id,email,passwordHash]);await f.database.query("INSERT INTO organization_memberships(id,organization_id,user_id,role) VALUES($1,$2,$3,$4)",[membership,organizationId,id,role]);
 }
 await f.database.query("INSERT INTO properties(id,organization_id,name,address,city) VALUES($1,$2,'Synthetic GA mapped property','Synthetic address','Demo city'),($3,$2,'Synthetic GA restricted property','Synthetic address','Demo city')",[propertyId,organizationId,otherPropertyId]);
 await f.database.query('INSERT INTO property_access_assignments(organization_id,membership_id,property_id) VALUES($1,$2,$3)',[organizationId,readerMembership,propertyId]);
 runtime.demoMode=false;runtime.googleAnalytics={enabled:true,clientId:'synthetic-ga-client.apps.googleusercontent.com',clientSecret:'synthetic-server-only-secret',redirectUri:'http://ootla.test/api/google-analytics/oauth/callback',tokenEncryptionKey:randomBytes(32).toString('base64')};
 const original={exchange:GoogleAnalyticsTransport.prototype.exchange,refresh:GoogleAnalyticsTransport.prototype.refresh,revoke:GoogleAnalyticsTransport.prototype.revoke,properties:GoogleAnalyticsTransport.prototype.properties,property:GoogleAnalyticsTransport.prototype.property,report:GoogleAnalyticsTransport.prototype.report,keyEvents:GoogleAnalyticsTransport.prototype.keyEvents};
 const calls={exchange:0,refresh:0,revoke:0,properties:0,property:0,report:0,keyEvents:0};let tokenScopes:string=GOOGLE_ANALYTICS_SCOPE,refreshRevoked=false,remoteUnavailable=false,remoteZero=false,remoteFailure=false;
 const remoteReport:GoogleAnalyticsTransport['report']=async(_token,id,kind,dates,page=1,pageSize=25):Promise<AnalyticsRemoteReport>=>{calls.report++;assert.equal(id,'properties/101');assert.deepEqual(Object.keys(dates).sort(),['from','to']);assert(page>0&&pageSize<=50);if(remoteFailure)throw new GoogleAnalyticsRemoteError(503,'http_503',true);const measure=remoteUnavailable?null:remoteZero?0:dates.from==='2026-10-01'?123:91;return{rows:[{label:kind==='acquisition'?'google / organic':kind==='landing'?'/apartments':kind==='events'?'viewing_requested':'Total',users:kind==='events'?null:measure,sessions:kind==='events'?null:measure,events:kind==='summary'||kind==='events'?measure:null,keyEvents:kind==='summary'||kind==='events'?measure:null}],total:1,timeZone:'Africa/Lagos',available:!remoteUnavailable,metadata:{thresholded:remoteUnavailable,otherRow:false}};};
 GoogleAnalyticsTransport.prototype.exchange=async()=>{calls.exchange++;return{access_token:'SYNTHETIC_ACCESS_TOKEN_NEVER_PUBLIC',refresh_token:'SYNTHETIC_REFRESH_TOKEN_NEVER_PUBLIC',expires_in:3600,token_type:'Bearer',scope:tokenScopes};};
 GoogleAnalyticsTransport.prototype.refresh=async()=>{calls.refresh++;if(refreshRevoked)throw new GoogleAnalyticsRemoteError(400,'invalid_grant',false,true);return{access_token:'SYNTHETIC_REFRESHED_ACCESS_NEVER_PUBLIC',expires_in:3600,token_type:'Bearer',scope:GOOGLE_ANALYTICS_SCOPE};};
 GoogleAnalyticsTransport.prototype.revoke=async()=>{calls.revoke++;};
 GoogleAnalyticsTransport.prototype.properties=async(_token,pageToken)=>{calls.properties++;return{items:[{id:pageToken?'properties/202':'properties/101',name:pageToken?'Second authorized GA property':'Synthetic website property',timeZone:'Africa/Lagos'}],nextPageToken:pageToken?null:'PROVIDER_CURSOR_NEVER_BROWSER'};};
 GoogleAnalyticsTransport.prototype.property=async(_token,id)=>{calls.property++;if(id!=='properties/101'&&id!=='properties/202')throw new GoogleAnalyticsRemoteError(403,'PERMISSION_DENIED',false);return{id,name:id==='properties/101'?'Synthetic website property':'Second authorized GA property',timeZone:'Africa/Lagos'};};
 GoogleAnalyticsTransport.prototype.keyEvents=async(_token,id,pageToken)=>{calls.keyEvents++;assert.equal(id,'properties/101');return{items:[{name:'properties/101/keyEvents/'+(pageToken?'2':'1'),eventName:pageToken?'contact_clicked':'viewing_requested',countingMethod:'ONCE_PER_EVENT'}],nextPageToken:pageToken?null:'PRIVATE_KEY_EVENT_CURSOR'};};
 GoogleAnalyticsTransport.prototype.report=remoteReport;
 try{
  const live=await f.start();base=live.base;allowedOrigins.add(base);runtime.appUrl=base;runtime.googleAnalytics={...f.config.googleAnalytics,redirectUri:base+'/api/google-analytics/oauth/callback'};
  const owner=await login(ownerEmail,password),reader=await login(readerEmail,password),secondOwner=await login(secondOwnerEmail,password);
  const connect=()=>json<{authorizationUrl:string}>(path+'/oauth/start',owner,'POST',{requestKey:randomUUID()});
  const callback=(state:string,cookie=owner)=>request(path+'/oauth/callback?state='+encodeURIComponent(state)+'&code=synthetic-code',cookie);
  phase='OAuth state/session/expiry and narrow scopes';
  const started=await connect(),auth=new URL(started.authorizationUrl),state=auth.searchParams.get('state');assert(state);assert.equal(auth.searchParams.get('scope'),GOOGLE_ANALYTICS_SCOPE);assert.equal(auth.searchParams.get('code_challenge_method'),'S256');assert(!JSON.stringify(started).includes(f.config.googleAnalytics.clientSecret));
  const row=(await f.database.query('SELECT state_digest,verifier_envelope FROM google_analytics_oauth_states WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 1',[organizationId])).rows[0];assert(row);assert(!JSON.stringify(row).includes(state));const challenge=auth.searchParams.get('code_challenge');assert(challenge);assert(!JSON.stringify(row).includes(challenge));
  await callback(state,secondOwner);assert.equal(calls.exchange,0);const otherOwnerSession=await login(ownerEmail,password);await callback(state,otherOwnerSession);assert.equal(calls.exchange,0);
  await f.database.query("UPDATE google_analytics_oauth_states SET expires_at=now()-interval '1 minute' WHERE organization_id=$1",[organizationId]);await callback(state);assert.equal(calls.exchange,0);
  tokenScopes=GOOGLE_ANALYTICS_SCOPE+' https://www.googleapis.com/auth/analytics.edit';const broadState=new URL((await connect()).authorizationUrl).searchParams.get('state')!;const rejectedScope=await callback(broadState);assert.equal(rejectedScope.status,303);assert.match(rejectedScope.headers.get('location')??'',/google=failed/);assert.equal((await f.database.query('SELECT token_envelope FROM google_analytics_connections WHERE organization_id=$1',[organizationId])).rows[0].token_envelope,null);tokenScopes=GOOGLE_ANALYTICS_SCOPE;const validState=new URL((await connect()).authorizationUrl).searchParams.get('state')!;const completed=await callback(validState);assert.equal(completed.status,303);assert.equal(calls.exchange,2);await callback(validState);assert.equal(calls.exchange,2);
  const connected=await json<AnalyticsStatus>(path,owner);assert.equal(connected.state,'connected');assert.equal(connected.mode,'live');assert.equal(connected.selectedProperty,null);
  const saved=(await f.database.query('SELECT token_envelope,scopes FROM google_analytics_connections WHERE organization_id=$1',[organizationId])).rows[0];assert(saved.token_envelope);assert(!JSON.stringify(saved).includes('SYNTHETIC_ACCESS'));assert(!JSON.stringify(saved).includes('SYNTHETIC_REFRESH'));assert.deepEqual(saved.scopes,[GOOGLE_ANALYTICS_SCOPE]);
  pass('real mounted OAuth routes bind digest-only expiring one-use state and encrypted PKCE to the current actor/session; tokens stay encrypted and only read-only scope is accepted');

  phase='accessible property cursor and selection';
  const first=await json<AnalyticsProperties>(path+'/properties',owner);assert.equal(first.items[0]?.id,'properties/101');assert(first.nextPageToken);assert.notEqual(first.nextPageToken,'PROVIDER_CURSOR_NEVER_BROWSER');await deny(path+'/properties?pageToken='+encodeURIComponent(first.nextPageToken),secondOwner,'GET',undefined,[400,403,404,409,410]);
  const next=await json<AnalyticsProperties>(path+'/properties?pageToken='+encodeURIComponent(first.nextPageToken),owner);assert.equal(next.items[0]?.id,'properties/202');
  await deny(path+'/selection',owner,'PUT',{requestKey:randomUUID(),propertyId:'properties/999',crmPropertyId:propertyId},[403,404,409]);
  await json(path+'/selection',owner,'PUT',{requestKey:randomUUID(),propertyId:'properties/101',crmPropertyId:propertyId});
  const keys=await json<AnalyticsKeyEvents>(path+'/key-events',owner);assert.equal(keys.source,'google');assert.equal(keys.items[0]?.eventName,'viewing_requested');assert(keys.nextPageToken);assert.notEqual(keys.nextPageToken,'PRIVATE_KEY_EVENT_CURSOR');await deny(path+'/properties?pageToken='+encodeURIComponent(keys.nextPageToken),owner,'GET',undefined,400);const keyNext=await json<AnalyticsKeyEvents>(path+'/key-events?pageToken='+encodeURIComponent(keys.nextPageToken),owner);assert.equal(keyNext.items[0]?.eventName,'contact_clicked');
  const current=await json<AnalyticsReport>(reportPath(),owner);assert.equal(current.source.mode,'google');assert.equal(current.summary.users,123);assert.equal(current.comparison?.users,91);
  const reportCalls=calls.report,cached=await json<AnalyticsReport>(reportPath(),owner);assert(cached.cached);assert.equal(calls.report,reportCalls);
  await json(reportPath(),reader);assert(calls.report>reportCalls);
  await f.database.query('DELETE FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2',[organizationId,readerMembership]);await deny(reportPath(),reader,'GET',undefined,[403,404]);
  await f.database.query('INSERT INTO property_access_assignments(organization_id,membership_id,property_id) VALUES($1,$2,$3)',[organizationId,readerMembership,propertyId]);
  await json(path+'/selection',owner,'PUT',{requestKey:randomUUID(),propertyId:'properties/101',crmPropertyId:otherPropertyId});await deny(reportPath(),reader,'GET',undefined,[403,404]);
  await json(path+'/selection',owner,'PUT',{requestKey:randomUUID(),propertyId:'properties/101',crmPropertyId:propertyId});
  pass('accessible GA property paging uses actor/session-bound opaque cursors; live caches are isolated by actor, dates and current mapped-property grants');

  phase='missing data, zero and transient failures';
  remoteUnavailable=true;const unavailable=await json<AnalyticsReport>(reportPath('summary','&refresh=true&comparison=none'),owner);assert.equal(unavailable.available,false);assert.equal(unavailable.summary.users,null);assert.equal(unavailable.summary.keyEvents,null);remoteUnavailable=false;remoteZero=true;
  const zero=await json<AnalyticsReport>(reportPath('summary','&refresh=true&comparison=none'),owner);assert.equal(zero.available,true);assert.equal(zero.summary.users,0);remoteZero=false;
  remoteFailure=true;const failure=await request(reportPath('summary','&refresh=true&comparison=none'),owner);assert([200,502,503].includes(failure.status));if(failure.status===200){const failed=await failure.json() as AnalyticsReport;assert.equal(failed.available,false);assert.equal(failed.summary.users,null);}assert.equal((await json<AnalyticsStatus>(path,owner)).state,'degraded');remoteFailure=false;
  await json(reportPath('summary','&refresh=true&comparison=none'),owner);assert.equal((await json<AnalyticsStatus>(path,owner)).state,'connected');
  pass('unavailable provider data remains null, actual zero stays zero and transient failures persist a truthful degraded state with deliberate recovery');

  phase='expired tokens, revoked authorization and local disconnect';
  await f.database.query("UPDATE audit_events SET created_at=created_at-interval '2 minutes' WHERE organization_id=$1 AND action='google_analytics.remote_request'",[organizationId]);
  await f.database.query("UPDATE google_analytics_connections SET token_expires_at=now()-interval '1 minute' WHERE organization_id=$1",[organizationId]);await json(reportPath('summary','&refresh=true&comparison=none'),owner);assert.equal(calls.refresh,1);
  const refreshed=(await f.database.query('SELECT token_envelope FROM google_analytics_connections WHERE organization_id=$1',[organizationId])).rows[0];assert(!JSON.stringify(refreshed).includes('SYNTHETIC_REFRESHED_ACCESS'));
  await f.database.query("UPDATE google_analytics_connections SET token_expires_at=now()-interval '1 minute' WHERE organization_id=$1",[organizationId]);refreshRevoked=true;await request(reportPath('summary','&refresh=true&comparison=none'),owner);const revoked=await json<AnalyticsStatus>(path,owner);assert.equal(revoked.state,'revoked');assert.equal(revoked.canReadReports,false);assert.equal((await f.database.query('SELECT token_envelope FROM google_analytics_connections WHERE organization_id=$1',[organizationId])).rows[0].token_envelope,null);
  const final=await json<AnalyticsStatus>(path+'/disconnect',owner,'POST',{requestKey:randomUUID()});assert.equal(final.state,'disconnected');assert.equal(final.canReadReports,false);
  pass('expired server tokens refresh once, revoked access persists after request failure and clears credentials, and disconnect cannot expose stale cached reports');
 }finally{Object.assign(GoogleAnalyticsTransport.prototype,original);}
});console.log('Stage 22 Google Analytics verification passed ('+groups+' focused groups).');}catch(issue){console.error('Google Analytics verification failed during '+phase+'.');console.error(issue instanceof Error?issue.message:'Unknown verification issue.');process.exitCode=1;}finally{globalThis.fetch=originalNetworkFetch;}
