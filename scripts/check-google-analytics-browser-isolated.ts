import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {withConversationFixture} from './lib/conversation-fixture.js';
try{await withConversationFixture('browser',async f=>{
 const tables=['properties','units','contacts','leads','applications','tasks','viewings','application_documents'];
 const snapshot=async()=>{const result:Record<string,string>={};for(const table of tables){assert(/^[a-z_]+$/.test(table));const rows=(await f.database.query('SELECT to_jsonb(t) AS row FROM '+table+' t ORDER BY id')).rows.map(r=>JSON.stringify(r.row));result[table]=createHash('sha256').update(JSON.stringify(rows)).digest('hex');}return result;};
 const before=await snapshot(),{base}=await f.startBrowser();
 const pending=promisify(execFile)(process.execPath,[path.join(f.root,'scripts/check-google-analytics-browser.mjs')],{cwd:f.root,windowsHide:true,timeout:240000,maxBuffer:1024*1024,env:{...process.env,OOTLA_CHECK_URL:base,OOTLA_CHECK_DATABASE:f.name,OOTLA_ANALYTICS_CONTEXT:JSON.stringify({propertyId:f.propertyId,propertyName:f.propertyName,staffEmail:f.staffEmail,staffPassword:f.adminPassword})}});
 pending.child.stdout?.on('data',chunk=>process.stdout.write(chunk));const result=await pending;if(result.stderr)process.stderr.write(result.stderr);
 assert.deepEqual(await snapshot(),before);
 const connection=(await f.database.query('SELECT mode,state,token_envelope FROM google_analytics_connections WHERE organization_id=$1',[f.organizationId])).rows[0];assert.equal(connection?.mode,'illustrative');assert.equal(connection?.state,'disconnected');assert.equal(connection?.token_envelope,null);
 console.log('Verified unchanged CRM property, unit, identity, lead, application, task, viewing and document records; no provider tokens were created.');
});}catch(issue){const child=issue as{stderr?:string};if(child.stderr)process.stderr.write(child.stderr);console.error('Isolated Stage 22 browser verification failed; credentials and raw configuration are omitted.');process.exitCode=1;}
