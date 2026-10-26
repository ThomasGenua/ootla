import '../server/config/environment.js';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {loadConfig,assertOotlaDatabase} from '../server/config/env.js';
import {Database} from '../server/db/pool.js';
type Baseline={records:Record<string,{columns:string[];count:number;hash:string;rowHashes:string[]}>;migrations:Array<{name:string;checksum:string}>;sources:Record<string,string>};
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const quote=(v:string)=>{assert(/^[a-z_][a-z0-9_]*$/.test(v));return '"'+v+'"';};
const config=loadConfig();assertOotlaDatabase(config);assert(config.demoMode&&!config.production,'Only the isolated local demo preservation baseline is supported.');
const db=new Database(config);
try{
 const b=JSON.parse(await readFile('.local/batch-20-25-baseline.json','utf8')) as Baseline;
 let tables=0,originalRows=0;
 for(const [name,record] of Object.entries(b.records)){
  const rows=(await db.query('SELECT '+record.columns.map(quote).join(',')+' FROM '+quote(name))).rows;
  const counts=new Map<string,number>();for(const row of rows){const h=sha(JSON.stringify(row));counts.set(h,(counts.get(h)??0)+1);}
  for(const h of record.rowHashes){assert((counts.get(h)??0)>0,'An original business record changed or disappeared in '+name);counts.set(h,counts.get(h)!-1);}
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
 console.log('Preserved all '+originalRows+' original rows across '+tables+' business tables; authorized additive demo records are allowed.');
 console.log('All '+b.migrations.length+' earlier migrations and '+applied.length+' applied migration file checksums match. '+protectedCount+' protected source/environment/public/dependency hashes match.');
}finally{await db.close();}
