import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {withConversationFixture} from './lib/conversation-fixture.js';
import {installLocalFixtureNetworkGuard} from './lib/local-network-guard.js';
const network=installLocalFixtureNetworkGuard();
try{await withConversationFixture('browser',async f=>{
 const snapshot=async()=>{const out:Record<string,string>={};for(const table of ['applications','leases','application_documents','application_consents','lease_verified_milestones'])out[table]=createHash('sha256').update(JSON.stringify((await f.database.query('SELECT to_jsonb(t) AS row FROM '+table+' t ORDER BY t.id')).rows)).digest('hex');return out;},before=await snapshot();
 const {base}=await f.startBrowser(),pending=promisify(execFile)(process.execPath,[path.join(f.root,'scripts/check-organization-administration-browser.mjs')],{cwd:f.root,windowsHide:true,timeout:360000,maxBuffer:1024*1024,env:{...process.env,OOTLA_CHECK_URL:base,OOTLA_CHECK_DATABASE:f.name,OOTLA_ADMINISTRATION_CONTEXT:JSON.stringify({organizationId:f.organizationId,propertyId:f.propertyId,restrictedPropertyId:f.restrictedPropertyId,propertyName:f.propertyName,staffEmail:f.staffEmail,staffPassword:f.adminPassword,staffUserId:f.staffUserId,staffMembershipId:f.staffMembershipId,agentEmail:f.staff[0]!.email,agentUserId:f.staff[0]!.userId,agentMembershipId:f.staff[0]!.membershipId,agentPassword:f.staffPassword})}});
 pending.child.stdout?.on('data',chunk=>process.stdout.write(chunk));const result=await pending;if(result.stderr)process.stderr.write(result.stderr);assert.deepEqual(await snapshot(),before);
 assert.equal(Number((await f.database.query("SELECT count(*) AS n FROM retention_runs WHERE organization_id=$1",[f.organizationId])).rows[0].n),0);
 console.log('Verified application, lease and applicant-document records were preserved; browser previews did not execute cleanup.');
 },{onLoopbackOrigin:network.allow});}catch(issue){const child=issue as{stderr?:string};if(child.stderr)process.stderr.write(child.stderr);console.error('Isolated Stage 26 browser verification failed; credentials and raw configuration are omitted.');process.exitCode=1;}finally{network.restore();}
