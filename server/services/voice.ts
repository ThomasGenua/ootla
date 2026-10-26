import {assertAiCapability} from './organization-policy.js';
import type {PoolClient,QueryResultRow} from 'pg';
import type {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import type {VoiceDetail,voiceStartSchema,voiceEventSchema,voiceVerifySchema,voiceBookSchema,voiceSlotsSchema} from '../../shared/voice-contracts.js';
import type {Database} from '../db/pool.js';
import type {ServerConfig} from '../config/env.js';
import {ApiError} from '../http/errors.js';
import {requireIsolatedDemo} from './demo-environment.js';
import {VoiceAdministration,voiceHash} from './voice-admin.js';
import {voiceAccess,voiceApplicantProof} from './voice-access.js';
import {voiceDetail,voiceManager} from './voice-core.js';
import {Conversations,publicConversationChannelAccess,type VoiceConversationOutcome} from './conversations.js';
import {AiOrchestrationService} from './ai-orchestration.js';
import {SimulatedAiAdapter} from '../ai/simulated.js';
import type {ApplicantPrincipal} from './applicant-portal.js';
import {applicantApplicationAccess,staffApplicationAccess} from './application-access.js';
import {transcriptPlaybackRecognition,transcriptPlaybackOutput,disabledTelephonyProvider,type VoiceSpeechRecognition,type VoiceSpeechOutput,type VoiceStaffTransfer} from '../voice/adapter.js';
export {purgeVoiceTranscripts} from './voice-retention.js';
type Claim={actor:AuthUser;session:QueryResultRow;policy:QueryResultRow;replay:boolean;result:QueryResultRow};
type Reply={text:string;outcome:VoiceConversationOutcome;status:string;private?:boolean;recognition?:string;dialogue?:string;tool?:string;handoff?:string};
export class VoiceService extends VoiceAdministration{
 private recognition:VoiceSpeechRecognition;private output:VoiceSpeechOutput;private transfer:VoiceStaffTransfer;
 constructor(db:Database,config:ServerConfig,deps:{recognition?:VoiceSpeechRecognition;output?:VoiceSpeechOutput;transfer?:VoiceStaffTransfer}={}){super(db,config);this.recognition=deps.recognition??transcriptPlaybackRecognition;this.output=deps.output??transcriptPlaybackOutput;this.transfer=deps.transfer??disabledTelephonyProvider;}
 private async controls(c:PoolClient,a:AuthUser,r:QueryResultRow,p:QueryResultRow):Promise<void>{
  await requireIsolatedDemo(this.config,c);await assertAiCapability(c,this.config,a.organization.id);if(a.id!==r.started_by_user_id&&!voiceManager(a))throw new ApiError(403,'VOICE_CONTROL_DENIED','Only the initiating staff member or an authorized manager can operate this local session.');
  if(!p.enabled)throw new ApiError(409,'VOICE_DISABLED','Voice assistance is disabled. An organization administrator must deliberately enable the isolated local simulator.');
  if(!['active','interrupted'].includes(r.status)||r.ownership!=='ai_active')throw new ApiError(409,'VOICE_SESSION_ENDED','Automated voice work is paused or ended; use the staff conversation workspace.');
  if(new Date(r.expires_at).getTime()<=Date.now()||new Date(r.last_event_at).getTime()<=Date.now()-300000)throw new ApiError(410,'VOICE_SESSION_EXPIRED','This local session expired or timed out. Start a new session.');
  if(r.policy_version!==p.version)throw new ApiError(409,'VOICE_POLICY_CHANGED','Voice settings changed. Start a new session under the current approved policy.');
 }
 async detail(u:AuthUser,digest:string,id:string,p={page:1,pageSize:25}):Promise<VoiceDetail>{return this.db.transaction(c=>voiceDetail(c,this.config,u,digest,id,p));}
 async start(u:AuthUser,digest:string,i:z.infer<typeof voiceStartSchema>):Promise<VoiceDetail>{
  const hash=voiceHash(i),ready=await this.db.transaction(async c=>{
   await this.lock(c,u.organization.id);const a=await this.actor(c,u,digest);await requireIsolatedDemo(this.config,c);await assertAiCapability(c,this.config,a.organization.id);const p=await this.policy(c,a.organization.id);
   const existing=(await c.query('SELECT id,payload_hash,started_by_user_id FROM voice_sessions WHERE organization_id=$1 AND request_key=$2',[a.organization.id,i.requestKey])).rows[0];if(existing){if(existing.payload_hash!==hash||existing.started_by_user_id!==a.id)throw new ApiError(409,'VOICE_REQUEST_CONFLICT','Use a new identifier for a different voice session.');await voiceAccess(c,this.config,a,digest,existing.id);return{id:existing.id};}
   if(!p.enabled)throw new ApiError(409,'VOICE_DISABLED','An organization administrator must deliberately enable the isolated transcript-playback simulator.');
   if(p.consent_required&&!i.consentAccepted)throw new ApiError(400,'VOICE_CONSENT_REQUIRED','Acknowledge the configured approved client notice before starting. No audio recording is enabled.');
   const{channel}=await publicConversationChannelAccess(c,this.config,i.channelId);if(channel.organization_id!==a.organization.id||!(await c.query("SELECT p.id FROM properties p WHERE p.id=$1 AND p.organization_id=$2 AND ($3='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=p.organization_id AND pa.property_id=p.id AND pa.membership_id=$4)) FOR SHARE OF p",[channel.property_id,a.organization.id,a.organization.role,a.membershipId])).rowCount)throw new ApiError(404,'VOICE_CHANNEL_UNAVAILABLE','Choose a published property channel in your current organization and property access.');
   return{policyVersion:p.version};
  });if(ready.id)return this.detail(u,digest,ready.id);
  const cv=await new Conversations(this.db,this.config,new SimulatedAiAdapter()).startVoice(u,digest,{requestKey:i.requestKey,channelId:i.channelId,name:i.name});
  const id=await this.db.transaction(async c=>{
   await this.lock(c,u.organization.id);const a=await this.actor(c,u,digest),p=await this.policy(c,a.organization.id);await requireIsolatedDemo(this.config,c);await assertAiCapability(c,this.config,a.organization.id);
   const prior=(await c.query('SELECT id,payload_hash,started_by_user_id FROM voice_sessions WHERE organization_id=$1 AND request_key=$2',[a.organization.id,i.requestKey])).rows[0];if(prior){if(prior.payload_hash!==hash||prior.started_by_user_id!==a.id)throw new ApiError(409,'VOICE_REQUEST_CONFLICT','The session identifier is already used.');return prior.id as string;}
   if(!p.enabled||p.version!==ready.policyVersion)throw new ApiError(409,'VOICE_POLICY_CHANGED','The inquiry was saved, but voice settings changed before the session started. Review the current policy and restart.');
   return(await c.query("WITH stamp AS MATERIALIZED(SELECT clock_timestamp() AS at) INSERT INTO voice_sessions(organization_id,property_id,conversation_id,lead_id,contact_id,started_by_user_id,started_by_membership_id,request_key,payload_hash,scenario,policy_version,retention_days,consent_accepted,started_at,last_event_at,expires_at) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,stamp.at,stamp.at,stamp.at+interval '30 minutes' FROM stamp RETURNING id",[a.organization.id,cv.propertyId,cv.conversationId,cv.leadId,cv.contactId,a.id,a.membershipId,i.requestKey,hash,i.scenario,p.version,p.retention_days,i.consentAccepted])).rows[0].id as string;
  });return this.detail(u,digest,id);
 }
 private async claim(u:AuthUser,digest:string,id:string,key:string,operation:string,payload:unknown,interrupt=false):Promise<Claim>{return this.db.transaction(async c=>{
  await this.lock(c,u.organization.id);const{actor:a,session:r}=await voiceAccess(c,this.config,u,digest,id,true),p=await this.policy(c,a.organization.id),hash=voiceHash(payload);
  const prior=(await c.query('SELECT * FROM voice_action_receipts WHERE organization_id=$1 AND session_id=$2 AND request_key=$3',[a.organization.id,id,key])).rows[0];if(prior){if(prior.actor_user_id!==a.id||prior.operation!==operation||prior.payload_hash!==hash)throw new ApiError(409,'VOICE_CALLBACK_CONFLICT','This callback identifier was already used for different input.');return{actor:a,session:r,policy:p,replay:true,result:prior.result};}
  await this.controls(c,a,r,p);
  const recent=Number((await c.query("SELECT count(*) AS total FROM voice_action_receipts WHERE organization_id=$1 AND created_at>clock_timestamp()-interval '1 minute'",[a.organization.id])).rows[0].total);if(recent>=60)throw new ApiError(429,'VOICE_RATE_LIMIT','The organization local voice callback limit was reached. Wait before another simulation action.');
  if(interrupt&&(await c.query("SELECT 1 FROM voice_action_receipts WHERE organization_id=$1 AND session_id=$2 AND operation='book' AND state='processing' LIMIT 1",[a.organization.id,id])).rowCount)throw new ApiError(409,'VOICE_BOOKING_IN_PROGRESS','A native booking confirmation is being checked. Wait for its saved outcome before another local interruption.');
  if(!interrupt&&(await c.query("SELECT 1 FROM voice_action_receipts WHERE organization_id=$1 AND session_id=$2 AND state='processing' LIMIT 1",[a.organization.id,id])).rowCount)throw new ApiError(409,'VOICE_BUSY','A bounded voice step is already running. You may interrupt it or wait for its outcome.');
  if(interrupt){await c.query("UPDATE voice_sessions SET generation=generation+1,status='interrupted',last_event_at=clock_timestamp() WHERE id=$1",[id]);r.generation++;}
  await c.query("INSERT INTO voice_action_receipts(organization_id,session_id,request_key,actor_user_id,operation,payload_hash,state) VALUES($1,$2,$3,$4,$5,$6,'processing')",[a.organization.id,id,key,a.id,operation,hash]);return{actor:a,session:r,policy:p,replay:false,result:{}};
 });}
 private async replay(u:AuthUser,digest:string,id:string,key:string,claim:Claim):Promise<VoiceDetail>{
  const outcome=claim.result.outcome as VoiceConversationOutcome|undefined;if(outcome)await new Conversations(this.db,this.config).appendVoiceOutcome(u,digest,claim.session.conversation_id,key,outcome);
  const detail=await this.detail(u,digest,id);detail.lastOutput='This callback was already processed or is still running. No action was repeated; inspect the saved session and native calendar outcome.';return detail;
 }
 private async finish(u:AuthUser,digest:string,id:string,key:string,claim:Claim,kind:string,input:string|undefined,reply:Reply):Promise<VoiceDetail>{
  const result=await this.db.transaction(async c=>{
   await this.lock(c,u.organization.id);const{actor:a,session:r}=await voiceAccess(c,this.config,u,digest,id,true),policy=await this.policy(c,a.organization.id);
   let actual=reply;
   if(reply.outcome!=='viewing_booked'&&(r.generation!==claim.session.generation||!policy.enabled||r.policy_version!==policy.version))actual={text:'The pending local response was cancelled after interruption or a voice policy change. No new automated response is confirmed.',outcome:'interrupted',status:r.status,recognition:'interrupted',dialogue:'cancelled',tool:'not_executed'};
   else if(r.ownership!=='ai_active'&&!['handoff_requested','transfer_failed','viewing_booked'].includes(reply.outcome))actual={text:'Staff has taken responsibility. Automated voice replies and tools are paused.',outcome:'handoff_requested',status:'awaiting_staff',recognition:'interrupted',dialogue:'cancelled',tool:'not_executed'};
   if(reply.outcome!=='viewing_booked'){try{await assertAiCapability(c,this.config,a.organization.id,'native_read',actual.private?'application_checklist':undefined);}catch{actual={text:'The organization assistant policy changed. Automated guidance is paused; use the authorized staff workspace.',outcome:'interrupted',status:'interrupted',dialogue:'cancelled',tool:'not_executed'};}}
   if(actual.private&&!await voiceApplicantProof(c,this.config,a,digest,r))actual={text:'The applicant portal verification is no longer current. Sign in to the portal before requesting private next steps.',outcome:'question_answered',status:'active',recognition:'recognized',dialogue:'verification_required',tool:'not_executed'};
   // A deletion during recognition/dialogue suppresses this in-flight turn; later deliberate turns use the current policy.
   const deletedDuringStep=Boolean(r.transcript_deleted_at_key&&r.transcript_deleted_at_key!==claim.session.transcript_deleted_at_key);
   const retain=deletedDuringStep?0:Math.min(r.retention_days,policy.retention_days),expires=retain>0?new Date(Date.now()+retain*86400000).toISOString():null;
   await c.query("INSERT INTO voice_transcripts(organization_id,session_id,request_key,kind,input_text,output_text,private,recognition,dialogue,tool,output_state,handoff,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'text_playback',$11,$12) ON CONFLICT(session_id,request_key) DO NOTHING",[a.organization.id,id,key,kind,retain>0?input??null:null,retain>0?actual.text.slice(0,6000):null,actual.private??false,actual.recognition??'recognized',actual.dialogue??'completed',actual.tool??'not_requested',actual.handoff??'not_requested',expires]);
   const summaries:Record<string,string>={started:'Local transcript-playback session started.',question_answered:'Approved public or verified portal guidance was handled locally; no private details are copied to the CRM summary.',viewing_requested:'Viewing options were requested; no viewing is booked.',viewing_booked:'The native calendar confirmed a viewing.',application_guidance:'Verified applicant next-step guidance was provided; private details remain restricted.',handoff_requested:'Staff assistance was requested in Ootla; no phone transfer is confirmed.',transfer_failed:'A staff transfer could not be confirmed; no telephone connection exists.',provider_failed:'Provider failure was simulated; no real call was attempted.',interrupted:'Local dialogue was interrupted; stale output was suppressed.',timed_out:'The local session timed out.',ended:'The local transcript simulation ended.',slot_unavailable:'The requested slot could not be booked; no viewing is confirmed.'};
   const terminal=!['active','interrupted'].includes(actual.status);
   await c.query("UPDATE voice_sessions SET status=$2,outcome=$3,summary=$4,last_event_at=clock_timestamp(),ended_at=CASE WHEN $5 THEN COALESCE(ended_at,clock_timestamp()) ELSE ended_at END WHERE id=$1",[id,actual.status,actual.outcome,summaries[actual.outcome],terminal]);
   await c.query("UPDATE voice_action_receipts SET state=$4,result=$5 WHERE organization_id=$1 AND session_id=$2 AND request_key=$3",[a.organization.id,id,key,['provider_failed','transfer_failed','slot_unavailable'].includes(actual.outcome)?'failed':'completed',JSON.stringify({outcome:actual.outcome})]);return actual;
  });
  await new Conversations(this.db,this.config).appendVoiceOutcome(u,digest,claim.session.conversation_id,key,result.outcome);
  const detail=await this.detail(u,digest,id);const spoken=await this.output.speak(result.text);detail.lastOutput=spoken.text;return detail;
 }
 private async requestStaff(u:AuthUser,digest:string,r:QueryResultRow,key:string,failed=false):Promise<Reply>{
  await new Conversations(this.db,this.config).ownership(u,digest,r.conversation_id,{requestKey:key,ownership:'staff_requested'});
  const transfer=await this.transfer.request();return{text:failed?'A telephone transfer could not be confirmed. Staff assistance was requested in the Ootla conversation workspace; no call was placed.':'Staff assistance was requested in Ootla. '+transfer.reason,outcome:failed?'transfer_failed':'handoff_requested',status:'awaiting_staff',tool:'staff_request_saved',handoff:'not_configured'};
 }
 async event(u:AuthUser,digest:string,id:string,i:z.infer<typeof voiceEventSchema>):Promise<VoiceDetail>{
  const interrupt=['interruption','timeout','provider_failure','end'].includes(i.kind),claim=await this.claim(u,digest,id,i.requestKey,'event',{kind:i.kind,text:i.text??null},interrupt);if(claim.replay)return this.replay(u,digest,id,i.requestKey,claim);
  let reply:Reply;
  try{
   if(i.kind==='end')reply={text:'The local transcript-playback session ended. No call or recording existed.',outcome:'ended',status:'completed'};
   else if(i.kind==='slot_unavailable')reply={text:'This simulates an unavailable viewing slot. No booking was attempted or confirmed. Choose a current native slot to try a real demo booking.',outcome:'slot_unavailable',status:'active',tool:'not_executed'};
   else if(i.kind==='failed_transfer')reply=await this.requestStaff(u,digest,claim.session,i.requestKey,true);
   else if(i.kind==='repeat')reply={text:'Please rephrase the question or select viewing options or staff assistance. Transcript retention may be off, so past private speech is not reconstructed.',outcome:'question_answered',status:'active',dialogue:'clarification'};
   else{
    const recognition=await this.recognition.recognize({kind:i.kind,text:i.text});
    if(recognition.status==='interrupted')reply={text:'The local assistant paused. A new synthetic transcript can resume the session; old pending output is cancelled.',outcome:'interrupted',status:'interrupted',recognition:'interrupted',dialogue:'cancelled'};
    else if(recognition.status==='timed_out')reply={text:'The local session timed out. Start a new simulation when ready. No call or staff transfer occurred.',outcome:'timed_out',status:'timed_out',recognition:'timed_out'};
    else if(recognition.status==='unavailable')reply={text:'A speech-provider failure was simulated. No live provider is configured and no call was attempted.',outcome:'provider_failed',status:'failed',recognition:'unavailable',dialogue:'not_executed'};
    else if(recognition.status==='no_input'||recognition.status==='unclear'){
     const repeated=await this.db.transaction(async c=>Number((await c.query('SELECT count(*) AS total FROM(SELECT kind FROM voice_transcripts WHERE session_id=$1 ORDER BY created_at DESC,id DESC LIMIT 2)t WHERE kind=$2',[id,i.kind])).rows[0].total));
     reply=repeated>=2?await this.requestStaff(u,digest,claim.session,i.requestKey):{text:recognition.status==='no_input'?'No input was received. Please enter another synthetic transcript or request staff assistance.':'The synthetic input was unclear. Please rephrase it; no booking or private action occurred.',outcome:'question_answered',status:'active',recognition:recognition.status,dialogue:'clarification'};
    }else{
     const text=recognition.text??'',privateQuestion=claim.session.scenario==='application_next_steps'||/application|documents?|checklist|my account|private|screening|resident|payment/i.test(text);
     if(/\b(?:charge|refund|capture|authorize payment|approve applicant|reject applicant|sign (?:a |the )?lease)\b/i.test(text))reply={text:'Payment authorization, charges, refunds, applicant decisions and lease signatures are not available voice tools. Use the approved provider or authorized staff workflow.',outcome:'question_answered',status:'active',tool:'denied'};
     else if(privateQuestion){
      reply=await this.db.transaction(async c=>{const{actor:a,session:r}=await voiceAccess(c,this.config,u,digest,id);await assertAiCapability(c,this.config,a.organization.id,'native_read','application_checklist');const proof=await voiceApplicantProof(c,this.config,a,digest,r);if(!proof)return{text:'For private application next steps, sign in to the applicant portal and explicitly verify that session. A name or email is not identity verification. Staff can help with general next steps.',outcome:'question_answered',status:'active',dialogue:'verification_required',tool:'not_executed'} as Reply;
       const missing=Number((await c.query('SELECT count(*) AS total FROM application_checklist_items ci WHERE ci.organization_id=$1 AND ci.application_id=$2 AND ci.active AND ci.required AND NOT EXISTS(SELECT 1 FROM application_documents d WHERE d.organization_id=ci.organization_id AND d.application_id=ci.application_id AND d.checklist_item_id=ci.id AND d.participant_id=$3)',[r.organization_id,proof.application.id,proof.participant.id])).rows[0].total);
       return{text:'Your authorized application is '+proof.application.status.replaceAll('_',' ')+'. '+missing+' required checklist items for your own participant record are outstanding. Review the secure applicant portal for details. Staff review remains required; the assistant does not approve or reject applicants.',outcome:'application_guidance',status:'active',private:true,tool:'authorized_applicant_read'} as Reply;
      });
     }else if(claim.session.scenario==='staff_handoff'||/\b(?:staff|human|agent|transfer)\b/i.test(text))reply=await this.requestStaff(u,digest,claim.session,i.requestKey);
     else if(claim.session.scenario==='viewing_enquiry'||/\b(?:viewing|tour|visit|book|slot)\b/i.test(text))reply={text:'Use the current native viewing slots and explicitly confirm a time. Your viewing is booked only after the calendar successfully saves and confirms it. No viewing has been booked by this reply.',outcome:'viewing_requested',status:'active',tool:'slot_selection_required'};
     else{
      const repeated=await this.db.transaction(async c=>Number((await c.query("SELECT count(*) AS total FROM(SELECT payload_hash FROM voice_action_receipts WHERE session_id=$1 AND operation='event' AND state='completed' ORDER BY created_at DESC LIMIT 2)t WHERE payload_hash=$2",[id,voiceHash({kind:i.kind,text:i.text??null})])).rows[0].total));
      if(repeated>=2)reply=await this.requestStaff(u,digest,claim.session,i.requestKey);
      else{
       const publisher=await this.db.transaction(c=>publicConversationChannelAccess(c,this.config,claim.session.channel_id)),local:ServerConfig={...this.config,ai:{...this.config.ai,provider:'simulated',apiKey:'',model:''}};
       const normalized=/office|hours|opening|closing/i.test(text)?'What are the approved office hours for this property?':/parking/i.test(text)?'What is the approved parking guidance for this property?':/pets?/i.test(text)?'What is the approved pet policy for this property?':/availab|vacan|bedroom|units?/i.test(text)?'What availability is verified for this property?':/rent|pricing|cost|budget/i.test(text)?'What approved rental pricing guidance is recorded for this property?':'What is the approved public property guidance?';
       const hash=voiceHash({voiceSession:id,event:i.requestKey}),requestKey=hash.slice(0,8)+'-'+hash.slice(8,12)+'-4'+hash.slice(13,16)+'-a'+hash.slice(17,20)+'-'+hash.slice(20,32);
       const answer=await new AiOrchestrationService(this.db,local,new SimulatedAiAdapter()).publicReply(publisher.actor,publisher.channel.id,{requestKey,propertyId:claim.session.property_id,message:normalized});
       reply={text:answer.response,outcome:'question_answered',status:'active',tool:'approved_public_knowledge',dialogue:answer.executionStatus};
      }
     }
    }
   }
  }catch(e){if(e instanceof ApiError&&[401,403,404].includes(e.status))throw e;reply={text:'This local step could not be completed. No booking, phone transfer or provider action is confirmed. Use the native workspace or ask staff.',outcome:'provider_failed',status:'failed',dialogue:'failed',tool:'not_confirmed'};}
  return this.finish(u,digest,id,i.requestKey,claim,i.kind,i.text,reply);
 }
 async verify(u:AuthUser,digest:string,id:string,i:z.infer<typeof voiceVerifySchema>,applicant:ApplicantPrincipal|null):Promise<VoiceDetail>{
  if(!applicant)throw new ApiError(401,'VOICE_APPLICANT_VERIFICATION_REQUIRED','Sign in through the actual applicant portal first. Staff credentials, caller names and email addresses are not applicant proof.');
  if(applicant.organization.id!==u.organization.id)throw new ApiError(404,'VOICE_APPLICATION_UNAVAILABLE','The signed-in applicant must belong to this staff organization.');
  await this.db.transaction(async c=>{const{actor:a,session:r}=await voiceAccess(c,this.config,u,digest,id),own=await applicantApplicationAccess(c,this.config,applicant,i.applicationId),staff=await staffApplicationAccess(c,this.config,a,digest,i.applicationId,{permission:'leasing.manage'});if(own.application.organization_id!==r.organization_id||own.application.property_id!==r.property_id||staff.application.property_id!==r.property_id)throw new ApiError(404,'VOICE_APPLICATION_UNAVAILABLE','The verified applicant record must belong to this voice property.');});
  const claim=await this.claim(u,digest,id,i.requestKey,'verify',{applicationId:i.applicationId});if(claim.replay)return this.replay(u,digest,id,i.requestKey,claim);
  await this.db.transaction(async c=>{
   await this.lock(c,u.organization.id);const{actor:a,session:r}=await voiceAccess(c,this.config,u,digest,id,true),own=await applicantApplicationAccess(c,this.config,applicant,i.applicationId),staff=await staffApplicationAccess(c,this.config,a,digest,i.applicationId,{permission:'leasing.manage'});
   if(own.application.organization_id!==r.organization_id||own.application.property_id!==r.property_id||staff.application.property_id!==r.property_id)throw new ApiError(404,'VOICE_APPLICATION_UNAVAILABLE','The verified applicant record must belong to this authorized property and organization.');
   await c.query('UPDATE voice_sessions SET verified_application_id=$2,verified_applicant_user_id=$3,verified_participant_id=$4,verified_applicant_session_digest=$5,last_event_at=clock_timestamp() WHERE id=$1',[id,i.applicationId,applicant.id,own.participant.id,applicant.sessionDigest]);
   await c.query("UPDATE voice_action_receipts SET state='completed',result='{}'::jsonb WHERE organization_id=$1 AND session_id=$2 AND request_key=$3",[a.organization.id,id,i.requestKey]);
   await c.query("INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,'voice.applicant_session_verified',$3)",[a.organization.id,a.id,JSON.stringify({voiceSessionId:id})]);
  });const detail=await this.detail(u,digest,id);detail.lastOutput='The signed-in applicant portal session was verified for its own authorized record. Private next steps are checked again on every turn.';return detail;
 }
 async slots(u:AuthUser,digest:string,id:string,i:z.infer<typeof voiceSlotsSchema>){
  const r=await this.db.transaction(async c=>{const{actor:a,session:r}=await voiceAccess(c,this.config,u,digest,id);await this.controls(c,a,r,await this.policy(c,a.organization.id));return r;});return new Conversations(this.db,this.config).voiceSlots(u,digest,r.conversation_id,i);
 }
 async book(u:AuthUser,digest:string,id:string,i:z.infer<typeof voiceBookSchema>):Promise<VoiceDetail>{
  const claim=await this.claim(u,digest,id,i.requestKey,'book',{startsAt:i.startsAt,slotKey:i.slotKey});if(claim.replay)return this.replay(u,digest,id,i.requestKey,claim);
  let reply:Reply;try{const result=await new Conversations(this.db,this.config).voiceBook(u,digest,claim.session.conversation_id,i);reply={text:'Your viewing is booked for '+result.startsAt+' ('+result.timeZone+'). The native calendar confirmed it. Notifications remain simulated; no real calendar invitation was sent.',outcome:'viewing_booked',status:'completed',tool:'native_calendar_confirmed'};}catch(e){if(e instanceof ApiError&&[401,403,404].includes(e.status))throw e;reply={text:'The viewing could not be booked. That slot may be unavailable or the booking configuration changed. No viewing is confirmed by this action; refresh current native slots before trying again.',outcome:'slot_unavailable',status:'active',tool:'native_calendar_failed'};}
  return this.finish(u,digest,id,i.requestKey,claim,'booking',undefined,reply);
 }
 async deleteTranscript(u:AuthUser,digest:string,id:string,key:string):Promise<VoiceDetail>{
  await this.db.transaction(async c=>{await this.lock(c,u.organization.id);const{actor:a}=await voiceAccess(c,this.config,u,digest,id,true);if(!voiceManager(a))throw new ApiError(403,'VOICE_TRANSCRIPT_DENIED','Only an authorized organization administrator or property manager can remove retained transcripts.');
   const prior=(await c.query('SELECT operation,actor_user_id FROM voice_action_receipts WHERE organization_id=$1 AND session_id=$2 AND request_key=$3',[a.organization.id,id,key])).rows[0];if(prior){if(prior.operation!=='delete_transcript'||prior.actor_user_id!==a.id)throw new ApiError(409,'VOICE_CALLBACK_CONFLICT','Use a new transcript deletion request identifier.');return;}
   await c.query('UPDATE voice_transcripts SET input_text=NULL,output_text=NULL WHERE organization_id=$1 AND session_id=$2',[a.organization.id,id]);await c.query('UPDATE voice_sessions SET transcript_deleted_at=clock_timestamp() WHERE id=$1',[id]);await c.query("INSERT INTO voice_action_receipts(organization_id,session_id,request_key,actor_user_id,operation,payload_hash,state) VALUES($1,$2,$3,$4,'delete_transcript',$5,'completed')",[a.organization.id,id,key,a.id,voiceHash({delete:true})]);await c.query("INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,'voice.transcript_deleted',$3)",[a.organization.id,a.id,JSON.stringify({voiceSessionId:id})]);
  });return this.detail(u,digest,id);
 }
}
