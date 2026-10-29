import type {PoolClient,QueryResultRow} from 'pg';
import {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import type {Database} from '../db/pool.js';
import type {ServerConfig} from '../config/env.js';
import type {MaintenanceConversation,MaintenanceConversationDraft,MaintenanceConversationMessage,MaintenanceConversationReplyResult} from '../../shared/maintenance-conversation-contracts.js';
import type {maintenanceConversationQuerySchema,maintenanceConversationDraftSchema,maintenanceConversationReplySchema} from '../../shared/maintenance-conversation-contracts.js';
import {MaintenanceAdministration} from './maintenance-admin.js';
import {staffMaintenanceAccess} from './maintenance-access.js';
import {residentCanonicalJoin,residentCanonicalContact} from './resident-access.js';
import {conversationTransport,type ConversationTransport} from '../conversations/transport.js';
import {ApiError} from '../http/errors.js';

type Row=QueryResultRow;
type Query=z.infer<typeof maintenanceConversationQuerySchema>;
type DraftInput=z.infer<typeof maintenanceConversationDraftSchema>;
type ReplyInput=z.infer<typeof maintenanceConversationReplySchema>;
const emailUnavailable='Email is unavailable: no approved email provider, authenticated inbound route or verified email-thread mapping is configured.';
const visible="m.organization_id=$1 AND m.request_id=$2 AND m.visibility='resident'";
const messageSelect="m.*,m.created_at::text AS cursor_created_at,u.display_name AS actor_name,o.attempts AS delivery_attempts FROM maintenance_messages m LEFT JOIN users u ON u.id=m.actor_user_id LEFT JOIN conversation_outbox o ON o.maintenance_message_id=m.id AND o.organization_id=m.organization_id AND o.maintenance_request_id=m.request_id";
const iso=(value:unknown)=>(value instanceof Date?value:new Date(String(value))).toISOString();
const absent=()=>new ApiError(404,'MAINTENANCE_CONVERSATION_NOT_FOUND','This conversation or message is outside the authorized request.');

/** Maintenance messages remain the single history; only actor-private draft and shared outbox metadata are added. */
export class MaintenanceConversations extends MaintenanceAdministration{
 private readonly transport:ConversationTransport;
 constructor(db:Database,config:ServerConfig,deps:{transport?:ConversationTransport}={}){super(db,config);this.transport=deps.transport??conversationTransport('resident_portal','native_chat');}
 private draftDto(row:Row):MaintenanceConversationDraft{return{body:row.body,channel:row.channel,version:row.version};}
 private async draft(c:PoolClient,actor:AuthUser,id:string,lock=false):Promise<MaintenanceConversationDraft|null>{
  const row=(await c.query('SELECT body,channel,version FROM maintenance_conversation_drafts WHERE organization_id=$1 AND request_id=$2 AND actor_user_id=$3'+(lock?' FOR UPDATE':''),[actor.organization.id,id,actor.id])).rows[0];
  return row?this.draftDto(row):null;
 }
 private async storeDraft(c:PoolClient,actor:AuthUser,id:string,input:{body:string;channel:'resident_portal'|'email';version:number}):Promise<MaintenanceConversationDraft>{
  const current=await this.draft(c,actor,id,true);
  if((current?.version??0)!==input.version)throw new ApiError(409,'MAINTENANCE_DRAFT_VERSION_CONFLICT','This draft changed in another tab. Refresh its saved revision before replacing it.');
  const next=input.version+1;
  if(current)await c.query('UPDATE maintenance_conversation_drafts SET body=$4,channel=$5,version=$6,updated_at=clock_timestamp() WHERE organization_id=$1 AND request_id=$2 AND actor_user_id=$3',[actor.organization.id,id,actor.id,input.body,input.channel,next]);
  else await c.query('INSERT INTO maintenance_conversation_drafts(organization_id,request_id,actor_user_id,body,channel,version) VALUES($1,$2,$3,$4,$5,$6)',[actor.organization.id,id,actor.id,input.body,input.channel,next]);
  return{body:input.body,channel:input.channel,version:next};
 }
 private async recipient(c:PoolClient,actor:AuthUser,request:Row):Promise<{name:string;email:string|null;available:boolean;reason?:string}>{
  const contact=(await c.query('SELECT display_name,email FROM contacts WHERE id=$1 AND organization_id=$2 FOR SHARE',[request.contact_id,actor.organization.id])).rows[0];
  if(!contact)throw absent();
  // Current grant and canonical lease/contact binding are locked until native publication commits.
  const grant=(await c.query("SELECT g.user_id FROM resident_access_grants g JOIN resident_relationships rr ON rr.id=g.relationship_id AND rr.organization_id=g.organization_id "+residentCanonicalJoin+" JOIN users ru ON ru.id=g.user_id AND ru.active AND ru.account_kind='resident' WHERE g.organization_id=$1 AND g.user_id=$2 AND g.relationship_id=$3 AND g.active AND g.revoked_at IS NULL AND rr.property_id=$4 AND rr.contact_id=$5 AND rr.unit_id IS NOT DISTINCT FROM $6::uuid AND rr.status IN('active','pending_move_in') AND ls.status='active' AND "+residentCanonicalContact+' FOR SHARE OF g,rr,ls,app,co,ru',[actor.organization.id,request.resident_user_id,request.resident_relationship_id,request.property_id,request.contact_id,request.unit_id])).rows[0];
  return{name:contact.display_name,email:typeof contact.email==='string'&&z.email().safeParse(contact.email).success?contact.email:null,available:Boolean(grant),...(!grant?{reason:'The resident does not currently have active portal access to this request.'}:{})};
 }
 private messageDto(row:Row,actor:AuthUser,canReply:boolean):MaintenanceConversationMessage{
  const state=row.delivery_state??(row.actor_kind==='resident'?'received':'available_in_portal');
  return{id:row.id,actorKind:row.actor_kind,actorName:row.actor_name??(row.actor_kind==='system'?'Ootla':row.actor_kind==='resident'?'Resident':'Staff'),body:row.body,createdAt:iso(row.created_at),channel:row.channel,state,canRetry:canReply&&state==='failed'&&row.actor_user_id===actor.id&&row.channel==='resident_portal'&&Number(row.delivery_attempts??3)<3};
 }
 private async message(c:PoolClient,actor:AuthUser,id:string,messageId:string,canReply:boolean):Promise<MaintenanceConversationMessage>{
  const row=(await c.query('SELECT '+messageSelect+' WHERE '+visible+' AND m.id=$3',[actor.organization.id,id,messageId])).rows[0];if(!row)throw absent();return this.messageDto(row,actor,canReply);
 }
 async workspace(user:AuthUser,digest:string,id:string,query:Query={}):Promise<MaintenanceConversation>{return this.db.transaction(async c=>{
  const{actor,request}=await staffMaintenanceAccess(c,this.config,user,digest,id),recipient=await this.recipient(c,actor,request),canReply=!['resolved','closed'].includes(request.status),canPublish=canReply&&recipient.available;
  const values:unknown[]=[actor.organization.id,id];let boundary='';
  const cursor=query.before??query.after;
  if(cursor){const anchor=(await c.query('SELECT m.created_at::text AS cursor_created_at,m.id FROM maintenance_messages m WHERE '+visible+' AND m.id=$3',[actor.organization.id,id,cursor])).rows[0];if(!anchor)throw absent();values.push(anchor.cursor_created_at,anchor.id);boundary=' AND (m.created_at,m.id) '+(query.before?'<':'>')+' ($3::timestamptz,$4::uuid)';}
  const forward=Boolean(query.after),all=(await c.query('SELECT '+messageSelect+' WHERE '+visible+boundary+' ORDER BY m.created_at '+(forward?'ASC':'DESC')+',m.id '+(forward?'ASC':'DESC')+' LIMIT 26',values)).rows;
  const selected=all.slice(0,25);if(!forward)selected.reverse();
  const first=selected[0],last=selected.at(-1),olderAnchor=first??(cursor?(await c.query('SELECT m.created_at::text AS cursor_created_at,m.id FROM maintenance_messages m WHERE '+visible+' AND m.id=$3',[actor.organization.id,id,cursor])).rows[0]:null),newerAnchor=last??olderAnchor;
  const hasOlder=olderAnchor?Boolean((await c.query('SELECT 1 FROM maintenance_messages m WHERE '+visible+' AND (m.created_at,m.id)<($3::timestamptz,$4::uuid) LIMIT 1',[actor.organization.id,id,olderAnchor.cursor_created_at,olderAnchor.id])).rowCount):false;
  const hasNewer=newerAnchor?Boolean((await c.query('SELECT 1 FROM maintenance_messages m WHERE '+visible+' AND (m.created_at,m.id)>($3::timestamptz,$4::uuid) LIMIT 1',[actor.organization.id,id,newerAnchor.cursor_created_at,newerAnchor.id])).rowCount):false;
  const updates=forward?(await c.query('SELECT '+messageSelect+' WHERE '+visible+' ORDER BY m.created_at DESC,m.id DESC LIMIT 25',[actor.organization.id,id])).rows.reverse():[];
  return{requestId:id,threadId:id,resident:{name:recipient.name,email:recipient.email},access:{canReply},transport:{portal:{available:recipient.available,...(recipient.reason?{reason:recipient.reason}:{})},email:{available:false,reason:emailUnavailable}},messages:{items:selected.map(row=>this.messageDto(row,actor,canPublish)),hasOlder,olderCursor:olderAnchor?.id??null,newerCursor:newerAnchor?.id??null,hasNewer,stateUpdates:updates.map(row=>this.messageDto(row,actor,canPublish))},draft:await this.draft(c,actor,id)};
 });}
 async saveDraft(user:AuthUser,digest:string,id:string,input:DraftInput):Promise<{draft:MaintenanceConversationDraft}>{return this.db.transaction(async c=>{
  await this.lock(c,user.organization.id);const{actor}=await staffMaintenanceAccess(c,this.config,user,digest,id);
  await this.receipt(c,actor.organization.id,actor.id,input.requestKey,'conversation_draft',{id,...input},async()=>({draft:await this.storeDraft(c,actor,id,input)}));
  const draft=await this.draft(c,actor,id);if(!draft)throw absent();return{draft};
 });}
 private async publish(c:PoolClient,actor:AuthUser,request:Row,messageId:string):Promise<void>{
  const outbox=(await c.query('SELECT o.*,m.body,m.actor_user_id,m.channel,m.visibility,m.delivery_state FROM conversation_outbox o JOIN maintenance_messages m ON m.id=o.maintenance_message_id AND m.organization_id=o.organization_id AND m.request_id=o.maintenance_request_id WHERE o.organization_id=$1 AND o.maintenance_request_id=$2 AND o.maintenance_message_id=$3 FOR UPDATE OF o,m',[actor.organization.id,request.id,messageId])).rows[0];
  if(!outbox)throw absent();if(outbox.state==='available_in_portal')return;
  if(outbox.maintenance_actor_user_id!==actor.id||outbox.actor_user_id!==actor.id||outbox.visibility!=='resident'||outbox.channel!=='resident_portal')throw absent();
  if(Number(outbox.attempts)>=3)return;
  const recipient=await this.recipient(c,actor,request);
  if(!recipient.available||request.status==='closed'||request.status==='resolved'||outbox.maintenance_recipient_user_id!==request.resident_user_id||outbox.maintenance_recipient_contact_id!==request.contact_id){
   await c.query("UPDATE conversation_outbox SET state='cancelled',last_error='resident_access_or_request_changed',updated_at=clock_timestamp() WHERE id=$1",[outbox.id]);
   await c.query("UPDATE maintenance_messages SET delivery_state='cancelled' WHERE id=$1 AND organization_id=$2 AND request_id=$3",[messageId,actor.organization.id,request.id]);return;
  }
  const attempts=Number(outbox.attempts)+1;
  let delivery:Awaited<ReturnType<ConversationTransport['deliver']>>;
  try{
   delivery=await this.transport.deliver(messageId,'delivered',false);
   if(delivery.state!=='available_in_portal'||delivery.provider!=='native_resident_portal'||delivery.simulated)throw new ApiError(503,'PORTAL_PUBLICATION_UNVERIFIED','Portal availability could not be confirmed.');
  }catch{
   await c.query("UPDATE conversation_outbox SET state='failed',attempts=$2,last_error='portal_publication_failed',next_attempt_at=clock_timestamp()+interval '10 seconds',updated_at=clock_timestamp() WHERE id=$1",[outbox.id,attempts]);
   await c.query("UPDATE maintenance_messages SET delivery_state='failed' WHERE id=$1 AND organization_id=$2 AND request_id=$3",[messageId,actor.organization.id,request.id]);return;
  }
  await c.query("UPDATE conversation_outbox SET state='available_in_portal',provider='native_resident_portal',provider_message_id=COALESCE(provider_message_id,$2),attempts=$3,last_error=NULL,updated_at=clock_timestamp() WHERE id=$1",[outbox.id,delivery.providerMessageId,attempts]);
  await c.query("UPDATE maintenance_messages SET delivery_state='available_in_portal' WHERE id=$1 AND organization_id=$2 AND request_id=$3",[messageId,actor.organization.id,request.id]);
  await c.query("UPDATE maintenance_conversation_drafts SET body='',version=version+1,updated_at=clock_timestamp() WHERE organization_id=$1 AND request_id=$2 AND actor_user_id=$3 AND version=$4 AND body=$5 AND channel='resident_portal'",[actor.organization.id,request.id,actor.id,outbox.maintenance_draft_version,outbox.body]);
  await this.audit(c,actor,'conversation_available',{requestId:request.id,messageId,channel:'resident_portal'});
 }
 async reply(user:AuthUser,digest:string,id:string,input:ReplyInput):Promise<MaintenanceConversationReplyResult>{
  if(input.channel==='email'){
   // Commit the actor's private draft before the deliberately unsupported transport response.
   await this.saveDraft(user,digest,id,{requestKey:input.requestKey,body:input.body,channel:'email',version:input.draftVersion});
   throw new ApiError(501,'MAINTENANCE_EMAIL_NOT_CONFIGURED',emailUnavailable);
  }
  return this.db.transaction(async c=>{
   await this.lock(c,user.organization.id);const{actor,request}=await staffMaintenanceAccess(c,this.config,user,digest,id);let fresh=false;
   const saved=await this.receipt(c,actor.organization.id,actor.id,input.requestKey,'conversation_reply',{id,...input},async()=>{
    fresh=true;if(['resolved','closed'].includes(request.status))throw new ApiError(409,'MAINTENANCE_CLOSED','This request is resolved or closed. A new resident reply cannot be published.');
    if(input.retryMessageId){
     const prior=(await c.query('SELECT m.*,o.state AS outbox_state,o.attempts FROM maintenance_messages m JOIN conversation_outbox o ON o.maintenance_message_id=m.id AND o.maintenance_request_id=m.request_id AND o.organization_id=m.organization_id WHERE m.organization_id=$1 AND m.request_id=$2 AND m.id=$3 AND m.visibility=\'resident\' FOR UPDATE OF m,o',[actor.organization.id,id,input.retryMessageId])).rows[0];
     if(!prior||prior.actor_user_id!==actor.id||prior.channel!=='resident_portal'||prior.body!==input.body)throw absent();
     if(prior.delivery_state==='available_in_portal')return{messageId:prior.id};
     if(!['failed','queued'].includes(prior.delivery_state)||Number(prior.attempts)>=3)throw new ApiError(409,'MAINTENANCE_REPLY_RETRY_UNAVAILABLE','This message cannot be retried again. Its saved history was preserved.');
     const current=await this.draft(c,actor,id,true);if((current?.version??0)!==input.draftVersion)throw new ApiError(409,'MAINTENANCE_DRAFT_VERSION_CONFLICT','Refresh the saved draft revision before retrying this message.');
     if(current&&current.body===prior.body&&current.channel==='resident_portal')await c.query('UPDATE conversation_outbox SET maintenance_draft_version=$4 WHERE organization_id=$1 AND maintenance_request_id=$2 AND maintenance_message_id=$3',[actor.organization.id,id,prior.id,current.version]);
     return{messageId:prior.id};
    }
    const recipient=await this.recipient(c,actor,request);if(!recipient.available)throw new ApiError(409,'RESIDENT_PORTAL_UNAVAILABLE',recipient.reason!);
    const draft=await this.storeDraft(c,actor,id,{body:input.body,channel:'resident_portal',version:input.draftVersion});
    const message=(await c.query("INSERT INTO maintenance_messages(organization_id,request_id,actor_user_id,actor_kind,visibility,body,channel,delivery_state) VALUES($1,$2,$3,'staff','resident',$4,'resident_portal','queued') RETURNING id",[actor.organization.id,id,actor.id,input.body])).rows[0];
    await c.query("INSERT INTO conversation_outbox(organization_id,origin,provider,maintenance_request_id,maintenance_message_id,maintenance_actor_user_id,maintenance_recipient_user_id,maintenance_recipient_contact_id,maintenance_draft_version) VALUES($1,'staff','native_resident_portal',$2,$3,$4,$5,$6,$7)",[actor.organization.id,id,message.id,actor.id,request.resident_user_id,request.contact_id,draft.version]);
    await this.audit(c,actor,'conversation_reply_queued',{requestId:id,messageId:message.id,channel:'resident_portal'});return{messageId:message.id};
   });
   if(fresh)await this.publish(c,actor,request,saved.messageId);
   const recipient=await this.recipient(c,actor,request),canReply=recipient.available&&!['resolved','closed'].includes(request.status);
   return{message:await this.message(c,actor,id,saved.messageId,canReply),draft:await this.draft(c,actor,id)};
  });
 }
}
