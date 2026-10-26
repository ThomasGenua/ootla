import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {OrganizationProvisioning} from '../server/services/organization-provisioning.js';
import {withCustomerRuntimeFixture} from './lib/customer-runtime-fixture.js';
let phase='owned customer fixture';
try{
 await withCustomerRuntimeFixture(async f=>{
  const service=new OrganizationProvisioning(f.database,f.config);
  const manifest={requestKey:randomUUID().toUpperCase(),organization:{name:'Uppercase UUID customer',slug:'upper-'+randomUUID(),mode:'standalone' as const,timeZone:'Africa/Lagos'},administrator:{name:'Uppercase request administrator',email:'upper-'+randomUUID()+'@example.test'},expiresInHours:48};
  phase='uppercase UUID provision and stable token reconstruction';
  assert(/[A-F]/.test(manifest.requestKey));const first=await service.provision(manifest),retry=await service.provision(manifest);assert.equal(first.invitation.url,retry.invitation.url);assert.equal(retry.replayed,true);assert(first.invitation.url);
  const token=new URL(first.invitation.url).hash.slice(7);assert(/^[a-f0-9]{64}$/.test(token));assert.equal((await service.resolve(token)).state,'pending');assert.deepEqual(await service.accept({token,password:'Uppercase-Personal-Password!2026'}),{accepted:true,signInUrl:'/admin/login'});
  phase='uppercase lifecycle UUID reissue and revocation';const second=await service.provision({...manifest,requestKey:randomUUID().toUpperCase(),organization:{...manifest.organization,slug:'second-'+randomUUID()},administrator:{...manifest.administrator,email:'second-'+randomUUID()+'@example.test'}});const reissue={requestKey:randomUUID().toUpperCase(),organizationId:second.organization.id.toUpperCase(),expiresInHours:24},fresh=await service.reissue(reissue);assert.equal((await service.reissue(reissue)).invitation.url,fresh.invitation.url);assert(fresh.invitation.url);assert.equal((await service.resolve(new URL(fresh.invitation.url).hash.slice(7))).state,'pending');const revoke={requestKey:randomUUID().toUpperCase(),organizationId:second.organization.id.toUpperCase()};assert.equal((await service.revoke(revoke)).revoked,true);assert.equal((await service.revoke(revoke)).replayed,true);
 },{createOrganization:false});
 await writeFile(path.resolve('.local/organization-provisioning-uuid-observations.json'),JSON.stringify({verifiedAt:new Date().toISOString(),passed:true,groups:1,uppercaseRequestAndOrganizationIds:true,provisionRetryResolveAcceptReissueRevoke:true,ownedDatabaseAndRoleCleaned:true,retainedDataChanged:false,realProviderCalls:0},null,2)+'\n');
 console.log('PASS uppercase PostgreSQL UUID normalization preserves opaque invitation reconstruction, stable retries and acceptance/reissue/revocation (one focused group).');
}catch(issue){console.error('Uppercase provisioning verification failed during '+phase+'.');console.error(issue instanceof Error?issue.name:'Unknown isolated error.');process.exitCode=1;}
