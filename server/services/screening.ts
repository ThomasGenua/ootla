import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PoolClient, QueryResultRow } from 'pg';
import type { z } from 'zod';
import type { AuthUser } from '../../shared/contracts.js';
import { screeningConsentVersion,screeningConsentText,screeningDemoCallbackSchema,type ScreeningConsent,type ScreeningWorkspace,type ScreeningRecord,type ScreeningStatus,type ApplicationDecisionRecord,type screeningRequestSchema,type screeningProcessSchema,type screeningActionSchema,type applicationDecisionSchema } from '../../shared/screening-contracts.js';
import type { ServerConfig } from '../config/env.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import type { ApplicantPrincipal } from './applicant-portal.js';
import { staffApplicationAccess,applicantApplicationAccess,isApplicationReviewer,type ApplicationRow } from './application-access.js';
import { demoScreeningAdapter } from '../screening/demo.js';
import { isIsolatedDemo,requireIsolatedDemo } from './demo-environment.js';
type Row=QueryResultRow;
const iso=(v:unknown):string|null=>v?(v instanceof Date?v:new Date(String(v))).toISOString():null;
const hash=(value:unknown):string=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const provider=demoScreeningAdapter.key;
const callbackNamespace='ootla.screening.demo.callback.v1:';
const policyMessage='Live screening requires an approved provider, client-supplied consent and notice wording, retention rules, authorized interfaces and server credentials. No eligibility thresholds or automated decisions are configured.';
const syntheticReport=demoScreeningAdapter.report();
/** Test/server adapter helper only. Never return this signature mechanism or server secrets to browsers. */
export function signScreeningDemoCallback(config:ServerConfig,body:Buffer,timestamp:string):string{return createHmac('sha256',config.sessionSecret).update(callbackNamespace+timestamp+':').update(body).digest('hex');}
export class ScreeningService{
 constructor(private readonly database:Database,private readonly config:ServerConfig){}
 private async demo(c:PoolClient,a:ApplicationRow):Promise<void>{
  await requireIsolatedDemo(this.config,c);
  if(!(await c.query("SELECT id FROM organizations WHERE id=$1 AND environment='demo' FOR SHARE",[a.organization_id])).rowCount)throw new ApiError(403,'DEMO_ENVIRONMENT_REQUIRED','Synthetic screening can update only an isolated demonstration organization.');
 }
 private async available(c:PoolClient,a:ApplicationRow):Promise<boolean>{return await isIsolatedDemo(this.config,c)&&Boolean((await c.query("SELECT id FROM organizations WHERE id=$1 AND environment='demo'",[a.organization_id])).rowCount);}
 private submitted(a:ApplicationRow):void{if(!['submitted','staff_review'].includes(a.status))throw new ApiError(409,'APPLICATION_NOT_SUBMITTED','Submit the application before requesting screening or recording its staff decision.');}
 private async event(c:PoolClient,a:ApplicationRow,actorId:string,kind:string,summary:string,metadata:Record<string,unknown>={},participantId:string|null=null,actorKind:'staff'|'applicant'='staff'):Promise<void>{
  await c.query('INSERT INTO application_portal_events(organization_id,application_id,participant_id,actor_user_id,actor_kind,kind,summary,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[a.organization_id,a.id,participantId,actorId,actorKind,kind,summary,JSON.stringify(metadata)]);
  await c.query('INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,$3,$4)',[a.organization_id,actorId,'application.'+kind,JSON.stringify({applicationId:a.id,participantId,...metadata})]);
 }
 private async receipt(c:PoolClient,a:ApplicationRow,u:AuthUser,key:string,operation:string,payload:unknown,run:()=>Promise<Row>):Promise<Row>{
  const digest=hash(payload),prior=(await c.query('SELECT * FROM screening_action_receipts WHERE organization_id=$1 AND application_id=$2 AND request_key=$3',[a.organization_id,a.id,key])).rows[0];
  if(prior){if(prior.operation!==operation||prior.payload_hash!==digest||prior.actor_user_id!==u.id)throw new ApiError(409,'REQUEST_KEY_REUSED','Use a new request identifier for a different screening action.');return prior.result;}
  const result=await run();
  await c.query('INSERT INTO screening_action_receipts(organization_id,application_id,actor_user_id,request_key,operation,payload_hash,result) VALUES($1,$2,$3,$4,$5,$6,$7)',[a.organization_id,a.id,u.id,key,operation,digest,JSON.stringify(result)]);
  return result;
 }
 async consent(user:ApplicantPrincipal,id:string,accept=false):Promise<ScreeningConsent>{
  return this.database.transaction(async c=>{
   const {application:a,participant:p}=await applicantApplicationAccess(c,this.config,user,id),configured=await this.available(c,a);
   if(accept){
    if(!configured)throw new ApiError(503,'SCREENING_NOT_CONFIGURED','An approved live provider and its consent wording have not been configured.');
    const existing=(await c.query('SELECT revoked_at FROM screening_consents WHERE organization_id=$1 AND application_id=$2 AND participant_id=$3 AND purpose=$4 AND version=$5',[a.organization_id,a.id,p.id,'screening',screeningConsentVersion])).rows[0];
    if(existing?.revoked_at)throw new ApiError(409,'SCREENING_CONSENT_REVOKED','Ask staff to configure a new consent request; a revoked consent cannot be silently restored.');
    const inserted=await c.query("INSERT INTO screening_consents(organization_id,application_id,participant_id,purpose,version,consent_text,actor_user_id) VALUES($1,$2,$3,'screening',$4,$5,$6) ON CONFLICT(participant_id,purpose,version) DO NOTHING RETURNING id",[a.organization_id,a.id,p.id,screeningConsentVersion,screeningConsentText,user.id]);
    if(inserted.rowCount)await this.event(c,a,user.id,'screening_consent_recorded','An applicant recorded separate, versioned consent for an isolated synthetic screening.',{purpose:'screening',version:screeningConsentVersion,simulated:true},p.id,'applicant');
   }
   const r=(await c.query("SELECT accepted_at FROM screening_consents WHERE organization_id=$1 AND application_id=$2 AND participant_id=$3 AND purpose='screening' AND version=$4 AND revoked_at IS NULL",[a.organization_id,a.id,p.id,screeningConsentVersion])).rows[0];
   return{purpose:'screening',version:screeningConsentVersion,text:configured?screeningConsentText:'Screening is not configured. Authorized provider consent wording is required before a live request.',acceptedAt:iso(r?.accepted_at),configured};
  });
 }
 private async snapshot(c:PoolClient,u:AuthUser,a:ApplicationRow):Promise<ScreeningWorkspace>{
  const demo=await this.available(c,a),review=isApplicationReviewer(u.organization.role),submitted=['submitted','staff_review'].includes(a.status);
  const people=(await c.query("SELECT ap.id,ap.role,co.display_name,sc.accepted_at,sr.id AS screening_id,sr.status FROM application_participants ap JOIN contacts co ON co.id=ap.contact_id AND co.organization_id=ap.organization_id LEFT JOIN screening_consents sc ON sc.participant_id=ap.id AND sc.application_id=ap.application_id AND sc.organization_id=ap.organization_id AND sc.purpose='screening' AND sc.version=$3 AND sc.revoked_at IS NULL LEFT JOIN screening_requests sr ON sr.participant_id=ap.id AND sr.application_id=ap.application_id AND sr.organization_id=ap.organization_id WHERE ap.application_id=$1 AND ap.organization_id=$2 AND ap.active AND ap.property_id=$4 AND (ap.role='primary' AND ap.contact_id=$5 OR ap.role='co_applicant' AND $6) AND EXISTS(SELECT 1 FROM contact_property_links cp WHERE cp.contact_id=ap.contact_id AND cp.organization_id=ap.organization_id AND cp.property_id=ap.property_id) ORDER BY ap.role DESC,ap.created_at,ap.id",[a.id,a.organization_id,screeningConsentVersion,a.property_id,a.contact_id,a.co_applicants_enabled])).rows;
  const rows=(await c.query('SELECT sr.*,j.attempts,j.next_attempt_at,j.error_code,j.status AS job_status,EXISTS(SELECT 1 FROM screening_reports r WHERE r.organization_id=sr.organization_id AND r.screening_id=sr.id) AS report_available FROM screening_requests sr JOIN screening_jobs j ON j.screening_id=sr.id AND j.organization_id=sr.organization_id WHERE sr.organization_id=$1 AND sr.application_id=$2 ORDER BY sr.created_at,sr.id',[a.organization_id,a.id])).rows;
  const screenings:ScreeningRecord[]=rows.map(r=>({id:r.id,participantId:r.participant_id,status:r.status,attempts:r.attempts,maxAttempts:3,nextAttemptAt:r.job_status==='completed'?null:iso(r.next_attempt_at),error:r.error_code?'The synthetic provider is temporarily unavailable. Retry after the displayed time.':null,createdAt:iso(r.created_at)!,updatedAt:iso(r.updated_at)!,reportAvailable:r.report_available,reportUrl:r.report_available&&review?'/api/application-journey/'+a.id+'/screening/'+r.id+'/report':null,reviewedAt:iso(r.reviewed_at),providerRequestId:r.provider_request_id}));
  const participants=people.map(r=>({id:r.id,name:r.display_name,role:r.role as 'primary'|'co_applicant',consentAcceptedAt:iso(r.accepted_at),screeningId:r.screening_id??null,status:(r.status??(r.accepted_at?'ready_to_submit':'consent_required')) as ScreeningStatus}));
  const priority:ScreeningStatus[]=['failed','consent_required','ready_to_submit','submitted','provider_reviewing','report_received','staff_review_pending'];
  const status=priority.find(s=>participants.some(p=>p.status===s))??'consent_required';
  const decisions:ApplicationDecisionRecord[]=review?(await c.query('SELECT d.id,d.decision,d.reason,d.created_at,u.display_name FROM application_decisions d JOIN users u ON u.id=d.actor_user_id WHERE d.organization_id=$1 AND d.application_id=$2 ORDER BY d.created_at DESC,d.id LIMIT 50',[a.organization_id,a.id])).rows.map(r=>({id:r.id,decision:r.decision,reason:r.reason,actorName:r.display_name,createdAt:iso(r.created_at)!})):[];
  return{applicationId:a.id,mode:demo?'demo':'not_configured',status,notice:demo?'Isolated synthetic screening. No live search, score, eligibility rule or AI decision. Staff review remains separate.':'Screening provider not configured. No live screening requests can be sent.',participants,screenings,decisions,access:{canRequest:demo&&submitted,canProcess:demo&&submitted,canReview:review&&submitted,canDecide:review&&submitted,canReadReports:review},policy:{noticesConfigured:false,retentionConfigured:false,message:policyMessage}};
 }
 async workspace(u:AuthUser,digest:string,id:string):Promise<ScreeningWorkspace>{return this.database.transaction(async c=>{const {actor,application:a}=await staffApplicationAccess(c,this.config,u,digest,id);return this.snapshot(c,actor,a);});}
 async request(u:AuthUser,digest:string,id:string,input:z.infer<typeof screeningRequestSchema>):Promise<ScreeningWorkspace>{
  await this.database.transaction(async c=>{
   const {actor,application:a}=await staffApplicationAccess(c,this.config,u,digest,id,{lock:true});this.submitted(a);await this.demo(c,a);
   await this.receipt(c,a,actor,input.requestKey,'request',{participantId:input.participantId},async()=>{
    const p=(await c.query("SELECT ap.* FROM application_participants ap WHERE ap.id=$1 AND ap.application_id=$2 AND ap.organization_id=$3 AND ap.active AND ap.user_id IS NOT NULL AND ap.property_id=$4 AND (ap.role='primary' AND ap.contact_id=$5 OR ap.role='co_applicant' AND $6) AND EXISTS(SELECT 1 FROM contact_property_links cp WHERE cp.contact_id=ap.contact_id AND cp.organization_id=ap.organization_id AND cp.property_id=ap.property_id) FOR SHARE",[input.participantId,a.id,a.organization_id,a.property_id,a.contact_id,a.co_applicants_enabled])).rows[0];
    if(!p)throw new ApiError(404,'APPLICANT_NOT_FOUND','Choose an active authorized participant on this application.');
    const consent=(await c.query("SELECT id FROM screening_consents WHERE organization_id=$1 AND application_id=$2 AND participant_id=$3 AND actor_user_id=$4 AND purpose='screening' AND version=$5 AND revoked_at IS NULL FOR SHARE",[a.organization_id,a.id,p.id,p.user_id,screeningConsentVersion])).rows[0];
    if(!consent)throw new ApiError(409,'SCREENING_CONSENT_REQUIRED','The applicant must record the required separate purpose-specific screening consent.');
    const existing=(await c.query('SELECT id FROM screening_requests WHERE organization_id=$1 AND application_id=$2 AND participant_id=$3',[a.organization_id,a.id,p.id])).rows[0];if(existing)return{screeningId:existing.id};
    const sr=(await c.query("INSERT INTO screening_requests(organization_id,application_id,participant_id,consent_id,provider,status,requested_by_user_id,requested_by_membership_id) VALUES($1,$2,$3,$4,$5,'submitted',$6,$7) RETURNING *",[a.organization_id,a.id,p.id,consent.id,provider,actor.id,actor.membershipId])).rows[0];
    await c.query('INSERT INTO screening_jobs(organization_id,screening_id,requested_by_user_id,requested_by_membership_id) VALUES($1,$2,$3,$4)',[a.organization_id,sr.id,actor.id,actor.membershipId]);
    await c.query("INSERT INTO screening_demo_provider_records(provider_request_id,organization_id,screening_id,status) VALUES($1,$2,$3,'submitted')",[sr.provider_request_id,a.organization_id,sr.id]);
    await this.event(c,a,actor.id,'screening_submitted','Authorized staff queued an isolated synthetic screening. No live provider request was sent.',{screeningId:sr.id,simulated:true},p.id);
    return{screeningId:sr.id};
   });
  });return this.workspace(u,digest,id);
 }
 private verifyCallback(body:Buffer,timestamp:string,signature:string):z.infer<typeof screeningDemoCallbackSchema>{
  if(!Buffer.isBuffer(body)||body.length<2||body.length>8192||!/^\d{10}$/.test(timestamp)||Math.abs(Date.now()/1000-Number(timestamp))>300||!/^[a-f0-9]{64}$/.test(signature))throw new ApiError(401,'SCREENING_CALLBACK_INVALID','The synthetic callback verification failed.');
  const expected=Buffer.from(signScreeningDemoCallback(this.config,body,timestamp),'hex'),actual=Buffer.from(signature,'hex');
  if(!timingSafeEqual(expected,actual))throw new ApiError(401,'SCREENING_CALLBACK_INVALID','The synthetic callback verification failed.');
  try{const parsed=screeningDemoCallbackSchema.safeParse(JSON.parse(body.toString('utf8')));if(parsed.success)return parsed.data;}catch{}
  throw new ApiError(400,'SCREENING_CALLBACK_INVALID','The synthetic callback payload is invalid.');
 }
 private async applyEvent(c:PoolClient,a:ApplicationRow,event:z.infer<typeof screeningDemoCallbackSchema>,bodyHash:string,actorId:string):Promise<{duplicate:boolean}>{
  const prior=(await c.query('SELECT * FROM screening_event_receipts WHERE provider=$1 AND event_id=$2',[provider,event.eventId])).rows[0];
  if(prior){if(prior.payload_hash!==bodyHash||prior.organization_id!==a.organization_id||prior.screening_id!==event.screeningId)throw new ApiError(409,'SCREENING_EVENT_CONFLICT','This callback identifier was already used for a different event.');return{duplicate:true};}
  const sr=(await c.query('SELECT sr.*,sc.revoked_at FROM screening_requests sr JOIN screening_consents sc ON sc.id=sr.consent_id AND sc.organization_id=sr.organization_id WHERE sr.id=$1 AND sr.organization_id=$2 AND sr.application_id=$3 AND sr.provider=$4 AND sr.provider_request_id=$5 FOR UPDATE OF sr',[event.screeningId,a.organization_id,a.id,provider,event.providerRequestId])).rows[0];
  if(!sr||sr.revoked_at)throw new ApiError(409,'SCREENING_EVENT_UNAVAILABLE','This synthetic request is unavailable or its consent was revoked.');
  const current=sr.status,expected=event.status==='provider_reviewing'?'submitted':'provider_reviewing';
  if(current!==expected)throw new ApiError(409,'SCREENING_EVENT_OUT_OF_ORDER','This synthetic event does not follow the current screening state.');
  const pr=(await c.query('SELECT * FROM screening_demo_provider_records WHERE provider_request_id=$1 AND organization_id=$2 AND screening_id=$3 FOR UPDATE',[event.providerRequestId,a.organization_id,sr.id])).rows[0];
  if(!pr||pr.status!==expected)throw new ApiError(409,'SCREENING_PROVIDER_CONFLICT','The synthetic provider state does not match this event.');
  await c.query('UPDATE screening_demo_provider_records SET status=$2,version=version+1,report_content=CASE WHEN $2=\'report_received\' THEN $3 ELSE report_content END,updated_at=now() WHERE provider_request_id=$1',[pr.provider_request_id,event.status,event.status==='report_received'?syntheticReport:null]);
  if(event.status==='report_received')await c.query('INSERT INTO screening_reports(organization_id,screening_id,content,sha256) VALUES($1,$2,$3,$4) ON CONFLICT(screening_id) DO NOTHING',[a.organization_id,sr.id,syntheticReport,hash(syntheticReport.toString('utf8'))]);
  await c.query('INSERT INTO screening_event_receipts(organization_id,screening_id,provider,event_id,payload_hash) VALUES($1,$2,$3,$4,$5)',[a.organization_id,sr.id,provider,event.eventId,bodyHash]);
  await c.query('UPDATE screening_requests SET status=$2,updated_at=now() WHERE id=$1',[sr.id,event.status]);
  await c.query("UPDATE screening_jobs SET status='waiting',resume_status=$2,error_code=NULL,next_attempt_at=now(),updated_at=now() WHERE screening_id=$1",[sr.id,event.status]);
  await this.event(c,a,actorId,'screening_'+event.status,event.status==='report_received'?'An isolated synthetic screening report was received. Report contents are restricted to authorized reviewers.':'The isolated synthetic screening provider is reviewing the demonstration request.',{screeningId:sr.id,providerEventId:event.eventId,simulated:true},sr.participant_id);
  return{duplicate:false};
 }
 async acceptDemoCallback(body:Buffer,timestamp:string,signature:string):Promise<{accepted:true;duplicate:boolean}>{
  const event=this.verifyCallback(body,timestamp,signature);
  return this.database.transaction(async c=>{
   const a=(await c.query<ApplicationRow>('SELECT a.* FROM applications a JOIN screening_requests sr ON sr.application_id=a.id AND sr.organization_id=a.organization_id WHERE sr.id=$1 AND a.organization_id=$2 FOR UPDATE OF a',[event.screeningId,event.organizationId])).rows[0];
   if(!a)throw new ApiError(404,'SCREENING_NOT_FOUND','The synthetic screening request is unavailable.');await this.demo(c,a);
   const sr=(await c.query('SELECT requested_by_user_id FROM screening_requests WHERE id=$1 AND organization_id=$2',[event.screeningId,event.organizationId])).rows[0]!;
   const result=await this.applyEvent(c,a,event,hash(body.toString('utf8')),sr.requested_by_user_id);
   return{accepted:true,...result};
  });
 }
 async process(u:AuthUser,digest:string,id:string,input:z.infer<typeof screeningProcessSchema>):Promise<ScreeningWorkspace>{
  await this.database.transaction(async c=>{
   const {actor,application:a}=await staffApplicationAccess(c,this.config,u,digest,id,{lock:true});this.submitted(a);await this.demo(c,a);
   await this.receipt(c,a,actor,input.requestKey,'process',{simulateFailure:input.simulateFailure},async()=>{
    const job=(await c.query("SELECT j.*,sr.status AS screening_status,sr.participant_id,sr.provider_request_id FROM screening_jobs j JOIN screening_requests sr ON sr.id=j.screening_id AND sr.organization_id=j.organization_id WHERE sr.application_id=$1 AND sr.organization_id=$2 AND j.status IN ('queued','waiting') AND j.next_attempt_at<=clock_timestamp() ORDER BY j.created_at,j.id LIMIT 1 FOR UPDATE OF j,sr",[a.id,a.organization_id])).rows[0];
    if(!job)throw new ApiError(409,'SCREENING_NO_READY_JOB','No screening job is ready. Check consent, the current status and the retry time.');
    if(input.simulateFailure){
     const attempts=job.attempts+1;
     if(attempts>3)throw new ApiError(409,'SCREENING_RETRIES_EXHAUSTED','The synthetic request reached its bounded retry limit.');
     await c.query("UPDATE screening_jobs SET status='failed',attempts=$2,resume_status=$3,error_code='SIMULATED_PROVIDER_UNAVAILABLE',next_attempt_at=clock_timestamp()+($4*interval '1 second'),updated_at=now() WHERE id=$1",[job.id,attempts,job.screening_status,10*2**(attempts-1)]);
     await c.query("UPDATE screening_requests SET status='failed',updated_at=now() WHERE id=$1",[job.screening_id]);
     await this.event(c,a,actor.id,'screening_failed','The synthetic provider temporarily failed. The request remains saved with a bounded retry time.',{screeningId:job.screening_id,attempts,simulated:true},job.participant_id);
     return{screeningId:job.screening_id,status:'failed'};
    }
    if(job.screening_status==='report_received'){
     await c.query("UPDATE screening_requests SET status='staff_review_pending',updated_at=now() WHERE id=$1",[job.screening_id]);
     await c.query("UPDATE screening_jobs SET status='completed',error_code=NULL,updated_at=now() WHERE id=$1",[job.id]);
     await this.event(c,a,actor.id,'screening_staff_review_pending','The demonstration report is awaiting authorized staff review. Screening is separate from the application decision.',{screeningId:job.screening_id,simulated:true},job.participant_id);
    }else{
     const event={eventId:randomUUID(),organizationId:a.organization_id,screeningId:job.screening_id,providerRequestId:job.provider_request_id,status:demoScreeningAdapter.nextStatus(job.screening_status)};
     const raw=Buffer.from(JSON.stringify(event));
     await this.applyEvent(c,a,event,hash(raw.toString('utf8')),actor.id);
    }
    return{screeningId:job.screening_id};
   });
  });return this.workspace(u,digest,id);
 }
 async retry(u:AuthUser,digest:string,id:string,input:z.infer<typeof screeningActionSchema>):Promise<ScreeningWorkspace>{
  await this.database.transaction(async c=>{
   const {actor,application:a}=await staffApplicationAccess(c,this.config,u,digest,id,{lock:true});this.submitted(a);await this.demo(c,a);
   await this.receipt(c,a,actor,input.requestKey,'retry',{},async()=>{
    const job=(await c.query("SELECT j.* FROM screening_jobs j JOIN screening_requests sr ON sr.id=j.screening_id AND sr.organization_id=j.organization_id WHERE sr.organization_id=$1 AND sr.application_id=$2 AND j.status='failed' ORDER BY j.created_at,j.id LIMIT 1 FOR UPDATE OF j,sr",[a.organization_id,a.id])).rows[0];
    if(!job)throw new ApiError(409,'SCREENING_NO_FAILED_JOB','No failed screening request is available to retry.');
    if(job.attempts>=3)throw new ApiError(409,'SCREENING_RETRIES_EXHAUSTED','The screening request reached its bounded retry limit.');
    if(new Date(job.next_attempt_at).getTime()>Date.now())throw new ApiError(409,'SCREENING_RETRY_NOT_DUE','Wait until the stored retry time before retrying.');
    await c.query("UPDATE screening_jobs SET status='queued',error_code=NULL,updated_at=now() WHERE id=$1",[job.id]);
    await c.query('UPDATE screening_requests SET status=$2,updated_at=now() WHERE id=$1',[job.screening_id,job.resume_status]);
    await this.event(c,a,actor.id,'screening_retry_queued','Authorized staff queued a retry of the same synthetic screening request.',{screeningId:job.screening_id,simulated:true});
    return{screeningId:job.screening_id};
   });
  });return this.workspace(u,digest,id);
 }
 async review(u:AuthUser,digest:string,id:string,input:z.infer<typeof screeningActionSchema>):Promise<ScreeningWorkspace>{
  await this.database.transaction(async c=>{
   const {actor,application:a}=await staffApplicationAccess(c,this.config,u,digest,id,{lock:true,review:true});this.submitted(a);
   await this.receipt(c,a,actor,input.requestKey,'review',{},async()=>{
    const rows=(await c.query("SELECT sr.* FROM screening_requests sr WHERE sr.organization_id=$1 AND sr.application_id=$2 AND sr.status='staff_review_pending' AND EXISTS(SELECT 1 FROM screening_reports r WHERE r.screening_id=sr.id AND r.organization_id=sr.organization_id) FOR UPDATE",[a.organization_id,a.id])).rows;
    if(!rows.length)throw new ApiError(409,'SCREENING_REPORT_NOT_READY','Wait for a received report to reach staff review pending.');
    for(const sr of rows)if(!sr.reviewed_at){
     await c.query('UPDATE screening_requests SET reviewed_at=now(),reviewed_by_user_id=$2,updated_at=now() WHERE id=$1',[sr.id,actor.id]);
     await this.event(c,a,actor.id,'screening_review_recorded','An authorized staff reviewer acknowledged reviewing the isolated synthetic report. No application decision was made automatically.',{screeningId:sr.id,simulated:true},sr.participant_id);
    }
    return{reviewed:rows.length};
   });
  });return this.workspace(u,digest,id);
 }
 async decision(u:AuthUser,digest:string,id:string,input:z.infer<typeof applicationDecisionSchema>):Promise<ScreeningWorkspace>{
  await this.database.transaction(async c=>{
   const {actor,application:a}=await staffApplicationAccess(c,this.config,u,digest,id,{lock:true,review:true});this.submitted(a);
   await this.receipt(c,a,actor,input.requestKey,'decision',{decision:input.decision,reason:input.reason},async()=>{
    if(['approved','declined'].includes(input.decision)&&(await c.query("SELECT id FROM screening_requests WHERE organization_id=$1 AND application_id=$2 AND (status<>'staff_review_pending' OR reviewed_at IS NULL) LIMIT 1",[a.organization_id,a.id])).rowCount)throw new ApiError(409,'SCREENING_REVIEW_REQUIRED','Review every requested screening report before recording this application decision.');
    const record=(await c.query('INSERT INTO application_decisions(organization_id,application_id,decision,reason,actor_user_id,actor_membership_id,request_key) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[a.organization_id,a.id,input.decision,input.reason,actor.id,actor.membershipId,input.requestKey])).rows[0]!;
    await this.event(c,a,actor.id,'staff_application_decision','Authorized staff recorded an application decision. Screening and payment status remain separate.',{decisionId:record.id,decision:input.decision,source:'authorized_staff'});
    return{decisionId:record.id};
   });
  });return this.workspace(u,digest,id);
 }
 async report(u:AuthUser,digest:string,id:string,screeningId:string):Promise<{content:Buffer;name:string;mediaType:'text/plain'}>{
  return this.database.transaction(async c=>{
   const {actor,application:a}=await staffApplicationAccess(c,this.config,u,digest,id,{review:true});
   const r=(await c.query('SELECT r.content FROM screening_reports r JOIN screening_requests sr ON sr.id=r.screening_id AND sr.organization_id=r.organization_id WHERE r.organization_id=$1 AND sr.application_id=$2 AND sr.id=$3',[a.organization_id,a.id,screeningId])).rows[0];
   if(!r)throw new ApiError(404,'SCREENING_REPORT_NOT_FOUND','This report is unavailable in the authorized application.');
   await c.query("INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,'screening.report_downloaded',$3)",[a.organization_id,actor.id,JSON.stringify({applicationId:a.id,screeningId})]);
   return{content:r.content,name:'ootla-synthetic-screening-'+screeningId+'.txt',mediaType:'text/plain'};
  });
 }
}
