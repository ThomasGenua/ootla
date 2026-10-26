import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {withConversationFixture} from './lib/conversation-fixture.js';
import {installLocalFixtureNetworkGuard} from './lib/local-network-guard.js';
import {seedResidentDemo} from '../server/services/resident-demo.js';
import {residentDemoEmail,residentDemoPassword,residentStaffDemoEmail} from '../server/services/resident-portal.js';
import {startAutomationWorker} from '../server/services/automation-worker.js';
import {startTaskReminderWorker} from '../server/services/tasks.js';
const network=installLocalFixtureNetworkGuard();
try{await withConversationFixture('browser',async f=>{
 await seedResidentDemo(f.database,f.config);
 const ids=(await f.database.query("SELECT rr.id AS relationship_id,rr.property_id,g.organization_id,g.user_id,m.id AS staff_membership_id FROM resident_access_grants g JOIN resident_relationships rr ON rr.id=g.relationship_id AND rr.organization_id=g.organization_id JOIN users u ON u.id=g.user_id AND u.email=$1 JOIN users own ON own.email=$2 JOIN organization_memberships m ON m.user_id=own.id AND m.organization_id=g.organization_id",[residentDemoEmail,residentStaffDemoEmail])).rows[0];assert(ids);
 const {base}=await f.startBrowser(),stopAutomation=startAutomationWorker(f.database,f.config),stopReminders=startTaskReminderWorker(f.database);
 try{
  const pending=promisify(execFile)(process.execPath,[path.join(f.root,'scripts/check-resident-operations-browser.mjs')],{cwd:f.root,windowsHide:true,timeout:360000,maxBuffer:1024*1024,env:{...process.env,OOTLA_CHECK_URL:base,OOTLA_CHECK_DATABASE:f.name,OOTLA_RESIDENT_CONTEXT:JSON.stringify({...ids,residentEmail:residentDemoEmail,residentPassword:residentDemoPassword,staffEmail:residentStaffDemoEmail,staffPassword:f.adminPassword})}});
  pending.child.stdout?.on('data',chunk=>process.stdout.write(chunk));const result=await pending;if(result.stderr)process.stderr.write(result.stderr);
  const requests=(await f.database.query('SELECT id,status,appointment_at FROM maintenance_requests WHERE organization_id=$1',[ids.organization_id])).rows;assert.equal(requests.length,1);assert.equal(requests[0].status,'assigned');assert.equal(requests[0].appointment_at,null);
  assert.equal(Number((await f.database.query('SELECT count(*) AS n FROM maintenance_files WHERE organization_id=$1',[ids.organization_id])).rows[0].n),1);
  assert.equal(Number((await f.database.query("SELECT count(*) AS n FROM task_creation_receipts WHERE organization_id=$1 AND namespace='automation'",[ids.organization_id])).rows[0].n),1);
  assert.equal((await f.database.query('SELECT status FROM applications WHERE id=$1',[f.applicationId])).rows[0].status,'draft');
  console.log('Verified one real assigned request, one private file, one native automation task receipt, no inferred appointment and unchanged separate applicant draft.');
 }finally{await stopAutomation();await stopReminders();}
 },{onLoopbackOrigin:network.allow});
}catch(issue){const child=issue as{stderr?:string};if(child.stderr)process.stderr.write(child.stderr);console.error('Isolated Stage 24 browser verification failed; credentials, capabilities and raw configuration are omitted.');process.exitCode=1;}finally{network.restore();}
