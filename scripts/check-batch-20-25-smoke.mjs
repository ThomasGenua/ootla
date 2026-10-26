import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {loadConfig,assertOotlaDatabase} from '../dist/server/server/config/env.js';
import {Database} from '../dist/server/server/db/pool.js';
import {createApp} from '../dist/server/server/app.js';

// Compiled packaging smoke: no workers, seeds, CRM writes or provider calls.
const current=loadConfig();assertOotlaDatabase(current);
assert(current.demoMode&&!current.production,'Use only the isolated development demo.');
assert.equal(new URL(current.databaseUrl).pathname,'/ootla_demo');
assert.equal(current.integrationsMode,'simulation');assert.equal(current.outboundMode,'simulation');
const config={...current,serveCompiledClient:true,secureCookies:false,trustProxyLoopback:false};
const db=new Database(config);let server;const sessions=[];
try{
 server=createServer(createApp(config,db));await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
 const base='http://127.0.0.1:'+server.address().port;config.appUrl=base;
 const request=async(route,{cookie,body,method='GET'}={})=>{assert(route.startsWith('/')&&!route.startsWith('//'));return fetch(base+route,{method,redirect:'manual',headers:{...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':'application/json',Origin:base}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});};
 const json=async(route,options)=>{const r=await request(route,options);assert.equal(r.status,200,route);return r.json();};
 const login=async(scope,email,password)=>{const r=await request('/api/'+scope+'/login',{method:'POST',body:{email,password}});assert.equal(r.status,200,'Normal '+scope+' sign-in');const data=await r.json(),cookie=(r.headers.get('set-cookie')??'').split(';')[0];assert(cookie);sessions.push({scope,cookie});return{cookie,user:data.user};};
 assert.equal((await json('/api/health')).database,'ready');
 const publicConfig=await json('/api/config');assert(publicConfig.demoEnabled);assert.equal(publicConfig.outboundMode,'simulation');
 const home=await request('/');assert.equal(home.status,200);assert.match(await home.text(),/Keep leads moving/);
 for(const route of ['/admin/login','/applicant/login','/resident/login']){const r=await request(route);assert.equal(r.status,200,route);assert.match(r.headers.get('x-robots-tag')??'',/noindex/);assert.doesNotMatch(await r.text(),/Demo Administrator|resident@demo|OotlaDemo!/);}
 for(const route of ['/api/voice/settings','/api/maintenance/requests','/api/portfolio-reporting','/api/automations/config'])assert.equal((await request(route)).status,401,route);
 const gated=await request('/admin/voice');assert.equal(gated.status,302);assert.equal(gated.headers.get('location'),'/admin/login');
 assert.equal((await request('/.env')).status,404);assert.equal((await request('/api/nonexistent')).status,404);
 console.log('PASS compiled public routes, noindex/private shell, protected APIs and non-public environment.');
 const admin=await login('auth','admin@demo.ootla.test','OotlaDemo!2026');
 assert.equal((await json('/api/auth/me',{cookie:admin.cookie})).user.id,admin.user.id);
 for(const route of ['/admin','/admin/conversations','/admin/automations','/admin/analytics','/admin/reports','/admin/maintenance','/admin/voice']){const r=await request(route,{cookie:admin.cookie});assert.equal(r.status,200,route);assert.match(r.headers.get('cache-control')??'',/no-store/);assert.match(r.headers.get('x-robots-tag')??'',/noindex/);}
 const policy=await json('/api/voice/settings',{cookie:admin.cookie});assert.equal(policy.enabled,false);assert.equal(policy.recordingEnabled,false);assert.equal(policy.provider,'not_configured');
 assert.equal((await db.query('SELECT count(*)::integer AS n FROM voice_sessions')).rows[0].n,0,'Retained demo has no seeded voice sessions.');
 console.log('PASS original staff login/current user, seven compiled workspaces, voice default disabled and no recording.');
 const residentStaff=await login('auth','residentstaff@demo.ootla.test','OotlaDemo!2026');
 assert.notEqual(residentStaff.user.organization.id,admin.user.organization.id);
 assert.equal((await request('/api/organizations/'+residentStaff.user.organization.id+'/overview',{cookie:admin.cookie})).status,403);
 const applicationStaff=await login('auth','applications@demo.ootla.test','OotlaDemo!2026');assert.notEqual(applicationStaff.user.organization.id,admin.user.organization.id);
 const applicant=await login('applicant/auth','applicant@demo.ootla.test','OotlaApplicant!2026');
 assert.equal((await json('/api/applicant/auth/me',{cookie:applicant.cookie})).user.id,applicant.user.id);
 assert.equal((await request('/api/applicant/applications',{cookie:applicant.cookie})).status,200);
 assert.equal((await request('/api/auth/me',{cookie:applicant.cookie})).status,401);
 const resident=await login('resident/auth','resident@demo.ootla.test','OotlaResident!2026');
 assert.equal((await json('/api/resident/auth/me',{cookie:resident.cookie})).user.id,resident.user.id);
 assert.equal((await request('/api/resident/leases',{cookie:resident.cookie})).status,200);
 assert.equal((await request('/api/auth/me',{cookie:resident.cookie})).status,401);
 assert.equal((await request('/api/resident/leases',{cookie:admin.cookie})).status,401);
 console.log('PASS separate application/resident demo sign-ins, own authorized records and organization/session isolation.');
 for(const session of sessions){const r=await request('/api/'+session.scope+'/logout',{method:'POST',body:{},cookie:session.cookie});assert([200,204].includes(r.status));}
 sessions.length=0;assert.equal((await request('/api/auth/me',{cookie:admin.cookie})).status,401);
 console.log('PASS logout; no business records were written by this smoke.');
}finally{
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 await db.close();
}
