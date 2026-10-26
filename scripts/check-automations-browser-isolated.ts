import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {withConversationFixture} from './lib/conversation-fixture.js';
import {startTaskReminderWorker} from '../server/services/tasks.js';
try{await withConversationFixture('browser',async f=>{
 const target=(await f.database.query("INSERT INTO leads(organization_id,property_id,display_name,email,status,intent,pipeline_stage,source,next_action,created_at) VALUES($1,$2,'Browser automation inquiry 21','','new','leasing','new_inquiry','website','Review the saved inquiry',now()-interval '2 hours') RETURNING id",[f.organizationId,f.propertyId])).rows[0]!;
 const {base}=await f.startBrowser(),stopReminders=startTaskReminderWorker(f.database);
 try{
  const pending=promisify(execFile)(process.execPath,[path.join(f.root,'scripts/check-automations-browser.mjs')],{cwd:f.root,windowsHide:true,timeout:480000,maxBuffer:1024*1024,env:{...process.env,OOTLA_CHECK_URL:base,OOTLA_CHECK_DATABASE:f.name,OOTLA_AUTOMATION_CONTEXT:JSON.stringify({applicationId:f.applicationId,propertyId:f.propertyId,propertyName:f.propertyName,leadId:target.id,staffEmail:f.staffEmail,staffPassword:f.adminPassword,staffMembershipId:f.staffMembershipId})}});
  pending.child.stdout?.on('data',chunk=>process.stdout.write(chunk));const result=await pending;if(result.stderr)process.stderr.write(result.stderr);
  assert.equal(Number((await f.database.query("SELECT count(*) AS n FROM task_creation_receipts WHERE organization_id=$1 AND namespace='automation'",[f.organizationId])).rows[0].n),1);
  assert.equal((await f.database.query('SELECT status FROM applications WHERE id=$1',[f.applicationId])).rows[0].status,'draft');
  assert.equal(Number((await f.database.query('SELECT count(*) AS n FROM application_documents WHERE organization_id=$1',[f.organizationId])).rows[0].n),0);
  console.log('Verified one native automation task receipt and unchanged draft applicant data in the owned browser database.');
 }finally{await stopReminders();}
});}catch(issue){const child=issue as{stderr?:string};if(child.stderr)process.stderr.write(child.stderr);console.error('Isolated Stage 21 browser verification failed; passwords, capabilities and raw database configuration are omitted.');process.exitCode=1;}
