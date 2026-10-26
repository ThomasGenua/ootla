import '../server/config/environment.js';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {parse} from 'dotenv';
import {loadConfig,assertOotlaDatabase} from '../server/config/env.js';
import {Database} from '../server/db/pool.js';
type RecordBaseline={columns:string[];count:number;rowHashes:string[]};
type Snapshot={capturedAt:string;records:Record<string,RecordBaseline>;env:{originalBytes:number;originalPrefixSha256:string;entries:Record<string,string>};migrations:Array<{name:string;checksum:string}>;sources:Record<string,string>};
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const quote=(v:string)=>{assert(/^[a-z_][a-z0-9_]*$/.test(v));return '"'+v+'"';};
const config=loadConfig();assertOotlaDatabase(config);assert(config.demoMode&&!config.production&&config.databaseName==='ootla_demo','Only the retained isolated local preview may be checked.');
const db=new Database(config);
try{
 const b=JSON.parse(await readFile('.local/production-readiness-2026-10-26-baseline.json','utf8')) as Snapshot;
 let originalRows=0;
 for(const [name,r] of Object.entries(b.records)){
  const current=(await db.query('SELECT '+r.columns.map(quote).join(',')+' FROM '+quote(name))).rows;
  const counts=new Map<string,number>();for(const row of current){const h=sha(JSON.stringify(row));counts.set(h,(counts.get(h)??0)+1);}
  for(const h of r.rowHashes){assert((counts.get(h)??0)>0,'An original record changed/disappeared in '+name);counts.set(h,counts.get(h)!-1);}
  originalRows+=r.count;
 }
 const bytes=await readFile('.env');assert(bytes.length>=b.env.originalBytes);assert.equal(sha(bytes.subarray(0,b.env.originalBytes)),b.env.originalPrefixSha256,'Existing private environment bytes must remain an unchanged prefix.');
 const now=parse(bytes);for(const [key,digest] of Object.entries(b.env.entries))assert.equal(sha(now[key]??''),digest,'An existing private setting changed: '+key);
 const applied=(await db.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows as Array<{name:string;checksum:string}>;
 for(const m of applied)assert.equal(sha(await readFile('migrations/'+m.name)),m.checksum,'Applied migration changed: '+m.name);
 for(const m of b.migrations)assert.equal(applied.find(v=>v.name===m.name)?.checksum,m.checksum,'Original migration history changed: '+m.name);
 let protectedFiles=0;for(const [file,digest] of Object.entries(b.sources))if(file==='package-lock.json'||file.startsWith('public/')||/^client\/[^/]+\.css$/.test(file)||file==='client/lib/ui.ts'){
  assert.equal(sha(await readFile(file)),digest,'Protected design/dependency source changed: '+file);protectedFiles++;
 }
 const result={verifiedAt:new Date().toISOString(),originalRows,businessTables:Object.keys(b.records).length,originalEnvironmentEntries:Object.keys(b.env.entries).length,originalEnvironmentBytesPreserved:true,currentEnvironmentEntries:Object.keys(now).length,originalMigrations:b.migrations.length,appliedMigrations:applied.length,protectedSourceHashes:protectedFiles,excludedVolatileColumns:{automation_rules:['last_scan_at','scan_page'],task_notifications:['read_at']},secretsPrinted:false};
 await writeFile('.local/production-readiness-preservation-observations.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await db.close();}
