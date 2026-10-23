import { ApiError } from '../http/errors.js';
const formatters=new Map<string,Intl.DateTimeFormat>();
function formatter(zone:string):Intl.DateTimeFormat{
 let current=formatters.get(zone);
 if(!current){try{current=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});}catch{throw new ApiError(400,'INVALID_TIME_ZONE','Choose a valid IANA timezone.');}if(formatters.size<200)formatters.set(zone,current);}
 return current;
}
function parts(value:Date,zone:string):Record<string,string>{
 if(!Number.isFinite(value.getTime()))throw new ApiError(400,'INVALID_LOCAL_TIME','Choose a valid time.');
 return Object.fromEntries(formatter(zone).formatToParts(value).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
}
export function localDate(value:Date,zone:string):string{const p=parts(value,zone);return p.year+'-'+p.month+'-'+p.day;}
export function localMinute(value:Date,zone:string):number{const p=parts(value,zone);return Number(p.hour)*60+Number(p.minute);}
export function addLocalDays(date:string,days:number):string{const value=new Date(date+'T12:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(value.getTime())||value.toISOString().slice(0,10)!==date)throw new ApiError(400,'INVALID_LOCAL_DATE','Choose a valid local date.');value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}
export function weekday(date:string):number{return new Date(addLocalDays(date,0)+'T12:00:00Z').getUTCDay();}
export function zonedIso(value:Date,zone:string):string{
 const p=parts(value,zone),seconds=Math.floor(value.getTime()/1000)*1000;
 const offset=Math.round((Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second))-seconds)/60000);
 const sign=offset<0?'-':'+',absolute=Math.abs(offset),suffix=sign+String(Math.floor(absolute/60)).padStart(2,'0')+':'+String(absolute%60).padStart(2,'0');
 return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute+':'+p.second+suffix;
}
export function validatesOffsetDateTime(value:string,zone:string):Date{
 const instant=new Date(value);
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00(?:\.000)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(instant.getTime()))throw new ApiError(400,'INVALID_LOCAL_TIME','Use a whole-minute local time with its explicit UTC offset.');
 const actual=zonedIso(instant,zone),offset=value.endsWith('Z')?'+00:00':value.slice(-6);
 if(value.slice(0,19)!==actual.slice(0,19)||offset!==actual.slice(-6))throw new ApiError(400,'INVALID_LOCAL_TIME','The local time and offset do not match this property timezone. Choose a valid offered slot.');
 return instant;
}
export function localInstants(date:string,minute:number,zone:string):Date[]{
 addLocalDays(date,0);if(!Number.isInteger(minute)||minute<0||minute>=1440)return[];
 const base=Date.parse(date+'T00:00:00Z')+minute*60000,offsets=new Set<number>();
 for(let hours=-36;hours<=36;hours+=12){const probe=new Date(base+hours*3600000),p=parts(probe,zone);offsets.add(Math.round((Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second))-probe.getTime())/60000));}
 const result:number[]=[];
 for(const offset of offsets){const candidate=new Date(base-offset*60000);if(localDate(candidate,zone)===date&&localMinute(candidate,zone)===minute)result.push(candidate.getTime());}
 return[...new Set(result)].sort((a,b)=>a-b).map(value=>new Date(value));
}
export function localDayBounds(date:string,zone:string):{from:Date;until:Date}{
 const first=(day:string):Date=>{for(let minute=0;minute<=180;minute++){const candidates=localInstants(day,minute,zone);if(candidates[0])return candidates[0];}throw new ApiError(400,'INVALID_LOCAL_DATE','This local date has no supported day boundary in the selected timezone.');};
 return{from:first(date),until:first(addLocalDays(date,1))};
}
