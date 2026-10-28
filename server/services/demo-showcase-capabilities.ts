import {createHash,createHmac} from 'node:crypto';
import type {Request,Response} from 'express';
import type {AuthUser} from '../../shared/contracts.js';
import {automationCreateSchema} from '../../shared/automation-contracts.js';
import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import {ApiError} from '../http/errors.js';
import {sessionCookieName} from '../http/session-cookies.js';
import {requireIsolatedDemo} from './demo-environment.js';
import {SessionService} from './sessions.js';
import {seedConversationDemo} from './conversation-demo.js';
import {Connectors} from './connectors.js';
import {GoogleAnalyticsService} from './google-analytics.js';
import {AiOrchestrationService} from './ai-orchestration.js';
import {AskOotlaService} from './ask-ootla.js';
import {Conversations} from './conversations.js';
import {Automations} from './automations.js';
import {VoiceService} from './voice.js';
import {ScreeningService} from './screening.js';
import {PaymentService} from './payments.js';
import {LeaseWorkflowService} from './lease-workflow.js';

export interface DemoShowcaseActor{user:AuthUser;digest:string}
export interface DemoCapabilityPreparation{
 organizationId:string;changedRecords:number;propertyChatUrl:string;
 connector:{state:string;initialSyncQueued:boolean};analytics:'illustrative'|'preserved';
 voice:'transcript_playback'|'preserved';conversations:number;privateAssistantThreads:number;automationRules:number;
 applicationJourney:{applicationsChecked:number;screeningDemoAvailable:boolean;paymentHandoffDemoAvailable:boolean;leaseDemoAvailable:boolean;leaseSettingsConfigured:boolean;applicantConsentRequired:true;staffApprovalRequired:true};
 externalActions:'none';
}
/** Stable action identifiers let the ordinary service receipts prevent duplicate synthetic actions. */
function key(org:string,name:string):string{
 const b=createHash('sha256').update('ootla.demo.showcase.capabilities.v1:'+org+':'+name).digest().subarray(0,16);
 b[6]=(b[6]!&15)|80;b[8]=(b[8]!&63)|128;
 const h=b.toString('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
}
const receiptDataset='demo.showcase.capabilities.v1';
const countedTables=['ai_knowledge','conversation_channels','customer_conversations','conversation_messages','conversation_outbox','ask_threads','ask_messages','automation_rules','automation_jobs','organization_voice_settings','voice_sessions','voice_transcripts','connector_connections','connector_jobs','connector_demo_records','connector_demo_events','google_analytics_connections','organization_lease_settings'] as const;
async function recordCount(db:Database,org:string):Promise<number>{
 const sql='SELECT '+countedTables.map(t=>'(SELECT count(*) FROM '+t+' WHERE organization_id=$1)').join('+')+' AS total';
 return Number((await db.query(sql,[org])).rows[0]?.total??0);
}
/** Command-only setup, never imported by application startup. Existing staff configuration wins. */
export async function prepareDemoCapabilities(db:Database,config:ServerConfig,providedActor?:DemoShowcaseActor):Promise<DemoCapabilityPreparation>{
 await db.requireReady();await requireIsolatedDemo(config,db);
 if(config.ai.provider!=='simulated'||config.googleCalendar.enabled||config.googleAnalytics.enabled||config.integrationsMode!=='simulation'||config.outboundMode!=='simulation')throw new ApiError(409,'DEMO_SIMULATION_REQUIRED','Prepare this showcase only with scripted AI, local integrations and outbound simulation. No configuration or customer data was changed.');
 const identity=(await db.query("SELECT o.id FROM organizations o JOIN organization_memberships m ON m.organization_id=o.id AND m.active AND m.role='organization_admin' JOIN users u ON u.id=m.user_id AND u.active AND u.is_demo AND u.account_kind='staff' WHERE o.slug='ootla-demo' AND o.environment='demo' AND u.email=$1",[config.demoAdminEmail])).rows[0];
 if(!identity)throw new ApiError(409,'DEMO_STAFF_REQUIRED','Prepare the existing isolated staff demo first.');
 if(providedActor&&(providedActor.user.organization.id!==identity.id||providedActor.user.organization.role!=='organization_admin'))throw new ApiError(403,'DEMO_SHOWCASE_ACTOR_REQUIRED','Use the original isolated demo organization administrator.');
 const prior=await db.transaction(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[receiptDataset+':'+identity.id]);
  return(await c.query("SELECT organization_id,action,metadata FROM audit_events WHERE organization_id=$1 AND action='demo.showcase.capabilities_prepared' AND metadata->>'dataset'=$2 ORDER BY id LIMIT 1",[identity.id,receiptDataset])).rows[0];
 });
 if(prior){
  if(prior.organization_id!==identity.id||prior.action!=='demo.showcase.capabilities_prepared'||!prior.metadata?.result)throw new ApiError(409,'DEMO_FIXTURE_CONFLICT','The capability preparation identifier conflicts with an existing record. No data was changed.');
  if(providedActor)await new Connectors(db,config).overview(providedActor.user,providedActor.digest);
  const connection=(await db.query("SELECT state FROM connector_connections WHERE organization_id=$1 AND provider='yardi_demo'",[identity.id])).rows[0];
  return{...prior.metadata.result,changedRecords:0,connector:{state:connection?.state??'not_configured',initialSyncQueued:false}} as DemoCapabilityPreparation;
 }
 const before=await recordCount(db,identity.id);
 let cookie='';const sessions=new SessionService(db,config);
 const response={cookie:(name:string,value:string)=>{cookie=name+'='+value;return response;},clearCookie:()=>response} as unknown as Response;
 let actor=providedActor;
 if(!actor){
  const user=await sessions.login({headers:{}} as Request,response,config.demoAdminEmail,config.demoAdminPassword);
  const token=cookie.slice(cookie.indexOf('=')+1);actor={user,digest:createHmac('sha256',config.sessionSecret).update(token).digest('hex')};
 }
 const {user,digest}=actor;
 try{
  if(user.organization.id!==identity.id||user.organization.role!=='organization_admin')throw new ApiError(403,'DEMO_SHOWCASE_ACTOR_REQUIRED','Use the original isolated demo organization administrator.');
  // The first service read revalidates the actual session, current role and organization grants.
  const connectors=new Connectors(db,config),overview=await connectors.overview(user,digest);
  let connector=overview.connection,initialSyncQueued=false;
  if(!connector){const started=await connectors.createDemo(user,digest,key(identity.id,'yardi-initial'));connector=started.connection;initialSyncQueued=true;}
  // Normal durable connector workers apply the provider records; preparation never writes a fake Connected state.
  const chat=await seedConversationDemo(db,config),conversations=new Conversations(db,config);
  const channel=(await conversations.configuration(user,digest)).channels.find(c=>c.id===chat.channelId);
  const properties=(await db.query("SELECT id,name,city FROM properties WHERE organization_id=$1 AND seed_key IN('demo.showcase.v1.property.cedar','demo.showcase.v1.property.grove') ORDER BY seed_key",[identity.id])).rows;
  const ai=new AiOrchestrationService(db,config);
  for(const property of properties){
   const title='Showcase property guide — '+property.name;
   if(!(await db.query('SELECT id FROM ai_knowledge WHERE organization_id=$1 AND property_id=$2 AND title=$3',[identity.id,property.id,title])).rowCount)await ai.createKnowledge(user,digest,{requestKey:key(identity.id,'knowledge:'+property.id),propertyId:property.id,title,body:property.name+' is a synthetic Ootla demonstration property in '+property.city+'. Staff can review its saved units, current native availability and available viewing times. A requested time is not a confirmed appointment. Applications need the configured documents, consent and staff review. Neither the assistant nor this demonstration approves applicants or performs payments.',status:'approved',publicEnabled:false});
  }
  const analytics=new GoogleAnalyticsService(db,config),ga=(await db.query('SELECT id FROM google_analytics_connections WHERE organization_id=$1',[identity.id])).rows[0];
  let analyticsMode:DemoCapabilityPreparation['analytics']='preserved';
  if(!ga){await analytics.select(user,digest,{requestKey:key(identity.id,'analytics-select'),propertyId:'demo',crmPropertyId:properties[0]?.id??chat.propertyId});analyticsMode='illustrative';}
  else if((await analytics.status(user,digest)).canReadReports)analyticsMode='illustrative';
  const policy=(await db.query('SELECT enabled,public_enabled FROM organization_assistant_policies WHERE organization_id=$1',[identity.id])).rows[0];
  let conversationCount=0,assistantCount=0;
  if(channel?.enabled&&policy?.enabled!==false&&policy?.public_enabled!==false){
   for(const scenario of [
    {id:'availability',name:'Amara Okafor — demo inquiry',message:'What availability do you have for a two-bedroom home?'},
    {id:'staff-handoff',name:'Ethan Brooks — demo inquiry',message:'I would like to speak to a staff agent about a viewing.'},
   ]){
    const requestKey=key(identity.id,'conversation:'+scenario.id),prior=(await db.query('SELECT id FROM customer_conversations WHERE organization_id=$1 AND channel_id=$2 AND request_key=$3',[identity.id,channel.id,requestKey])).rows[0];
    if(!prior){const result=await conversations.simulate(user,digest,{requestKey,channelId:channel.id,name:scenario.name,message:scenario.message,consent:true});
     // One sample explicitly records a staff takeover; other inquiries remain available for AI follow-up.
     if(scenario.id==='staff-handoff')await conversations.ownership(user,digest,result.detail.conversation.id,{requestKey:key(identity.id,'conversation:staff-takeover'),ownership:'staff_requested'});
    }
    conversationCount++;
   }
  }
  if(policy?.enabled!==false){
   const ask=new AskOotlaService(db,config),propertyId=properties[0]?.id??chat.propertyId,requestKey=key(identity.id,'assistant-thread');
   const existing=(await db.query('SELECT id FROM ask_threads WHERE organization_id=$1 AND actor_user_id=$2 AND request_key=$3',[identity.id,user.id,requestKey])).rows[0];
   if(!existing){const thread=await ask.create(user,digest,{requestKey,context:{page:'/admin/ai',propertyId}});await ask.message(user,digest,thread.thread.id,{requestKey:key(identity.id,'assistant-message'),message:'Which follow-up tasks need staff attention?'});}
   assistantCount=1;
  }
  const automations=new Automations(db,config);let automationRules=0;
  const rules=[{id:'overdue-task',name:'Demo: review overdue work',trigger:'overdue_task' as const},{id:'inquiry',name:'Demo: review a new inquiry',trigger:'new_inquiry' as const}];
  for(const rule of rules){
   if(!(await db.query('SELECT id FROM automation_rules WHERE organization_id=$1 AND name=$2',[identity.id,rule.name])).rowCount)await automations.create(user,digest,automationCreateSchema.parse({requestKey:key(identity.id,'rule:'+rule.id),name:rule.name,trigger:rule.trigger,delayMinutes:0,channel:'in_app',assignment:'manual',ownerMembershipId:user.membershipId,template:'Review the saved record and arrange its next authorized staff step.',requiresApproval:true,enabled:true,quietStart:0,quietEnd:0,timeZone:'Africa/Lagos',templateApproved:true}));
   automationRules++;
  }
  // Discovery is a normal durable-job operation. These rules require explicit staff approval; no messages are sent.
  if(!(await db.query('SELECT 1 FROM automation_action_receipts WHERE organization_id=$1 AND actor_user_id=$2 AND request_key=$3',[identity.id,user.id,key(identity.id,'rules-evaluate')])).rowCount)await automations.evaluate(user,digest,{requestKey:key(identity.id,'rules-evaluate'),limit:25});
  const voice=new VoiceService(db,config),voicePolicy=(await db.query('SELECT organization_id FROM organization_voice_settings WHERE organization_id=$1',[identity.id])).rows[0];
  if(!voicePolicy)await voice.configure(user,digest,{requestKey:key(identity.id,'voice-policy'),enabled:true,retentionDays:7,consentRequired:false,consentNotice:null,recordingEnabled:false});
  const voiceSettings=await voice.settings(user,digest);
  if(voiceSettings.enabled&&channel?.enabled&&policy?.enabled!==false){
   const requestKey=key(identity.id,'voice-inquiry'),prior=(await db.query('SELECT id FROM voice_sessions WHERE organization_id=$1 AND request_key=$2',[identity.id,requestKey])).rows[0];
   if(!prior){const sample=await voice.start(user,digest,{requestKey,channelId:channel.id,name:'Taylor Morgan — synthetic voice inquiry',scenario:'property_questions',consentAccepted:false});
    await voice.event(user,digest,sample.session.id,{requestKey:key(identity.id,'voice-question'),kind:'transcript',text:'What can you tell me about this property?'});
    await voice.event(user,digest,sample.session.id,{requestKey:key(identity.id,'voice-ended'),kind:'end'});
   }
  }
  const leases=new LeaseWorkflowService(db,config);
  // These are genuine native move-in policy settings. Signing remains an explicitly evidenced demo_event;
  // preparation never approves an applicant, records applicant consent or signs a lease on anyone's behalf.
  if(!(await db.query('SELECT organization_id FROM organization_lease_settings WHERE organization_id=$1',[identity.id])).rowCount)await leases.saveSettings(user,digest,{requestKey:key(identity.id,'lease-policy'),leasedMilestone:'fully_signed',moveInTasks:[{key:'welcome',title:'Confirm move-in arrangements',dayOffset:-1,priority:'normal'},{key:'handover',title:'Complete move-in handover',dayOffset:0,priority:'high'}]});
  const applications=(await db.query("SELECT a.id FROM applications a JOIN leads l ON l.id=a.lead_id AND l.organization_id=a.organization_id WHERE a.organization_id=$1 AND l.seed_key=ANY($2::text[]) ORDER BY a.created_at,a.id",[identity.id,['leila','ethan','sofia','ben','alex'].map(name=>'demo.showcase.v1.lead.'+name)])).rows;
  const journey:DemoCapabilityPreparation['applicationJourney']={applicationsChecked:applications.length,screeningDemoAvailable:applications.length>0,paymentHandoffDemoAvailable:applications.length>0,leaseDemoAvailable:applications.length>0,leaseSettingsConfigured:(await leases.settings(user,digest)).configured,applicantConsentRequired:true,staffApprovalRequired:true};
  const screening=new ScreeningService(db,config),payments=new PaymentService(db,config);
  // The real isolated adapters select themselves from the verified runtime/application, with no fabricated
  // provider configuration. Payment handoff is created only by its authorized applicant at /payment-demo.
  for(const application of applications){
   const screen=await screening.workspace(user,digest,application.id),payment=await payments.staffWorkspace(user,digest,application.id),lease=await leases.workspace(user,digest,application.id);
   journey.screeningDemoAvailable&&=screen.mode==='demo';
   journey.paymentHandoffDemoAvailable&&=payment.mode==='demo'&&payment.destination?.configured===true;
   journey.leaseDemoAvailable&&=lease.mode==='demo'&&lease.evidenceKinds.includes('demo_event');
  }
  const result:DemoCapabilityPreparation={organizationId:identity.id,changedRecords:Math.max(0,(await recordCount(db,identity.id))-before),propertyChatUrl:'/',connector:{state:connector.state,initialSyncQueued},analytics:analyticsMode,voice:voiceSettings.enabled?'transcript_playback':'preserved',conversations:conversationCount,privateAssistantThreads:assistantCount,automationRules,applicationJourney:journey,externalActions:'none'};
  await db.transaction(async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[receiptDataset+':'+identity.id]);
   if(!(await c.query("SELECT 1 FROM audit_events WHERE organization_id=$1 AND action='demo.showcase.capabilities_prepared' AND metadata->>'dataset'=$2",[identity.id,receiptDataset])).rowCount)await c.query("INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,'demo.showcase.capabilities_prepared',$3)",[identity.id,user.id,JSON.stringify({dataset:receiptDataset,synthetic:true,outboundSent:false,result})]);
  });
  return result;
 }finally{
  if(!providedActor&&cookie.startsWith(sessionCookieName(config)+'='))await sessions.logout({headers:{cookie}} as Request,response);
 }
}
