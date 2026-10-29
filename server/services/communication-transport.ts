import type { ServerConfig } from '../config/env.js';
export class DeliveryError extends Error { constructor(public uncertain:boolean){super('Delivery provider unavailable.');} }
export async function providerJson(response:Response):Promise<Record<string,any>> {
 const reader=response.body?.getReader();if(!reader)throw new DeliveryError(true);
 const parts:Uint8Array[]=[];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>262144)throw new Error('Response too large');parts.push(part.value);}return JSON.parse(Buffer.concat(parts).toString('utf8'));}
 catch{await reader.cancel().catch(()=>undefined);throw new DeliveryError(true);}
}
export async function sendCommunication(config:ServerConfig,input:{id:string;channel:'email'|'sms';recipient:string;subject:string;body:string;replyTo:string},fetcher:typeof fetch=fetch):Promise<{provider:string;id:string}> {
 const settings=config.communications;let response:Response;
 try{
  response=input.channel==='email'?await fetcher('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+settings.resendKey,'Content-Type':'application/json','Idempotency-Key':'ootla-'+input.id},body:JSON.stringify({from:settings.resendFrom,to:[input.recipient],subject:input.subject||'Your property inquiry',text:input.body,reply_to:input.replyTo})}):await fetcher('https://api.twilio.com/2010-04-01/Accounts/'+settings.twilioSid+'/Messages.json',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Basic '+Buffer.from(settings.twilioSid+':'+settings.twilioToken).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({From:settings.twilioFrom,To:input.recipient,Body:input.body,StatusCallback:config.appUrl+'/api/communications/twilio/status/'+input.id}).toString()});
 }catch{throw new DeliveryError(true);}
 if(!response.ok)throw new DeliveryError(response.status>=500 || response.status===408);
 const data=await providerJson(response),id=input.channel==='email'?data.id:data.sid;
 if(typeof id!=='string'|| !(input.channel==='email'?/^[a-f0-9-]{36}$/i:/^SM[a-f0-9]{32}$/i).test(id))throw new DeliveryError(true);
 return{provider:input.channel==='email'?'resend':'twilio',id};
}
