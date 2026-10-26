import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {withConversationFixture} from './lib/conversation-fixture.js';
try{
 await withConversationFixture('browser',async f=>{
  const{base}=await f.startBrowser();
  const pending=promisify(execFile)(process.execPath,[path.join(f.root,'scripts/check-conversations-browser.mjs')],{cwd:f.root,windowsHide:true,timeout:480000,maxBuffer:1024*1024,env:{...process.env,OOTLA_CHECK_URL:base,OOTLA_CHECK_DATABASE:f.name,OOTLA_CONVERSATION_CONTEXT:JSON.stringify({applicationId:f.applicationId,propertyId:f.propertyId,propertyName:f.propertyName,leadId:f.leadId,staffEmail:f.staffEmail,staffPassword:f.adminPassword,staffMembershipId:f.staffMembershipId})}});
  pending.child.stdout?.on('data',chunk=>process.stdout.write(chunk));const result=await pending;if(result.stderr)process.stderr.write(result.stderr);
  assert.equal(Number((await f.database.query("SELECT count(*) AS n FROM tasks WHERE organization_id=$1 AND title='Browser confirmed Ask follow-up 20'",[f.organizationId])).rows[0].n),1);
  assert.equal(Number((await f.database.query('SELECT count(*) AS n FROM application_documents WHERE organization_id=$1',[f.organizationId])).rows[0].n),0);
  assert.equal((await f.database.query('SELECT status FROM applications WHERE id=$1',[f.applicationId])).rows[0].status,'draft');
  assert.equal(Number((await f.database.query("SELECT count(*) AS n FROM viewings WHERE organization_id=$1 AND managed_by_ootla",[f.organizationId])).rows[0].n),1);
  console.log('Verified one confirmed assistant task and one native viewing, with unchanged draft application and no document uploads.');
 });
}catch(issue){const child=issue as{stdout?:string;stderr?:string};if(child.stderr)process.stderr.write(child.stderr);console.error('Isolated Stage 20 browser verification failed; passwords, bearer tokens and database configuration are omitted.');process.exitCode=1;}
