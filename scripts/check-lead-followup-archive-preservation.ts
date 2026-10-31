import '../server/config/environment.js';
import assert from'node:assert/strict';import{createHash}from'node:crypto';import{execFile}from'node:child_process';import{promisify}from'node:util';import{readFile,writeFile}from'node:fs/promises';
import{loadConfig}from'../server/config/env.js';import{Database}from'../server/db/pool.js';import{requireIsolatedDemo}from'../server/services/demo-environment.js';
const config=loadConfig(),db=new Database(config),sha=(v:unknown)=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex'),quote=(v:string)=>{assert(/^[a-z_][a-z0-9_]*$/.test(v));return'"'+v+'"';};
try{await requireIsolatedDemo(config,db);const before=JSON.parse(await readFile('.local/lead-followup-before.json','utf8')),backup=JSON.parse(await readFile('.local/lead-followup-backup-observations.json','utf8'));assert.equal(sha(await readFile(backup.archive)),backup.sha256);
 const copy=(await promisify(execFile)('pg_restore.exe',['--data-only','--table=task_reminders','--file=-',backup.archive],{windowsHide:true,maxBuffer:3000000})).stdout,lines=copy.split(/\r?\n/),start=lines.findIndex(s=>s.startsWith('COPY public.task_reminders ('));assert(start>=0);const columns=lines[start]!.slice(lines[start]!.indexOf('(')+1,lines[start]!.indexOf(')')).split(',').map(s=>s.trim());
 const data:Array<Array<string|null>>=[];for(const line of lines.slice(start+1)){if(line==='\\.')break;data.push(line.split('\t').map(s=>s==='\\N'?null:s.replace(/\\([\\tnr])/g,(_,v:string)=>v==='t'?'\t':v==='n'?'\n':v==='r'?'\r':'\\')));}
 const result=await db.transaction(async c=>{
  await c.query('CREATE TEMP TABLE archived_task_reminders (LIKE task_reminders) ON COMMIT DROP');for(const row of data)await c.query('INSERT INTO archived_task_reminders('+columns.map(quote)+')VALUES('+row.map((_,i)=>'$'+(i+1)).join(',')+')',row);
  let originalRows=0,exact=0,worker=0;const workerRows:Record<string,number>={},additions:Record<string,number>={};const volatile:Record<string,string[]>={automation_rules:['last_scan_at','scan_page'],automation_jobs:['next_attempt_at'],task_notifications:['read_at']};const lifecycle=['status','next_attempt_at','attempts','delivered_at','cancelled_at','last_error'];
  let remindersFromOriginalArchive=0,remindersBeforeBackupChanged=0;
  for(const[name,b]of Object.entries(before.records)as Array<[string,any]>){
   const current=(await c.query('SELECT '+b.fullColumns.map(quote)+' FROM '+quote(name))).rows,full=current.map(sha),stable=current.map(row=>sha(Object.fromEntries(b.columns.map((key:string)=>[key,row[key]]))));
   if(name==='task_reminders'){
    const archive=(await c.query('SELECT '+b.fullColumns.map(quote)+' FROM archived_task_reminders')).rows,archivedHashes=archive.map(sha);
    for(const old of b.fullHashes){if(archivedHashes.includes(old))remindersFromOriginalArchive++;else remindersBeforeBackupChanged++;}
    for(const row of archive){const now=current.find(r=>r.id===row.id);assert(now,'A pre-change reminder disappeared.');const changed=b.fullColumns.filter((key:string)=>sha(row[key])!==sha(now[key]));assert(changed.every((key:string)=>lifecycle.includes(key)),'Reminder identity/content changed: '+changed.join(','));if(changed.length){worker++;workerRows[name]=(workerRows[name]??0)+1;}else exact++;originalRows++;}
   }else{
    for(const old of b.hashes){const index=stable.indexOf(old);assert(index>=0,'Original content changed in '+name);stable.splice(index,1);originalRows++;}
    for(const old of b.fullHashes){const index=full.indexOf(old);if(index>=0){full.splice(index,1);exact++;}else{assert(volatile[name]?.length,'Original full row changed in '+name);worker++;workerRows[name]=(workerRows[name]??0)+1;}}
   }
   const extra=current.length-b.hashes.length;if(extra)additions[name]=extra;
  }
  assert.equal(sha(await readFile('.env')),before.envSha);const migrations=(await c.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;assert.deepEqual(migrations.slice(0,32),before.migrations);assert.equal(migrations.length,33);for(const m of migrations)assert.equal(sha(await readFile('migrations/'+m.name)),m.checksum);
  return{verifiedAt:new Date().toISOString(),originalRows,exactRows:exact,knownWorkerOnlyRows:worker,workerRows,additions,remindersFromOriginalArchive,remindersChangedBetweenInterruptedBaselineAndVerifiedPreChangeBackup:remindersBeforeBackupChanged,allPreChangeBackupRemindersPreserved:true,privateEnvironmentUnchanged:true,originalMigrationChecksumsUnchanged:32,newMigration:'033_task_followup_outbox.sql',originalCrmMutations:0,limitation:remindersBeforeBackupChanged?'The interrupted baseline predates the verified native backup. These reminder lifecycle hashes cannot be reconstructed for that earlier instant; all pre-change backup reminders are compared field by field.':null};
 });await writeFile('.local/lead-followup-preservation-archive-observations.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await db.close();}
