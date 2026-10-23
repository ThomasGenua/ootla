import type { ServerConfig } from '../config/env.js';
export const GOOGLE_CALENDAR_SCOPES=['https://www.googleapis.com/auth/calendar.calendarlist.readonly','https://www.googleapis.com/auth/calendar.events'] as const;
export interface GoogleToken{access_token:string;refresh_token?:string;expires_in:number;scope?:string;token_type:string}
export interface GoogleRemoteCalendar{id:string;summary?:string;timeZone?:string;accessRole:string;deleted?:boolean}
export interface GoogleRemoteEvent{id:string;etag?:string;status?:string;start?:{dateTime?:string;date?:string;timeZone?:string};end?:{dateTime?:string;date?:string;timeZone?:string};transparency?:string;attendees?:unknown[];extendedProperties?:{private?:Record<string,string>};[key:string]:unknown}
export class GoogleCalendarRemoteError extends Error{
 constructor(readonly status:number,readonly code:string,readonly retryable:boolean,readonly revoked=false){super('Google Calendar request did not complete.');this.name='GoogleCalendarRemoteError';}
}
type GoogleConfig=ServerConfig['googleCalendar'];
/** Fixed official endpoints only. Injection is a code-only test seam, never an HTTP/config URL. */
export class GoogleCalendarTransport{
 constructor(private readonly fetcher:typeof fetch=fetch){}
 authorizationUrl(config:GoogleConfig,state:string,challenge:string):string{
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  for(const [name,value] of Object.entries({client_id:config.clientId!,redirect_uri:config.redirectUri!,response_type:'code',scope:GOOGLE_CALENDAR_SCOPES.join(' '),access_type:'offline',prompt:'consent',include_granted_scopes:'false',state,code_challenge:challenge,code_challenge_method:'S256'}))url.searchParams.set(name,value);
  return url.toString();
 }
 private async request<T>(url:string,init:RequestInit):Promise<T>{
  let response:Response;try{response=await this.fetcher(url,{...init,redirect:'error',signal:AbortSignal.timeout(4000)});}catch{throw new GoogleCalendarRemoteError(0,'network',true);}
  if(!response.ok){
   let payload:{error?:string|{errors?:{reason?:string}[];status?:string}}={};try{payload=await response.json() as typeof payload;}catch{}
   const raw=typeof payload.error==='string'?payload.error:payload.error?.errors?.[0]?.reason;
   const allowed=['invalid_grant','invalid_token','access_denied','rateLimitExceeded','userRateLimitExceeded','dailyLimitExceeded','notFound','forbidden','conditionNotMet'];
   const code=raw&&allowed.includes(raw)?raw:'http_'+response.status;
   throw new GoogleCalendarRemoteError(response.status,code,[408,429,500,502,503,504].includes(response.status)||(response.status===403&&['rateLimitExceeded','userRateLimitExceeded'].includes(code)),code==='invalid_grant'||code==='invalid_token');
  }
  if(response.status===204||response.headers.get('content-length')==='0')return undefined as T;
  const text=await response.text();if(!text)return undefined as T;
  try{return JSON.parse(text) as T;}catch{throw new GoogleCalendarRemoteError(502,'invalid_response',true);}
 }
 private token(config:GoogleConfig,values:Record<string,string>):Promise<GoogleToken>{
  return this.request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId!,client_secret:config.clientSecret!,...values})});
 }
 exchange(config:GoogleConfig,code:string,verifier:string):Promise<GoogleToken>{return this.token(config,{grant_type:'authorization_code',code,redirect_uri:config.redirectUri!,code_verifier:verifier});}
 refresh(config:GoogleConfig,refreshToken:string):Promise<GoogleToken>{return this.token(config,{grant_type:'refresh_token',refresh_token:refreshToken});}
 async revoke(token:string):Promise<void>{await this.request('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token})});}
 private api<T>(accessToken:string,path:string,query:Record<string,string>={},init:RequestInit={}):Promise<T>{
  const url=new URL('https://www.googleapis.com/calendar/v3/'+path);for(const [name,value] of Object.entries(query))url.searchParams.set(name,value);
  return this.request(url.toString(),{...init,headers:{Authorization:'Bearer '+accessToken,...(init.body?{'Content-Type':'application/json'}:{}),...init.headers}});
 }
 calendars(token:string,pageToken?:string):Promise<{items?:GoogleRemoteCalendar[];nextPageToken?:string}>{return this.api(token,'users/me/calendarList',{maxResults:'100',...(pageToken?{pageToken}:{})});}
 calendar(token:string,id:string):Promise<GoogleRemoteCalendar>{return this.api(token,'users/me/calendarList/'+encodeURIComponent(id));}
 events(token:string,id:string,query:Record<string,string>):Promise<{items?:GoogleRemoteEvent[];nextPageToken?:string;nextSyncToken?:string}>{return this.api(token,'calendars/'+encodeURIComponent(id)+'/events',query);}
 event(token:string,calendar:string,id:string):Promise<GoogleRemoteEvent>{return this.api(token,'calendars/'+encodeURIComponent(calendar)+'/events/'+encodeURIComponent(id));}
 insert(token:string,calendar:string,body:GoogleRemoteEvent):Promise<GoogleRemoteEvent>{return this.api(token,'calendars/'+encodeURIComponent(calendar)+'/events',{sendUpdates:'none'},{method:'POST',body:JSON.stringify(body)});}
 update(token:string,calendar:string,id:string,body:GoogleRemoteEvent,etag:string):Promise<GoogleRemoteEvent>{return this.api(token,'calendars/'+encodeURIComponent(calendar)+'/events/'+encodeURIComponent(id),{sendUpdates:'none'},{method:'PUT',headers:{'If-Match':etag},body:JSON.stringify(body)});}
 async remove(token:string,calendar:string,id:string,etag:string):Promise<void>{await this.api(token,'calendars/'+encodeURIComponent(calendar)+'/events/'+encodeURIComponent(id),{sendUpdates:'none'},{method:'DELETE',headers:{'If-Match':etag}});}
}
