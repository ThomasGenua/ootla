import '../server/config/environment.js';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {loadConfig,assertOotlaDatabase} from '../server/config/env.js';
import {Database} from '../server/db/pool.js';
type Baseline={capturedAt:string;records:Record<string,{columns:string[];count:number;hash:string;rowHashes:string[]}>;migrations:Array<{name:string;checksum:string}>;sources:Record<string,string>};
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const quote=(v:string)=>{assert(/^[a-z_][a-z0-9_]*$/.test(v));return '"'+v+'"';};
const config=loadConfig();assertOotlaDatabase(config);assert(config.demoMode&&!config.production,'Only the isolated local demo preservation baseline is supported.');
const db=new Database(config);
try{
 const b=JSON.parse(await readFile('.local/batch-26-28-baseline.json','utf8')) as Baseline;
 let tables=0,originalRows=0,exactRows=0;
 const runtimeObservations:Array<{table:string;rows:number;note:string;configurationUpdatedAt:string}> = [];
 const allowRuntimeObservation=process.argv.includes('--report-runtime-cursors');
 for(const [name,record] of Object.entries(b.records)){
  const rows=(await db.query('SELECT '+record.columns.map(quote).join(',')+' FROM '+quote(name))).rows;
  const counts=new Map<string,number>();for(const row of rows){const h=sha(JSON.stringify(row));counts.set(h,(counts.get(h)??0)+1);}
  let missing=0;for(const h of record.rowHashes){if((counts.get(h)??0)>0){counts.set(h,counts.get(h)!-1);exactRows++;}else missing++;}
  if(missing){
   // The immutable pre26 snapshot included the live worker scan timestamp in its whole-row hash.
   // Report this narrow observation explicitly; do not rewrite that baseline or restore a worker cursor.
   const row=rows[0] as Record<string,unknown>|undefined;
   const operationalOnlyCandidate=name==='automation_rules'&&record.count===1&&rows.length===1&&missing===1&&row&&Number(row.version)===1&&Number(row.scan_page)===1&&new Date(String(row.updated_at)).getTime()<new Date(b.capturedAt).getTime()&&new Date(String(row.last_scan_at)).getTime()>new Date(b.capturedAt).getTime();
   assert(operationalOnlyCandidate,'An original business record changed or disappeared in '+name);
   runtimeObservations.push({table:name,rows:1,note:'Live worker scan cursor advanced after capture; configuration updated_at predates capture. The original snapshot stored no separate business-field hash, so full hash equality for this row is unverified.',configurationUpdatedAt:row.updated_at instanceof Date?row.updated_at.toISOString():new Date(String(row.updated_at)).toISOString()});
  }
  tables++;originalRows+=record.count;
 }
 const applied=(await db.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows as Array<{name:string;checksum:string}>;
 for(const m of applied)assert.equal(sha(await readFile('migrations/'+m.name)),m.checksum,'Applied migration checksum differs: '+m.name);
 for(const m of b.migrations)assert.equal(applied.find(v=>v.name===m.name)?.checksum,m.checksum,'An earlier migration changed: '+m.name);
 let protectedCount=0;
 for(const [file,digest] of Object.entries(b.sources)){
  const protect=file==='.env'||file==='package-lock.json'||file.startsWith('public/')||/^migrations\//.test(file)||/^client\/(?:styles|admin|home|home-preview|brand|public.*|platform|integrations|workflows)\.css$/.test(file)||file==='client/lib/ui.ts'||/^client\/pages\/(?:public|home|platform|integrations|public-information|workflows|dashboard)\.ts$/.test(file);
  if(protect){assert.equal(sha(await readFile(file)),digest,'Protected existing source changed: '+file);protectedCount++;}
 }
 const observation={capturedAt:b.capturedAt,checkedAt:new Date().toISOString(),originalRows,tables,exactRows,runtimeObservations,earlierMigrations:b.migrations.length,appliedMigrations:applied.length,protectedSourceHashes:protectedCount};
 await writeFile('.local/final-preservation-observations.json',JSON.stringify(observation,null,2)+'\n');
 console.log(exactRows+'/'+originalRows+' original rows match exact hashes across '+tables+' business tables. Additive records are allowed.');
 for(const item of runtimeObservations)console.warn(item.table+': '+item.note);
 assert(allowRuntimeObservation||runtimeObservations.length===0,'Strict whole-row check differs for the explicitly reported live scan cursor. Use --report-runtime-cursors to accept only this documented observation, not a full hash-equivalence claim.');
 console.log('All '+b.migrations.length+' earlier migrations and '+applied.length+' applied migration file checksums match. '+protectedCount+' protected source/environment/public/dependency hashes match.');
}finally{await db.close();}
