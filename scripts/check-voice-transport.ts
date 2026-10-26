import assert from 'node:assert/strict';
import {transcriptPlaybackRecognition as recognition,transcriptPlaybackOutput as output,disabledTelephonyProvider as provider} from '../server/voice/adapter.js';
import {installLocalFixtureNetworkGuard} from './lib/local-network-guard.js';
const guard=installLocalFixtureNetworkGuard();
try{
 assert.deepEqual(await recognition.recognize({kind:'transcript',text:'  What are the office hours?  '}),{status:'recognized',text:'What are the office hours?',mode:'transcript_playback'});
 assert.equal((await recognition.recognize({kind:'transcript',text:'  '})).status,'no_input');
 assert.equal((await recognition.recognize({kind:'transcript',text:'x'.repeat(1501)})).status,'unclear');
 assert.equal((await recognition.recognize({kind:'transcript',text:'unsafe\u0000input'})).status,'unclear');
 console.log('PASS synthetic transcript input is explicit, bounded and validated; no microphone or speech-recognition claim is made');
 for(const [kind,status]of [['silence','no_input'],['unclear','unclear'],['interruption','interrupted'],['timeout','timed_out'],['provider_failure','unavailable']] as const){const result=await recognition.recognize({kind});assert.equal(result.status,status);assert.equal(result.text,null);assert.equal(result.mode,kind==='provider_failure'?'not_configured':'transcript_playback');}
 console.log('PASS silence, unclear input, interruptions, timeouts and provider unavailability remain distinct normalized states without invented recognized text');
 const rendered=await output.speak('Synthetic reply.');assert.equal(rendered.mode,'text_playback');assert.equal(rendered.text,'Synthetic reply.');assert.equal(rendered.audioCreated,false);
 assert.equal(provider.configured,false);assert(Object.values(provider.capabilities).every(value=>value===false));assert.equal(await provider.authenticateCallback(),false);const transfer=await provider.request();assert.equal(transfer.state,'not_configured');assert.equal(transfer.confirmed,false);assert.match(transfer.reason,/No call or transfer was attempted/);
 await assert.rejects(()=>fetch('https://api.twilio.com/'),/Unexpected network request prevented/);
 console.log('PASS local output creates no audio; unavailable telephony cannot authenticate callbacks, place/receive/record calls or claim a successful transfer');
 console.log('Stage 25 voice transport verification passed (3 no-network groups).');
}finally{guard.restore();}
