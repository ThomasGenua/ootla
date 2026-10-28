import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import type {Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {loadConfig,type ServerConfig} from '../server/config/env.js';
import {createApp} from '../server/app.js';
import {ApiError} from '../server/http/errors.js';
import {OrganizationProvisioning} from '../server/services/organization-provisioning.js';
import {provisioningRuntime} from '../server/services/organization-provisioning-access.js';
import {withCustomerRuntimeFixture} from './lib/customer-runtime-fixture.js';
import {installLocalFixtureNetworkGuard} from './lib/local-network-guard.js';
const network=installLocalFixtureNetworkGuard();let phase='fresh restricted customer fixture',groups=0;
const pass=(message:string)=>{groups++;console.log('PASS '+message);};
const denied=(issue:unknown)=>issue instanceof ApiError&&issue.status===403;
try{
 await withCustomerRuntimeFixture(async f=>{
  assert.equal(f.setup,null);
  const local=loadConfig({NODE_ENV:'development',DEMO_MODE:'false',DATABASE_URL:f.config.databaseUrl,DATABASE_TLS_MODE:'disable',APP_URL:'http://127.0.0.1:7349',OOTLA_BIND_HOST:'127.0.0.1',PORT:'3101',SESSION_SECRET:f.config.sessionSecret,SESSION_COOKIE_PREFIX:'ootla_local_check',AI_PROVIDER:'disabled',GOOGLE_CALENDAR_ENABLED:'false',GOOGLE_ANALYTICS_ENABLED:'false',INTEGRATIONS_MODE:'simulation',OUTBOUND_MODE:'simulation'});
  const service=new OrganizationProvisioning(f.database,local),input={requestKey:randomUUID(),organization:{name:'Owned local customer organization',slug:'owned-local-'+randomUUID(),mode:'standalone' as const,timeZone:'Africa/Lagos'},administrator:{name:'Owned local administrator',email:'owned-local-'+randomUUID()+'@example.test'},expiresInHours:24};
  phase='loopback-only policy denials';
  const snapshot=async()=>JSON.stringify((await f.database.query('SELECT (SELECT count(*) FROM organizations) AS organizations,(SELECT count(*) FROM users) AS users,(SELECT count(*) FROM staff_admin_invitations) AS invitations')).rows[0]);
  const initial=await snapshot();
  const remoteDatabase=new URL(local.databaseUrl);remoteDatabase.hostname='database.example.test';
  const invalid:ServerConfig[]=[{...local,appUrl:'http://customer.example.test'},{...local,appUrl:'https://127.0.0.1:7349'},{...local,bindHost:'0.0.0.0'},{...local,bindHost:'::'},{...local,databaseUrl:remoteDatabase.toString()},{...local,nodeEnv:'test'},{...local,demoMode:true},{...local,databaseName:'ootla_demo'},{...local,databaseUrl:''}];
  for(const config of invalid){const blocked=new OrganizationProvisioning(f.database,config);await assert.rejects(()=>blocked.provision(input),denied);await assert.rejects(()=>blocked.resolve('a'.repeat(64)),denied);await assert.rejects(()=>blocked.accept({token:'a'.repeat(64),password:'Owned-Synthetic-Administrator!2026'}),denied);}
  assert.equal(await snapshot(),initial);pass('remote origins, HTTPS development origin, public binds, remote or absent databases, test mode and every preview configuration cannot provision, resolve or accept');
  await provisioningRuntime(f.database,f.config);pass('the existing production-customer guard still accepts its ready dedicated non-demo database');
  phase='local operator provisioning and receipt persistence';
  const created=await service.provision(input);assert(created.invitation.url);const url=new URL(created.invitation.url);assert.equal(url.origin,local.appUrl);assert.equal(url.pathname,'/staff/invite');assert.equal(url.search,'');const token=url.hash.slice('#token='.length);assert(/^[a-f0-9]{64}$/.test(token));
  assert.equal((await service.provision(input)).invitation.url,created.invitation.url);const pending=(await f.database.query('SELECT u.active AS user_active,u.is_demo,m.active AS membership_active,m.role,o.environment,i.token_digest FROM users u JOIN organization_memberships m ON m.user_id=u.id JOIN organizations o ON o.id=m.organization_id JOIN staff_admin_invitations i ON i.user_id=u.id WHERE u.id=$1',[created.administrator.userId])).rows[0];assert.equal(pending.user_active,false);assert.equal(pending.membership_active,false);assert.equal(pending.is_demo,false);assert.equal(pending.role,'organization_admin');assert.equal(pending.environment,'live');assert.equal(pending.token_digest,createHash('sha256').update(token).digest('hex'));assert(!JSON.stringify(pending).includes(token));pass('local customer provisioning creates only an inactive non-demo own-organization administrator with a digest-only invitation and duplicate-safe retries');
  phase='local HTTP resolve and password acceptance';
  const app=createApp(local,f.database),server=await new Promise<Server>((resolve,reject)=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));listener.once('error',reject);}),base='http://127.0.0.1:'+(server.address() as AddressInfo).port;network.allow(base);
  try{
   const request=(route:string,body?:unknown,cookie='')=>fetch(base+route,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{...(body===undefined?{}:{Origin:local.appUrl,'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
   const password='Owned-Local-Administrator!2026';assert.equal((await request('/api/auth/login',{email:input.administrator.email,password})).status,401);
   const resolved=await request('/api/staff-onboarding/resolve',{token});assert.equal(resolved.status,200);assert.equal(resolved.headers.get('cache-control'),'no-store, private');const resolution=await resolved.json() as {state:string;organization:{name:string}};assert.equal(resolution.state,'pending');assert.equal(resolution.organization.name,input.organization.name);
   const accepted=await request('/api/staff-onboarding/accept',{token,password});assert.equal(accepted.status,200);assert.equal(accepted.headers.get('set-cookie'),null);assert.deepEqual(await accepted.json(),{accepted:true,signInUrl:'/admin/login'});assert.equal((await f.database.query('SELECT count(*)::int AS n FROM sessions')).rows[0].n,0);assert.equal((await request('/api/auth/me')).status,401);assert.equal((await request('/api/staff-onboarding/resolve',{token})).status,410);pass('actual loopback HTTP invitation resolves and accepts a personal password once, preserves normal sign-in and creates no authenticated session');
   const login=await request('/api/auth/login',{email:input.administrator.email,password});assert.equal(login.status,200);const rawCookie=login.headers.get('set-cookie')??'',cookie=rawCookie.split(';')[0]!;assert(cookie.startsWith('ootla_local_check.sid='));assert(rawCookie.includes('HttpOnly')&&rawCookie.includes('SameSite=Lax'));const identity=await login.json() as {user:{id:string;organization:{id:string;role:string}}};assert.equal(identity.user.id,created.administrator.userId);assert.equal(identity.user.organization.id,created.organization.id);assert.equal(identity.user.organization.role,'organization_admin');assert.equal((await request('/api/auth/me',undefined,cookie)).status,200);assert.equal((await request('/api/auth/logout',{},cookie)).status,204);assert.equal((await request('/api/auth/me',undefined,cookie)).status,401);pass('the accepted local customer signs in and out through real database sessions with its independent cookie prefix and organization-admin scope');
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  phase='actual database content boundary';
  await f.database.query("INSERT INTO organizations(name,slug,environment) VALUES('Owned invalid preview content',$1,'demo')",['invalid-preview-'+randomUUID()]);
  await assert.rejects(()=>service.provision({...input,requestKey:randomUUID(),organization:{...input.organization,slug:'blocked-'+randomUUID()},administrator:{...input.administrator,email:'blocked-'+randomUUID()+'@example.test'}}));
  pass('a local customer runtime still rejects an actual database containing preview organization records before any new customer is provisioned');
 },{createOrganization:false});
 console.log('Local customer provisioning verified ('+groups+' focused groups; owned database/role cleaned, no outbound delivery).');
}catch(issue){console.error('Local customer provisioning failed during '+phase+'.');console.error(issue instanceof ApiError?'Controlled API error '+issue.status+' '+issue.code:issue instanceof Error?issue.name+' (values omitted)':'Unknown failure.');process.exitCode=1;}
finally{network.restore();}
