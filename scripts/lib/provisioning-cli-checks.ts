import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,chmod,writeFile,readFile,lstat,unlink,rmdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {CustomerRuntimeFixture} from './customer-runtime-fixture.js';
import type {OrganizationProvisioningResult,OrganizationProvisioningManifest} from '../../shared/organization-provisioning-contracts.js';
export async function checkProvisioningCli(f:CustomerRuntimeFixture):Promise<void>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'ootla-provisioning-check-'));await chmod(directory,0o700);
 assert(path.isAbsolute(directory));const relative=path.relative(f.root,directory);assert(relative.startsWith('..'+path.sep)||path.isAbsolute(relative),'CLI private fixtures must remain outside the checkout.');
 const files:string[]=[];
 const own=(name:string)=>{const target=path.join(directory,name);assert.equal(path.dirname(target),directory);files.push(target);return target;};
 const envFile=own('customer.env'),manifestFile=own('manifest.json'),outputFile=own('invitation.json'),collisionFile=own('collision.json');
 const manifest:OrganizationProvisioningManifest={requestKey:randomUUID(),organization:{name:'CLI owned customer',slug:'cli-'+randomUUID(),mode:'standalone',timeZone:'Europe/London'},administrator:{name:'CLI first administrator',email:'cli-'+randomUUID()+'@example.test'},expiresInHours:48};
 const values:Record<string,string>={NODE_ENV:'production',DEMO_MODE:'false',DATABASE_URL:f.config.databaseUrl,DATABASE_TLS_MODE:'disable',APP_URL:f.config.appUrl,SESSION_SECRET:f.config.sessionSecret,SESSION_COOKIE_PREFIX:f.config.sessionCookiePrefix,COOKIE_SECURE:'true',OOTLA_BIND_HOST:'127.0.0.1',PORT:'3100',AI_PROVIDER:'disabled',GOOGLE_CALENDAR_ENABLED:'false',GOOGLE_ANALYTICS_ENABLED:'false',INTEGRATIONS_MODE:'simulation',OUTBOUND_MODE:'simulation'};
 const inherited:NodeJS.ProcessEnv={};for(const name of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE'])if(process.env[name])inherited[name]=process.env[name];
 const env={...inherited,NODE_ENV:'production',OOTLA_ENV_FILE:envFile};
 const count=async()=>JSON.stringify((await f.database.query('SELECT (SELECT count(*) FROM organizations) AS organizations,(SELECT count(*) FROM users) AS users,(SELECT count(*) FROM staff_admin_invitations) AS invitations,(SELECT count(*) FROM organization_provisioning_receipts) AS receipts,(SELECT count(*) FROM audit_events) AS audits')).rows[0]);
 const run=async(output:string,operation='provision')=>{
  try{const result=await promisify(execFile)(process.execPath,[path.join(f.root,'node_modules/tsx/dist/cli.mjs'),path.join(f.root,'scripts/provision-organization.ts'),'--operation',operation,'--manifest',manifestFile,...(operation==='revoke'?[]:['--invitation-output',output])],{cwd:f.root,windowsHide:true,timeout:60000,maxBuffer:256000,env});return{ok:true,stdout:result.stdout,stderr:result.stderr};}
  catch(issue){const error=issue as {stdout?:string;stderr?:string};return{ok:false,stdout:error.stdout??'',stderr:error.stderr??''};}
 };
 const noSecrets=(result:{stdout:string;stderr:string},token='')=>{const text=result.stdout+result.stderr;for(const value of [f.config.databaseUrl,f.config.sessionSecret,token].filter(Boolean))assert(!text.includes(value),'The operator process must not print credentials or invitation capabilities.');};
 try{
  await writeFile(envFile,Object.entries(values).map(([key,value])=>key+'='+JSON.stringify(value)).join('\n')+'\n',{mode:0o600});
  await writeFile(manifestFile,JSON.stringify(manifest),{mode:0o600});
  const first=await run(outputFile);noSecrets(first);assert(first.ok,'The actual private operator CLI must complete.');
  const bytes=await readFile(outputFile),saved=JSON.parse(bytes.toString()) as OrganizationProvisioningResult&{format:string;version:number;requestKey:string;manifestHash:string};assert.equal(saved.format,'ootla-first-administrator-invitation');assert.equal(saved.version,1);assert.equal(saved.requestKey,manifest.requestKey);assert(/^[a-f0-9]{64}$/.test(saved.manifestHash));assert(saved.invitation.url);const token=new URL(saved.invitation.url).hash.slice('#token='.length);assert(/^[a-f0-9]{64}$/.test(token));noSecrets(first,token);assert.equal(new URL(saved.invitation.url).search,'');assert.equal(new URL(saved.invitation.url).pathname,'/staff/invite');
  const metadata=await lstat(outputFile);if(process.platform!=='win32')assert.equal(metadata.mode&0o077,0);const before=await count();
  const retry=await run(outputFile);noSecrets(retry,token);assert(retry.ok);assert.deepEqual(await readFile(outputFile),bytes);assert.equal((await lstat(outputFile)).mtimeMs,metadata.mtimeMs);assert.equal(await count(),before);
  await writeFile(manifestFile,JSON.stringify({...manifest,organization:{...manifest.organization,name:'Changed instructions'}}));const changed=await run(outputFile);noSecrets(changed,token);assert(!changed.ok);assert.equal(await count(),before);assert.deepEqual(await readFile(outputFile),bytes);
  await writeFile(manifestFile,JSON.stringify({...manifest,requestKey:randomUUID(),organization:{...manifest.organization,slug:'uncreated-'+randomUUID()},administrator:{...manifest.administrator,email:'uncreated-'+randomUUID()+'@example.test'}}));await writeFile(collisionFile,'unrelated private content',{mode:0o600});const collision=await run(collisionFile);noSecrets(collision);assert(!collision.ok);assert.equal(await count(),before);assert.equal(await readFile(collisionFile,'utf8'),'unrelated private content');
  const checkoutTarget=path.join(f.root,'.local','forbidden-invitation-'+randomUUID()+'.json');const inCheckout=await run(checkoutTarget);noSecrets(inCheckout);assert(!inCheckout.ok);assert.equal(await count(),before);await assert.rejects(()=>lstat(checkoutTarget),(e:unknown)=>(e as NodeJS.ErrnoException).code==='ENOENT');
  await writeFile(manifestFile,JSON.stringify({requestKey:randomUUID(),organizationId:saved.organization.id,expiresInHours:24}));const replacementFile=own('replacement.json');const reissue=await run(replacementFile,'reissue');noSecrets(reissue,token);assert(reissue.ok);const replacement=JSON.parse(await readFile(replacementFile,'utf8')) as OrganizationProvisioningResult;assert.notEqual(replacement.invitation.id,saved.invitation.id);
  await writeFile(manifestFile,JSON.stringify({requestKey:randomUUID(),organizationId:saved.organization.id}));const revoke=await run('','revoke');noSecrets(revoke,token);assert(revoke.ok);assert.equal((await f.database.query('SELECT revoked_at IS NOT NULL AS revoked FROM staff_admin_invitations WHERE id=$1',[replacement.invitation.id])).rows[0].revoked,true);
 }finally{
  for(const file of files.reverse()){assert.equal(path.dirname(file),directory);const state=await lstat(file).catch(()=>null);if(state){assert(state.isFile()&&!state.isSymbolicLink());await unlink(file);}}
  assert(path.basename(directory).startsWith('ootla-provisioning-check-')&&path.dirname(directory)===path.resolve(os.tmpdir()));await rmdir(directory);
 }
}
