import '../../server/config/environment.js';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
import path from 'node:path';
import type {AddressInfo} from 'node:net';
import {Client} from 'pg';
import {createServer,type ViteDevServer} from 'vite';
import {createApp} from '../../server/app.js';
import {loadConfig,type ServerConfig} from '../../server/config/env.js';
import {Database} from '../../server/db/pool.js';
import {seedDemo} from '../../server/services/demo-seed.js';
import {seedApplicantDemo,applicantDemoEmail,applicantDemoPassword,applicantDemoStaffEmail} from '../../server/services/applicant-demo.js';
import {hashPassword} from '../../server/services/passwords.js';

const root=path.resolve(import.meta.dirname,'../..');
const normalize=(value:string)=>path.resolve(value).replaceAll('\\','/').toLowerCase();
export async function withConversationFixture<T>(kind:'api'|'browser',run:(fixture:ConversationFixture)=>Promise<T>,options:{onLoopbackOrigin?:(origin:string)=>void}={}):Promise<T>{
 const source=loadConfig(),sourceUrl=new URL(source.databaseUrl);
 assert(source.demoMode&&!source.production&&/^ootla_demo(?:_[a-z0-9_]+)?$/.test(source.databaseName??''),'Use only Ootla isolated non-production demo configuration.');
 assert(sourceUrl.hostname==='127.0.0.1'&&sourceUrl.port==='55439'&&sourceUrl.username==='ootla'&&!sourceUrl.search&&!sourceUrl.hash,'Use the project-owned loopback PostgreSQL cluster and application role.');
 const name='ootla_demo_chat_'+kind+'_'+randomUUID().replaceAll('-','');
 assert(name.length<=63&&/^ootla_demo_chat_(api|browser)_[a-f0-9]{32}$/.test(name));
 const scratchUrl=new URL(sourceUrl);scratchUrl.pathname='/'+name;
 const ownerUrl=new URL(sourceUrl);ownerUrl.username='ootla_cluster_owner';ownerUrl.pathname='/postgres';
 const owner=new Client({connectionString:ownerUrl.toString(),connectionTimeoutMillis:5000});
 const config:{-readonly [K in keyof ServerConfig]:ServerConfig[K]}={...source,nodeEnv:'test',production:false,demoMode:true,serveCompiledClient:false,secureCookies:false,trustProxyLoopback:false,sessionSecret:randomBytes(48).toString('hex'),databaseUrl:scratchUrl.toString(),databaseName:name,appUrl:'http://ootla.test',integrationsMode:'simulation',outboundMode:'simulation',ai:{...source.ai,provider:'simulated',apiKey:'',model:'',maxRequestsPerMinute:1000,dailyTokenBudget:100000000}};
 const database=new Database(config),servers:Array<()=>Promise<void>>=[];
 let owned=false,connected=false;
 try{
  await owner.connect();connected=true;
  assert.equal(normalize((await owner.query('SHOW data_directory')).rows[0].data_directory),normalize(path.join(root,'.local/postgres/data')),'Refusing a non-project PostgreSQL cluster.');
  const role=(await owner.query('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1',['ootla'])).rows[0];
  assert(role&&!role.rolsuper&&!role.rolcreatedb&&!role.rolcreaterole);
  assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount,0);
  await owner.query('CREATE DATABASE '+(await owner.query('SELECT quote_ident($1) AS name',[name])).rows[0].name+' OWNER ootla');owned=true;
  assert.equal((await database.query('SELECT current_database() AS name')).rows[0].name,name);
  await promisify(execFile)(process.execPath,[path.join(root,'node_modules/tsx/dist/cli.mjs'),path.join(root,'scripts/migrate.ts')],{cwd:root,windowsHide:true,timeout:90000,env:{...process.env,NODE_ENV:'test',DEMO_MODE:'true',DATABASE_URL:config.databaseUrl,APP_URL:config.appUrl}});
  const foreign=await seedDemo(database,config),demo=await seedApplicantDemo(database,config);
  const property=(await database.query('SELECT a.property_id,a.unit_id,a.lead_id,a.contact_id,p.name FROM applications a JOIN properties p ON p.organization_id=a.organization_id AND p.id=a.property_id WHERE a.id=$1 AND a.organization_id=$2',[demo.applicationId,demo.organizationId])).rows[0]!;
  const staffMembership=(await database.query('SELECT id FROM organization_memberships WHERE organization_id=$1 AND user_id=$2',[demo.organizationId,demo.staffUserId])).rows[0]!.id as string;
  const roles=['leasing_agent','leasing_agent','read_only_analyst'] as const,staffPassword='Synthetic-'+randomUUID()+'!',staff:Array<{userId:string;membershipId:string;email:string;role:string}>=[];
  const passwordHash=await hashPassword(staffPassword);
  for(const role of roles){
   const userId=randomUUID(),email='conversation-'+userId+'@example.test';
   await database.query("INSERT INTO users(id,email,display_name,password_hash,account_kind) VALUES($1,$2,$3,$4,'staff')",[userId,email,'Isolated '+role,passwordHash]);
   const membershipId=(await database.query('INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING id',[demo.organizationId,userId,role])).rows[0]!.id;
   await database.query('INSERT INTO property_access_assignments(organization_id,membership_id,property_id) VALUES($1,$2,$3)',[demo.organizationId,membershipId,property.property_id]);
   staff.push({userId,membershipId,email,role});
  }
  const restrictedProperty=(await database.query("INSERT INTO properties(organization_id,name,address,city,source_system) VALUES($1,'Restricted conversation property','Synthetic address','Demo city','demo') RETURNING id",[demo.organizationId])).rows[0]!.id as string;
  const restrictedLead=(await database.query("INSERT INTO leads(organization_id,property_id,display_name,email,status,intent,pipeline_stage,source,notes) VALUES($1,$2,'Restricted Person','restricted@example.test','contacted','leasing','contacted','demo','PRIVATE_STAFF_MARKER_20') RETURNING id,contact_id",[demo.organizationId,restrictedProperty])).rows[0]!;
  const foreignProperty=(await database.query('SELECT id FROM properties WHERE organization_id=$1 ORDER BY id LIMIT 1',[foreign.organizationId])).rows[0]!.id as string;
  await database.query("UPDATE leads SET notes='PRIVATE_STAFF_MARKER_20' WHERE id=$1 AND organization_id=$2",[property.lead_id,demo.organizationId]);
  const fixture:ConversationFixture={root,name,config,database,organizationId:demo.organizationId,staffUserId:demo.staffUserId,staffMembershipId:staffMembership,applicationId:demo.applicationId,propertyId:property.property_id,propertyName:property.name,unitId:property.unit_id,leadId:property.lead_id,contactId:property.contact_id,restrictedPropertyId:restrictedProperty,restrictedLeadId:restrictedLead.id,foreignOrganizationId:foreign.organizationId,foreignPropertyId:foreignProperty,staff,staffPassword,staffEmail:applicantDemoStaffEmail,adminPassword:config.demoAdminPassword,foreignEmail:config.demoAdminEmail,applicantEmail:applicantDemoEmail,applicantPassword:applicantDemoPassword,
   start:async()=>{
    const app=createApp(config,database),server=await new Promise<ReturnType<typeof app.listen>>((resolve,reject)=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));listener.once('error',reject);});
    let closed=false;const close=async()=>{if(closed)return;closed=true;server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));};servers.push(close);
    const base='http://127.0.0.1:'+(server.address() as AddressInfo).port;options.onLoopbackOrigin?.(base);return{base,close};
   },
   startBrowser:async()=>{
    const api=await fixture.start();
    const web:ViteDevServer=await createServer({configFile:false,root:path.join(root,'client'),publicDir:path.join(root,'public'),envDir:root,server:{host:'127.0.0.1',port:0,strictPort:true,proxy:{'/api':{target:api.base,changeOrigin:false}}},logLevel:'error'});
    await web.listen();servers.push(()=>web.close());const address=web.httpServer?.address();assert(address&&typeof address!=='string');
    config.appUrl='http://127.0.0.1:'+address.port;options.onLoopbackOrigin?.(config.appUrl);
    assert(![3100,5173,7673].includes(address.port));
    const health=await fetch(config.appUrl+'/api/health');assert.equal(health.status,200);assert.equal((await health.json() as {database:string}).database,'ready');
    return{base:config.appUrl,close:async()=>{await web.close();await api.close();}};
   }
  };
  console.log('Created owned isolated '+kind+' conversation environment; retained demo is untouched.');
  return await run(fixture);
 }finally{
  for(const close of servers.reverse())await close();
  await database.close();
  if(owned&&connected){
   assert.equal(normalize((await owner.query('SHOW data_directory')).rows[0].data_directory),normalize(path.join(root,'.local/postgres/data')));
   assert(/^ootla_demo_chat_(api|browser)_[a-f0-9]{32}$/.test(name));
   await owner.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[name]);
   await owner.query('DROP DATABASE '+(await owner.query('SELECT quote_ident($1) AS name',[name])).rows[0].name);
   console.log('Removed only the owned conversation database and stopped temporary servers.');
  }
  if(connected)await owner.end();
 }
}
export interface ConversationFixture{
 root:string;name:string;config:ServerConfig;database:Database;organizationId:string;staffUserId:string;staffMembershipId:string;applicationId:string;propertyId:string;propertyName:string;unitId:string;leadId:string;contactId:string;restrictedPropertyId:string;restrictedLeadId:string;foreignOrganizationId:string;foreignPropertyId:string;staff:Array<{userId:string;membershipId:string;email:string;role:string}>;staffPassword:string;staffEmail:string;adminPassword:string;foreignEmail:string;applicantEmail:string;applicantPassword:string;
 start():Promise<{base:string;close():Promise<void>}>;startBrowser():Promise<{base:string;close():Promise<void>}>;
}
