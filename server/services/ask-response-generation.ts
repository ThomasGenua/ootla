import {formatAssistantTextDates} from '../../shared/assistant-dates.js';
import type {AiSource} from '../../shared/ai-contracts.js';

/** Domain facts remain separate from final prose. This function never invents records or executes actions. */
export function nativeRecordAnswer(text:string,timeZone='UTC'):string{
 const readable=formatAssistantTextDates(text,timeZone).replace(/\b(?:awaiting_assignment|appointment_scheduled|staff_review|new_inquiry|tour_scheduled|application_started|application_submitted|lease_pending|lost_closed)\b/g,value=>value.replaceAll('_',' '));
 return 'Record-based answer (no language model).\n'+readable.slice(0,2400);
}
/** A model read cannot claim that it performed an operation, or invent a record link. */
export function generatedReadIsSafe(text:string,sources:ReadonlyArray<Pick<AiSource,'url'>>):boolean{
 if(/\b(?:I(?:['’]ve)?|we(?:['’]ve)?|Ootla(?:AI)?)\s+(?:(?:have|has)\s+)?(?:(?:just|already|now|successfully)\s+)*(?:created|saved|booked|scheduled|rescheduled|cancelled|sent|emailed|texted|assigned|completed|closed|charged|refunded|approved|rejected|renewed|signed)\b/i.test(text)||/\b(?:successfully\s+(?:created|saved|booked|sent|assigned|charged|refunded)|(?:created|saved|booked|sent|assigned|charged|refunded)\s+successfully)\b/i.test(text))return false;
 if(/\b(?:task|viewing|appointment|email|message|payment)\b.{0,18}\b(?:has|have|is)\s+(?:now\s+|just\s+|successfully\s+)+(?:been\s+)?(?:created|saved|booked|scheduled|sent|assigned|completed|charged|refunded)\b/i.test(text))return false;
 const passive=/\b(task|viewing|appointment|email|message|payment)\b.{0,18}\b(?:has|have|is)\s+(?:(?:now|just|successfully)\s+)*(?:been\s+)?(created|saved|booked|scheduled|sent|assigned|completed|charged|refunded)\b/ig;
 if(passive.test(text))return false;
 const allowed=new Set(sources.map(source=>source.url)),links=text.match(/https?:\/\/[^\s<>]+|\/admin(?:[/?#])[^\s<>]*/ig)??[],markdown=[...text.matchAll(/\[[^\]\r\n]*\]\(\s*<?([^\s)>]+)/g)].map(match=>match[1]!);
 if(markdown.some(target=>!allowed.has(target)))return false;
 if(/\b(?:javascript|data|file|vbscript):/i.test(text))return false;
 return links.every(value=>allowed.has(value.replace(/[).,;!?]+$/,'')));
}
/** Capability readers retain their exact structured definitions; ordinary fallback text stays short. */
export function conciseNativeFacts(text:string,timeZone='UTC'):string{
 const readable=formatAssistantTextDates(text,timeZone).replace(/^Observed [^.]+\.\s*/,'').replace(/\s+/g,' ').trim()
  .replace(/Selected dates ([^.]+?) \(UTC\); cohort outcomes stop at ([^.]+)\./,'For $1; outcomes through $2.')
  .replace(/ in this authorized scope\b/g,'').replace(/match this authorized scope/g,'match the current filters')
  .replace(/\b(?:Current owners\/statuses are observed now\.|Missing-document counts disclose no document contents\.|These are observed facts, not a causal explanation\.|Review the linked records before deciding what to change\.|No provider dispatch or staff assignment was made by this summary\.)\s*/g,'');
 const sentences=readable.split(/(?<=[.!?])\s+/).filter(sentence=>! /\b(?:simulat\w*|synthetic|internal adapter|backend|database|server)\b/i.test(sentence));
 return sentences.slice(0,5).join(' ').trim().slice(0,1600);
}
