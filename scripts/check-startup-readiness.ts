import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn,type ChildProcess} from 'node:child_process';
import {mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:net';
import {loadConfig,ConfigurationError} from '../server/config/env.js';
import {Database} from '../server/db/pool.js';
import {migrationManifest,migrationHistoryMatches,MigrationManifestError} from '../server/db/migrations.js';
import {withConversationFixture} from './lib/conversation-fixture.js';
import {installLocalFixtureNetworkGuard} from './lib/local-network-guard.js';

const guard=installLocalFixtureNetworkGuard(),delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
let groups=0,phase='configuration';
const pass=(text:string)=>{groups++;console.log('PASS '+text);};
const cleanEnv:NodeJS.ProcessEnv={NODE_ENV:'test',APP_URL:'http://127.0.0.1:7673',SESSION_SECRET:'synthetic-startup-check-secret-with-more-than-32-characters',DEMO_MODE:'false'};
async function port(){const probe=createServer();await new Promise<void>((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});const address=probe.address();assert(address&&typeof address!=='string');await new Promise<void>(resolve=>probe.close(()=>resolve()));return address.port;}
try{
 assert.equal(loadConfig(cleanEnv).bindHost,'127.0.0.1');assert.equal(loadConfig({...cleanEnv,HOST:'0.0.0.0'}).bindHost,'127.0.0.1');assert.equal(loadConfig({...cleanEnv,OOTLA_BIND_HOST:'0.0.0.0'}).bindHost,'0.0.0.0');
 for(const patch of [{OOTLA_BIND_HOST:'malicious-host.example'},{SERVE_COMPILED_CLIENT:'true'},{NODE_ENV:'production',APP_URL:'https://example.test'},{NODE_ENV:'production',APP_URL:'https://example.test',DEMO_MODE:'true',DATABASE_URL:'postgresql://ootla:synthetic@127.0.0.1:55439/ootla_demo'}])assert.throws(()=>loadConfig({...cleanEnv,...patch}),ConfigurationError);
 const noDb=new Database(loadConfig(cleanEnv));assert.equal(await noDb.state(),'unconfigured');await noDb.close();pass('loopback is the default; application-specific binding validates; compiled/production needs a database and production rejects demo mode');
 phase='raw migration manifest';const temporary=await mkdtemp(path.join(tmpdir(),'ootla-manifest-')),file=path.join(temporary,'001_synthetic.sql');
 try{const bytes=Buffer.from('\uFEFFCREATE TABLE synthetic_manifest(id integer);\r\n');await writeFile(file,bytes);const manifest=await migrationManifest(temporary);assert.strictEqual(await migrationManifest(temporary),manifest);assert.equal(manifest[0]!.checksum,createHash('sha256').update(bytes).digest('hex'));assert.equal(manifest[0]!.sql.startsWith('CREATE'),true);assert.deepEqual(manifest[0]!.tables,['synthetic_manifest']);assert(migrationHistoryMatches(manifest,[{name:manifest[0]!.name,checksum:manifest[0]!.checksum}]));assert(!migrationHistoryMatches(manifest,[]));assert(!migrationHistoryMatches(manifest,[{name:manifest[0]!.name,checksum:'0'.repeat(64)}]));assert(!migrationHistoryMatches(manifest,[{name:'999_unrecognized.sql',checksum:manifest[0]!.checksum}]));await assert.rejects(()=>migrationManifest(path.join(temporary,'missing')),MigrationManifestError);}finally{await unlink(file);await rmdir(temporary);}
 pass('cached release manifest hashes exact bytes including BOM/newlines and rejects missing, changed or unexpected history');
 await withConversationFixture('api',async f=>{
  const db=f.database,manifest=await migrationManifest();assert.equal(manifest.length,26);assert.equal(await db.state(),'ready');const latest=manifest.at(-1)!;
  const coreCounts=async()=>Object.fromEntries(await Promise.all(['organizations','users','leads','applications','leases'].map(async table=>[table,(await db.query('SELECT count(*)::int AS n FROM '+table)).rows[0].n])));const before=await coreCounts();
  phase='fresh migration history';await db.query('DELETE FROM schema_migrations WHERE name=$1',[latest.name]);try{assert.equal(await db.state(),'migration-required');}finally{await db.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[latest.name,latest.checksum]);}
  await db.query('UPDATE schema_migrations SET checksum=$2 WHERE name=$1',[latest.name,'0'.repeat(64)]);try{assert.equal(await db.state(),'migration-required');}finally{await db.query('UPDATE schema_migrations SET checksum=$2 WHERE name=$1',[latest.name,latest.checksum]);}
  await db.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',['999_unrecognized.sql','0'.repeat(64)]);try{assert.equal(await db.state(),'migration-required');}finally{await db.query('DELETE FROM schema_migrations WHERE name=$1',['999_unrecognized.sql']);}
  assert.equal(await db.state(),'ready');pass('all 26 applied checksums are checked afresh; absent, mismatched and unknown history cannot reuse a cached ready result');
  type Child={process:ChildProcess;base:string;output:()=>string};const children:Child[]=[];
  const start=async(patch:NodeJS.ProcessEnv={}):Promise<Child>=>{const number=await port(),base='http://127.0.0.1:'+number;guard.allow(base);let text='';const processChild=spawn(process.execPath,['--import','tsx','scripts/lib/startup-test-host.ts'],{cwd:f.root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,...cleanEnv,OOTLA_STARTUP_CHECK:'true',OOTLA_BIND_HOST:'127.0.0.1',PORT:String(number),APP_URL:base,DATABASE_URL:f.config.databaseUrl,SESSION_SECRET:f.config.sessionSecret,DEMO_MODE:'true',SERVE_COMPILED_CLIENT:'true',COOKIE_SECURE:'false',TRUST_PROXY_LOOPBACK:'false',AI_PROVIDER:'simulated',AI_API_KEY:'',AI_MODEL:'',GOOGLE_CALENDAR_ENABLED:'false',GOOGLE_ANALYTICS_ENABLED:'false',CONNECTOR_CREDENTIAL_KEY:'',...patch}});processChild.stdout?.on('data',value=>{text=(text+value.toString()).slice(-6000);});processChild.stderr?.on('data',value=>{text=(text+value.toString()).slice(-6000);});const child={process:processChild,base,output:()=>text};children.push(child);return child;};
  const exit=async(child:Child,expected:number)=>{if(child.process.exitCode===null)await Promise.race([new Promise<void>(resolve=>child.process.once('exit',()=>resolve())),delay(15000).then(()=>{throw Error('Owned startup check did not exit in time.');})]);assert.equal(child.process.exitCode,expected);assert(!child.output().includes(f.config.databaseUrl));assert(!child.output().includes(f.config.sessionSecret));};
  const stoppedBeforeListen=async(child:Child)=>{await exit(child,1);assert(!child.output().includes('API listening'));try{await fetch(child.base+'/api/health');assert.fail('An invalid release must not open its socket.');}catch(issue){assert(!(issue instanceof assert.AssertionError));}};
  const stop=async(child:Child)=>{if(child.process.exitCode!==null)return;if(child.process.connected)child.process.send('stop-owned-ootla-startup-check');await exit(child,0);};
  const health=async(child:Child)=>{for(let i=0;i<100;i++){if(child.process.exitCode!==null)throw Error('Owned valid startup exited before readiness.');try{const response=await fetch(child.base+'/api/health');if(response.status===200)return await response.json() as {database:string};}catch{}await delay(100);}throw Error('Owned valid startup did not become ready.');};
  try{
   phase='current schema gate';await db.query('ALTER TABLE property_knowledge_documents RENAME TO startup_missing_property_documents');try{assert.equal(await db.state(),'migration-required');await stoppedBeforeListen(await start());}finally{await db.query('ALTER TABLE startup_missing_property_documents RENAME TO property_knowledge_documents');}
   await db.query('UPDATE schema_migrations SET checksum=$2 WHERE name=$1',[latest.name,'0'.repeat(64)]);try{await stoppedBeforeListen(await start());}finally{await db.query('UPDATE schema_migrations SET checksum=$2 WHERE name=$1',[latest.name,latest.checksum]);}
   pass('a missing latest private-document table or changed applied checksum prevents the real compiled-mode entrypoint from listening or starting workers');
   phase='absent configuration gate';await stoppedBeforeListen(await start({DATABASE_URL:''}));const missingUrl=new URL(f.config.databaseUrl);missingUrl.pathname='/ootla_demo_chat_api_'+'0'.repeat(32);await stoppedBeforeListen(await start({DATABASE_URL:missingUrl.toString()}));pass('compiled startup refuses absent or unavailable PostgreSQL before listening, with credentials omitted from diagnostics');
   phase='valid compiled/production and optional development';const live=await start({NODE_ENV:'production',DEMO_MODE:'false',APP_URL:'https://startup.example.test',COOKIE_SECURE:'true',TRUST_PROXY_LOOPBACK:'true'});assert.equal((await health(live)).database,'ready');await stop(live);
   const development=await start({DATABASE_URL:'',DEMO_MODE:'false',SERVE_COMPILED_CLIENT:'false'});assert.equal((await health(development)).database,'unconfigured');await stop(development);assert.deepEqual(await coreCounts(),before);assert.equal(await db.state(),'ready');pass('valid production settings start successfully and shut down gracefully; public development without PostgreSQL still runs and startup does not seed or reset core data');
  }finally{for(const child of children){if(child.process.exitCode===null){try{await stop(child);}catch{child.process.kill();}}}}
 },{onLoopbackOrigin:guard.allow});
 console.log('Startup/readiness focused checks passed: '+groups+' groups.');
}catch(issue){console.error('Startup/readiness check failed during '+phase+': '+(issue instanceof Error?issue.message.slice(0,200):'failed')+'; credentials omitted.');process.exitCode=1;}finally{guard.restore();}
