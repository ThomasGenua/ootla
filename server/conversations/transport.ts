import {createHash} from 'node:crypto';
import {ApiError} from '../http/errors.js';
export type ConversationChannelKind='website'|'email'|'sms'|'resident_portal';
export interface ChannelCapabilities{channel:ConversationChannelKind;mode:'local_simulation'|'native_chat'|'not_configured';send:boolean;deliveryCallbacks:boolean;inboundReplies:boolean;notice:string}
export interface ChannelDelivery{state:'sent'|'delivered'|'failed'|'available_in_portal';provider:'local_simulator'|'native_website'|'native_resident_portal';providerMessageId:string;simulated:boolean;retryable:boolean}
/** Provider adapters must supply documented transports, callback verification and inbound threading.
 * No credential, arbitrary endpoint, SMTP server or recipient is accepted from a browser. */
export interface ConversationTransport{capabilities:ChannelCapabilities;deliver(messageId:string,outcome:'sent'|'delivered'|'temporary_failure',isolatedDemo:boolean):Promise<ChannelDelivery>}
export function conversationTransport(channel:ConversationChannelKind,mode:'local_simulation'|'native_chat'|'demo_email'='local_simulation'):ConversationTransport{
 if(channel==='resident_portal')return{capabilities:{channel,mode:'native_chat',send:true,deliveryCallbacks:false,inboundReplies:true,notice:'Saved correspondence is available in the authorized resident portal. This is not email delivery or a read receipt.'},async deliver(messageId,outcome){
  if(!/^[a-f0-9-]{36}$/i.test(messageId))throw new ApiError(400,'COMMUNICATION_MESSAGE_INVALID','A saved message is required.');
  if(outcome!=='delivered')throw new ApiError(400,'PORTAL_OUTCOME_INVALID','Portal availability follows the saved correspondence.');
  return{state:'available_in_portal',provider:'native_resident_portal',providerMessageId:'portal_'+createHash('sha256').update('ootla:resident-portal:'+messageId).digest('hex').slice(0,32),simulated:false,retryable:false};
 }};
 if(channel!=='website'&&!(channel==='email'&&mode==='demo_email'))return{capabilities:{channel,mode:'not_configured',send:false,deliveryCallbacks:false,inboundReplies:false,notice:'No documented and approved '+channel+' provider is configured. Real delivery and inbound callbacks are unavailable.'},async deliver(){throw new ApiError(501,'COMMUNICATION_PROVIDER_NOT_CONFIGURED','No approved provider, verified inbound route and test-recipient policy are configured. Nothing was sent.');}};
 if(mode==='native_chat')return{capabilities:{channel,mode:'native_chat',send:true,deliveryCallbacks:false,inboundReplies:true,notice:'Saved messages are available inside this website chat. This is not email/SMS delivery, a read receipt or a provider callback.'},async deliver(messageId,outcome){
  if(!/^[a-f0-9-]{36}$/i.test(messageId))throw new ApiError(400,'COMMUNICATION_MESSAGE_INVALID','A saved message is required.');
  if(outcome!=='delivered')throw new ApiError(400,'NATIVE_CHAT_OUTCOME_INVALID','Native chat availability follows the persisted message; synthetic delivery outcomes are unavailable.');
  return{state:'delivered',provider:'native_website',providerMessageId:'chat_'+createHash('sha256').update('ootla:native-website:'+messageId).digest('hex').slice(0,32),simulated:false,retryable:false};
 }};
 return{capabilities:{channel,mode:'local_simulation',send:true,deliveryCallbacks:false,inboundReplies:true,notice:'Local conversation simulator only. Sent/delivered describe local synthetic processing and are not proof of email or SMS delivery.'},async deliver(messageId,outcome,isolatedDemo){
  if(!isolatedDemo)throw new ApiError(403,'COMMUNICATION_SIMULATION_DENIED','Local provider simulation requires the verified isolated demo.');
  if(!/^[a-f0-9-]{36}$/i.test(messageId))throw new ApiError(400,'COMMUNICATION_MESSAGE_INVALID','A saved message is required.');
  return{state:outcome==='temporary_failure'?'failed':outcome,provider:'local_simulator',providerMessageId:'local_'+createHash('sha256').update('ootla:conversation:'+messageId).digest('hex').slice(0,32),simulated:true,retryable:outcome==='temporary_failure'};
 }};
}
