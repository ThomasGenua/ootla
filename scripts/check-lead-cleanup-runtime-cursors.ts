import '../server/config/environment.js';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {loadConfig} from '../server/config/env.js';
import {Database} from '../server/db/pool.js';
const config=loadConfig();assert(config.demoMode&&!config.production&&config.databaseName==='ootla_demo');const db=new Database(config),sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const quote=(s:string)=>{assert(/^[a-z_][a-z0-9_]*$/.test(s));return '"'+s+'"';};
type Baseline={capturedAt:string;records:Record<string,{columns:string[];hashes:string[]}>;envSha:string;migrations:Array<{name:string;checksum:string}>};
try{
 const baseline=JSON.parse(await readFile('.local/lead-cleanup-2026-10-28-before.json','utf8')) as Baseline;let exact=0,cursors=0;const reconstructed:Array<{id:string;status:string;onlyChangedColumn:'next_attempt_at';originalCursor:string;currentCursor:string}>=[];
 for(const[name,table]of Object.entries(baseline.records)){
  const rows=(await db.query('SELECT '+table.columns.map(quote).join(',')+' FROM '+quote(name))).rows,original=[...table.hashes];let unmatched=rows.filter(row=>{const i=original.indexOf(sha(JSON.stringify(row)));if(i<0)return true;original.splice(i,1);exact++;return false;});
  if(!original.length)continue;
  assert.equal(name,'automation_jobs','An unrelated original business row changed.');assert.equal(rows.length,table.hashes.length,'Original automation jobs were added/deleted rather than simply deferred.');assert.equal(unmatched.length,original.length);
  // Match the original full-row SHA-256 exactly by replacing ONLY the worker-owned retry cursor.
  // The unchanged worker defers awaiting-approval jobs by 30 seconds; capture queried this table within one second.
  // A conservative +/-60-second capture window proves every other original value (including IDs, status,
  // payload, actor, timestamps, attempts, consent/approval and error fields) remains byte-equivalent.
  const captured=Date.parse(baseline.capturedAt),from=Math.floor(captured)-60000,until=Math.floor(captured)+60000;
  for(const row of unmatched){assert.equal(row.status,'awaiting_approval','Unexpected automation lifecycle change.');assert(row.next_attempt_at instanceof Date);const current=row.next_attempt_at.toISOString();let matched=-1,originalCursor='';
   for(let instant=from;instant<=until;instant++){row.next_attempt_at=new Date(instant);const index=original.indexOf(sha(JSON.stringify(row)));if(index>=0){matched=index;originalCursor=row.next_attempt_at.toISOString();break;}}
   row.next_attempt_at=new Date(current);assert(matched>=0,'A deferred job changed beyond its evidenced worker-owned retry cursor.');original.splice(matched,1);cursors++;reconstructed.push({id:row.id,status:row.status,onlyChangedColumn:'next_attempt_at',originalCursor,currentCursor:current});
  }assert.equal(original.length,0);
 }
 assert.equal(sha(await readFile('.env')),baseline.envSha,'Private environment changed.');for(const migration of baseline.migrations)assert.equal(sha(await readFile('migrations/'+migration.name)),migration.checksum,'Applied migration changed.');const worker=await readFile('server/services/automation-processor.ts','utf8');assert(worker.includes("if(job.status==='completed'||job.status==='awaiting_approval'){await c.query(\"UPDATE automation_jobs SET next_attempt_at=clock_timestamp()+interval '30 seconds' WHERE id=$1\",[id]);result.deferred++;return;}"),'Worker cursor evidence no longer matches.');const result={verifiedAt:new Date().toISOString(),originalRows:exact+cursors,exactOriginalRows:exact,businessTables:Object.keys(baseline.records).length,fullyReconstructedRows:cursors,privateEnvironmentUnchanged:true,migrations:baseline.migrations.length,baselineOverwritten:false,reconstructed,workerEvidence:'server/services/automation-processor.ts:75',outboundActions:0};await writeFile('.local/lead-cleanup-cursor-preservation-observations.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,reconstructed:reconstructed.map(({id,status,onlyChangedColumn})=>({id,status,onlyChangedColumn}))}));
}finally{await db.close();}
