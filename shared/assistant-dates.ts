/** Presentation only: stored UTC instants and civil lease/report dates remain unchanged. */
export function isAssistantTimeZone(value:string):boolean{
 if(!value||value.length>100)return false;
 try{new Intl.DateTimeFormat('en-US',{timeZone:value}).format(0);return true;}catch{return false;}
}
function zone(value:string):string{return isAssistantTimeZone(value)?value:'UTC';}
function civilDate(value:Date,timeZone:string):string{
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone(timeZone),year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);
 const part=(type:string)=>parts.find(item=>item.type===type)?.value??'';
 return part('year')+'-'+part('month')+'-'+part('day');
}
function validCivilDate(value:string):boolean{
 return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
}
function instant(value:string):Date|null{
 if(!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)||!validCivilDate(value.slice(0,10)))return null;
 const date=new Date(value);return Number.isFinite(date.getTime())?date:null;
}
function dateLabel(value:string,timeZone:string,now:Date):string{
 const today=civilDate(now,timeZone),tomorrow=new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 if(value===today)return 'Today';if(value===tomorrow)return 'Tomorrow';
 return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short',day:'numeric',...(value.slice(0,4)!==today.slice(0,4)?{year:'numeric' as const}:{})}).format(new Date(value+'T12:00:00Z'));
}
/** Date-only values never become instants and therefore cannot shift to a neighboring day. */
export function formatAssistantDate(value:string|null|undefined,timeZone='UTC',now:Date=new Date()):string{
 if(!value)return 'Not recorded';
 if(validCivilDate(value))return dateLabel(value,timeZone,now);
 const date=instant(value);return date?dateLabel(civilDate(date,timeZone),timeZone,now):'Not recorded';
}
export function formatAssistantTime(value:string|null|undefined,timeZone='UTC'):string{
 const date=value?instant(value):null;if(!date)return 'Not recorded';
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone(timeZone),hour:'numeric',minute:'2-digit',hour12:true}).formatToParts(date),part=(type:string)=>parts.find(item=>item.type===type)?.value??'';
 return part('hour')+(part('minute')==='00'?'':':'+part('minute'))+' '+part('dayPeriod');
}
export function formatAssistantDateTime(value:string|null|undefined,timeZone='UTC',now:Date=new Date()):string{
 if(!value)return 'Not recorded';if(validCivilDate(value))return formatAssistantDate(value,timeZone,now);
 if(!instant(value))return 'Not recorded';return formatAssistantDate(value,timeZone,now)+' at '+formatAssistantTime(value,timeZone);
}
/** Humanize valid ISO references in ordinary response text; URLs and unknown/invalid dates stay verbatim. */
export function formatAssistantTextDates(text:string,timeZone='UTC',now:Date=new Date()):string{
 return text.replace(/https?:\/\/[^\s<>]+|\/admin(?:[/?#])[^\s<>]*|(?<![A-Za-z0-9_])\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})(?![A-Za-z0-9_])|(?<![A-Za-z0-9_])\d{4}-\d{2}-\d{2}(?![A-Za-z0-9_])/g,value=>{
  if(value.startsWith('http')||value.startsWith('/admin'))return value;
  if(validCivilDate(value))return formatAssistantDate(value,timeZone,now);
  return instant(value)?formatAssistantDateTime(value,timeZone,now):value;
 });
}
