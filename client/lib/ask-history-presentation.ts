import {formatAssistantDate,formatAssistantTime,isAssistantTimeZone} from '../../shared/assistant-dates';
import type {AskThread} from '../../shared/conversation-contracts';

export interface AskHistoryGroup{key:string;label:string;items:Array<AskThread&{timeLabel:string}>}
const civil=(date:Date,timeZone:string):string=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date),part=(type:string)=>parts.find(item=>item.type===type)?.value??'';return part('year')+'-'+part('month')+'-'+part('day');};
/** Group stored instants by the viewer's civil day; no seconds or timezone identifiers are UI labels. */
export function askHistoryGroups(items:ReadonlyArray<AskThread>,timeZone:string,now=new Date()):AskHistoryGroup[]{
 const zone=isAssistantTimeZone(timeZone)?timeZone:'UTC',today=civil(now,zone),yesterday=new Date(Date.parse(today+'T12:00:00Z')-86400000).toISOString().slice(0,10),groups=new Map<string,AskHistoryGroup>();
 for(const item of items){const date=new Date(item.updatedAt),valid=Number.isFinite(date.getTime()),key=valid?civil(date,zone):'earlier',label=key===today?'Today':key===yesterday?'Yesterday':valid?formatAssistantDate(item.updatedAt,zone,now):'Earlier';if(!groups.has(key))groups.set(key,{key,label,items:[]});groups.get(key)!.items.push({...item,timeLabel:valid?formatAssistantTime(item.updatedAt,zone):'Date unavailable'});}
 return [...groups.values()];
}
