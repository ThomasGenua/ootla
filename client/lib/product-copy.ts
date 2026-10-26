import {ApiError} from './api';
import {customerError,customerText} from './customer-copy';
// Staff presentation only. Stored messages, notes, consent and source evidence are never rewritten.
export function productError(issue:unknown,fallback='This action could not be completed. Please try again or ask your organization owner for help.'):string{
 if(issue instanceof ApiError){
  if(issue.status===401)return 'Your session has ended. Sign in again to continue.';
  if(issue.status===403)return 'You do not have access to this action. Ask your organization owner for help.';
  if(issue.status===404)return 'This record is no longer available to you. Return to the list and try again.';
  if(issue.status===413)return 'This file is too large. Choose a smaller file and try again.';
  if(issue.status===429)return 'This action could not be completed yet. Please wait a moment and try again.';
 }
 return customerError(issue,fallback);
}
export function productNotice(value:string,fallback:string):string{return /\b(?:simulat\w*|synthetic|ASR|TTS|local transcript|internal adapter|idempotency|provider failure|provider is|server|backend)\b/i.test(value)?fallback:customerText(value,fallback);}
export function businessStatus(value:string):string{
 const labels:Record<string,string>={proposed:'Review needed',failed:'Could not complete',handoff:'Needs staff help',queued:'Waiting',not_configured:'Unavailable',refused:'Needs staff help',awaiting_approval:'Awaiting approval'};
 return labels[value]??value.replaceAll('_',' ').replace(/^./,character=>character.toUpperCase());
}

export function assistantReply(value:string):string{return value.replace(/^Simulated AI:\s*/i,'');}
