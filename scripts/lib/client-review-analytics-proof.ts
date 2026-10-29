import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {promisify} from 'node:util';
import type {Database} from '../../server/db/pool.js';

type Row=Record<string,any>;
type Table={fullColumns:string[];fullHashes:string[]};
type Baseline={capturedAt:string;records:Record<string,Table>};
const calendarDate=(value:Date|string)=>typeof value==='string'?value:[value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join('-');
const sha=(row:Row)=>createHash('sha256').update(JSON.stringify(row)).digest('hex');
const quote=(name:string)=>{assert(/^[a-z_][a-z0-9_]*$/.test(name));return '"'+name+'"';};
const restore='C:/Users/user/scoop/apps/postgresql/current/bin/pg_restore.exe';
const dump='.local/client-review-2026-10-29-before.dump';
const tables=['google_analytics_connections','google_analytics_report_cache'] as const;
// Decode COPY TEXT only in memory. No archive SQL, identifiers, credentials or payloads are logged.
function copyText(value:string):string|null{
 if(value==='\\N')return null;
 return value.replace(/\\([0-7]{1,3}|[bfnrtv\\])/g,(_all:string,key:string)=>/^[0-7]/.test(key)?String.fromCharCode(parseInt(key,8)):({b:'\b',f:'\f',n:'\n',r:'\r',t:'\t',v:'\v','\\':'\\'}[key]??key));
}
async function archivedRows(db:Database,table:string,sql:string,baseline:Table):Promise<Row[]>{
 const lines=sql.split(/\r?\n/),start=lines.findIndex(line=>line.startsWith('COPY public.'+table+' ('));
 assert(start>=0,'The private backup is missing the expected COPY section.');
 const columns=lines[start].slice(lines[start].indexOf('(')+1,lines[start].lastIndexOf(')')).split(', ').map(name=>name.replaceAll('"',''));
 assert.deepEqual(columns,baseline.fullColumns,'Backup schema differs from the immutable row baseline.');
 const typeRows=(await db.query<{column_name:string;sql_type:string}>("SELECT a.attname AS column_name,format_type(a.atttypid,a.atttypmod) AS sql_type FROM pg_attribute a WHERE a.attrelid=('public.'||$1)::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum",[table])).rows;
 assert.deepEqual(typeRows.map(row=>row.column_name),columns);
 for(const row of typeRows)assert(/^[a-z][a-z0-9_ ,()\[\]]*$/.test(row.sql_type),'Unexpected SQL type in backup proof.');
 const result:Row[]=[];
 for(let i=start+1;i<lines.length&&lines[i]!=='\\.';i++){
  const values=lines[i].split('\t').map(copyText);assert.equal(values.length,columns.length);
  const typed=(await db.query('SELECT '+typeRows.map((row,index)=>'$'+(index+1)+'::'+row.sql_type+' AS '+quote(row.column_name)).join(','),values)).rows[0];
  assert(baseline.fullHashes.includes(sha(typed)),'An archived row does not match the original immutable full-row hash.');result.push(typed);
 }
 assert.equal(result.length,baseline.fullHashes.length,'Archive row count differs from the original baseline.');return result;
}
export async function proveAnalyticsReadLifecycle(db:Database,baseline:Baseline){
 const archiveStat=await stat(dump);assert(archiveStat.mtimeMs>Date.parse(baseline.capturedAt));
 const output=await promisify(execFile)(restore,['--data-only','--table=google_analytics_connections','--table=google_analytics_report_cache','--file=-',dump],{windowsHide:true,maxBuffer:8*1024*1024});
 const originalConnection=await archivedRows(db,tables[0],output.stdout,baseline.records[tables[0]]),originalCache=await archivedRows(db,tables[1],output.stdout,baseline.records[tables[1]]);
 const currentConnections=(await db.query('SELECT '+baseline.records[tables[0]].fullColumns.map(quote).join(',')+' FROM google_analytics_connections')).rows;
 const currentCache=(await db.query('SELECT '+baseline.records[tables[1]].fullColumns.map(quote).join(',')+' FROM google_analytics_report_cache')).rows;
 assert.equal(originalConnection.length,1);assert.equal(currentConnections.length,1,'Analytics link identities changed.');
 const original=originalConnection[0],current=currentConnections[0];assert.equal(current.id,original.id);assert.equal(current.mode,'illustrative');assert.equal(current.state,'demo');
 const reconstructed={...current,last_successful_fetch:original.last_successful_fetch,updated_at:original.updated_at};
 assert.equal(sha(reconstructed),sha(original),'An analytics link field other than successful-fetch/updated timestamps changed.');
 assert(new Date(current.last_successful_fetch).getTime()>=new Date(original.last_successful_fetch).getTime());assert(new Date(current.updated_at).getTime()>=new Date(original.updated_at).getTime());
 const originals:Record<string,Map<string,Row>>={[tables[0]]:new Map([[current.id,reconstructed]]),[tables[1]]:new Map()},expired:Row[]=[];
 const newFetches=currentCache.filter(row=>new Date(row.fetched_at).getTime()>=archiveStat.mtimeMs);assert(newFetches.length>0,'Expected an observed bounded report refresh.');
 const firstFetch=Math.min(...newFetches.map(row=>new Date(row.fetched_at).getTime()));
 for(const row of currentCache){
  assert.equal(row.organization_id,original.organization_id);assert.equal(row.connection_id,original.id);assert.equal(row.configuration_version,original.version);assert.equal(row.property_id,original.property_id);
  assert.equal(row.permission_scope,originalCache[0].permission_scope,'Report actor/permission scope changed.');
  assert.equal(row.kind,'summary');assert.equal(row.page,1);assert([10,25].includes(row.page_size));assert.equal(row.comparison,'previous');
  assert.equal(row.payload.source.mode,'illustrative');assert.equal(row.payload.source.propertyId,row.property_id);assert.equal(row.payload.kind,row.kind);assert.equal(row.payload.page,row.page);assert.equal(row.payload.pageSize,row.page_size);
  assert.equal(row.payload.range.from,calendarDate(row.date_from));assert.equal(row.payload.range.to,calendarDate(row.date_to));assert.equal(row.payload.available,true);
  assert.equal(Date.parse(row.payload.fetchedAt),new Date(row.fetched_at).getTime());assert.equal(Date.parse(row.payload.cacheExpiresAt),new Date(row.expires_at).getTime());
  assert.equal(new Date(row.expires_at).getTime()-new Date(row.fetched_at).getTime(),300000,'Report cache TTL differs from the existing five-minute lifecycle.');
  const expectedKey=createHash('sha256').update(JSON.stringify({org:row.organization_id,connection:row.connection_id,version:row.configuration_version,property:row.property_id,permissionScope:row.permission_scope,from:calendarDate(row.date_from),to:calendarDate(row.date_to),kind:row.kind,comparison:row.comparison,page:row.page,size:row.page_size})).digest('hex');assert.equal(row.cache_key,expectedKey,'Cache key does not describe the observed report GET.');
 }
 let refreshed=0;
 for(const before of originalCache){
  const after=currentCache.find(row=>row.cache_key===before.cache_key);
  if(after){const reconstructedCache={...after,payload:before.payload,fetched_at:before.fetched_at,expires_at:before.expires_at};assert.equal(sha(reconstructedCache),sha(before),'A stable cache-key field changed.');originals[tables[1]].set(after.cache_key,reconstructedCache);if(sha(after)!==sha(before))refreshed++;}
  else{assert(new Date(before.expires_at).getTime()<firstFetch,'An original report-cache row disappeared before its documented expiry.');expired.push(before);}
 }
 const lastFetch=new Date(current.last_successful_fetch).getTime();assert(lastFetch>=firstFetch);assert(new Date(current.updated_at).getTime()>=lastFetch);
 const result={verifiedAt:new Date().toISOString(),archiveBytes:archiveStat.size,archivedRowsMatchImmutableFullHashes:true,connectionRows:1,connectionChangedFields:['last_successful_fetch','updated_at'],connectionIdentityConfigurationAndTokensUnchanged:true,originalCacheRows:originalCache.length,refreshedOriginalCacheRows:refreshed,expiredOriginalCacheRows:expired.length,currentCacheRows:currentCache.length,currentReportKinds:[...new Set(currentCache.map(row=>row.kind))],currentPageSizes:[...new Set(currentCache.map(row=>row.page_size))],cacheRefreshFields:['payload','fetched_at','expires_at'],cacheLifetimeSeconds:300,firstObservedFetch:new Date(firstFetch).toISOString(),lastSuccessfulFetch:new Date(lastFetch).toISOString(),illustrativeOnly:true,retainedWritesByVerifier:0};
 return{originals,expired,result};
}
