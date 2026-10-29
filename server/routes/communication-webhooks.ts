import { Router,raw,urlencoded,type Request } from 'express';
import twilio from 'twilio';
import { Webhook } from 'svix';
import { z } from 'zod';
import type { ServerConfig } from '../config/env.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { Inbox } from '../services/inbox.js';
import { providerJson } from '../services/communication-transport.js';

export function createCommunicationWebhooks(config:ServerConfig,database:Database,fetcher:typeof fetch=fetch){
 const router=Router(),service=new Inbox(database,config),settings=config.communications;
 const enabled=()=>{if(!settings.enabled||config.demoMode||!settings.organizationId)throw new ApiError(503,'DELIVERY_UNCONFIGURED','Communications are not configured.');};
 router.post('/resend',raw({type:'application/json',limit:'256kb',inflate:false}),async(r,s)=>{
  enabled();if(!settings.resendWebhookSecret||!Buffer.isBuffer(r.body))throw new ApiError(400,'INVALID_CALLBACK','Invalid provider callback.');
  const payload=r.body.toString('utf8'),eventId=r.get('svix-id');let event:Record<string,any>;
  try{new Webhook(settings.resendWebhookSecret).verify(payload,{'svix-id':eventId??'','svix-timestamp':r.get('svix-timestamp')??'','svix-signature':r.get('svix-signature')??''});event=JSON.parse(payload);if(!event||typeof event!=='object')throw new Error('Invalid event');}catch{throw new ApiError(403,'INVALID_SIGNATURE','Invalid provider signature.');}
  if(!eventId||eventId.length>200)throw new ApiError(400,'INVALID_CALLBACK','Invalid callback identifier.');
  if((await database.query("SELECT 1 FROM communication_receipts WHERE provider='resend' AND event_id=$1",[eventId])).rowCount){s.json({received:true});return;}
  const emailId=z.uuid().safeParse(event.data?.email_id);if(!emailId.success){s.json({ignored:true});return;}
  let incoming:Record<string,any>|undefined;
  if(event.type==='email.received'){
   const response=await fetcher('https://api.resend.com/emails/receiving/'+emailId.data,{headers:{Authorization:'Bearer '+settings.resendKey},redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new ApiError(503,'INBOUND_UNAVAILABLE','Incoming message retrieval is temporarily unavailable.');incoming=await providerJson(response);
  }
  await database.transaction(async c=>{
   const org=(await c.query("SELECT id FROM organizations WHERE id=$1 AND environment='live' FOR SHARE",[settings.organizationId])).rows[0];if(!org)throw new ApiError(403,'ORGANIZATION_UNAVAILABLE','The configured organization is unavailable.');
   if(!await service.receipt(c,'resend',eventId,payload))return;
   if(incoming){
    const from=String(incoming.from??'').trim(),sender=(from.match(/<([^<>]+)>$/)?.[1]??from).toLowerCase();if(!z.email().safeParse(sender).success)return;
    const recipients=Array.isArray(incoming.to)?incoming.to:[];let conversationId:string|undefined;
    for(const recipient of recipients){const match=String(recipient).match(/^reply\+([a-f0-9]{32})\.([a-f0-9]{24})@/);if(!match)continue;const rawId=match[1],id=[rawId.slice(0,8),rawId.slice(8,12),rawId.slice(12,16),rawId.slice(16,20),rawId.slice(20)].join('-');if(service.replyAddress(id)===String(recipient).toLowerCase())conversationId=id;}
    const text=typeof incoming.text==='string'?incoming.text:'[This email has no plain-text body. Review it in the email provider.]';
    await service.inbound(c,settings.organizationId,'email',sender,String(incoming.subject??'').slice(0,200),text.slice(0,10000),emailId.data,conversationId);
   }else{
    const statuses:Record<string,string>={'email.sent':'accepted','email.delivered':'delivered','email.bounced':'failed','email.failed':'failed','email.complained':'failed'};
    const status=statuses[String(event.type)];const time=new Date(event.created_at);if(!status||!Number.isFinite(time.getTime()))return;
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['delivery:resend:'+emailId.data]);
    await c.query("INSERT INTO communication_delivery_events(organization_id,provider,provider_id,status,occurred_at) VALUES($1,'resend',$2,$3,$4) ON CONFLICT(provider,provider_id) DO UPDATE SET status=$3,occurred_at=$4 WHERE communication_delivery_events.occurred_at<=$4 AND NOT(communication_delivery_events.status IN ('delivered','failed') AND $3='accepted')",[settings.organizationId,emailId.data,status,time]);
    await c.query("UPDATE conversation_messages SET status=$3,delivered_at=CASE WHEN $3='delivered' THEN $4 ELSE delivered_at END,provider_event_at=$4,updated_at=now() WHERE organization_id=$1 AND provider='resend' AND provider_id=$2 AND direction='outbound' AND (provider_event_at IS NULL OR provider_event_at<=$4) AND NOT(status IN ('delivered','failed') AND $3='accepted')",[settings.organizationId,emailId.data,status,time]);
   }
  });s.json({received:true});
 });
 const validateTwilio=(r:Request)=>{
  enabled();if(!settings.twilioToken||Object.keys(r.query).length||!r.body||Object.values(r.body).some(v=>typeof v!=='string'))throw new ApiError(400,'INVALID_CALLBACK','Invalid provider callback.');
  if(!twilio.validateRequest(settings.twilioToken,r.get('x-twilio-signature')??'',config.appUrl+r.originalUrl,r.body)||r.body.AccountSid!==settings.twilioSid)throw new ApiError(403,'INVALID_SIGNATURE','Invalid provider signature.');
 };
 router.post('/twilio/status/:id',urlencoded({extended:false,limit:'32kb',inflate:false}),async(r,s)=>{
  validateTwilio(r);const id=z.uuid().safeParse(r.params.id),sid=r.body.MessageSid,status=r.body.MessageStatus;if(!id.success||!/^SM[a-f0-9]{32}$/i.test(sid??''))throw new ApiError(400,'INVALID_CALLBACK','Invalid message identifier.');
  const mapped:Record<string,string>={queued:'accepted',accepted:'accepted',sending:'accepted',sent:'accepted',delivered:'delivered',failed:'failed',undelivered:'failed'};
  await database.transaction(async c=>{
   if(!(await c.query("SELECT id FROM organizations WHERE id=$1 AND environment='live' FOR SHARE",[settings.organizationId])).rowCount)throw new ApiError(403,'ORGANIZATION_UNAVAILABLE','The configured organization is unavailable.');
   if(!mapped[status])return;
   const message=(await c.query("SELECT * FROM conversation_messages WHERE id=$1 AND organization_id=$2 AND channel='sms' AND direction='outbound' AND status<>'draft' AND recipient=$3 AND (provider_id IS NULL OR provider_id=$4) FOR UPDATE",[id.data,settings.organizationId,r.body.To,sid])).rows[0];if(!message)throw new ApiError(404,'MESSAGE_UNAVAILABLE','The provider message does not match.');
   if(!await service.receipt(c,'twilio',sid+':'+status,JSON.stringify(r.body)))return;
   if(['delivered','failed'].includes(message.status))return;
   await c.query("UPDATE conversation_messages SET provider='twilio',provider_id=$2,status=$3,delivered_at=CASE WHEN $3='delivered' THEN now() ELSE delivered_at END,updated_at=now() WHERE id=$1",[id.data,sid,mapped[status]]);
  });s.type('text/xml').send('<Response/>');
 });
 router.post('/twilio/incoming',urlencoded({extended:false,limit:'32kb',inflate:false}),async(r,s)=>{
  validateTwilio(r);if(r.body.To!==settings.twilioFrom||!/^SM[a-f0-9]{32}$/i.test(r.body.MessageSid??'')||!/^\+[1-9]\d{7,14}$/.test(r.body.From??'')||typeof r.body.Body!=='string')throw new ApiError(400,'INVALID_CALLBACK','Invalid incoming message.');
  await database.transaction(async c=>{if(!(await c.query("SELECT id FROM organizations WHERE id=$1 AND environment='live' FOR SHARE",[settings.organizationId])).rowCount)throw new ApiError(403,'ORGANIZATION_UNAVAILABLE','The configured organization is unavailable.');if(!await service.receipt(c,'twilio',r.body.MessageSid+':incoming',JSON.stringify(r.body)))return;await service.inbound(c,settings.organizationId,'sms',r.body.From,'',r.body.Body.slice(0,10000),r.body.MessageSid);});s.type('text/xml').send('<Response/>');
 });
 return router;
}
