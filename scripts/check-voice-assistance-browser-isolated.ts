import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {withConversationFixture} from './lib/conversation-fixture.js';
import {installLocalFixtureNetworkGuard} from './lib/local-network-guard.js';
const network=installLocalFixtureNetworkGuard();
try{await withConversationFixture('browser',async f=>{
 const {base}=await f.startBrowser();
 const pending=promisify(execFile)(process.execPath,[path.join(f.root,'scripts/check-voice-assistance-browser.mjs')],{cwd:f.root,windowsHide:true,timeout:360000,maxBuffer:1024*1024,env:{...process.env,OOTLA_CHECK_URL:base,OOTLA_CHECK_DATABASE:f.name,OOTLA_VOICE_CONTEXT:JSON.stringify({organizationId:f.organizationId,propertyId:f.propertyId,applicationId:f.applicationId,staffMembershipId:f.staffMembershipId,staffEmail:f.staffEmail,staffPassword:f.adminPassword,applicantEmail:f.applicantEmail,applicantPassword:f.applicantPassword})}});
 pending.child.stdout?.on('data',chunk=>process.stdout.write(chunk));const result=await pending;if(result.stderr)process.stderr.write(result.stderr);
 const booked=(await f.database.query("SELECT v.id FROM viewings v JOIN voice_sessions s ON s.lead_id=v.lead_id AND s.organization_id=v.organization_id WHERE s.organization_id=$1 AND v.status='scheduled'",[f.organizationId])).rows;assert.equal(booked.length,1);
 assert.equal((await f.database.query('SELECT status FROM applications WHERE id=$1',[f.applicationId])).rows[0].status,'draft');
 const raw=(await f.database.query("SELECT t.id FROM voice_transcripts t JOIN voice_sessions s ON s.id=t.session_id WHERE s.organization_id=$1 AND s.retention_days=0 AND (t.input_text IS NOT NULL OR t.output_text IS NOT NULL)",[f.organizationId])).rowCount;assert.equal(raw,0);
 assert.equal((await f.database.query('SELECT recording_enabled FROM organization_voice_settings WHERE organization_id=$1',[f.organizationId])).rows[0].recording_enabled,false);
 console.log('Verified one real native viewing, unchanged actual application draft, no zero-retention raw text and disabled audio recording.');
 },{onLoopbackOrigin:network.allow});
}catch(issue){const child=issue as{stderr?:string};if(child.stderr)process.stderr.write(child.stderr);console.error('Isolated Stage 25 browser verification failed; credentials, capabilities and raw configuration are omitted.');process.exitCode=1;}finally{network.restore();}
