import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {organizationProvisioningSchema,organizationInvitationReissueSchema,organizationInvitationRevokeSchema} from '../shared/organization-provisioning-contracts.js';
import {loadConfig,ConfigurationError} from '../server/config/env.js';
import {Database} from '../server/db/pool.js';
import {ApiError} from '../server/http/errors.js';
import {assertRuntimeDatabaseIsolation} from '../server/runtime-isolation.js';
import {OrganizationProvisioning} from '../server/services/organization-provisioning.js';
import {preparePrivateOutput,savePrivateOutput,PrivateOutputError} from './lib/private-provisioning-output.js';
const usage='Usage: provision-organization --operation provision|reissue|revoke --manifest /private/request.json [--invitation-output /private/new-invitation.json]. Use the same request key for retries; never put links or credentials in chat/logs.';
let database:Database|undefined;
try{
 const args=process.argv.slice(2);if(args.length===1&&args[0]==='--help'){console.log(usage);}else{
  const flags=new Map<string,string>();for(let i=0;i<args.length;i+=2){const key=args[i],value=args[i+1];if(!key||!['--operation','--manifest','--invitation-output'].includes(key)||!value||value.startsWith('--')||flags.has(key))throw new PrivateOutputError(usage);flags.set(key,value);}
  const operation=flags.get('--operation')??'provision',manifestPath=flags.get('--manifest');
  if(!['provision','reissue','revoke'].includes(operation)||!manifestPath||!path.isAbsolute(manifestPath))throw new PrivateOutputError(usage);
  const size=(await stat(manifestPath)).size;if(size>65536)throw new PrivateOutputError('The operator manifest is too large.');
  const raw=JSON.parse(await readFile(manifestPath,'utf8')) as unknown;
  const schema=operation==='provision'?organizationProvisioningSchema:operation==='reissue'?organizationInvitationReissueSchema:organizationInvitationRevokeSchema;
  const parsed=schema.safeParse(raw);if(!parsed.success)throw new PrivateOutputError('The operator manifest is invalid. Check the documented fields, request UUID, email, mode, timezone and invitation lifetime. Values are omitted.');
  const config=loadConfig(),target=config.databaseUrl?new URL(config.databaseUrl):null;
  const runtime={appUrl:config.appUrl,database:config.databaseName,host:target?.hostname,port:target?.port,role:target?.username};
  const manifest=parsed.data,manifestHash=createHash('sha256').update(JSON.stringify({operation,manifest,runtime})).digest('hex'),output=flags.get('--invitation-output');
  if(operation==='revoke'&&output)throw new PrivateOutputError('Revocation does not issue an invitation. Omit --invitation-output.');
  if(operation!=='revoke'&&!output)throw new PrivateOutputError('A new private --invitation-output path is required.');
  const plan=output?await preparePrivateOutput(output,process.cwd(),manifest.requestKey,manifestHash):null;
  database=new Database(config);await database.requireReady();await assertRuntimeDatabaseIsolation(database,config);
  const service=new OrganizationProvisioning(database,config);
  if(operation==='revoke'){await service.revoke(organizationInvitationRevokeSchema.parse(manifest));console.log('The invitation revocation is saved. No account password or active membership was changed.');}
  else{
   const result=operation==='provision'?await service.provision(organizationProvisioningSchema.parse(manifest)):await service.reissue(organizationInvitationReissueSchema.parse(manifest));
   const written=await savePrivateOutput(plan!,{...result});
   console.log(written?'The organization request is saved and its invitation result is written privately.':'The same organization request is saved; the existing private invitation output was preserved.');
   console.log(result.invitation.state==='pending'?'Share the private invitation link through your approved secure channel. The administrator chooses a password, then signs in normally.':'No active invitation was issued. Check its state in the private result; accepted accounts are never reset by retrying provisioning.');
  }
 }
}catch(issue){console.error(issue instanceof ConfigurationError||issue instanceof PrivateOutputError||issue instanceof ApiError?issue.message:'The request could not finish. Check the private manifest/output paths and database, then retry the same request key. Values are omitted; no credential or link is printed.');process.exitCode=1;}
finally{await database?.close();}
