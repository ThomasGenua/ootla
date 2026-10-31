import assert from 'node:assert/strict';
import {parse} from 'dotenv';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,stat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {loadConfig} from '../server/config/env.js';
import {Database} from '../server/db/pool.js';
const parent=path.resolve(import.meta.dirname,'../..'),roots={demo:path.join(parent,'ootlademo'),live:path.join(parent,'Ootla')};
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex'),quote=(v:string)=>{assert(/^[a-z_][a-z0-9_]*$/.test(v));return '"'+v+'"';};
const volatile:Record<string,string[]>={automation_rules:['last_scan_at','scan_page'],automation_jobs:['next_attempt_at'],task_notifications:['read_at'],task_reminders:['status','next_attempt_at','attempts','delivered_at','cancelled_at','last_error']};
const skip=['sessions','applicant_sessions','resident_sessions','staff_password_attempt_limits'];
type Baseline={privateFiles:Record<string,string>;records:Record<string,{columns:string[];stableColumns:string[];hashes:string[];full:string[]}>;migrations:Array<{name:string;checksum:string}>};
const mode=process.argv[2]??'audit',reports=[];
for(const kind of ['live','demo'] as const){
 const root=await realpath(roots[kind]),file=path.join(root,kind==='live'?'.env.live':'.env');
 const config=loadConfig({...parse(await readFile(file)),OOTLA_ENV_FILE:file}),url=new URL(config.databaseUrl),db=new Database(config);
 assert(!config.production&&url.hostname==='127.0.0.1'&&url.port==='55439');assert.equal(config.demoMode,kind==='demo');assert.equal(config.databaseName,kind==='demo'?'ootla_demo':'ootla_live');assert.equal(url.username,kind==='demo'?'ootla':'ootla_live');
 try{
  assert.equal((await db.query('SELECT current_database() name')).rows[0].name,config.databaseName);
  const other=kind==='live'?'ootla_demo':'ootla_live',roleIsolation=(await db.query("SELECT current_user AS role,has_database_privilege(current_user,$1,'CONNECT') AS can_connect_other",[other])).rows[0];assert.equal(roleIsolation.can_connect_other,false,'Separate instance role must not connect to the other database.');
  const migrations=(await db.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows as Baseline['migrations'];
  for(const migration of migrations)assert.equal(sha(await readFile(path.join(root,'migrations',migration.name))),migration.checksum);
  const tables=(await db.query<{name:string}>("SELECT table_name name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map(r=>r.name),counts:Record<string,number>={},seeded:Record<string,number>={},records:Baseline['records']={};
  for(const table of tables){const columns=(await db.query<{name:string}>("SELECT column_name name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",[table])).rows.map(r=>r.name);counts[table]=(await db.query('SELECT count(*)::int n FROM '+quote(table))).rows[0].n;
   if(columns.includes('seed_key')){const n=(await db.query('SELECT count(*)::int n FROM '+quote(table)+' WHERE seed_key IS NOT NULL')).rows[0].n;if(n)seeded[table]=n;}
   if(mode==='capture'&&!skip.includes(table)){const rows=(await db.query('SELECT '+columns.map(quote).join(',')+' FROM '+quote(table))).rows,stableColumns=columns.filter(c=>!volatile[table]?.includes(c)),project=(row:Record<string,unknown>)=>Object.fromEntries(stableColumns.map(c=>[c,row[c]]));records[table]={columns,stableColumns,hashes:rows.map(r=>sha(JSON.stringify(project(r)))),full:rows.map(r=>sha(JSON.stringify(r)))};}
  }
  const organizations=(await db.query('SELECT environment,count(*)::int count FROM organizations GROUP BY environment ORDER BY environment')).rows;
  const demoUsers=(await db.query('SELECT count(*)::int n FROM users WHERE is_demo')).rows[0].n;
  const administratorActivation=(await db.query("SELECT count(*) FILTER(WHERE u.active AND m.active)::int AS active, count(*) FILTER(WHERE NOT u.active OR NOT m.active)::int AS pending FROM users u JOIN organization_memberships m ON m.user_id=u.id WHERE m.role='organization_admin'")).rows[0];const invitationState=(await db.query("SELECT count(*) FILTER(WHERE accepted_at IS NULL AND revoked_at IS NULL AND expires_at<=clock_timestamp())::int AS expired,count(*) FILTER(WHERE accepted_at IS NULL AND revoked_at IS NULL AND expires_at>clock_timestamp())::int AS usable FROM staff_admin_invitations")).rows[0];
  const privateFiles:Record<string,string>={};for(const name of [kind==='live'?'.env.live':'.env',...(kind==='live'?['.env']:[]),'ootla.instance.json'])privateFiles[name]=sha(await readFile(path.join(root,name)));
  const summary:any={instance:kind,database:config.databaseName,demoMode:config.demoMode,url:config.appUrl,appliedMigrations:migrations.length,organizations,demoUsers,administratorActivation,invitationState,roleIsolation,coreCounts:Object.fromEntries(['organizations','users','organization_memberships','properties','units','contacts','leads','tasks','applications','leases','maintenance_requests','viewings','ask_threads','conversation_threads','conversations'].filter(t=>t in counts).map(t=>[t,counts[t]])),seeded,providers:{ai:config.ai.provider,aiKeyConfigured:Boolean(config.ai.apiKey),calendarEnabled:config.googleCalendar.enabled,calendarCredentialsConfigured:Boolean(config.googleCalendar.clientSecret),analyticsEnabled:config.googleAnalytics.enabled,analyticsCredentialsConfigured:Boolean(config.googleAnalytics.clientSecret),connectorKeyConfigured:Boolean(config.connectorCredentialKey),outbound:config.outboundMode},privateSettingsRedacted:true};
  const before=path.join(root,'.local/release-parity-before.json');
  if(mode==='capture'){
   await mkdir(path.join(root,'.local/backups'),{recursive:true,mode:0o700});await writeFile(before,JSON.stringify({privateFiles,records,migrations})+'\n',{flag:'wx',mode:0o600});
   const archive=path.join(root,'.local/backups','release-parity-before-'+randomUUID()+'.dump'),run=promisify(execFile),env:NodeJS.ProcessEnv={...process.env,PGHOST:url.hostname,PGPORT:url.port,PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:config.databaseName!,PGCONNECT_TIMEOUT:'5',PGSSLMODE:'disable',PGOPTIONS:'-c statement_timeout=0',PGPASSFILE:path.join(root,'.local/backups/no-password-file')};delete env.PGSERVICE;delete env.PGSERVICEFILE;delete env.PGHOSTADDR;
   try{await run('pg_dump.exe',['--format=custom','--no-owner','--no-privileges','--no-password','--file',archive,'--dbname',config.databaseName!],{cwd:root,env,windowsHide:true,timeout:120000,maxBuffer:1000000});const listing=(await run('pg_restore.exe',['--list',archive],{cwd:root,windowsHide:true,timeout:30000,maxBuffer:3000000})).stdout;for(const table of ['schema_migrations','users','properties','leads','leases'])assert(listing.includes(' public '+table+' '));summary.backup={archive:path.relative(root,archive).replaceAll('\\','/'),bytes:(await stat(archive)).size,sha256:sha(await readFile(archive)),listingVerified:true};}catch{throw new Error('Native release backup failed for '+kind+'; private tool details omitted.');}
  }
  if(mode==='verify'){
   const baseline=JSON.parse(await readFile(before,'utf8')) as Baseline;let total=0,fullExact=0,workerOnly=0;const additions:Record<string,number>={};
   for(const [name,prior] of Object.entries(baseline.records)){const rows=(await db.query('SELECT '+prior.columns.map(quote).join(',')+' FROM '+quote(name))).rows,stable=rows.map(r=>sha(JSON.stringify(Object.fromEntries(prior.stableColumns.map(c=>[c,r[c]]))))),full=rows.map(r=>sha(JSON.stringify(r)));
    for(const hash of prior.hashes){const index=stable.indexOf(hash);assert(index>=0,'Original business row changed in '+kind+':'+name);stable.splice(index,1);total++;}if(stable.length)additions[name]=stable.length;
    for(const hash of prior.full){const index=full.indexOf(hash);if(index>=0){full.splice(index,1);fullExact++;}else{assert(volatile[name]?.length);workerOnly++;}}
   }
   for(const [name,hash]of Object.entries(baseline.privateFiles))assert.equal(sha(await readFile(path.join(root,name))),hash,'Private/instance file changed: '+kind+':'+name);
   for(const migration of baseline.migrations)assert(migrations.some(m=>m.name===migration.name&&m.checksum===migration.checksum));
   summary.preservation={originalRows:total,fullExact,workerOnly,additions,originalBusinessMutations:0,privateSettingsUnchanged:true,originalMigrationsUnchanged:baseline.migrations.length};
  }
  if(kind==='live'){assert.equal(demoUsers,0,'Customer database must contain no demo identities');assert(organizations.every(o=>o.environment!=='demo'));assert.equal(Object.keys(seeded).length,0,'Customer database must contain no seeded fixture records');}
  reports.push(summary);
 }finally{await db.close();}
}
await writeFile(path.join(roots.demo,'.local/release-parity-'+mode+'-observations.json'),JSON.stringify({verifiedAt:new Date().toISOString(),mode,instances:reports},null,2)+'\n',{mode:0o600});console.log(JSON.stringify(reports));
