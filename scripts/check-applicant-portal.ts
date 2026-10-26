import '../server/config/environment.js';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { Client } from 'pg';
import { createApp } from '../server/app.js';
import { loadConfig, type ServerConfig } from '../server/config/env.js';
import { Database } from '../server/db/pool.js';
import type { AdminOverview } from '../shared/contracts.js';
import { hashPassword, verifyPassword } from '../server/services/passwords.js';
import { seedApplicantDemo, applicantDemoEmail, applicantDemoPassword, applicantDemoStaffEmail } from '../server/services/applicant-demo.js';
import type { ApplicantConfig, ApplicantUser, IssuedApplicationInvitation, PortalApplication, StaffApplicationWorkspace, StaffApplications } from '../shared/applicant-contracts.js';


// Every mutation is confined to a newly created, uniquely owned scratch database.
// Retained demo/customer records are never migrated, seeded, reset or changed.
const root=path.resolve(import.meta.dirname,'..');
const source=loadConfig(), sourceUrl=new URL(source.databaseUrl);
assert(source.demoMode&&!source.production&&/^ootla_demo(?:_[a-z0-9_]+)?$/.test(source.databaseName??''),'Use the documented isolated non-production Ootla demo configuration.');
assert(sourceUrl.hostname==='127.0.0.1'&&sourceUrl.port==='55439'&&sourceUrl.username==='ootla'&&!sourceUrl.search&&!sourceUrl.hash,'Use only the project-owned local cluster and restricted application role.');
const scratchName='ootla_demo_applicant_'+randomUUID().replaceAll('-','');
const scratchUrl=new URL(sourceUrl);scratchUrl.pathname='/'+scratchName;
const config:ServerConfig={...source,nodeEnv:'test',production:false,demoMode:false,appUrl:'http://ootla.test',databaseUrl:scratchUrl.toString(),databaseName:scratchName};
const ownerUrl=new URL(sourceUrl);ownerUrl.username='ootla_cluster_owner';ownerUrl.pathname='/postgres';
const owner=new Client({connectionString:ownerUrl.toString(),connectionTimeoutMillis:5000});
const database=new Database(config);
const orgs=[randomUUID(),randomUUID()],properties=[randomUUID(),randomUUID(),randomUUID()];
const roles=['organization_admin','leasing_agent','read_only_analyst','organization_admin','leasing_agent'] as const;
const users=roles.map(()=>randomUUID()),memberships=roles.map(()=>randomUUID()),emails=users.map(id=>'staff-'+id+'@example.test');
const leadIds=[randomUUID(),randomUUID(),randomUUID()],contacts:string[]=[];
const applicantEmails=leadIds.map(id=>'applicant-'+id+'@example.test');
const password='Stage15-'+randomUUID()+'!',applicantPassword='Applicant-'+randomUUID()+'!';
const coContact=randomUUID(),coEmail='co-'+randomUUID()+'@example.test';
let ownerConnected=false,ownsScratch=false,groups=0,phase='safe scratch setup';
const servers:Array<()=>Promise<void>>=[];
const pass=(label:string)=>{groups++;console.log('PASS '+label);};
const normalize=(value:string)=>path.resolve(value).replaceAll('\\','/').toLowerCase();
async function verifiedCluster(){const row=(await owner.query<{data_directory:string}>('SHOW data_directory')).rows[0];assert.equal(normalize(row?.data_directory??''),normalize(path.join(root,'.local/postgres/data')),'Refusing any operation outside the Ootla-owned PostgreSQL data directory.');}
async function createScratch(){
 await owner.connect();ownerConnected=true;await verifiedCluster();assert(/^ootla_demo_applicant_[a-f0-9]{32}$/.test(scratchName));
 assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1',[scratchName])).rowCount,0);
 const role=(await owner.query<{rolsuper:boolean;rolcreatedb:boolean;rolcreaterole:boolean}>('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1',['ootla'])).rows[0];
 assert(role&&!role.rolsuper&&!role.rolcreatedb&&!role.rolcreaterole);
 const quoted=(await owner.query<{name:string}>('SELECT quote_ident($1) AS name',[scratchName])).rows[0]!.name;
 await owner.query('CREATE DATABASE '+quoted+' OWNER ootla');ownsScratch=true;
 assert.equal((await database.query<{name:string}>('SELECT current_database() AS name')).rows[0]?.name,scratchName);
}
type Snapshot=Record<string,{columns:string[];count:number;hash:string}>;
async function snapshot(previous?:Snapshot):Promise<Snapshot>{
 const tables=previous?Object.keys(previous):(await database.query<{tablename:string}>("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename")).rows.map(r=>r.tablename),result:Snapshot={};
 for(const table of tables){
  const columns=previous?.[table]?.columns??(await database.query<{column_name:string}>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",[table])).rows.map(r=>r.column_name);
  assert(/^[a-z_][a-z0-9_]*$/.test(table)&&columns.length&&columns.every(c=>/^[a-z_][a-z0-9_]*$/.test(c)));
  const rows=(await database.query('SELECT '+columns.map(c=>'"'+c+'"').join(',')+' FROM "'+table+'"')).rows.map(r=>JSON.stringify(r)).sort();
  result[table]={columns,count:rows.length,hash:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};
 }return result;
}
async function baseline(){
 await database.query('CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
 const files=(await readdir(path.join(root,'migrations'))).filter(name=>/^(00[1-9]|01[0-2])_[a-z0-9_]+\.sql$/.test(name)).sort();assert.equal(files.length,12);
 for(const name of files){const sql=await readFile(path.join(root,'migrations',name),'utf8');await database.transaction(async c=>{await c.query(sql.replace(/^\uFEFF/,''));await c.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[name,createHash('sha256').update(sql).digest('hex')]);});}
 const hash=await hashPassword(password);
 await database.transaction(async c=>{
  for(const [i,id] of orgs.entries()){await c.query("INSERT INTO organizations(id,name,slug,environment) VALUES($1,$2,$3,'live')",[id,'Stage15 isolated '+i,'applicant-'+randomUUID()]);await c.query("INSERT INTO organization_data_settings(organization_id,mode) VALUES($1,'standalone')",[id]);}
  for(const [i,id] of users.entries()){await c.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)',[id,emails[i],'Stage15 '+roles[i],hash]);await c.query('INSERT INTO organization_memberships(id,organization_id,user_id,role) VALUES($1,$2,$3,$4)',[memberships[i],orgs[i===3?1:0],id,roles[i]]);}
  for(const [i,id] of properties.entries())await c.query("INSERT INTO properties(id,organization_id,name,address,city) VALUES($1,$2,$3,'1 Private Way','Lagos')",[id,orgs[i===2?1:0],'Stage15 property '+i]);
  for(const i of [1,2,4])await c.query('INSERT INTO property_access_assignments(organization_id,membership_id,property_id) VALUES($1,$2,$3)',[orgs[0],memberships[i],properties[0]]);
  for(const [i,id] of leadIds.entries()){
   const row=(await c.query("INSERT INTO leads(id,organization_id,property_id,display_name,email,status,intent,pipeline_stage,notes) VALUES($1,$2,$3,$4,$5,'contacted','leasing','application_started','Existing staff-only private note') RETURNING contact_id",[id,orgs[i===2?1:0],properties[i===2?2:0],'Stage15 person '+i,applicantEmails[i]])).rows[0];contacts.push(row.contact_id);
  }
  await c.query('INSERT INTO contact_property_links(organization_id,contact_id,property_id) VALUES($1,$2,$3)',[orgs[0],contacts[1],properties[1]]);
  await c.query('INSERT INTO lead_property_interests(organization_id,lead_id,contact_id,property_id) VALUES($1,$2,$3,$4)',[orgs[0],leadIds[1],contacts[1],properties[1]]);
  await c.query("INSERT INTO contacts(id,organization_id,display_name,email,source_system) VALUES($1,$2,'Independent co-applicant',$3,'local')",[coContact,orgs[0],coEmail]);
  await c.query('INSERT INTO contact_property_links(organization_id,contact_id,property_id) VALUES($1,$2,$3)',[orgs[0],coContact,properties[0]]);
  await c.query("INSERT INTO applications(organization_id,contact_id,property_id,lead_id,status) VALUES($1,$2,$3,$4,'draft')",[orgs[0],contacts[0],properties[0],leadIds[0]]);
 });
}
async function migrate(){
 try{await promisify(execFile)(process.execPath,[path.join(root,'node_modules/tsx/dist/cli.mjs'),path.join(root,'scripts/migrate.ts')],{cwd:root,windowsHide:true,timeout:30000,env:{...process.env,NODE_ENV:'test',DEMO_MODE:'false',DATABASE_URL:config.databaseUrl,APP_URL:config.appUrl}});}
 catch{assert.fail('Scoped scratch migration failed; raw credentials/process configuration are omitted.');}
}
async function start(localConfig:ServerConfig=config){
 const db=new Database(localConfig),app=createApp(localConfig,db);
 const server=await new Promise<ReturnType<typeof app.listen>>((resolve,reject)=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));listener.once('error',reject);});
 let closed=false;const close=async()=>{if(closed)return;closed=true;server.closeIdleConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await db.close();};servers.push(close);
 const base='http://127.0.0.1:'+(server.address() as AddressInfo).port;
 const request=(route:string,cookie='',method='GET',body?:unknown,headers:Record<string,string>={})=>fetch(base+route,{method,redirect:'manual',headers:{...(cookie?{Cookie:cookie}:{}),...(method==='GET'?{}:{Origin:localConfig.appUrl}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {base,request,close,login:async(index:number)=>{const response=await request('/api/auth/login','','POST',{email:emails[index],password});assert.equal(response.status,200);return cookieOf(response,'ootla.sid');}};
}
type Api=Awaited<ReturnType<typeof start>>;
function cookieOf(response:Response,name:string){const set=response.headers.get('set-cookie')??'';assert(set.startsWith(name+'='),'Expected the correct isolated HttpOnly session cookie.');assert(/HttpOnly/i.test(set)&&/SameSite=Lax/i.test(set)&&/Path=\//i.test(set));return set.split(';')[0]!;}
async function json<T=Record<string,unknown>>(api:Api,route:string,cookie='',method='GET',body?:unknown,expected=200):Promise<T>{const response=await api.request(route,cookie,method,body);assert.equal(response.status,expected,method+' '+route.split('?')[0]+' must return '+expected+'; received '+response.status);return response.json() as Promise<T>;}
async function deny(api:Api,route:string,cookie='',method='GET',body?:unknown,expected:number|number[]=[400,401,403,404,409,410,415,422]){const response=await api.request(route,cookie,method,body);assert((Array.isArray(expected)?expected:[expected]).includes(response.status),method+' '+route.split('?')[0]+' must deny; received '+response.status);return response;}
async function noApplicantSession(api:Api,cookie:string){const response=await api.request('/api/applicant/auth/me',cookie);assert.equal(response.status,200);assert.equal((await response.json() as {user:null}).user,null);}
async function rawUpload(api:Api,route:string,cookie:string,content:Buffer,type='application/pdf'){return fetch(api.base+route,{method:'POST',redirect:'manual',headers:{Cookie:cookie,Origin:config.appUrl,'Content-Type':type},body:new Uint8Array(content)});}
const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
const portal='/api/applicant',staff='/api/applications';
async function main(){
 await createScratch();await baseline();const before=await snapshot();phase='additive migration preservation';await migrate();assert.deepEqual(await snapshot(before),before);await migrate();assert.deepEqual(await snapshot(before),before);
 const checksums=(await database.query<{name:string;checksum:string}>('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;assert.equal(checksums.length,13);for(const row of checksums)assert.equal(row.checksum,createHash('sha256').update(await readFile(path.join(root,'migrations',row.name),'utf8')).digest('hex'));
 assert.equal(await database.state(),'ready');pass('additive Stage15 migration and repeat execution preserve all earlier record columns, hashes and immutable migration checksums');

 let api=await start();const staffCookies:string[]=[];
 for(let i=0;i<roles.length;i++)staffCookies.push(await api.login(i));
 const admin=staffCookies[0]!,agent=staffCookies[1]!,analyst=staffCookies[2]!,foreignAdmin=staffCookies[3]!;
 phase='canonical staff applications and organization/property access';
 const initiallyEmpty=await json<AdminOverview>(api,'/api/admin/overview',foreignAdmin);assert.equal(initiallyEmpty.counts.applications,0);assert.equal(initiallyEmpty.dashboard.metrics.applications,0);
 const createApplication=async(index:number,cookie=admin)=>{
  const response=await api.request(staff,cookie,'POST',{leadId:leadIds[index]});assert([200,201].includes(response.status),'Staff application preparation must succeed.');
  const value=await response.json() as StaffApplicationWorkspace;assert(value.application?.id);return value;
 };
 let workspace=await createApplication(0);const appId=workspace.application.id,appRoute=staff+'/'+appId,portalRoute=portal+'/applications/'+appId;
 assert.equal((await database.query('SELECT id FROM applications WHERE lead_id=$1',[leadIds[0]])).rowCount,1,'Preparing an existing application must reuse its canonical CRM record.');
 assert.equal(workspace.application.leadId,leadIds[0]);assert.equal(workspace.primaryContact.id,contacts[0]);assert(workspace.application.portalEnabled);
 assert.equal(workspace.participants.filter(p=>p.role==='primary').length,1);assert(workspace.checklist.length>0);
 await deny(api,appRoute);await deny(api,appRoute,foreignAdmin);await json(api,appRoute,agent);await deny(api,appRoute,analyst,'GET',undefined,403);await json(api,staff+'/list',analyst);await deny(api,appRoute+'/preview',analyst,'GET',undefined,403);
 await deny(api,appRoute+'/invitations',analyst,'POST',{participantId:workspace.participants[0]!.id,expiresInHours:1},403);
 const restricted=await createApplication(1);await deny(api,staff+'/'+restricted.application.id,agent,'GET',undefined,[403,404]);
 await deny(api,staff+'/'+restricted.application.id+'/preview',agent,'GET',undefined,[403,404]);
 const foreign=await createApplication(2,foreignAdmin);await deny(api,staff+'/'+foreign.application.id,admin,'GET',undefined,[403,404]);
 const listed=await json<StaffApplications>(api,staff+'/list?page=1&pageSize=1',admin);assert.equal(listed.items.length,1);assert(listed.total>=2&&listed.totalPages>=2);assert(!listed.items.some(a=>a.id===foreign.application.id));
 await noApplicantSession(api,admin);
 await deny(api,appRoute+'/participants',admin,'POST',{contactId:coContact,email:coEmail});

 phase='real overview application counts and creation-date periods';
 const detachedId=randomUUID();
 await database.query("INSERT INTO applications(id,organization_id,contact_id,property_id,status) VALUES($1,$2,$3,$4,'draft')",[detachedId,orgs[0],contacts[1],properties[1]]);
 const overviewFor=(cookie:string,period='month')=>json<AdminOverview>(api,'/api/admin/overview?period='+period,cookie);
 const ownAll=await overviewFor(admin,'all');assert.equal(ownAll.counts.applications,3);assert.equal(ownAll.dashboard.metrics.applications,3);assert.equal(ownAll.dashboard.metrics.leasesSigned,null);assert.equal(ownAll.modulesReady,false);
 assert.deepEqual(Object.keys(ownAll.dashboard.metrics).sort(),['applications','leasesSigned','newLeads','toursBooked'],'Overview must retain exactly four established metrics.');
 const assignedAll=await overviewFor(agent,'all');assert.equal(assignedAll.dashboard.metrics.applications,1);assert.equal(assignedAll.counts.applications,1,'An assigned agent must not count applications with hidden additional lead interests or an unassigned property.');
 const foreignAll=await overviewFor(foreignAdmin,'all');assert.equal(foreignAll.dashboard.metrics.applications,1);assert.equal(foreignAll.counts.applications,1);
 await deny(api,'/api/organizations/'+orgs[0]+'/overview',foreignAdmin,'GET',undefined,403);
 await database.query('DELETE FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=$3',[orgs[0],memberships[4],properties[0]]);
 const unassignedAll=await overviewFor(staffCookies[4]!,'all');assert.equal(unassignedAll.dashboard.metrics.applications,0);assert.equal(unassignedAll.counts.applications,0);
 await database.query('INSERT INTO property_access_assignments(organization_id,membership_id,property_id) VALUES($1,$2,$3)',[orgs[0],memberships[4],properties[0]]);
 const applicationDates=(await database.query('SELECT created_at,updated_at,portal_submitted_at FROM applications WHERE id=$1',[appId])).rows[0]!;
 await database.query("UPDATE applications SET created_at='2000-01-01T00:00:00Z',updated_at=now(),portal_submitted_at=now() WHERE id=$1",[appId]);
 for(const period of ['month','week']){const value=await overviewFor(admin,period);assert.equal(value.dashboard.metrics.applications,2,'A recently updated/submitted historical application must remain excluded from creation-period metrics.');assert.equal(value.counts.applications,3);const scoped=await overviewFor(agent,period);assert.equal(scoped.dashboard.metrics.applications,0);assert.equal(scoped.counts.applications,1);}
 const historicalAll=await overviewFor(admin,'all');assert.equal(historicalAll.dashboard.metrics.applications,3);
 await database.query('UPDATE applications SET created_at=$2,updated_at=$3,portal_submitted_at=$4 WHERE id=$1',[appId,applicationDates.created_at,applicationDates.updated_at,applicationDates.portal_submitted_at]);
 assert.equal((await overviewFor(admin)).dashboard.metrics.applications,3);
 pass('canonical applications are reused; pagination and tenant/property/all-interest permissions hold; the four overview metrics count real records by creation period with hidden scopes excluded');

 const issue=async(id:string,participantId:string,cookie=admin)=>{
  const value=await json<IssuedApplicationInvitation>(api,staff+'/'+id+'/invitations',cookie,'POST',{participantId,expiresInHours:1},201);
  const url=new URL(value.url);assert.equal(url.origin,config.appUrl);assert.equal(url.search,'','Invitation credentials must never appear in a query string.');
  const token=url.hash.match(/[a-f0-9]{64}/)?.[0];assert(token&&url.hash.includes(token),'Invitation is carried only by a browser fragment.');
  assert(!url.pathname.includes(token));return {...value,token};
 };
 const primary=workspace.participants.find(p=>p.role==='primary')!;
 phase='secure invitation expiry revocation and single-use acceptance';
 let invitation=await issue(appId,primary.id);
 await database.query("UPDATE application_invitations SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE id=$1",[invitation.id]);
 await deny(api,portal+'/invitations/accept','','POST',{token:invitation.token,password:applicantPassword},[400,401,404,410]);
 invitation=await issue(appId,primary.id);await api.request(appRoute+'/invitations/'+invitation.id,admin,'DELETE').then(r=>assert([200,204].includes(r.status)));
 await deny(api,portal+'/invitations/accept','','POST',{token:invitation.token,password:applicantPassword},[400,401,404,410]);
 invitation=await issue(appId,primary.id);
 const invitationRow=(await database.query('SELECT * FROM application_invitations WHERE id=$1',[invitation.id])).rows[0]!;
 assert.equal(invitationRow.token_digest.length,64);assert.notEqual(invitationRow.token_digest,invitation.token);
 const staffWithoutToken=await json<StaffApplicationWorkspace>(api,appRoute,admin);assert(!JSON.stringify(staffWithoutToken).includes(invitation.token));
 // A wrong Origin is explicitly denied before credentials can be consumed.
 const crossOrigin=await api.request(portal+'/invitations/accept','','POST',{token:invitation.token,password:applicantPassword},{Origin:'https://unrelated.example'});assert.equal(crossOrigin.status,403);
 const accepted=await api.request(portal+'/invitations/accept','','POST',{token:invitation.token,password:applicantPassword});assert.equal(accepted.status,200);
 let applicantCookie=cookieOf(accepted,'ootla.applicant.sid');const identity=await accepted.json() as {user:ApplicantUser};assert(identity.user.id);const applicantId=identity.user.id;
 const identityRow=(await database.query('SELECT account_kind,password_hash FROM users WHERE id=$1',[applicantId])).rows[0]!;
 assert.equal(identityRow.account_kind,'applicant');assert(await verifyPassword(identityRow.password_hash,applicantPassword));assert.notEqual(identityRow.password_hash,applicantPassword);
 assert.equal((await database.query('SELECT 1 FROM organization_memberships WHERE user_id=$1',[applicantId])).rowCount,0);
 await deny(api,portal+'/invitations/accept','','POST',{token:invitation.token,password:applicantPassword},[400,401,404,410]);
 await deny(api,'/api/auth/me',applicantCookie,'GET',undefined,401);await deny(api,'/api/account',applicantCookie,'GET',undefined,401);
 await deny(api,'/api/auth/login','','POST',{email:applicantEmails[0],password:applicantPassword},401);
 const me=await json<{user:ApplicantUser}>(api,portal+'/auth/me',applicantCookie);assert.equal(me.user.id,applicantId);
 assert.equal((await database.query('SELECT 1 FROM applicant_sessions WHERE token_digest=$1',[applicantCookie.split('=')[1]])).rowCount,0,'Only a keyed digest of the opaque portal token is stored.');
 const accountHash=identityRow.password_hash;const repeated=await issue(appId,primary.id);await deny(api,portal+'/invitations/accept','','POST',{token:repeated.token,password:'wrong-existing-account-password'},401);const repeatedAccept=await api.request(portal+'/invitations/accept','','POST',{token:repeated.token,password:applicantPassword});assert.equal(repeatedAccept.status,200);assert.equal((await repeatedAccept.json() as {user:ApplicantUser}).user.id,applicantId);applicantCookie=cookieOf(repeatedAccept,'ootla.applicant.sid');assert.equal((await database.query('SELECT password_hash FROM users WHERE id=$1',[applicantId])).rows[0]!.password_hash,accountHash,'A new invitation cannot reset an existing applicant password.');
 pass('fragment-only invitations are hashed, expire, revoke and consume once; normal Argon2 portal accounts have no staff membership and use separate HttpOnly sessions');

 const detail=()=>json<PortalApplication>(api,portalRoute,applicantCookie);
 phase='applicant boundaries save/resume and restart persistence';
 let portalState=await detail();assert.equal(portalState.participant.role,'primary');assert(!JSON.stringify(portalState).includes('Existing staff-only private note'));assert(!portalState.preview&&!portalState.readOnly);
 await deny(api,portal+'/applications/'+restricted.application.id,applicantCookie,'GET',undefined,[403,404]);
 await deny(api,portal+'/applications/'+foreign.application.id,applicantCookie,'GET',undefined,[403,404]);
 await deny(api,portalRoute,admin,'GET',undefined,401);
 const draft={displayName:'Portal saved identity',phone:'+234 800 100 2000',currentAddress:'23 Saved Resume Road',moveInDate:'2027-01-20'};
 await json<PortalApplication>(api,portalRoute,applicantCookie,'PATCH',{version:portalState.participant.version,details:draft});
 await deny(api,portalRoute,applicantCookie,'PATCH',{version:portalState.participant.version,details:{...draft,phone:'outdated edit'}},409);
 portalState=await detail();assert.deepEqual(portalState.participant.details,draft);
 await api.close();api=await start();assert.deepEqual((await detail()).participant.details,draft,'Saved portal details and normal sessions survive a real API restart.');
 const participantRow=(await database.query('SELECT contact_id FROM application_participants WHERE id=$1',[portalState.participant.id])).rows[0]!;
 assert.equal(participantRow.contact_id,contacts[0]);assert.equal((await database.query('SELECT contact_id FROM applications WHERE id=$1',[appId])).rows[0]!.contact_id,contacts[0]);
 await deny(api,portalRoute,applicantCookie,'PATCH',{version:portalState.participant.version,details:draft,contactId:coContact},400);
 await deny(api,portalRoute+'/submit',applicantCookie,'POST',{version:portalState.application.version});
 await deny(api,portalRoute+'/ready',applicantCookie,'POST',{version:portalState.participant.version});
 pass('only explicit application grants are visible; optimistic draft edits, stable CRM contact identity and saved cookie sessions survive API restart; incomplete submissions are refused');

 phase='private validated document storage and downloads';
 const checklistId=portalState.checklist[0]!.id;
 const uploadRoute=(name:string,id=checklistId)=>portalRoute+'/documents?'+new URLSearchParams({checklistId:id,name}).toString();
 const invalidDocuments=[
  {name:'../unsafe.pdf',content:pdf,type:'application/pdf'},
  {name:'renamed.pdf',content:Buffer.from('<html><script>alert(1)</script></html>'),type:'application/pdf'},
  {name:'executable.svg',content:Buffer.from('<svg onload="alert(1)"></svg>'),type:'image/svg+xml'},
  {name:'truncated.png',content:Buffer.from([137,80,78,71,13,10,26,10]),type:'image/png'},
  {name:'empty.pdf',content:Buffer.alloc(0),type:'application/pdf'},
  {name:'too-large.pdf',content:Buffer.alloc(2097153,65),type:'application/pdf'}
 ];
 for(const item of invalidDocuments){const response=await rawUpload(api,uploadRoute(item.name),applicantCookie,item.content,item.type);assert([400,413,415].includes(response.status),'Unsafe filename, type, content, empty or over-limit document must be refused.');}
 const forgedChecklist=await rawUpload(api,uploadRoute('unrelated.pdf',randomUUID()),applicantCookie,pdf);assert([400,403,404].includes(forgedChecklist.status));
 const unauthorizedUpload=await rawUpload(api,uploadRoute('staff-cookie.pdf'),admin,pdf);assert.equal(unauthorizedUpload.status,401);
 const firstUpload=await rawUpload(api,uploadRoute('applicant-private.pdf'),applicantCookie,pdf);assert.equal(firstUpload.status,201);
 const duplicateUpload=await rawUpload(api,uploadRoute('applicant-private.pdf'),applicantCookie,pdf);assert([200,201].includes(duplicateUpload.status));
 portalState=await detail();const document=portalState.checklist.find(i=>i.id===checklistId)!.document;assert(document);
 assert.equal((await database.query('SELECT 1 FROM application_documents WHERE participant_id=$1 AND checklist_item_id=$2',[portalState.participant.id,checklistId])).rowCount,1,'Replacing/retrying one checklist upload must not create duplicates.');
 const stored=(await database.query('SELECT content,size_bytes,sha256 FROM application_documents WHERE id=$1',[document.id])).rows[0]!;
 assert(Buffer.isBuffer(stored.content)&&stored.content.equals(pdf));assert.equal(stored.sha256,createHash('sha256').update(pdf).digest('hex'));assert.equal(stored.size_bytes,pdf.length);
 const downloaded=await api.request(document.downloadUrl,applicantCookie);assert.equal(downloaded.status,200);assert(/attachment/i.test(downloaded.headers.get('content-disposition')??''));assert(/no-store/i.test(downloaded.headers.get('cache-control')??''));assert.equal(downloaded.headers.get('referrer-policy'),'no-referrer');assert(/sandbox/.test(downloaded.headers.get('content-security-policy')??''));assert.equal(downloaded.headers.get('x-content-type-options'),'nosniff');assert(Buffer.from(await downloaded.arrayBuffer()).equals(pdf));
 await deny(api,document.downloadUrl);await deny(api,document.downloadUrl,admin,'GET',undefined,401);
 await deny(api,'/application-documents/'+document.id);await deny(api,'/uploads/'+document.id);
 pass('documents live privately in PostgreSQL, reject unsafe names/MIME/magic/size, replace safely per checklist, and download only through authorized no-store attachment routes');

 phase='staff preview and independent co-applicant privacy';
 workspace=await json<StaffApplicationWorkspace>(api,appRoute,admin);const staffDocument=workspace.participants.find(p=>p.id===primary.id)!.documents[0]!;const staffDownload=await api.request(staffDocument.downloadUrl,agent);assert.equal(staffDownload.status,200);assert(/attachment/.test(staffDownload.headers.get('content-disposition')??''));await deny(api,staffDocument.downloadUrl,analyst,'GET',undefined,403);await deny(api,staffDocument.downloadUrl,foreignAdmin,'GET',undefined,[403,404]);await deny(api,staffDocument.downloadUrl,applicantCookie,'GET',undefined,401);const previewResponse=await api.request(appRoute+'/preview',admin);assert.equal(previewResponse.headers.get('set-cookie'),null,'Staff preview must never create an applicant session.');const preview=await json<PortalApplication>(api,appRoute+'/preview',admin);
 assert(preview.preview&&preview.readOnly);assert(!JSON.stringify(preview).includes('password_hash'));await deny(api,appRoute+'/preview',admin,'PATCH',{version:preview.participant.version,details:draft});
 await deny(api,appRoute+'/preview/submit',admin,'POST',{version:preview.application.version});
 const settings={version:workspace.application.version,coApplicantsEnabled:true,checklist:workspace.checklist.map(i=>({id:i.id,label:i.label,required:i.required}))};
 await json(api,appRoute+'/settings',admin,'PUT',settings);
 await json(api,appRoute+'/participants',admin,'POST',{contactId:coContact,email:coEmail},201);
 workspace=await json<StaffApplicationWorkspace>(api,appRoute,admin);const co=workspace.participants.find(p=>p.contactId===coContact)!;assert(co);
 const coInvitation=await issue(appId,co.id);const coAccepted=await api.request(portal+'/invitations/accept','','POST',{token:coInvitation.token,password:applicantPassword});assert.equal(coAccepted.status,200);const coCookie=cookieOf(coAccepted,'ootla.applicant.sid');
 let coState=await json<PortalApplication>(api,portalRoute,coCookie);assert.equal(coState.participant.role,'co_applicant');assert.notEqual(coState.participant.id,portalState.participant.id);assert(coState.checklist.every(i=>i.document===null));assert(!JSON.stringify(coState).includes('applicant-private.pdf'));assert(!JSON.stringify(coState).includes(draft.currentAddress));
 await deny(api,document.downloadUrl,coCookie,'GET',undefined,[403,404]);
 const privateCoDetails={displayName:'Co-applicant independently saved',phone:'+234 800 999 0000',currentAddress:'Co-applicant private address',moveInDate:'2027-01-20'};
 await json(api,portalRoute,coCookie,'PATCH',{version:coState.participant.version,details:privateCoDetails});coState=await json<PortalApplication>(api,portalRoute,coCookie);
 for(const item of coState.checklist.filter(i=>i.required)){const response=await rawUpload(api,uploadRoute('co-private-'+item.id+'.pdf',item.id),coCookie,pdf);assert.equal(response.status,201);}
 await json(api,portalRoute+'/consents',coCookie,'POST',{version:'application-v1',accepted:true});coState=await json<PortalApplication>(api,portalRoute,coCookie);assert(coState.readiness.canMarkReady);
 await json(api,portalRoute+'/ready',coCookie,'POST',{version:coState.participant.version});
 portalState=await detail();assert(!JSON.stringify(portalState).includes(privateCoDetails.currentAddress));assert(!JSON.stringify(portalState).includes('co-private-'));
 const coDocument=(await json<PortalApplication>(api,portalRoute,coCookie)).checklist.find(i=>i.document)!.document!;await deny(api,coDocument.downloadUrl,applicantCookie,'GET',undefined,[403,404]);
 await deny(api,portalRoute+'/submit',coCookie,'POST',{version:portalState.application.version},[403,404,409]);
 pass('staff preview is a read-only representation without an applicant session; configured co-applicants authenticate independently and cannot read each other personal details or documents');

 phase='consent readiness source ownership submission and CRM synchronization';
 for(const item of portalState.checklist.filter(i=>i.required&&!i.document)){const response=await rawUpload(api,uploadRoute('required-'+item.id+'.pdf',item.id),applicantCookie,pdf);assert.equal(response.status,201);}
 await deny(api,portalRoute+'/consents',applicantCookie,'POST',{version:'application-v1',accepted:false},400);await deny(api,portalRoute+'/consents',applicantCookie,'POST',{version:'invented-version',accepted:true},400);
 await json(api,portalRoute+'/consents',applicantCookie,'POST',{version:'application-v1',accepted:true});await json(api,portalRoute+'/consents',applicantCookie,'POST',{version:'application-v1',accepted:true});
 assert.equal((await database.query('SELECT 1 FROM application_consents WHERE participant_id=$1',[primary.id])).rowCount,1,'Consent retries must preserve one immutable versioned acceptance.');
 portalState=await detail();assert(portalState.consent.acceptedAt&&portalState.consent.text.includes('does not authorize screening'));assert(portalState.readiness.canMarkReady);
 await json(api,portalRoute+'/ready',applicantCookie,'POST',{version:portalState.participant.version});portalState=await detail();assert(portalState.participant.readyAt);
 await json(api,portalRoute,applicantCookie,'PATCH',{version:portalState.participant.version,details:{...draft,phone:'+234 800 100 2001'}});portalState=await detail();assert.equal(portalState.participant.readyAt,null,'Editing previously ready details must require another explicit readiness confirmation.');
 await json(api,portalRoute+'/ready',applicantCookie,'POST',{version:portalState.participant.version});portalState=await detail();assert(portalState.readiness.canSubmit);
 await database.query("UPDATE applications SET source_system='yardi',source_owned_fields=ARRAY['status']::text[] WHERE id=$1",[appId]);
 await deny(api,portalRoute+'/submit',applicantCookie,'POST',{version:portalState.application.version},[403,409]);assert.equal((await database.query('SELECT status FROM applications WHERE id=$1',[appId])).rows[0]!.status,'draft');
 await database.query("UPDATE applications SET source_system='local',source_owned_fields='{}'::text[] WHERE id=$1",[appId]);
 portalState=await detail();const submissionVersion=portalState.application.version;
 const submissions=await Promise.all([api.request(portalRoute+'/submit',applicantCookie,'POST',{version:submissionVersion}),api.request(portalRoute+'/submit',applicantCookie,'POST',{version:submissionVersion})]);
 for(const response of submissions)assert.equal(response.status,200,'A concurrent exact submission retry must safely return the existing submitted result.');
 portalState=await detail();assert.equal(portalState.application.status,'submitted');assert(portalState.application.submittedAt&&portalState.readOnly);assert(portalState.nextSteps.length);
 const canonical=(await database.query('SELECT status,contact_id,lead_id FROM applications WHERE id=$1',[appId])).rows[0]!;assert.equal(canonical.status,'submitted');assert.equal(canonical.contact_id,contacts[0]);assert.equal(canonical.lead_id,leadIds[0]);
 const lead=(await database.query('SELECT application_summary_id,application_summary_status,pipeline_stage FROM leads WHERE id=$1',[leadIds[0]])).rows[0]!;assert.equal(lead.application_summary_id,appId);assert.equal(lead.application_summary_status,'submitted');assert.equal(lead.pipeline_stage,'application_started','Portal submission must preserve the established staff-managed lead stage.');
 workspace=await json<StaffApplicationWorkspace>(api,appRoute,admin);assert.equal(workspace.application.status,'submitted');assert.equal(workspace.application.readyCount,2);assert(workspace.events.some(e=>e.kind.includes('submi')));
 const submissionEvents=(await database.query("SELECT 1 FROM application_portal_events WHERE application_id=$1 AND kind IN ('submitted','application_submitted')",[appId])).rowCount;assert.equal(submissionEvents,1);
 const timeline=await json<{items:Array<{kind:string;summary:string;occurredAt:string}>}>(api,'/api/lead-workspaces/'+leadIds[0]+'/timeline?page=1&pageSize=100',admin);
 assert(timeline.items.some(e=>e.kind==='application'&&/submi/i.test(e.summary)),'The real lead timeline must contain applicant submission history.');
 for(let i=1;i<timeline.items.length;i++)assert(Date.parse(timeline.items[i-1]!.occurredAt)>=Date.parse(timeline.items[i]!.occurredAt));
 await deny(api,portalRoute,applicantCookie,'PATCH',{version:portalState.participant.version,details:draft},[403,409]);
 assert.equal((await database.query('SELECT 1 FROM leases WHERE lead_id=$1',[leadIds[0]])).rowCount,0);assert.equal((await database.query('SELECT 1 FROM lease_verified_milestones WHERE lead_id=$1',[leadIds[0]])).rowCount,0);
 pass('versioned consent, per-person required documents and readiness gate one atomic retry-safe submission; provider-owned status is protected; staff application, lead summary and timeline synchronize while preserving the lead stage without screening approval or lease creation');

 phase='normal login logout expiry and immediate grant revocation';
 const loginApplicant=async(secret=applicantPassword)=>{const response=await api.request(portal+'/auth/login','','POST',{email:applicantEmails[0],password:secret});assert.equal(response.status,200);return cookieOf(response,'ootla.applicant.sid');};
 await deny(api,portal+'/auth/login','','POST',{email:applicantEmails[0],password:'incorrect-but-long-password'},401);
 applicantCookie=await loginApplicant();await json(api,portal+'/auth/me',applicantCookie);
 const logout=await api.request(portal+'/auth/logout',applicantCookie,'POST',{});assert.equal(logout.status,204);assert(/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(logout.headers.get('set-cookie')??''));await noApplicantSession(api,applicantCookie);
 applicantCookie=await loginApplicant();
 await database.query("UPDATE applicant_sessions SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE user_id=$1",[applicantId]);await noApplicantSession(api,applicantCookie);await deny(api,document.downloadUrl,applicantCookie,'GET',undefined,401);
 applicantCookie=await loginApplicant();await database.query('UPDATE application_participants SET active=false WHERE id=$1',[primary.id]);await deny(api,portalRoute,applicantCookie,'GET',undefined,[401,403,404]);await deny(api,document.downloadUrl,applicantCookie,'GET',undefined,[401,403,404]);await database.query('UPDATE application_participants SET active=true WHERE id=$1',[primary.id]);
 await database.query('UPDATE organization_memberships SET active=false WHERE id=$1',[memberships[1]]);await deny(api,appRoute,agent,'GET',undefined,401);
 const disabledDemo=await json<ApplicantConfig>(api,portal+'/config');assert.equal(disabledDemo.demoEnabled,false);assert(!disabledDemo.demoCredentials);
 const mixed=await start({...config,demoMode:true});const mixedConfig=await json<ApplicantConfig>(mixed,portal+'/config');assert.equal(mixedConfig.demoEnabled,false);assert(!mixedConfig.demoCredentials);
 await deny(mixed,portal+'/auth/login','','POST',{email:applicantEmails[0],password:applicantPassword},401);
 pass('normal sign-in, invalid credentials, logout, expiry and immediate participant/staff revocation work; non-demo or mixed customer environments never publish or enable demo applicant access');


 phase='property-bound applicant grants cannot be retargeted by a CRM edit';
 const boundParticipant=restricted.participants.find(p=>p.role==='primary')!;
 const boundInvitation=await issue(restricted.application.id,boundParticipant.id);
 const boundAccepted=await api.request(portal+'/invitations/accept','','POST',{token:boundInvitation.token,password:applicantPassword});assert.equal(boundAccepted.status,200);const boundCookie=cookieOf(boundAccepted,'ootla.applicant.sid');
 await json<PortalApplication>(api,portal+'/applications/'+restricted.application.id,boundCookie);
 const futureInvitation=await issue(restricted.application.id,boundParticipant.id);
 assert.equal((await database.query('SELECT property_id FROM application_participants WHERE id=$1',[boundParticipant.id])).rows[0]!.property_id,properties[0]);
 await database.transaction(async c=>{
  await c.query('UPDATE leads SET application_summary_id=NULL,application_summary_status=NULL WHERE id=$1',[leadIds[1]]);
  await c.query('UPDATE applications SET lead_id=NULL,property_id=$2 WHERE id=$1',[restricted.application.id,properties[1]]);
 });
 await noApplicantSession(api,boundCookie);await deny(api,portal+'/applications/'+restricted.application.id,boundCookie,'GET',undefined,[401,403,404]);
 await deny(api,portal+'/invitations/inspect','','POST',{token:futureInvitation.token},[400,401,404,410]);
 await deny(api,portal+'/invitations/accept','','POST',{token:futureInvitation.token,password:applicantPassword},[400,401,404,410]);
 pass('an applicant grant snapshots its original property; later canonical CRM property changes cannot retarget an existing session or invitation to a different property');
 phase='deliberate isolated demo applicant setup and safe repeat seeding';
 const beforeRejectedDemo=await snapshot();
 await assert.rejects(()=>seedApplicantDemo(database,config),(e:unknown)=>(e as{status?:number}).status===403);
 await assert.rejects(()=>seedApplicantDemo(database,{...config,demoMode:true}),(e:unknown)=>(e as{status?:number}).status===403);
 assert.deepEqual(await snapshot(beforeRejectedDemo),beforeRejectedDemo,'Disabled/mixed environment seed attempts must not change a record.');
 await database.query("UPDATE organizations SET environment='demo' WHERE id=ANY($1::uuid[])",[orgs]);
 const demoConfig:ServerConfig={...config,demoMode:true};
 const seeded=await seedApplicantDemo(database,demoConfig);assert(seeded.changedRecords>0);assert(!orgs.includes(seeded.organizationId));
 const seededSnapshot=await snapshot();const repeatedSeed=await seedApplicantDemo(database,demoConfig);assert.equal(repeatedSeed.changedRecords,0);assert.equal(repeatedSeed.applicationId,seeded.applicationId);assert.deepEqual(await snapshot(seededSnapshot),seededSnapshot,'An intentional seed retry must not overwrite user work, hashes, status or audit history.');
 const demoApi=await start(demoConfig),demoConfigPublic=await json<ApplicantConfig>(demoApi,portal+'/config');assert(demoConfigPublic.demoEnabled);assert.equal(demoConfigPublic.demoCredentials?.email,applicantDemoEmail);
 const demoLogin=await demoApi.request(portal+'/auth/login','','POST',{email:applicantDemoEmail,password:applicantDemoPassword});assert.equal(demoLogin.status,200);const demoCookie=cookieOf(demoLogin,'ootla.applicant.sid');
 const demoApplications=await json<{items:Array<{id:string}>}>(demoApi,portal+'/applications',demoCookie);assert.equal(demoApplications.items.length,1);assert.equal(demoApplications.items[0]!.id,seeded.applicationId);
 assert.equal((await database.query('SELECT 1 FROM organization_memberships WHERE user_id=$1',[seeded.applicantUserId])).rowCount,0);

 const demoStaffLogin=await demoApi.request('/api/auth/login','','POST',{email:applicantDemoStaffEmail,password:demoConfig.demoAdminPassword});assert.equal(demoStaffLogin.status,200);const demoStaffCookie=cookieOf(demoStaffLogin,'ootla.sid');
 for(const period of ['month','all']){const demoOverview=await json<AdminOverview>(demoApi,'/api/admin/overview?period='+period,demoStaffCookie);assert.equal(demoOverview.dashboard.metrics.applications,1);assert.equal(demoOverview.counts.applications,1);assert.equal(demoOverview.dashboard.metrics.leasesSigned,null);assert.equal(demoOverview.modulesReady,false);}
 const disabledAgain=await start(config);await deny(disabledAgain,portal+'/auth/login','','POST',{email:applicantDemoEmail,password:applicantDemoPassword},401);assert.equal((await json<ApplicantConfig>(disabledAgain,portal+'/config')).demoEnabled,false);
 const production=await start({...config,nodeEnv:'production',production:true,appUrl:'https://ootla.test'});await deny(production,portal+'/auth/login','','POST',{email:applicantDemoEmail,password:applicantDemoPassword},401);
 pass('the deliberate applicant seed creates a separate synthetic organization and hashed applicant, retries without changing any record, and cannot run or authenticate against disabled, mixed or production configurations');
 console.log('Stage15 applicant portal checks complete: '+groups+' focused groups passed; all records and uploads were synthetic inside the uniquely owned scratch database. No live outbound actions were performed.');

}
try{await main();}
catch(error){const detail=error instanceof assert.AssertionError?error.message.split(/\r?\n/,1)[0]:JSON.stringify({name:error instanceof Error?error.name:'unknown',code:(error as{code?:string})?.code});console.error('Stage15 checks failed during '+phase+': '+detail);console.error('Check location: '+(error instanceof Error?error.stack?.split(/\r?\n/).find(l=>l.includes('check-applicant-portal.ts'))?.trim():'unknown'));process.exitCode=1;}
finally{
 try{
  for(const close of servers.reverse())await close();await database.close();
  if(ownsScratch){await verifiedCluster();assert(/^ootla_demo_applicant_[a-f0-9]{32}$/.test(scratchName));const target=await owner.query<{owner:string}>('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1',[scratchName]);assert(target.rowCount===1&&target.rows[0]?.owner==='ootla','Scratch ownership changed; no deletion attempted.');const quoted=(await owner.query<{name:string}>('SELECT quote_ident($1) AS name',[scratchName])).rows[0]!.name;await owner.query('DROP DATABASE '+quoted);assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1',[scratchName])).rowCount,0);console.log('PASS removed only the uniquely owned Stage15 scratch database; retained data was never modified');}
 }catch{console.error('Stage15 owned scratch cleanup failed. No unrelated database deletion was attempted.');process.exitCode=1;}finally{if(ownerConnected)await owner.end();}
}
