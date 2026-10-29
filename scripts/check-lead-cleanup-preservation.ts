import '../server/config/environment.js';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {loadConfig} from '../server/config/env.js';
import {Database} from '../server/db/pool.js';
const file='.local/lead-cleanup-2026-10-28-before.json',sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const cfg=loadConfig();assert(cfg.demoMode&&!cfg.production&&cfg.databaseName==='ootla_demo','Retained preview read-only preservation only.');
const db=new Database(cfg),skip=new Set(['sessions','applicant_sessions','resident_sessions','staff_password_attempt_limits']);
const excluded:Record<string,string[]>={automation_rules:['last_scan_at','scan_page'],task_notifications:['read_at']};
type Baseline={capturedAt:string;records:Record<string,{columns:string[];hashes:string[]}>;envSha:string;migrations:Array<{name:string;checksum:string}>};
const quote=(s:string)=>{assert(/^[a-z_][a-z0-9_]*$/.test(s));return '"'+s+'"';};
try{await db.requireReady();let baseline:Baseline;
 if(process.argv.includes('--capture')){
  baseline={capturedAt:new Date().toISOString(),records:{},envSha:sha(await readFile('.env')),migrations:(await db.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows as Baseline['migrations']};
  for(const {table_name}of(await db.query<{table_name:string}>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows){if(skip.has(table_name))continue;const columns=(await db.query<{column_name:string}>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",[table_name])).rows.map(r=>r.column_name).filter(n=>!excluded[table_name]?.includes(n));const rows=(await db.query('SELECT '+columns.map(quote).join(',')+' FROM '+quote(table_name))).rows;baseline.records[table_name]={columns,hashes:rows.map(r=>sha(JSON.stringify(r)))};}
  await mkdir('.local',{recursive:true});await writeFile(file,JSON.stringify(baseline,null,2)+'\n',{flag:'wx',mode:0o600});console.log('Captured immutable retained-demo baseline: '+Object.keys(baseline.records).length+' business tables, '+Object.values(baseline.records).reduce((n,t)=>n+t.hashes.length,0)+' rows. No data, credentials or personal values printed.');
 }else{
  baseline=JSON.parse(await readFile(file,'utf8')) as Baseline;let rows=0;for(const[name,t]of Object.entries(baseline.records)){const hashes=(await db.query('SELECT '+t.columns.map(quote).join(',')+' FROM '+quote(name))).rows.map(r=>sha(JSON.stringify(r)));for(const h of t.hashes){const index=hashes.indexOf(h);assert(index>=0,'An original retained row changed or disappeared in '+name);hashes.splice(index,1);rows++;}}
  assert.equal(sha(await readFile('.env')),baseline.envSha,'Private runtime configuration changed.');for(const migration of baseline.migrations)assert.equal(sha(await readFile('migrations/'+migration.name)),migration.checksum,'Applied migration source changed.');const result={verifiedAt:new Date().toISOString(),retainedRows:rows,businessTables:Object.keys(baseline.records).length,privateEnvironmentUnchanged:true,migrations:baseline.migrations.length,excludedVolatileColumns:excluded,secretsPrinted:false};await writeFile('.local/lead-cleanup-preservation-observations.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 }
}finally{await db.close();}
