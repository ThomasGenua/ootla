import '../server/config/environment.js';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {loadConfig} from '../server/config/env.js';
import {Database} from '../server/db/pool.js';
import {requireIsolatedDemo} from '../server/services/demo-environment.js';
const file='.local/workspace-ui-before.json',sha=(value:unknown)=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const config=loadConfig();assert(config.demoMode&&!config.production&&config.databaseName==='ootla_demo');const db=new Database(config);
const skipped=['sessions','applicant_sessions','resident_sessions','staff_password_attempt_limits'];
const volatile:Record<string,string[]>={automation_rules:['last_scan_at','scan_page'],automation_jobs:['next_attempt_at'],task_notifications:['read_at'],task_reminders:['status','next_attempt_at','attempts','delivered_at','cancelled_at','last_error']};
const quote=(key:string)=>{assert(/^[a-z_][a-z0-9_]*$/.test(key));return '"'+key+'"';};
const project=(row:Record<string,unknown>,cols:string[])=>Object.fromEntries(cols.map(key=>[key,row[key]]));
type Table={fullColumns:string[];columns:string[];fullHashes:string[];hashes:string[]};
type Baseline={capturedAt:string;records:Record<string,Table>;envSha:string;migrations:Array<{name:string;checksum:string}>;skippedAuthTables:string[];workerCursors:Record<string,string[]>};
try {
 if(process.argv.includes('--capture')){const source=new URL(config.databaseUrl);assert.equal(source.hostname,'127.0.0.1');assert.equal(source.port,'55439');assert.equal(source.username,'ootla');await requireIsolatedDemo(config,db);const applied=(await db.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;assert.equal(applied.length,35);for(const migration of applied)assert.equal(sha(await readFile('migrations/'+migration.name)),migration.checksum);}else await db.requireReady();
 if(process.argv.includes('--capture')) {
  const before:Baseline={capturedAt:new Date().toISOString(),records:{},envSha:sha(await readFile('.env')),migrations:(await db.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows as Baseline['migrations'],skippedAuthTables:skipped,workerCursors:volatile};
  assert.equal(before.migrations.length,35,'Capture current chat-scroll baseline without migration.');
  for(const {table_name:name}of(await db.query<{table_name:string}>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows) {
   if(skipped.includes(name))continue;
   const fullColumns=(await db.query<{column_name:string}>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",[name])).rows.map(row=>row.column_name),columns=fullColumns.filter(key=>!volatile[name]?.includes(key));
   const rows=(await db.query('SELECT '+fullColumns.map(quote).join(',')+' FROM '+quote(name))).rows;
   before.records[name]={fullColumns,columns,fullHashes:rows.map(sha),hashes:rows.map(row=>sha(project(row,columns)))};
  }
  await writeFile(file,JSON.stringify(before,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({capturedAt:before.capturedAt,businessTables:Object.keys(before.records).length,originalRows:Object.values(before.records).reduce((total,row)=>total+row.hashes.length,0),originalMigrations:before.migrations.length,privateEnvironmentHashed:true,retainedWrites:0}));
 } else {
  const before=JSON.parse(await readFile(file,'utf8')) as Baseline;let retained=0,exact=0,cursors=0;const cursorTables:Record<string,number>={},additions:Record<string,number>={};
  for(const [name,baseline]of Object.entries(before.records)) {
   const rows=(await db.query('SELECT '+baseline.fullColumns.map(quote).join(',')+' FROM '+quote(name))).rows,stable=rows.map(row=>sha(project(row,baseline.columns))),full=rows.map(sha);
   for(const hash of baseline.hashes){const index=stable.indexOf(hash);assert(index>=0,'An original row changed or disappeared in '+name);stable.splice(index,1);retained++;}
   if(stable.length)additions[name]=stable.length;
   for(const hash of baseline.fullHashes){const index=full.indexOf(hash);if(index>=0){full.splice(index,1);exact++;}else{assert(volatile[name]?.length,'An original full row changed in '+name);cursors++;cursorTables[name]=(cursorTables[name]??0)+1;}}
  }
  assert.equal(sha(await readFile('.env')),before.envSha,'Private environment must remain byte-identical.');
  for(const migration of before.migrations)assert.equal(sha(await readFile('migrations/'+migration.name)),migration.checksum);
  const applied=(await db.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;
  assert.deepEqual(applied,before.migrations);

  const result={verifiedAt:new Date().toISOString(),originalRows:retained,fullExactRows:exact,knownWorkerCursorOnlyRows:cursors,cursorTables,businessTables:Object.keys(before.records).length,privateEnvironmentUnchanged:true,originalMigrationsUnchanged:before.migrations.length,newAdditiveMigrations:0,additions,originalBusinessMutations:0};
  await writeFile('.local/workspace-ui-preservation-observations.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 }
} finally {await db.close();}
