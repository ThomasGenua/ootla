import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import type {AddressInfo} from 'node:net';
import type {Server} from 'node:http';
import {Client} from 'pg';
import {loadConfig,type ServerConfig} from '../../server/config/env.js';
import {Database} from '../../server/db/pool.js';
import {assertRuntimeDatabaseIsolation} from '../../server/runtime-isolation.js';
import {createApp} from '../../server/app.js';
import {hashPassword} from '../../server/services/passwords.js';

export interface CustomerRuntimeSetup{organizationId:string;staffUserId:string;staffMembershipId:string;staffEmail:string;staffPassword:string;propertyId:string;unitId:string}
export interface CustomerRuntimeFixture{
 root:string;name:string;roleName:string;database:Database;config:ServerConfig;setup:CustomerRuntimeSetup|null;
 start(config?:ServerConfig):Promise<{base:string;close:()=>Promise<void>}>;
}
const root=path.resolve(import.meta.dirname,'../..'),normalize=(value:string)=>path.resolve(value).replaceAll('\\','/').toLowerCase();
/** Isolated customer checks only. Never clones retained demo accounts or changes a retained role. */
export async function withCustomerRuntimeFixture<T>(run:(fixture:CustomerRuntimeFixture)=>Promise<T>,options:{createOrganization?:boolean;onLoopbackOrigin?:(origin:string)=>void}={}):Promise<T>{
 const source=loadConfig(),sourceUrl=new URL(source.databaseUrl);
 assert(source.demoMode&&!source.production&&sourceUrl.hostname==='127.0.0.1'&&sourceUrl.port==='55439'&&sourceUrl.username==='ootla'&&!sourceUrl.search&&!sourceUrl.hash,'Customer checks require the project-owned loopback source configuration.');
 const git=await promisify(execFile)('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:root,windowsHide:true});const clusterRoot=path.resolve(git.stdout.trim(),'..');
 const suffix=randomUUID().replaceAll('-',''),name='ootla_customer_check_'+suffix,roleName='ootla_check_'+suffix,rolePassword=randomBytes(36).toString('hex');
 assert(/^ootla_customer_check_[a-f0-9]{32}$/.test(name)&&name.length<=63);assert(/^ootla_check_[a-f0-9]{32}$/.test(roleName));
 const ownerUrl=new URL(sourceUrl);ownerUrl.username='ootla_cluster_owner';ownerUrl.pathname='/postgres';
 const url=new URL(sourceUrl);url.username=roleName;url.password=rolePassword;url.pathname='/'+name;
 const config=loadConfig({NODE_ENV:'production',DEMO_MODE:'false',DATABASE_URL:url.toString(),DATABASE_TLS_MODE:'disable',APP_URL:'https://customer-fixture.example.test',SESSION_SECRET:randomBytes(48).toString('hex'),SESSION_COOKIE_PREFIX:'ootla-customer',OOTLA_BIND_HOST:'127.0.0.1',PORT:'3100',COOKIE_SECURE:'true',AI_PROVIDER:'disabled',GOOGLE_CALENDAR_ENABLED:'false',GOOGLE_ANALYTICS_ENABLED:'false',INTEGRATIONS_MODE:'simulation',OUTBOUND_MODE:'simulation'});
 const owner=new Client({connectionString:ownerUrl.toString(),connectionTimeoutMillis:5000}),database=new Database(config),servers:Array<()=>Promise<void>>=[];
 let connected=false,ownedRole=false,ownedDatabase=false,roleOid=0;
 try{
  await owner.connect();connected=true;
  assert.equal(normalize((await owner.query('SHOW data_directory')).rows[0].data_directory),normalize(path.join(clusterRoot,'.local/postgres/data')),'Refusing an unrelated PostgreSQL cluster.');
  assert.equal((await owner.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[roleName])).rowCount,0);assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount,0);
  const quoted=(await owner.query('SELECT quote_ident($1) AS role,quote_literal($2) AS password,quote_ident($3) AS database',[roleName,rolePassword,name])).rows[0];
  await owner.query('CREATE ROLE '+quoted.role+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD '+quoted.password);ownedRole=true;
  const role=(await owner.query('SELECT oid,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=$1',[roleName])).rows[0];roleOid=Number(role.oid);
  assert(roleOid&&!role.rolsuper&&!role.rolcreatedb&&!role.rolcreaterole&&!role.rolreplication&&!role.rolbypassrls);
  assert.equal((await owner.query('SELECT 1 FROM pg_auth_members WHERE member=$1',[roleOid])).rowCount,0);
  await owner.query('CREATE DATABASE '+quoted.database+' OWNER '+quoted.role);ownedDatabase=true;
  await promisify(execFile)(process.execPath,[path.join(root,'node_modules/tsx/dist/cli.mjs'),path.join(root,'scripts/migrate.ts')],{cwd:root,windowsHide:true,timeout:90000,maxBuffer:2*1024*1024,env:{...process.env,OOTLA_ENV_FILE:'',NODE_ENV:'production',DEMO_MODE:'false',DATABASE_URL:config.databaseUrl,DATABASE_TLS_MODE:'disable',DATABASE_TLS_CA_FILE:'',APP_URL:config.appUrl,SESSION_SECRET:config.sessionSecret,SESSION_COOKIE_PREFIX:config.sessionCookiePrefix,PREVIEW_APP_URL:'',AI_PROVIDER:'disabled',AI_API_KEY:'',AI_MODEL:'',GOOGLE_CALENDAR_ENABLED:'false',GOOGLE_ANALYTICS_ENABLED:'false',GOOGLE_CALENDAR_TOKEN_KEY:'',GOOGLE_ANALYTICS_TOKEN_KEY:'',CONNECTOR_CREDENTIAL_KEY:''}});
  await database.requireReady();await assertRuntimeDatabaseIsolation(database,config);
  assert.equal((await database.query('SELECT current_database() AS name,current_user AS role')).rows[0].role,roleName);
  let setup:CustomerRuntimeSetup|null=null;
  if(options.createOrganization!==false){
   const organizationId=randomUUID(),staffUserId=randomUUID(),staffEmail='customer-fixture-'+suffix+'@example.test',staffPassword='Synthetic-'+randomBytes(24).toString('hex')+'!';
   await database.query("INSERT INTO organizations(id,name,slug,environment) VALUES($1,'Synthetic customer organization',$2,'live')",[organizationId,'customer-check-'+suffix]);
   await database.query("INSERT INTO organization_data_settings(organization_id,mode) VALUES($1,'standalone')",[organizationId]);
   await database.query("INSERT INTO users(id,email,display_name,password_hash,account_kind,is_demo) VALUES($1,$2,'Synthetic customer administrator',$3,'staff',false)",[staffUserId,staffEmail,await hashPassword(staffPassword)]);
   const staffMembershipId=(await database.query("INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,'organization_admin') RETURNING id",[organizationId,staffUserId])).rows[0].id as string;
   const propertyId=(await database.query("INSERT INTO properties(organization_id,name,address,city,source_system) VALUES($1,'Synthetic customer property','Synthetic property address','Test city','local') RETURNING id",[organizationId])).rows[0].id as string;
   const unitId=(await database.query("INSERT INTO units(organization_id,property_id,label,bedrooms,status,monthly_rent,source_system,availability_source,availability_verified_at) VALUES($1,$2,'Test 101',2,'available',1500,'local','staff_reported',clock_timestamp()) RETURNING id",[organizationId,propertyId])).rows[0].id as string;
   setup={organizationId,staffUserId,staffMembershipId,staffEmail,staffPassword,propertyId,unitId};
  }
  const fixture:CustomerRuntimeFixture={root,name,roleName,database,config,setup,start:async(selected=config)=>{
   assert.equal(selected.databaseUrl,config.databaseUrl);assert.equal(selected.databaseName,name);assert(!selected.demoMode&&selected.production);
   await database.requireReady();await assertRuntimeDatabaseIsolation(database,selected);
   const app=createApp(selected,database),server=await new Promise<Server>((resolve,reject)=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));listener.once('error',reject);}),base='http://127.0.0.1:'+(server.address() as AddressInfo).port;
   assert(!['3100','5173','7673'].includes(new URL(base).port));options.onLoopbackOrigin?.(base);
   let closed=false;const close=async()=>{if(closed)return;closed=true;server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));};servers.push(close);return{base,close};
  }};
  console.log('Created owned customer fixture with a fresh restricted database role; no retained identity was copied.');
  return await run(fixture);
 }finally{
  for(const close of servers.reverse())await close();await database.close();
  if(connected&&(ownedDatabase||ownedRole)){
   assert.equal(normalize((await owner.query('SHOW data_directory')).rows[0].data_directory),normalize(path.join(clusterRoot,'.local/postgres/data')));
   const actual=(await owner.query('SELECT oid,rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1',[roleName])).rows[0];assert(actual&&Number(actual.oid)===roleOid&&!actual.rolsuper&&!actual.rolcreatedb&&!actual.rolcreaterole,'Refusing cleanup after owned role identity changed.');
   if(ownedDatabase){assert(/^ootla_customer_check_[a-f0-9]{32}$/.test(name));assert.equal(Number((await owner.query('SELECT datdba FROM pg_database WHERE datname=$1',[name])).rows[0]?.datdba),roleOid);await owner.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[name]);await owner.query('DROP DATABASE '+(await owner.query('SELECT quote_ident($1) AS name',[name])).rows[0].name);}
   if(ownedRole){assert(/^ootla_check_[a-f0-9]{32}$/.test(roleName));await owner.query('DROP ROLE '+(await owner.query('SELECT quote_ident($1) AS name',[roleName])).rows[0].name);}
   console.log('Removed only the exact owned customer database and its restricted role.');
  }
  if(connected)await owner.end();
 }
}
