import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';

export class MigrationManifestError extends Error {
  constructor(message='The Ootla migration files are unavailable. Keep migrations/ in the release and start from the application directory.') { super(message);this.name='MigrationManifestError'; }
}
export interface MigrationFile {readonly name:string;readonly checksum:string;readonly sql:string;readonly tables:readonly string[]}
export interface AppliedMigration {name:string;checksum:string}
const manifests=new Map<string,Promise<readonly MigrationFile[]>>();
/** Release files are immutable for this process. Database history is checked afresh separately. */
export function migrationManifest(directory=path.resolve(process.cwd(),'migrations')):Promise<readonly MigrationFile[]> {
 const resolved=path.resolve(directory),cached=manifests.get(resolved);if(cached)return cached;
 const pending=(async()=>{
  let names:string[];try{names=(await readdir(resolved)).filter(name=>name.endsWith('.sql')).sort();}catch{throw new MigrationManifestError();}
  if(!names.length||names.some(name=>!/^\d{3}_[a-z0-9_]+\.sql$/.test(name))||new Set(names.map(name=>name.slice(0,3))).size!==names.length)throw new MigrationManifestError('Migration files must have unique numbered names such as 001_description.sql. No database was changed.');
  return Object.freeze(await Promise.all(names.map(async name=>{
   let bytes:Buffer;try{bytes=await readFile(path.join(resolved,name));}catch{throw new MigrationManifestError();}
   const sql=bytes.toString('utf8').replace(/^\uFEFF/,''),tables=[...sql.matchAll(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)\s*\(/gi)].map(match=>match[1]!.toLowerCase());
   return Object.freeze({name,checksum:createHash('sha256').update(bytes).digest('hex'),sql,tables:Object.freeze(tables)});
  })));
 })();manifests.set(resolved,pending);return pending;
}
/** Exact release/history equality rejects missing, changed and unexpected applied migrations. */
export function migrationHistoryMatches(manifest:readonly MigrationFile[],applied:readonly AppliedMigration[]):boolean {
 if(!manifest.length||manifest.length!==applied.length||new Set(applied.map(row=>row.name)).size!==applied.length)return false;
 const checksums=new Map(applied.map(row=>[row.name,row.checksum]));return manifest.every(file=>checksums.get(file.name)===file.checksum);
}
