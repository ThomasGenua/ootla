/** Staff-facing dates use the browser-resolved user timezone; stored values remain UTC instants. */
export function resolveUserTimeZone():string {
 try {const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;if(zone){new Intl.DateTimeFormat(undefined,{timeZone:zone}).format();return zone;}}catch{/* UTC is a safe fallback when a browser cannot resolve its timezone. */}
 return 'UTC';
}
export function formatUserTime(value:string|null,timeZone:string):string {
 if(!value)return 'Not recorded';const date=new Date(value);if(!Number.isFinite(date.getTime()))return 'Not recorded';
 return new Intl.DateTimeFormat(undefined,{timeZone,dateStyle:'medium',timeStyle:'short'}).format(date);
}
export function userLocalInput(value:string|null,timeZone:string):string {
 if(!value)return '';const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
 const get=(key:string)=>parts.find(part=>part.type===key)?.value??'';
 return get('year')+'-'+get('month')+'-'+get('day')+'T'+get('hour')+':'+get('minute');
}
/** Preserve an unchanged instant, including seconds and a daylight-saving overlap's original offset. */
export function userInstant(value:string|null,timeZone:string,original:string|null=null):string|null {
 if(!value)return null;const local=String(value);
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))throw new Error('Choose a complete date and time.');
 if(original&&Number.isFinite(Date.parse(original))&&userLocalInput(original,timeZone)===local)return new Date(original).toISOString();
 const naive=Date.parse(local+':00Z');if(!Number.isFinite(naive))throw new Error('Choose a valid date and time.');
 // Check the possible offsets around the requested civil time, as in the existing lease workflow.
 const offsets=new Set<number>();for(let hours=-36;hours<=36;hours+=6){const instant=naive+hours*3600000;offsets.add(Date.parse(userLocalInput(new Date(instant).toISOString(),timeZone)+':00Z')-instant);}
 const candidates=[...offsets].map(offset=>naive-offset).filter(instant=>userLocalInput(new Date(instant).toISOString(),timeZone)===local);
 if(candidates.length!==1)throw new Error(candidates.length?'This time occurs twice during a clock change. Choose another time.':'This time does not exist in your timezone. Choose another time.');
 return new Date(candidates[0]!).toISOString();
}
