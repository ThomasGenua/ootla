import type {PoolClient,QueryResultRow} from 'pg';
import type {AuthUser} from '../../shared/contracts.js';
import type {CalendarEmailNotification} from '../../shared/calendar-contracts.js';
import type {ServerConfig} from '../config/env.js';
import {isIsolatedDemo} from './demo-environment.js';
import {conversationTransport} from '../conversations/transport.js';

/** Called inside the successful booking receipt transaction, after native slot reservation.
 * The client chooses whether to notify, never the recipient or delivery outcome.
 * No live email transport is implemented: retain a draft and report that exact limitation.
 */
export async function prepareViewingEmail(c:PoolClient,config:ServerConfig,actor:AuthUser,v:QueryResultRow,timeZone?:string):Promise<CalendarEmailNotification>{
 const contact=(await c.query('SELECT c.id,c.display_name,c.email,p.name FROM contacts c JOIN leads l ON l.contact_id=c.id AND l.organization_id=c.organization_id JOIN properties p ON p.id=l.property_id AND p.organization_id=l.organization_id WHERE l.id=$1 AND l.organization_id=$2 FOR SHARE OF c',[v.lead_id,actor.organization.id])).rows[0];
 const event=(await c.query("SELECT id FROM viewing_events WHERE organization_id=$1 AND viewing_id=$2 AND kind='booked' ORDER BY occurred_at,id LIMIT 1",[actor.organization.id,v.id])).rows[0];
 if(!contact||!event)throw Error('Saved viewing notification context is unavailable.');
 const property=(await c.query('SELECT name FROM properties WHERE organization_id=$1 AND id=$2',[actor.organization.id,v.property_id])).rows[0];
 const zone=timeZone??v.time_zone,when=new Intl.DateTimeFormat('en',{timeZone:zone,dateStyle:'full',timeStyle:'short'}).format(new Date(v.starts_at));
 const payload={to:contact.email,subject:'Your viewing at '+property.name,body:'Hi '+contact.display_name+',\n\nYour viewing at '+property.name+' is booked for '+when+' ('+zone+').\nMeeting location: '+v.location+'.\n\nPlease let us know if you need to change these arrangements.',timeZone:zone,outboundSent:false};
 const preview=config.outboundMode==='simulation'&&await isIsolatedDemo(config,c)&&/@[^@]+\.test$/i.test(contact.email);
 await c.query("UPDATE viewing_notification_receipts SET email_requested=true,email_state=$3,contact_id=$4,email_payload=$5::jsonb,updated_at=clock_timestamp() WHERE event_id=$1 AND organization_id=$2",[event.id,actor.organization.id,preview?'draft':'unavailable',contact.id,JSON.stringify(payload)]);
 if(!preview)return{state:'unavailable',message:contact.email?'Viewing saved. Email delivery is not configured; the notification draft is kept.':'Viewing saved. No client email address is recorded; the notification draft is kept.'};
 const outbox=(await c.query("INSERT INTO conversation_outbox(organization_id,origin,state,provider,viewing_id,viewing_event_id,viewing_contact_id)VALUES($1,'staff','queued','local_simulator',$2,$3,$4)RETURNING id",[actor.organization.id,v.id,event.id,contact.id])).rows[0];
 const result=await conversationTransport('email','demo_email').deliver(event.id,'delivered',true);
 await c.query('UPDATE conversation_outbox SET state=$2,provider_message_id=$3,attempts=1,updated_at=clock_timestamp() WHERE id=$1',[outbox.id,result.state,result.providerMessageId]);
 await c.query("UPDATE viewing_notification_receipts SET email_state='preview_processed',updated_at=clock_timestamp() WHERE event_id=$1 AND organization_id=$2",[event.id,actor.organization.id]);
 return{state:'preview_processed',message:'Viewing saved. Email preview processed; no external email was sent.'};
}
export async function viewingEmailStatus(c:PoolClient,organizationId:string,viewingId:string):Promise<CalendarEmailNotification>{
 const row=(await c.query("SELECT n.email_state FROM viewing_notification_receipts n JOIN viewing_events e ON e.id=n.event_id AND e.organization_id=n.organization_id WHERE e.organization_id=$1 AND e.viewing_id=$2 AND e.kind='booked' ORDER BY e.occurred_at DESC,e.id LIMIT 1",[organizationId,viewingId])).rows[0];
 const state=row?.email_state??'not_requested';
 return{state,message:state==='preview_processed'?'Email preview processed; no external email was sent.':state==='unavailable'?'Email delivery unavailable. Notification draft kept.':state==='draft'?'Notification draft saved.':'Client email was not requested.'};
}
