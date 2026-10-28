import '../../server/config/environment.js';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import path from 'node:path';
import {promisify} from 'node:util';
import {Client} from 'pg';
import type {AddressInfo} from 'node:net';
import {createApp} from '../../server/app.js';
import {loadConfig,type ServerConfig} from '../../server/config/env.js';
import {Database} from '../../server/db/pool.js';
import {assertRuntimeDatabaseIsolation} from '../../server/runtime-isolation.js';

const root=path.resolve(import.meta.dirname,'../..');
const normalize=(value:string)=>path.resolve(value).replaceAll('\\','/').toLowerCase();
/** Owned, uniquely named PostgreSQL fixture. Never copies, seeds, resets or edits a retained database. */
export async function withDemoShowcaseFixture<T>(run:(fixture:DemoShowcaseFixture)=>Promise<T>):Promise<T>{
 const source=loadConfig(),sourceUrl=new URL(source.databaseUrl);
 assert(source.demoMode&&!source.production&&/^ootla_demo(?:_[a-z0-9_]+)?$/.test(source.databaseName??''),'A verified isolated development demo configuration is required.');
 assert.equal(sourceUrl.hostname,'127.0.0.1');assert.equal(sourceUrl.port,'55439');assert.equal(sourceUrl.username,'ootla');assert(!sourceUrl.search&&!sourceUrl.hash);
 const git=await promisify(execFile)('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:root,windowsHide:true});
 const common=path.resolve(git.stdout.trim());assert.equal(path.basename(common),'.git');const clusterRoot=path.resolve(common,'..');
 const name='ootla_demo_showcase_'+randomUUID().replaceAll('-','');assert(/^ootla_demo_showcase_[a-f0-9]{32}$/.test(name));
 const ownerUrl=new URL(sourceUrl);ownerUrl.username='ootla_cluster_owner';ownerUrl.pathname='/postgres';
 const ownedUrl=new URL(sourceUrl);ownedUrl.pathname='/'+name;
 const owner=new Client({connectionString:ownerUrl.toString(),connectionTimeoutMillis:5000});
 const config:ServerConfig={...source,nodeEnv:'test',production:false,demoMode:true,secureCookies:false,trustProxyLoopback:false,serveCompiledClient:false,databaseUrl:ownedUrl.toString(),databaseName:name,appUrl:'http://ootla-showcase.test',sessionSecret:randomBytes(48).toString('hex'),sessionCookiePrefix:'ootla_showcase',integrationsMode:'simulation',outboundMode:'simulation',ai:{...source.ai,provider:'simulated',apiKey:'',model:'',maxRequestsPerMinute:1000,dailyTokenBudget:10000000},googleCalendar:{...source.googleCalendar,enabled:false,clientId:'',clientSecret:'',tokenEncryptionKey:null},googleAnalytics:{...source.googleAnalytics,enabled:false,clientId:'',clientSecret:'',tokenEncryptionKey:null}};
 const database=new Database(config);let connected=false,owned=false;const closers:Array<()=>Promise<void>>=[];const originalFetch=globalThis.fetch,origins=new Set<string>();let outside=0;
 globalThis.fetch=async(input,init)=>{const target=new URL(input instanceof Request?input.url:String(input));if(target.protocol!=='http:'||target.hostname!=='127.0.0.1'||!origins.has(target.origin)||target.username||target.password){outside++;throw new Error('Showcase verification refused external network access.');}return originalFetch(input,{...init,redirect:'manual'});};
 try{
  await owner.connect();connected=true;assert.equal(normalize((await owner.query('SHOW data_directory')).rows[0].data_directory),normalize(path.join(clusterRoot,'.local/postgres/data')),'Refusing an unrelated PostgreSQL cluster.');
  const role=(await owner.query('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1',['ootla'])).rows[0];assert(role&&!role.rolsuper&&!role.rolcreatedb&&!role.rolcreaterole);
  assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount,0);
  const quoted=(await owner.query('SELECT quote_ident($1) AS value',[name])).rows[0].value;
  await owner.query('CREATE DATABASE '+quoted+' OWNER ootla');owned=true;
  assert.equal((await database.query('SELECT current_database() AS name')).rows[0].name,name);
  await promisify(execFile)(process.execPath,[path.join(root,'node_modules/tsx/dist/cli.mjs'),path.join(root,'scripts/migrate.ts')],{cwd:root,windowsHide:true,timeout:90000,env:{...process.env,NODE_ENV:'test',DEMO_MODE:'true',DATABASE_URL:config.databaseUrl,APP_URL:config.appUrl,AI_PROVIDER:'simulated',GOOGLE_CALENDAR_CLIENT_ID:'',GOOGLE_CALENDAR_CLIENT_SECRET:'',GOOGLE_CALENDAR_TOKEN_KEY:'',GOOGLE_ANALYTICS_CLIENT_ID:'',GOOGLE_ANALYTICS_CLIENT_SECRET:'',GOOGLE_ANALYTICS_TOKEN_KEY:''}});
  await database.requireReady();await assertRuntimeDatabaseIsolation(database,config);
  const transaction=database.transaction.bind(database);database.transaction=operation=>transaction(async client=>{const query=client.query.bind(client);(client as any).query=async(...args:any[])=>{try{return await (query as any)(...args);}catch(issue){const e=issue as{code?:string;table?:string;constraint?:string};if(e.code&&/^[A-Z0-9]{5}$/.test(e.code))console.error('Owned fixture SQL diagnostic: '+e.code+' '+(e.table||String(args[0]).match(/(?:INSERT INTO|UPDATE|FROM)\s+([a-z_]+)/i)?.[1]||'')+' '+(e.constraint??''));throw issue;}};try{return await operation(client);}finally{client.query=query;}});
  const fixture:DemoShowcaseFixture={root,config,database,outsideRequests:()=>outside,start:async()=>{
   await database.requireReady();await assertRuntimeDatabaseIsolation(database,config);const app=createApp(config,database);
   const server=await new Promise<ReturnType<typeof app.listen>>((resolve,reject)=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));listener.once('error',reject);});
   const base='http://127.0.0.1:'+(server.address() as AddressInfo).port;assert(!['3100','3101','7673','7674'].includes(new URL(base).port));origins.add(base);let closed=false;
   const close=async()=>{if(closed)return;closed=true;server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));};closers.push(close);return{base,close};
  }};
  return await run(fixture);
 }finally{
  for(const close of closers.reverse())await close();await database.close();
  if(owned&&connected){assert.equal(normalize((await owner.query('SHOW data_directory')).rows[0].data_directory),normalize(path.join(clusterRoot,'.local/postgres/data')));assert(/^ootla_demo_showcase_[a-f0-9]{32}$/.test(name));const identity=(await owner.query('SELECT d.datname,r.rolname FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE d.datname=$1',[name])).rows[0];assert(identity?.datname===name&&identity.rolname==='ootla');await owner.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[name]);await owner.query('DROP DATABASE '+(await owner.query('SELECT quote_ident($1) AS value',[name])).rows[0].value);}
  if(connected)await owner.end();globalThis.fetch=originalFetch;
 }
}
export interface DemoShowcaseFixture{root:string;config:ServerConfig;database:Database;outsideRequests():number;start():Promise<{base:string;close():Promise<void>}>;}
