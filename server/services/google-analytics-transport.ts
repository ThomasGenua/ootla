import type {ServerConfig} from '../config/env.js';
export const GOOGLE_ANALYTICS_SCOPE='https://www.googleapis.com/auth/analytics.readonly';
export type GoogleAnalyticsKind='summary'|'acquisition'|'landing'|'events';
export interface GoogleAnalyticsToken{access_token:string;refresh_token?:string;expires_in:number;scope?:string;token_type:string}
export interface GoogleAnalyticsProperty{id:string;name:string;timeZone:string|null}
export interface AnalyticsRemoteRow{label:string;users:number|null;sessions:number|null;events:number|null;keyEvents:number|null}
export interface AnalyticsRemoteReport{rows:AnalyticsRemoteRow[];total:number;timeZone:string|null;metadata:{thresholded:boolean;otherRow:boolean;sampled?:boolean;truncated?:boolean;empty?:boolean};available:boolean}
type GoogleConfig=ServerConfig['googleAnalytics'];
type Json=Record<string,unknown>;
export class GoogleAnalyticsRemoteError extends Error{
 constructor(readonly status:number,readonly code:string,readonly retryable:boolean,readonly revoked=false){super('Google Analytics could not complete the read-only request.');this.name='GoogleAnalyticsRemoteError';}
}
const invalid=()=>new GoogleAnalyticsRemoteError(502,'invalid_response',false);
const obj=(v:unknown):Json=>{if(!v||typeof v!=='object'||Array.isArray(v))throw invalid();return v as Json;};
const array=(v:unknown):unknown[]=>{if(v===undefined)return[];if(!Array.isArray(v))throw invalid();return v;};
function zone(v:unknown):string|null{if(typeof v!=='string'||v.length>100)return null;try{new Intl.DateTimeFormat('en',{timeZone:v}).format();return v;}catch{return null;}}
function propertyId(id:string):string{if(!/^properties\/[1-9][0-9]{0,19}$/.test(id))throw new GoogleAnalyticsRemoteError(400,'invalid_property',false);return id;}
function safeLabel(v:unknown,kind:GoogleAnalyticsKind|'property'):string{
 if(typeof v!=='string'||v.length>2048)throw invalid();let label=v.replace(/[\u0000-\u001f\u007f]/g,'').trim();
 try{label=decodeURIComponent(label);}catch{}
 if(/@|\b[0-9]{7,}\b|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(label))return'[Redacted value]';
 if(kind==='landing'){label=label.split(/[?#]/,1)[0]??'';if(/^\/(?:admin|api|applicant|resident|payment-demo|book)(?:\/|$)/i.test(label))return'[Private route excluded]';if(label!=='(not set)'&&!/^\/[A-Za-z0-9/_~.%-]*$/.test(label))return'[Redacted path]';}
 if(kind==='events'&&!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(label)&&label!=='(not set)')return'[Unrecognized event]';
 return(label||'(not set)').slice(0,160);
}
function numeric(v:unknown):number{if(typeof v!=='string'||!/^\d+(?:\.\d+)?$/.test(v))throw invalid();const n=Number(v);if(!Number.isFinite(n)||n<0||n>Number.MAX_SAFE_INTEGER)throw invalid();return n;}
/** Official read-only APIs; no configurable endpoint, tracking script or CRM upload operation. */
export class GoogleAnalyticsTransport{
 constructor(private readonly fetcher:typeof fetch=fetch){}
 authorizationUrl(config:GoogleConfig,state:string,challenge:string):string{
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  for(const[k,v]of Object.entries({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',scope:GOOGLE_ANALYTICS_SCOPE,access_type:'offline',prompt:'consent',include_granted_scopes:'false',state,code_challenge:challenge,code_challenge_method:'S256'}))url.searchParams.set(k,v);
  return url.toString();
 }
 private async request(url:string,init:RequestInit):Promise<unknown>{
  let response:Response;try{response=await this.fetcher(url,{...init,redirect:'error',signal:AbortSignal.timeout(4000)});}catch{throw new GoogleAnalyticsRemoteError(0,'network',true);}
  let text='';try{
   if(response.body){const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>1024*1024){await reader.cancel();throw invalid();}chunks.push(part.value);}text=Buffer.concat(chunks).toString('utf8');}
  }catch(e){if(e instanceof GoogleAnalyticsRemoteError)throw e;throw new GoogleAnalyticsRemoteError(0,'network',true);}
  let value:unknown={};if(text){try{value=JSON.parse(text);}catch{if(response.ok)throw invalid();}}
  if(!response.ok){
   const error=obj(value).error,raw=typeof error==='string'?error:error&&typeof error==='object'&&!Array.isArray(error)?String((error as Json).status??''):'';
   const allowed=['invalid_grant','invalid_token','access_denied','PERMISSION_DENIED','RESOURCE_EXHAUSTED','UNAUTHENTICATED','NOT_FOUND','INVALID_ARGUMENT'];
   const code=allowed.includes(raw)?raw:'http_'+response.status;
   throw new GoogleAnalyticsRemoteError(response.status,code,[408,429,500,502,503,504].includes(response.status)||code==='RESOURCE_EXHAUSTED',code==='invalid_grant'||code==='invalid_token'||response.status===401);
  }
  return value;
 }
 private async token(config:GoogleConfig,values:Record<string,string>):Promise<GoogleAnalyticsToken>{
  const value=obj(await this.request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,...values})}));
  if(typeof value.access_token!=='string'||!value.access_token||value.access_token.length>16384||typeof value.expires_in!=='number'||!Number.isInteger(value.expires_in)||value.expires_in<1||value.expires_in>86400||typeof value.token_type!=='string'||value.token_type.toLowerCase()!=='bearer'||value.refresh_token!==undefined&&(typeof value.refresh_token!=='string'||!value.refresh_token||value.refresh_token.length>16384)||value.scope!==undefined&&typeof value.scope!=='string')throw invalid();
  return value as unknown as GoogleAnalyticsToken;
 }
 exchange(config:GoogleConfig,code:string,verifier:string):Promise<GoogleAnalyticsToken>{return this.token(config,{grant_type:'authorization_code',code,redirect_uri:config.redirectUri,code_verifier:verifier});}
 refresh(config:GoogleConfig,refreshToken:string):Promise<GoogleAnalyticsToken>{return this.token(config,{grant_type:'refresh_token',refresh_token:refreshToken});}
 async revoke(token:string):Promise<void>{await this.request('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token})});}
 private api(token:string,url:string,init:RequestInit={}):Promise<unknown>{return this.request(url,{...init,headers:{Authorization:'Bearer '+token,...(init.body?{'Content-Type':'application/json'}:{}),...init.headers}});}
 async properties(token:string,pageToken?:string):Promise<{items:GoogleAnalyticsProperty[];nextPageToken:string|null}>{
  if(pageToken!==undefined&&(typeof pageToken!=='string'||pageToken.length>4096))throw new GoogleAnalyticsRemoteError(400,'invalid_page',false);
  const url=new URL('https://analyticsadmin.googleapis.com/v1beta/accountSummaries');url.searchParams.set('pageSize','50');if(pageToken)url.searchParams.set('pageToken',pageToken);
  const raw=obj(await this.api(token,url.toString())),items:GoogleAnalyticsProperty[]=[];
  for(const account of array(raw.accountSummaries)){for(const value of array(obj(account).propertySummaries)){const p=obj(value);if(typeof p.property!=='string')throw invalid();propertyId(p.property);items.push({id:p.property,name:safeLabel(p.displayName??p.property,'property'),timeZone:null});}}
  if(items.length>5000||raw.nextPageToken!==undefined&&(typeof raw.nextPageToken!=='string'||raw.nextPageToken.length>4096))throw invalid();
  return{items,nextPageToken:typeof raw.nextPageToken==='string'&&raw.nextPageToken?raw.nextPageToken:null};
 }
 async property(token:string,id:string):Promise<GoogleAnalyticsProperty>{
  propertyId(id);const raw=obj(await this.api(token,'https://analyticsadmin.googleapis.com/v1beta/'+id));
  if(raw.name!==id||raw.deleteTime||raw.expireTime)throw new GoogleAnalyticsRemoteError(404,'property_unavailable',false);
  return{id,name:safeLabel(raw.displayName??id,'property'),timeZone:zone(raw.timeZone)};
 }
 async keyEvents(token:string,id:string,pageToken?:string):Promise<{items:Array<{name:string;eventName:string;countingMethod:string}>;nextPageToken:string|null}>{
  propertyId(id);if(pageToken!==undefined&&(typeof pageToken!=='string'||pageToken.length>4096))throw new GoogleAnalyticsRemoteError(400,'invalid_page',false);
  const url=new URL('https://analyticsadmin.googleapis.com/v1beta/'+id+'/keyEvents');url.searchParams.set('pageSize','50');if(pageToken)url.searchParams.set('pageToken',pageToken);
  const raw=obj(await this.api(token,url.toString())),values=array(raw.keyEvents);if(values.length>50)throw invalid();
  const items=values.map(v=>{const r=obj(v);if(typeof r.name!=='string'||!r.name.startsWith(id+'/keyEvents/')||r.name.length>150||typeof r.eventName!=='string')throw invalid();return{name:r.name,eventName:safeLabel(r.eventName,'events'),countingMethod:['ONCE_PER_EVENT','ONCE_PER_SESSION','COUNTING_METHOD_UNSPECIFIED'].includes(String(r.countingMethod))?String(r.countingMethod):'COUNTING_METHOD_UNSPECIFIED'};});
  if(raw.nextPageToken!==undefined&&(typeof raw.nextPageToken!=='string'||raw.nextPageToken.length>4096))throw invalid();
  return{items,nextPageToken:typeof raw.nextPageToken==='string'&&raw.nextPageToken?raw.nextPageToken:null};
 }
 async report(token:string,id:string,kind:GoogleAnalyticsKind,range:{from:string;to:string},page=1,pageSize=25):Promise<AnalyticsRemoteReport>{
  propertyId(id);
  const date=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
  if(!date(range.from)||!date(range.to)||range.to<range.from||Date.parse(range.to)-Date.parse(range.from)>365*86400000||!Number.isInteger(page)||page<1||page>100000||!Number.isInteger(pageSize)||pageSize<1||pageSize>50||!['summary','acquisition','landing','events'].includes(kind))throw new GoogleAnalyticsRemoteError(400,'invalid_report',false);
  const dimension=kind==='acquisition'?'sessionSourceMedium':kind==='landing'?'landingPage':kind==='events'?'eventName':null;
  const metrics=kind==='events'?['eventCount','keyEvents']:kind==='summary'?['activeUsers','sessions','eventCount','keyEvents']:['activeUsers','sessions'];
  const body:Json={dateRanges:[{startDate:range.from,endDate:range.to}],metrics:metrics.map(name=>({name})),...(dimension?{dimensions:[{name:dimension}]}:{}),offset:String(kind==='summary'?0:(page-1)*pageSize),limit:String(kind==='summary'?1:pageSize),keepEmptyRows:false,returnPropertyQuota:true,orderBys:[{metric:{metricName:kind==='events'?'eventCount':'sessions'},desc:true},...(dimension?[{dimension:{dimensionName:dimension},desc:false}]:[])]};
  if(kind==='landing')body.dimensionFilter={notExpression:{filter:{fieldName:'landingPage',stringFilter:{matchType:'FULL_REGEXP',value:'^/(admin|api|applicant|resident|payment-demo|book)(/|$).*',caseSensitive:false}}}};
  const raw=obj(await this.api(token,'https://analyticsdata.googleapis.com/v1beta/'+id+':runReport',{method:'POST',body:JSON.stringify(body)}));
  const names=(v:unknown)=>array(v).map(h=>obj(h).name),metricNames=names(raw.metricHeaders),dimensionNames=names(raw.dimensionHeaders);
  if(metricNames.length!==metrics.length||metricNames.some((n,i)=>n!==metrics[i])||dimensionNames.length!==(dimension?1:0)||dimension&&dimensionNames[0]!==dimension)throw invalid();
  const total=raw.rowCount===undefined?0:Number(raw.rowCount);if(!Number.isSafeInteger(total)||total<0||total>1000000000)throw invalid();
  const metadata=raw.metadata===undefined?{}:obj(raw.metadata),quality={thresholded:metadata.subjectToThresholding===true,otherRow:metadata.dataLossFromOtherRow===true,sampled:array(metadata.samplingMetadatas).length>0,truncated:array(metadata.dataTruncationReasons).length>0,empty:typeof metadata.emptyReason==='string'&&Boolean(metadata.emptyReason)};
  const nativeRows=array(raw.rows);if(nativeRows.length>(kind==='summary'?1:pageSize))throw invalid();if(nativeRows.length&&total===0)throw invalid();
  const rows:AnalyticsRemoteRow[]=nativeRows.map(v=>{const row=obj(v),values=array(row.metricValues),dims=array(row.dimensionValues);if(values.length!==metrics.length||dims.length!==(dimension?1:0))throw invalid();const mapped=new Map(metrics.map((m,i)=>[m,numeric(obj(values[i]).value)]));return{label:dimension?safeLabel(obj(dims[0]).value,kind):'Total',users:mapped.get('activeUsers')??null,sessions:mapped.get('sessions')??null,events:mapped.get('eventCount')??null,keyEvents:mapped.get('keyEvents')??null};});
  const available=!quality.empty&&!(quality.thresholded&&nativeRows.length===0);
  if(kind==='summary'&&nativeRows.length===0&&total===0)rows.push({label:'Total',users:available?0:null,sessions:available?0:null,events:available?0:null,keyEvents:available?0:null});
  return{rows,total,timeZone:zone(metadata.timeZone),metadata:quality,available};
 }
}
