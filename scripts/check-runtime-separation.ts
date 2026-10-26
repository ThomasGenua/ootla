import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {spawn,execFile,type ChildProcess} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import {createServer as probeServer,type AddressInfo} from 'node:net';
import type {Server} from 'node:http';
import {Client} from 'pg';
import {createApp} from '../server/app.js';
import {Database} from '../server/db/pool.js';
import {ConfigurationError,loadConfig,type ServerConfig} from '../server/config/env.js';
import {assertRuntimeDatabaseIsolation} from '../server/runtime-isolation.js';
import {readSessionCookie,sessionCookieName} from '../server/http/session-cookies.js';
import {readSessionDigest} from '../server/services/sessions.js';
import {hashPassword} from '../server/services/passwords.js';
import {seedResidentDemo} from '../server/services/resident-demo.js';
import {residentDemoEmail,residentDemoPassword,residentDigest} from '../server/services/resident-portal.js';
import {withConversationFixture} from './lib/conversation-fixture.js';
import {installLocalFixtureNetworkGuard} from './lib/local-network-guard.js';
const guard=installLocalFixtureNetworkGuard(),normal=(p:string)=>path.resolve(p).replaceAll('\\','/').toLowerCase();
let phase='cookie codecs',groups=0;
const pass=(label:string)=>{groups++;console.log('PASS '+label);};
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
type Runtime={base:string;config:ServerConfig;close:()=>Promise<void>};
const runtime=async(config:ServerConfig,db:Database):Promise<Runtime>=>{
 await db.requireReady();await assertRuntimeDatabaseIsolation(db,config);
 const app=createApp(config,db),server=await new Promise<Server>((resolve,reject)=>{const socket=app.listen(0,'127.0.0.1',()=>resolve(socket));socket.once('error',reject);});
 const base='http://127.0.0.1:'+(server.address() as AddressInfo).port;guard.allow(base);let closed=false;
 return{base,config,close:async()=>{if(closed)return;closed=true;server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
};
async function request(r:Runtime,route:string,cookie='',method='GET',body?:unknown){
 const target=new URL(route,r.base);assert.equal(target.origin,r.base);
 return fetch(target,{method,redirect:'manual',headers:{...(cookie?{Cookie:cookie}:{}),...(method==='GET'?{}:{Origin:r.config.appUrl,'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
async function login(r:Runtime,route:string,email:string,password:string,kind:'staff'|'applicant'|'resident'){
 const response=await request(r,route,'','POST',{email,password});assert.equal(response.status,200,'Normal '+kind+' sign-in must succeed.');
 const header=response.headers.get('set-cookie')??'';assert(header.startsWith(sessionCookieName(r.config,kind)+'='));assert.match(header,/HttpOnly/i);assert.match(header,/SameSite=Lax/i);assert(!/\bDomain=/i.test(header));return header.split(';')[0]!;
}
async function availablePort(){const probe=probeServer();await new Promise<void>((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});const port=(probe.address() as AddressInfo).port;await new Promise<void>(resolve=>probe.close(()=>resolve()));return port;}
try{
 const config=loadConfig({NODE_ENV:'test',APP_URL:'http://127.0.0.1:5299',SESSION_SECRET:'synthetic-cookie-check-with-more-than-32-characters'}),custom={...config,sessionCookiePrefix:'ootla-preview'},token='a'.repeat(64);
 for(const kind of ['staff','applicant','resident'] as const){
  assert.equal(sessionCookieName(config,kind),'ootla'+(kind==='staff'?'.sid':'.'+kind+'.sid'));
  const name=sessionCookieName(custom,kind),r={headers:{cookie:'unrelated=b; '+name+'='+token}};
  assert.equal(readSessionCookie(r,custom,kind),token);assert.equal(readSessionCookie(r,config,kind),null);
  assert.equal(readSessionCookie({headers:{cookie:name+'=invalid'}},custom,kind),null);
 }
 const req={headers:{cookie:'ootla.sid='+token}} as Parameters<typeof readSessionDigest>[0];
 assert.equal(readSessionDigest(req,config),createHmac('sha256',config.sessionSecret).update(token).digest('hex'));
 for(const SESSION_COOKIE_PREFIX of ['','bad.prefix','bad;prefix','x'.repeat(81)])assert.throws(()=>loadConfig({NODE_ENV:'test',APP_URL:config.appUrl,SESSION_SECRET:config.sessionSecret,SESSION_COOKIE_PREFIX}),ConfigurationError);
 pass('legacy names and staff HMAC remain unchanged; all three runtime cookie names parse exactly and invalid prefixes/tokens fail closed');
 await withConversationFixture('api',async f=>{
  const runtimes:Runtime[]=[],children:ChildProcess[]=[];let customer:Database|null=null,ownerReady=false,owned=false;
  const sourceUrl=new URL(f.config.databaseUrl),customerName='ootla_customer_check_'+randomUUID().replaceAll('-',''),customerUrl=new URL(sourceUrl);customerUrl.pathname='/'+customerName;
  assert(/^ootla_customer_check_[a-f0-9]{32}$/.test(customerName));assert.notEqual(customerName,f.name);
  const ownerUrl=new URL(sourceUrl);ownerUrl.username='ootla_cluster_owner';ownerUrl.pathname='/postgres';
  const owner=new Client({connectionString:ownerUrl.toString(),connectionTimeoutMillis:5000});
  const customerConfig={...f.config,demoMode:false,databaseName:customerName,databaseUrl:customerUrl.toString(),sessionSecret:randomBytes(48).toString('hex'),sessionCookiePrefix:'ootla-customer',appUrl:'http://customer-runtime.test',ai:{...f.config.ai,provider:'simulated' as const,apiKey:'',model:''}};
  try{
   phase='preview metadata and identity guard';await assertRuntimeDatabaseIsolation(f.database,f.config);
   await assert.rejects(()=>assertRuntimeDatabaseIsolation(f.database,{...f.config,demoMode:false}),ConfigurationError);
   await assert.rejects(()=>assertRuntimeDatabaseIsolation(f.database,{...f.config,production:true}),ConfigurationError);
   await assert.rejects(()=>assertRuntimeDatabaseIsolation(f.database,{...f.config,databaseName:'ootla_demo_wrong_database'}),ConfigurationError);
   await f.database.query("UPDATE organizations SET environment='live' WHERE id=$1",[f.foreignOrganizationId]);
   try{await assert.rejects(()=>assertRuntimeDatabaseIsolation(f.database,f.config),ConfigurationError);}finally{await f.database.query("UPDATE organizations SET environment='demo' WHERE id=$1",[f.foreignOrganizationId]);}
   pass('actual preview database identity and all-organization environment are verified; wrong name, customer mode and mixed customer records are refused');
   phase='separate fresh customer database';await owner.connect();ownerReady=true;
   assert.equal(normal((await owner.query('SHOW data_directory')).rows[0].data_directory),normal(path.join(f.root,'.local/postgres/data')));
   assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1',[customerName])).rowCount,0);
   await owner.query('CREATE DATABASE '+(await owner.query('SELECT quote_ident($1) AS name',[customerName])).rows[0].name+' OWNER ootla');owned=true;
   await promisify(execFile)(process.execPath,[path.join(f.root,'node_modules/tsx/dist/cli.mjs'),path.join(f.root,'scripts/migrate.ts')],{cwd:f.root,windowsHide:true,timeout:90000,env:{...process.env,NODE_ENV:'test',DEMO_MODE:'false',DATABASE_URL:customerConfig.databaseUrl,APP_URL:customerConfig.appUrl,SESSION_SECRET:customerConfig.sessionSecret,SESSION_COOKIE_PREFIX:customerConfig.sessionCookiePrefix,PREVIEW_APP_URL:'',GOOGLE_CALENDAR_ENABLED:'false',GOOGLE_ANALYTICS_ENABLED:'false',AI_PROVIDER:'simulated',AI_API_KEY:'',AI_MODEL:''}});
   customer=new Database(customerConfig);await customer.requireReady();await assertRuntimeDatabaseIsolation(customer,customerConfig);
   await assert.rejects(()=>assertRuntimeDatabaseIsolation(customer!,{...customerConfig,demoMode:true}),ConfigurationError);
   const customerOrg=randomUUID(),customerUser=randomUUID(),customerEmail='runtime-customer-'+randomUUID()+'@example.test',password='Synthetic-'+randomUUID()+'!';
   await customer.query("INSERT INTO organizations(id,name,slug,environment) VALUES($1,'Synthetic native customer organization',$2,'live')",[customerOrg,'runtime-customer-'+randomUUID()]);
   await customer.query("INSERT INTO users(id,email,display_name,password_hash,account_kind,is_demo) VALUES($1,$2,'Synthetic customer administrator',$3,'staff',false)",[customerUser,customerEmail,await hashPassword(password)]);
   await customer.query("INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,'organization_admin')",[customerOrg,customerUser]);
   await customer.query("INSERT INTO organization_data_settings(organization_id,mode) VALUES($1,'standalone')",[customerOrg]);
   await assertRuntimeDatabaseIsolation(customer,customerConfig);
   const marker=randomUUID();await customer.query("INSERT INTO organizations(id,name,slug,environment) VALUES($1,'Forbidden preview marker',$2,'demo')",[marker,'forbidden-'+randomUUID()]);
   try{await assert.rejects(()=>assertRuntimeDatabaseIsolation(customer!,customerConfig),ConfigurationError);}finally{await customer.query('DELETE FROM organizations WHERE id=$1',[marker]);}
   await customer.query('UPDATE users SET is_demo=true WHERE id=$1',[customerUser]);
   try{await assert.rejects(()=>assertRuntimeDatabaseIsolation(customer!,customerConfig),ConfigurationError);}finally{await customer.query('UPDATE users SET is_demo=false WHERE id=$1',[customerUser]);}
   pass('fresh migrated customer database accepts native live identities but rejects a demo prefix, preview organization or preview user before execution');
   phase='three normal preview identity sessions';await seedResidentDemo(f.database,f.config);
   const legacy=await runtime({...f.config,sessionCookiePrefix:'ootla',appUrl:'http://legacy-runtime.test'},f.database);runtimes.push(legacy);
   const identities=[{kind:'staff' as const,login:'/api/auth/login',me:'/api/auth/me',logout:'/api/auth/logout',email:f.staffEmail,password:f.adminPassword},{kind:'applicant' as const,login:'/api/applicant/auth/login',me:'/api/applicant/auth/me',logout:'/api/applicant/auth/logout',email:f.applicantEmail,password:f.applicantPassword},{kind:'resident' as const,login:'/api/resident/auth/login',me:'/api/resident/auth/me',logout:'/api/resident/auth/logout',email:residentDemoEmail,password:residentDemoPassword}];
   const saved:Array<{kind:'staff'|'applicant'|'resident';cookie:string;me:string;logout:string}>=[];
   for(const i of identities){const cookie=await login(legacy,i.login,i.email,i.password,i.kind),response=await request(legacy,i.me,cookie);assert.equal(response.status,200);assert((await response.json() as {user:unknown}).user);saved.push({kind:i.kind,cookie,me:i.me,logout:i.logout});}
   const applicantToken=saved.find(i=>i.kind==='applicant')!.cookie.split('=')[1]!,residentToken=saved.find(i=>i.kind==='resident')!.cookie.split('=')[1]!;
   assert.equal((await f.database.query('SELECT 1 FROM applicant_sessions WHERE token_digest=$1',[createHmac('sha256',legacy.config.sessionSecret).update('ootla-applicant:session:'+applicantToken).digest('hex')])).rowCount,1);
   assert.equal((await f.database.query('SELECT 1 FROM resident_sessions WHERE token_digest=$1',[residentDigest(legacy.config,residentToken)])).rowCount,1);
   await legacy.close();const restarted=await runtime({...legacy.config},f.database);runtimes.push(restarted);
   for(const i of saved){const response=await request(restarted,i.me,i.cookie);assert.equal(response.status,200);assert((await response.json() as {user:unknown}).user);}
   pass('normal staff, applicant and resident preview sign-ins preserve legacy cookies/HMACs and continue loading after an ordinary API restart');
   phase='cookie prefix and database separation';const preview=await runtime({...f.config,sessionCookiePrefix:'ootla-preview',appUrl:'http://preview-runtime.test'},f.database);runtimes.push(preview);
   const live=await runtime(customerConfig,customer);runtimes.push(live);
   const liveCookie=await login(live,'/api/auth/login',customerEmail,password,'staff');
   for(const i of identities){const cookie=await login(preview,i.login,i.email,i.password,i.kind),response=await request(preview,i.me,cookie);assert.equal(response.status,200);assert((await response.json() as {user:unknown}).user);
    const legacyResponse=await request(restarted,i.me,cookie);if(i.kind==='staff')assert.equal(legacyResponse.status,401);else assert.equal((await legacyResponse.json() as {user:unknown}).user,null);
    const cross=await request(live,i.me,cookie);if(i.kind==='staff')assert.equal(cross.status,401);else assert.equal((await cross.json() as {user:unknown}).user,null);
    const loginDenied=await request(live,i.login,'','POST',{email:i.email,password:i.password});assert.equal(loginDenied.status,401);
    const logout=await request(preview,i.logout,cookie,'POST',{});assert([200,204].includes(logout.status));assert((logout.headers.get('set-cookie')??'').startsWith(sessionCookieName(preview.config,i.kind)+'='));
   }
   assert.equal((await request(preview,'/api/auth/me',liveCookie)).status,401);
   const me=await request(live,'/api/auth/me',liveCookie);assert.equal(me.status,200);assert.equal((await me.json() as {user:{organization:{id:string}}}).user.organization.id,customerOrg);
   assert.equal((await request(preview,'/api/auth/login','','POST',{email:customerEmail,password})).status,401);
   const productionSettings=await request(live,'/api/config');assert.equal((await productionSettings.json() as {demoEnabled:boolean}).demoEnabled,false);
   assert.equal((await customer.query('SELECT count(*)::int AS n FROM users WHERE is_demo')).rows[0].n,0);
   pass('distinct host-only prefixes on all three session codecs and separate databases deny cross-runtime cookies/credentials; fill helpers stay off in customer runtime and logout clears the correct names');
   phase='prefixed password-change sign-out';const nextPassword='Synthetic-Changed-'+randomUUID()+'!',changed=await request(live,'/api/account/password',liveCookie,'POST',{currentPassword:password,newPassword:nextPassword,confirmPassword:nextPassword});
   assert.equal(changed.status,200);assert((changed.headers.get('set-cookie')??'').startsWith(sessionCookieName(live.config)+'='));
   assert.equal((await request(live,'/api/auth/me',liveCookie)).status,401);
   await login(live,'/api/auth/login',customerEmail,nextPassword,'staff');
   pass('staff password change revokes its server session and clears the configured customer cookie, with normal reauthentication afterward');
   phase='actual before-listen startup rejection';
   for(const mixed of [false,true]){
    if(mixed)await f.database.query("UPDATE organizations SET environment='live' WHERE id=$1",[f.foreignOrganizationId]);
    try{
     const port=await availablePort(),base='http://127.0.0.1:'+port;guard.allow(base);let output='';
     const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:f.root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'test',DEMO_MODE:mixed?'true':'false',DATABASE_URL:f.config.databaseUrl,APP_URL:base,PORT:String(port),OOTLA_BIND_HOST:'127.0.0.1',SESSION_SECRET:f.config.sessionSecret,SESSION_COOKIE_PREFIX:'ootla-preview',PREVIEW_APP_URL:'',SERVE_COMPILED_CLIENT:'false',COOKIE_SECURE:'false',TRUST_PROXY_LOOPBACK:'false',GOOGLE_CALENDAR_ENABLED:'false',GOOGLE_ANALYTICS_ENABLED:'false',AI_PROVIDER:'simulated',AI_API_KEY:'',AI_MODEL:''}});
     children.push(child);child.stdout?.on('data',v=>{output=(output+v.toString()).slice(-6000);});child.stderr?.on('data',v=>{output=(output+v.toString()).slice(-6000);});
     if(child.exitCode===null)await Promise.race([new Promise<void>(resolve=>child.once('exit',()=>resolve())),delay(15000).then(()=>{throw Error('Invalid owned runtime did not stop before startup deadline.');})]);
     assert.equal(child.exitCode,1);assert(!output.includes('API listening'));assert(!output.includes(f.config.sessionSecret));assert(!output.includes(f.config.databaseUrl));
     let refused=false;try{await fetch(base+'/api/health');}catch{refused=true;}assert(refused,'Invalid runtime must not open a socket.');
    }finally{if(mixed)await f.database.query("UPDATE organizations SET environment='demo' WHERE id=$1",[f.foreignOrganizationId]);}
   }
   pass('real source entrypoint refuses a customer-on-preview configuration and mixed preview records before opening a listener or starting durable workers');
   phase='all bounded worker CLI isolation gates';
   const tables=['task_reminders','task_notifications','import_batches','connector_jobs','google_calendar_jobs','automation_jobs','voice_transcripts','retention_runs'];
   const queueState=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await f.database.query("SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]') AS state FROM "+table+" t")).rows[0].state])));
   const beforeWorkers=await queueState();
   await Promise.all(['process-task-reminders.ts','process-imports.ts','process-connectors.ts','process-google-calendar.ts','process-automations.ts','purge-voice-transcripts.ts'].map(async file=>{
    let output='';const child=spawn(process.execPath,['--import','tsx','scripts/'+file],{cwd:f.root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'test',DEMO_MODE:'false',DATABASE_URL:f.config.databaseUrl,APP_URL:'http://worker-runtime.test',SESSION_SECRET:f.config.sessionSecret,SESSION_COOKIE_PREFIX:'ootla-customer',PREVIEW_APP_URL:'',SERVE_COMPILED_CLIENT:'false',COOKIE_SECURE:'false',TRUST_PROXY_LOOPBACK:'false',GOOGLE_CALENDAR_ENABLED:'false',GOOGLE_ANALYTICS_ENABLED:'false',AI_PROVIDER:'simulated',AI_API_KEY:'',AI_MODEL:''}});
    children.push(child);child.stdout?.on('data',v=>{output=(output+v.toString()).slice(-6000);});child.stderr?.on('data',v=>{output=(output+v.toString()).slice(-6000);});
    if(child.exitCode===null)await Promise.race([new Promise<void>((resolve,reject)=>{child.once('exit',()=>resolve());child.once('error',reject);}),delay(15000).then(()=>{throw Error('Owned bounded worker CLI did not exit in time.');})]);
    assert.equal(child.exitCode,1,'Every bounded worker CLI must refuse a customer runtime pointed at preview data.');assert(!output.includes(f.config.sessionSecret));assert(!output.includes(f.config.databaseUrl));
   }));
   assert.deepEqual(await queueState(),beforeWorkers);
   pass('all six manual bounded worker CLIs reject cross-mode configuration without changing any queue, reminder, notification or retained transcript rows');

  }finally{
   for(const child of children)if(child.exitCode===null)child.kill();
   for(const r of runtimes.reverse())await r.close();if(customer)await customer.close();
   if(owned&&ownerReady){assert.equal(normal((await owner.query('SHOW data_directory')).rows[0].data_directory),normal(path.join(f.root,'.local/postgres/data')));assert(/^ootla_customer_check_[a-f0-9]{32}$/.test(customerName));await owner.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[customerName]);await owner.query('DROP DATABASE '+(await owner.query('SELECT quote_ident($1) AS name',[customerName])).rows[0].name);}if(ownerReady)await owner.end();
  }
 },{onLoopbackOrigin:guard.allow});
 await writeFile(path.resolve('.local/runtime-separation-observations.json'),JSON.stringify({verifiedAt:new Date().toISOString(),passed:true,groups,isolatedDatabases:2,normalIdentityTypes:3,legacyCookiesAndDigestsPreserved:true,runtimeCookiePrefixVerified:true,crossRuntimeCookiesAndCredentialsDenied:true,sourceStartupBeforeListenerDenied:2,retainedDataChanged:false,outsideNetworkRequests:0,ownedResourcesCleaned:true,limits:['Local ephemeral API and actual source startup checks; remote hosts, TLS certificates and deployment services are verified separately.','This test creates new synthetic customer fixture rows directly; operator onboarding is a separate subsequent step.']},null,2)+'\n');
 console.log('Runtime isolation and session verification passed ('+groups+' focused groups).');
}catch(issue){console.error('Runtime separation verification failed during '+phase+'.');console.error(issue instanceof Error?issue.message.slice(0,500):'Unknown isolated verification failure.');process.exitCode=1;}finally{guard.restore();}
