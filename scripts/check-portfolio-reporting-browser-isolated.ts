import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {withConversationFixture} from './lib/conversation-fixture.js';
import {seedReportingFixture} from './lib/reporting-fixture.js';
try{await withConversationFixture('browser',async f=>{
 const sample=await seedReportingFixture(f),tables=['properties','units','contacts','leads','applications','tasks','viewings','leases','lease_verified_milestones','application_documents'];
 const snapshot=async()=>{const result:Record<string,string>={};for(const table of tables){assert(/^[a-z_]+$/.test(table));const rows=(await f.database.query('SELECT to_jsonb(t) AS row FROM '+table+' t ORDER BY id')).rows.map(r=>JSON.stringify(r.row));result[table]=createHash('sha256').update(JSON.stringify(rows)).digest('hex');}return result;};
 const before=await snapshot(),{base}=await f.startBrowser();
 const pending=promisify(execFile)(process.execPath,[path.join(f.root,'scripts/check-portfolio-reporting-browser.mjs')],{cwd:f.root,windowsHide:true,timeout:300000,maxBuffer:1024*1024,env:{...process.env,OOTLA_CHECK_URL:base,OOTLA_CHECK_DATABASE:f.name,OOTLA_REPORTING_CONTEXT:JSON.stringify({...sample,staffEmail:f.staffEmail,staffPassword:f.adminPassword,staffMembershipId:f.staffMembershipId})}});
 pending.child.stdout?.on('data',chunk=>process.stdout.write(chunk));const result=await pending;if(result.stderr)process.stderr.write(result.stderr);
 assert.deepEqual(await snapshot(),before);
 console.log('Verified unchanged CRM properties, units, identities, leads, applications, tasks, viewings, leases, synthetic evidence and private documents after report reads, export and Ask.');
});}catch(issue){const child=issue as{stderr?:string};if(child.stderr)process.stderr.write(child.stderr);console.error('Isolated Stage 23 browser verification failed; credentials and raw configuration are omitted.');process.exitCode=1;}
