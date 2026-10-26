import '../server/config/environment.js';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { createServer } from 'vite';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config/env.js';
import { Database } from '../server/db/pool.js';
import { seedDemo } from '../server/services/demo-seed.js';
import { hashPassword } from '../server/services/passwords.js';



// All record writes and browser actions target one newly created, uniquely owned database.
const root=path.resolve(import.meta.dirname,'..');
const source=loadConfig();
const url=new URL(source.databaseUrl);
assert(source.demoMode&&!source.production&&/^ootla_demo(?:_[a-z0-9_]+)?$/.test(source.databaseName??''));
assert(url.hostname==='127.0.0.1'&&url.port==='55439'&&url.username==='ootla'&&!url.search&&!url.hash);
const name='ootla_demo_stage12_browser_'+randomUUID().replaceAll('-','');
const scratchUrl=new URL(url);scratchUrl.pathname='/'+name;
const ownerUrl=new URL(url);ownerUrl.username='ootla_cluster_owner';ownerUrl.pathname='/postgres';
const owner=new Client({connectionString:ownerUrl.toString(),connectionTimeoutMillis:5000});
const config={...source,nodeEnv:'test' as const,production:false,databaseUrl:scratchUrl.toString(),databaseName:name,appUrl:'http://127.0.0.1:5177'};
const database=new Database(config);
const normalize=(value:string)=>path.resolve(value).replaceAll('\\','/').toLowerCase();
let owned=false,connected=false;




let api:ReturnType<ReturnType<typeof createApp>['listen']>|undefined;
let web:Awaited<ReturnType<typeof createServer>>|undefined;
try {
 await owner.connect();connected=true;
 const identity=(await owner.query('SHOW data_directory')).rows[0].data_directory;
 assert.equal(normalize(identity),normalize(path.join(root,'.local/postgres/data')));
 const role=(await owner.query('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1',['ootla'])).rows[0];
 assert(role&&!role.rolsuper&&!role.rolcreatedb&&!role.rolcreaterole);
 assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount,0);
 const quoted=(await owner.query('SELECT quote_ident($1) AS name',[name])).rows[0].name;
 await owner.query('CREATE DATABASE '+quoted+' OWNER ootla');owned=true;
 assert.equal((await database.query('SELECT current_database() AS name')).rows[0].name,name);
 await promisify(execFile)(process.execPath,[path.join(root,'node_modules/tsx/dist/cli.mjs'),path.join(root,'scripts/migrate.ts')],{
  cwd:root,windowsHide:true,timeout:30000,env:{...process.env,NODE_ENV:'test',DEMO_MODE:'true',DATABASE_URL:config.databaseUrl,APP_URL:config.appUrl}
 });
 await seedDemo(database,config);
 const organization=(await database.query<{id:string}>("SELECT id FROM organizations WHERE slug='ootla-demo' AND environment='demo'")).rows[0];
 assert(organization);
 const passwordHash=await hashPassword('YardiAgent!2026');
 const user=(await database.query<{id:string}>("INSERT INTO users(email,display_name,password_hash,is_demo) VALUES('yardi-agent@example.test','Yardi Browser Agent',$1,false) RETURNING id",[passwordHash])).rows[0];
 assert(user);
 await database.query("INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,'leasing_agent')",[organization.id,user.id]);
 const app=createApp(config,database);
 api=await new Promise((resolve,reject)=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));listener.once('error',reject);});
 assert(api);const apiAddress=api.address();assert(apiAddress&&typeof apiAddress!=='string');
 web=await createServer({configFile:false,root:path.join(root,'client'),publicDir:path.join(root,'public'),envDir:root,server:{host:'127.0.0.1',port:0,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:'+apiAddress.port,changeOrigin:false}}},logLevel:'error'});
 await web.listen();const address=web.httpServer?.address();assert(address&&typeof address!=='string');
 config.appUrl='http://127.0.0.1:'+address.port;
 assert(![3100,5173,7673].includes(address.port));
 const health=await fetch(config.appUrl+'/api/health');assert.equal(health.status,200);assert.equal((await health.json() as {database:string}).database,'ready');

 console.log('Created owned isolated Stage 12 browser environment; retained demo is untouched.');
 const browserRun=promisify(execFile)(process.execPath,[path.join(root,'scripts/check-yardi-browser.mjs')],{
  cwd:root,windowsHide:true,timeout:180000,maxBuffer:1024*1024,env:{...process.env,OOTLA_CHECK_URL:config.appUrl,OOTLA_CHECK_DATABASE:name}
 });
 browserRun.child.stdout?.pipe(process.stdout);browserRun.child.stderr?.pipe(process.stderr);
 await browserRun;
} catch(error) {
 const child=error as {stdout?:string;stderr?:string;message?:string;code?:string|number;killed?:boolean;signal?:string};
 if(child.stdout)process.stdout.write(child.stdout);
 if(child.stderr)process.stderr.write(child.stderr);
 console.error('Isolated Yardi readiness browser check failed; code='+String(child.code??'none')+'; killed='+String(child.killed??false)+'; signal='+String(child.signal??'none')+'. Configured credentials and raw database details are omitted.');process.exitCode=1;
} finally {
 if(web)await web.close();
 if(api){api.closeAllConnections();await new Promise<void>(resolve=>api!.close(()=>resolve()));}



 await database.close();
 if(owned&&connected){
  assert.equal(normalize((await owner.query('SHOW data_directory')).rows[0].data_directory),normalize(path.join(root,'.local/postgres/data')));
  assert(/^ootla_demo_stage12_browser_[a-f0-9]{32}$/.test(name));
  await owner.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[name]);
  const quoted=(await owner.query('SELECT quote_ident($1) AS name',[name])).rows[0].name;
  await owner.query('DROP DATABASE '+quoted);console.log('Removed only the owned Stage 12 browser database and stopped its temporary servers.');
 }
 if(connected)await owner.end();
}
