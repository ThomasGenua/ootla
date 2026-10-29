import {createHash,createHmac,randomUUID} from 'node:crypto';
import type {PoolClient,QueryResultRow} from 'pg';
import type {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import type {PaymentWorkspace,PaymentHandoff,DemoPaymentHandoff,PaymentDestinations,PaymentKnownStatus,paymentDestinationSchema,paymentActionSchema,paymentDemoConfirmSchema} from '../../shared/payment-contracts.js';
import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import {ApiError} from '../http/errors.js';
import {staffApplicationAccess,staffOrganizationAccess,applicantApplicationAccess,type ApplicationRow} from './application-access.js';
import type {ApplicantPrincipal} from './applicant-portal.js';
import {isIsolatedDemo,requireIsolatedDemo} from './demo-environment.js';
import {demoPaymentAdapter} from '../payments/demo.js';
type Row=QueryResultRow;
const iso=(v:unknown):string|null=>v?(v instanceof Date?v:new Date(String(v))).toISOString():null;
const hash=(v:unknown)=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const verificationSeconds=3600;
const demoNotice='Payment handoff simulation. This page collects no payment details and performs no charge, capture, refund or payment authorization. Only an explicit synthetic provider read can update the CRM status.';
/** Approval is an explicit organization-admin configuration, never a browser-supplied return URL. */
export function validateApprovedPaymentDestination(value:string):string{
 let url:URL;try{url=new URL(value);decodeURIComponent(url.pathname);}catch{throw new ApiError(400,'PAYMENT_DESTINATION_DENIED','Use an approved absolute HTTPS payment portal URL.');}
 const host=url.hostname.toLowerCase().replace(/\.$/,'');
 const parts=host.split('.'),octets=parts.map(p=>Number(p));
 const ip=parts.length===4&&parts.every(p=>/^\d{1,3}$/.test(p))&&octets.every(v=>v<=255);
 const privateIp=ip&&(octets[0]===0||octets[0]===10||octets[0]===127||octets[0]===169&&octets[1]===254||octets[0]===172&&octets[1]>=16&&octets[1]<=31||octets[0]===192&&octets[1]===168||octets[0]===100&&octets[1]>=64&&octets[1]<=127||octets[0]>=224);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.port&&url.port!=='443'||host.includes(':')||privateIp||host==='localhost'||!host.includes('.')||/\.(?:localhost|local|internal)$/.test(host)||!parts.every(p=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(p))||/[\u0000-\u0020\u007f\\]/.test(value)||decodeURIComponent(url.pathname).includes('@'))throw new ApiError(400,'PAYMENT_DESTINATION_DENIED','Use an approved public HTTPS portal without credentials, query parameters, fragments or private hosts.');
 return url.href;
}
export class PaymentService{
 constructor(private readonly database:Database,private readonly config:ServerConfig){}
 private async available(c:PoolClient,a:ApplicationRow):Promise<boolean>{return await isIsolatedDemo(this.config,c)&&Boolean((await c.query("SELECT id FROM organizations WHERE id=$1 AND environment='demo'",[a.organization_id])).rowCount);}
 private async demo(c:PoolClient,a:ApplicationRow):Promise<void>{await requireIsolatedDemo(this.config,c);if(!(await c.query("SELECT id FROM organizations WHERE id=$1 AND environment='demo' FOR SHARE",[a.organization_id])).rowCount)throw new ApiError(403,'DEMO_ENVIRONMENT_REQUIRED','This synthetic provider is limited to the isolated demo organization.');}
 private async event(c:PoolClient,a:ApplicationRow,actorId:string,actorKind:'staff'|'applicant',kind:string,summary:string,metadata:Record<string,unknown>):Promise<void>{
  await c.query('INSERT INTO application_portal_events(organization_id,application_id,actor_user_id,actor_kind,kind,summary,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)',[a.organization_id,a.id,actorId,actorKind,kind,summary,JSON.stringify(metadata)]);
  await c.query('INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,$3,$4)',[a.organization_id,actorId,'application.'+kind,JSON.stringify({applicationId:a.id,...metadata})]);
 }
 private async receipt(c:PoolClient,a:ApplicationRow,actorId:string,key:string,operation:string,payload:unknown,run:()=>Promise<Row>):Promise<Row>{
  const digest=hash(payload),prior=(await c.query('SELECT * FROM payment_action_receipts WHERE organization_id=$1 AND application_id=$2 AND request_key=$3',[a.organization_id,a.id,key])).rows[0];
  if(prior){if(prior.actor_user_id!==actorId||prior.operation!==operation||prior.payload_hash!==digest)throw new ApiError(409,'REQUEST_KEY_REUSED','Use a new request identifier for a different payment handoff action.');return prior.result;}
  const result=await run();await c.query('INSERT INTO payment_action_receipts(organization_id,application_id,request_key,actor_user_id,operation,payload_hash,result) VALUES($1,$2,$3,$4,$5,$6,$7)',[a.organization_id,a.id,key,actorId,operation,digest,JSON.stringify(result)]);return result;
 }
 private async reference(c:PoolClient,a:ApplicationRow,create=false):Promise<Row|null>{
  if(create)await c.query('INSERT INTO application_payment_references(organization_id,application_id,property_id,contact_id) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id,application_id) DO NOTHING',[a.organization_id,a.id,a.property_id,a.contact_id]);
  return(await c.query('SELECT *,EXTRACT(EPOCH FROM(clock_timestamp()-verified_at)) AS verification_age_seconds FROM application_payment_references WHERE organization_id=$1 AND application_id=$2 AND property_id=$3 AND contact_id=$4 FOR UPDATE',[a.organization_id,a.id,a.property_id,a.contact_id])).rows[0]??null;
 }
 private async destination(c:PoolClient,organizationId:string):Promise<Row|null>{const r=(await c.query('SELECT * FROM payment_destinations WHERE organization_id=$1 AND enabled',[organizationId])).rows[0];if(r)validateApprovedPaymentDestination(r.url);return r??null;}
 private async snapshot(c:PoolClient,a:ApplicationRow,applicant:boolean,admin:boolean):Promise<PaymentWorkspace>{
  const demo=await this.available(c,a),destination=demo?null:await this.destination(c,a.organization_id),r=await this.reference(c,a),lastKnownStatus=(r?.status??'unknown') as PaymentKnownStatus;
  // Verification is stamped by PostgreSQL; use that same clock to assess its age.
  const verifiedAt=iso(r?.verified_at),age=verifiedAt?Number(r!.verification_age_seconds):null,stale=age!==null&&(age>verificationSeconds||age<0);
  const status=stale||r&&!verifiedAt?'verification_needed':lastKnownStatus;
  return{applicationId:a.id,mode:demo?'demo':destination?'external':'not_configured',status,lastKnownStatus,source:r?.source==='ootla_payment_demo'?'Simulated existing payment provider':destination?'Configured external portal; verification not configured':'No verified payment source',verifiedAt,stale,notice:demo?demoNotice:destination?'An approved external portal is configured. Its documented status-read or authenticated callback interface is not configured; Ootla cannot verify a payment.':'Payment destination and status verification are not configured. No payment is assumed or collected.',destination:demo?{name:'Demonstration payment provider',configured:true}:destination?{name:destination.name,configured:true}:null,access:{canOpen:applicant&&['submitted','staff_review'].includes(a.status)&&Boolean(demo||destination),canVerify:demo&&Boolean(r),canConfigure:admin}};
 }
 async staffWorkspace(u:AuthUser,digest:string,id:string):Promise<PaymentWorkspace>{return this.database.transaction(async c=>{const{actor,application:a}=await staffApplicationAccess(c,this.config,u,digest,id);return this.snapshot(c,a,false,actor.organization.role==='organization_admin');});}
 async applicantWorkspace(u:ApplicantPrincipal,id:string):Promise<PaymentWorkspace>{return this.database.transaction(async c=>{const{application:a}=await applicantApplicationAccess(c,this.config,u,id);return this.snapshot(c,a,true,false);});}
 async destinations(u:AuthUser,digest:string):Promise<PaymentDestinations>{
  return this.database.transaction(async c=>{const actor=await staffOrganizationAccess(c,this.config,u,digest);if(actor.organization.role!=='organization_admin')throw new ApiError(403,'PAYMENT_ADMIN_REQUIRED','An organization administrator must manage approved payment destinations.');
   return this.destinationList(c,actor.organization.id);
  });
 }
 private async destinationList(c:PoolClient,organizationId:string):Promise<PaymentDestinations>{return{items:(await c.query('SELECT * FROM payment_destinations WHERE organization_id=$1',[organizationId])).rows.map(r=>({id:r.id,name:r.name,url:r.url,enabled:r.enabled,updatedAt:iso(r.updated_at)!})),liveVerificationConfigured:false,notice:'Only an approved HTTPS destination is configured here. Existing-provider status verification requires client documentation and authenticated read/callback access. Demo handoffs always remain local.'};}
 async saveDestination(u:AuthUser,digest:string,input:z.infer<typeof paymentDestinationSchema>):Promise<PaymentDestinations>{
  const url=validateApprovedPaymentDestination(input.url);
  return this.database.transaction(async c=>{
   const actor=await staffOrganizationAccess(c,this.config,u,digest);if(actor.organization.role!=='organization_admin')throw new ApiError(403,'PAYMENT_ADMIN_REQUIRED','An organization administrator must approve payment destinations.');
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ootla.payment.destination:'+actor.organization.id]);
   const payload=hash({name:input.name,url,enabled:input.enabled}),prior=(await c.query('SELECT * FROM payment_configuration_receipts WHERE organization_id=$1 AND request_key=$2',[actor.organization.id,input.requestKey])).rows[0];
   if(prior){if(prior.actor_user_id!==actor.id||prior.payload_hash!==payload)throw new ApiError(409,'REQUEST_KEY_REUSED','Use a new request identifier for a different destination configuration.');return this.destinationList(c,actor.organization.id);}
   const row=(await c.query('INSERT INTO payment_destinations(organization_id,name,url,enabled,created_by_user_id,updated_by_user_id) VALUES($1,$2,$3,$4,$5,$5) ON CONFLICT(organization_id) DO UPDATE SET name=EXCLUDED.name,url=EXCLUDED.url,enabled=EXCLUDED.enabled,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now() RETURNING id',[actor.organization.id,input.name,url,input.enabled,actor.id])).rows[0]!;
   await c.query('INSERT INTO payment_configuration_receipts(organization_id,request_key,actor_user_id,payload_hash,destination_id) VALUES($1,$2,$3,$4,$5)',[actor.organization.id,input.requestKey,actor.id,payload,row.id]);
   await c.query("INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,'payment.destination_configured',$3)",[actor.organization.id,actor.id,JSON.stringify({destinationId:row.id,enabled:input.enabled})]);
   return this.destinationList(c,actor.organization.id);
  });
 }
 private handoffToken(u:ApplicantPrincipal,a:ApplicationRow,participantId:string,key:string):string{return createHmac('sha256',this.config.sessionSecret).update('ootla.payment.handoff.v1:'+a.id+':'+participantId+':'+u.sessionDigest+':'+key).digest('hex');}
 async handoff(u:ApplicantPrincipal,id:string,input:z.infer<typeof paymentActionSchema>):Promise<PaymentHandoff>{
  return this.database.transaction(async c=>{
   const{application:a,participant:p}=await applicantApplicationAccess(c,this.config,u,id);
   if(!['submitted','staff_review'].includes(a.status))throw new ApiError(409,'APPLICATION_NOT_SUBMITTED','Submit this application before opening its configured payment handoff.');
   if(!await this.available(c,a)){
    const destination=await this.destination(c,a.organization_id);if(!destination)throw new ApiError(503,'PAYMENT_DESTINATION_NOT_CONFIGURED','An approved external payment portal has not been configured.');
    const result=await this.receipt(c,a,u.id,input.requestKey,'external_handoff',{participantId:p.id,sessionDigest:u.sessionDigest,destinationId:destination.id,destinationUrl:destination.url},async()=>({destinationId:destination.id}));
    if(result.destinationId!==destination.id)throw new ApiError(409,'PAYMENT_DESTINATION_CHANGED','The approved destination changed. Start a new handoff.');
    return{url:validateApprovedPaymentDestination(destination.url),mode:'external',expiresAt:null};
   }
   await this.demo(c,a);
   const token=this.handoffToken(u,a,p.id,input.requestKey),result=await this.receipt(c,a,u.id,input.requestKey,'demo_handoff',{participantId:p.id,sessionDigest:u.sessionDigest},async()=>{
    const reference=await this.reference(c,a,true);
    await c.query('INSERT INTO payment_demo_provider_records(organization_id,payment_reference_id) VALUES($1,$2) ON CONFLICT(payment_reference_id) DO NOTHING',[a.organization_id,reference!.id]);
    const row=(await c.query("INSERT INTO payment_handoffs(organization_id,payment_reference_id,application_id,participant_id,token_digest,user_id,session_digest,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()+interval '15 minutes') RETURNING id,expires_at",[a.organization_id,reference!.id,a.id,p.id,hash(token),u.id,u.sessionDigest])).rows[0]!;
    await this.event(c,a,u.id,'applicant','payment_demo_handoff_opened','An applicant opened an isolated demonstration payment-provider handoff. No payment details were collected.',{handoffId:row.id,simulated:true});
    return{handoffId:row.id,expiresAt:iso(row.expires_at)};
   });
   return{url:'/payment-demo#token='+token,mode:'demo',expiresAt:result.expiresAt};
  });
 }
 private async boundHandoff(c:PoolClient,u:ApplicantPrincipal,token:string):Promise<{a:ApplicationRow;handoff:Row}>{
  if(!/^[a-f0-9]{64}$/.test(token))throw new ApiError(410,'PAYMENT_HANDOFF_UNAVAILABLE','This handoff is unavailable or expired. Open a new handoff from your own application.');
  const h=(await c.query('SELECT * FROM payment_handoffs WHERE token_digest=$1 AND organization_id=$2 AND user_id=$3 AND session_digest=$4 AND expires_at>clock_timestamp() FOR SHARE',[hash(token),u.organization.id,u.id,u.sessionDigest])).rows[0];
  if(!h)throw new ApiError(410,'PAYMENT_HANDOFF_UNAVAILABLE','This handoff is unavailable or expired. Open a new handoff from your own application.');
  const{application:a,participant:p}=await applicantApplicationAccess(c,this.config,u,h.application_id);await this.demo(c,a);
  if(p.id!==h.participant_id)throw new ApiError(403,'PAYMENT_HANDOFF_ACCESS_DENIED','This handoff belongs to another authorized application participant.');
  const r=await this.reference(c,a);if(!r||r.id!==h.payment_reference_id)throw new ApiError(410,'PAYMENT_HANDOFF_UNAVAILABLE','The application payment context changed. Open a new handoff.');
  return{a,handoff:h};
 }
 private async demoView(c:PoolClient,a:ApplicationRow,h:Row):Promise<DemoPaymentHandoff>{
  const provider=(await c.query('SELECT status FROM payment_demo_provider_records WHERE organization_id=$1 AND payment_reference_id=$2',[a.organization_id,h.payment_reference_id])).rows[0];
  if(!provider)throw new ApiError(503,'PAYMENT_PROVIDER_UNAVAILABLE','The synthetic provider record is unavailable. No payment status was assumed.');
  return{mode:'demo',applicationId:a.id,status:provider.status,notice:demoNotice,returnUrl:'/applicant?application='+a.id,expiresAt:iso(h.expires_at)!};
 }
 async openDemo(u:ApplicantPrincipal,token:string):Promise<DemoPaymentHandoff>{return this.database.transaction(async c=>{const{a,handoff:h}=await this.boundHandoff(c,u,token);return this.demoView(c,a,h);});}
 async confirmDemo(u:ApplicantPrincipal,input:z.infer<typeof paymentDemoConfirmSchema>):Promise<DemoPaymentHandoff>{
  return this.database.transaction(async c=>{
   const{a,handoff:h}=await this.boundHandoff(c,u,input.token);
   await this.receipt(c,a,u.id,input.requestKey,'demo_provider_confirmation',{handoffId:h.id,sessionDigest:u.sessionDigest},async()=>{
    const provider=(await c.query('SELECT * FROM payment_demo_provider_records WHERE organization_id=$1 AND payment_reference_id=$2 FOR UPDATE',[a.organization_id,h.payment_reference_id])).rows[0];
    if(!provider)throw new ApiError(503,'PAYMENT_PROVIDER_UNAVAILABLE','The isolated provider record is unavailable.');
    if(provider.status==='confirmed')return{providerEventId:provider.latest_event_id};
    const eventId=randomUUID(),version=provider.version+1;
    await c.query("INSERT INTO payment_demo_provider_events(organization_id,payment_reference_id,provider_record_id,event_id,status,provider_version) VALUES($1,$2,$3,$4,'confirmed',$5)",[a.organization_id,h.payment_reference_id,provider.id,eventId,version]);
    await c.query("UPDATE payment_demo_provider_records SET status='confirmed',version=$2,latest_event_id=$3,updated_at=now() WHERE id=$1",[provider.id,version,eventId]);
    // Canonical application_payment_references is deliberately untouched by the provider browser confirmation.
    return{providerEventId:eventId};
   });
   return this.demoView(c,a,h);
  });
 }
 private async verify(c:PoolClient,a:ApplicationRow,actorId:string,actorKind:'staff'|'applicant',key:string,sessionDigest:string):Promise<void>{
  if(!await this.available(c,a))throw new ApiError(503,'PAYMENT_VERIFICATION_NOT_CONFIGURED','Provider status verification is not configured. A portal return or browser parameter cannot verify a payment.');
  await this.demo(c,a);
  await this.receipt(c,a,actorId,key,'verify',{sessionDigest},async()=>{
   const reference=await this.reference(c,a);
   if(!reference)throw new ApiError(409,'PAYMENT_SOURCE_UNAVAILABLE','Open the isolated provider handoff before verifying its source status.');
   const observation=await demoPaymentAdapter.read(c,a.organization_id,reference.id);
   if(!observation)throw new ApiError(503,'PAYMENT_SOURCE_UNAVAILABLE','The source record is unavailable or unverified. Ootla did not mark it confirmed.');
   if(observation.organizationId!==a.organization_id||observation.referenceId!==reference.id)throw new ApiError(403,'PAYMENT_SOURCE_SCOPE_DENIED','The provider record does not match this authorized application.');
   const payload=hash(observation),prior=(await c.query('SELECT payload_hash FROM payment_event_receipts WHERE payment_reference_id=$1 AND provider_version=$2',[reference.id,observation.version])).rows[0];
   if(prior&&prior.payload_hash!==payload)throw new ApiError(409,'PAYMENT_PROVIDER_EVENT_CONFLICT','The provider version changed without a new source version. Verification was refused.');
   if(!prior)await c.query('INSERT INTO payment_event_receipts(organization_id,payment_reference_id,provider,provider_version,event_id,payload_hash) VALUES($1,$2,$3,$4,$5,$6)',[a.organization_id,reference.id,demoPaymentAdapter.key,observation.version,observation.eventId,payload]);
   await c.query('UPDATE application_payment_references SET status=$2,source=$3,source_version=$4,verified_at=clock_timestamp(),last_provider_event_id=$5,updated_at=CASE WHEN source_version<>$4 THEN now() ELSE updated_at END WHERE id=$1',[reference.id,observation.status,demoPaymentAdapter.key,observation.version,observation.eventId]);
   if(!prior)await this.event(c,a,actorId,actorKind,'payment_demo_source_verified','Ootla read a controlled synthetic payment-provider record. This is simulated status evidence and no payment operation was performed.',{referenceId:reference.id,status:observation.status,providerVersion:observation.version,simulated:true});
   return{referenceId:reference.id,sourceVersion:observation.version};
  });
 }
 async staffVerify(u:AuthUser,digest:string,id:string,input:z.infer<typeof paymentActionSchema>):Promise<PaymentWorkspace>{return this.database.transaction(async c=>{const{actor,application:a}=await staffApplicationAccess(c,this.config,u,digest,id,{lock:true});await this.verify(c,a,actor.id,'staff',input.requestKey,digest);return this.snapshot(c,a,false,actor.organization.role==='organization_admin');});}
 async applicantVerify(u:ApplicantPrincipal,id:string,input:z.infer<typeof paymentActionSchema>):Promise<PaymentWorkspace>{return this.database.transaction(async c=>{const{application:a}=await applicantApplicationAccess(c,this.config,u,id);await this.verify(c,a,u.id,'applicant',input.requestKey,u.sessionDigest);return this.snapshot(c,a,true,false);});}
}
