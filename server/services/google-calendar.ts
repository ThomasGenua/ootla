import {createHash,createHmac,randomBytes,randomUUID} from 'node:crypto';
import type {PoolClient,QueryResultRow} from 'pg';
import type {AuthUser} from '../../shared/contracts.js';
import type {GoogleCalendarBusy,GoogleCalendarChoices,GoogleCalendarStatus,GoogleViewingSync} from '../../shared/google-calendar-contracts.js';
import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import {ApiError} from '../http/errors.js';
import {encryptConnectorCredential,decryptConnectorCredential,type CredentialEnvelope} from '../connectors/vault.js';
import {GoogleCalendarTransport,GoogleCalendarRemoteError,GOOGLE_CALENDAR_SCOPES,type GoogleToken,type GoogleRemoteEvent} from './google-calendar-transport.js';
import {localInstants} from './calendar-time.js';
type Row=QueryResultRow;
type Tokens={accessToken:string;refreshToken:string};
const iso=(v:unknown):string|null=>v?(v instanceof Date?v:new Date(String(v))).toISOString():null;
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const configured=(config:ServerConfig)=>Boolean(config.googleCalendar?.enabled&&config.googleCalendar.clientId&&config.googleCalendar.clientSecret&&config.googleCalendar.redirectUri&&config.googleCalendar.tokenEncryptionKey);
const context=(r:Row)=>'ootla:google-calendar:tokens:'+r.organization_id+':'+r.id;
const stateContext=(org:string,membership:string,state:string)=>'ootla:google-calendar:oauth:'+org+':'+membership+':'+state;
const notice='Local bookings remain saved independently of Google. Google synchronization can be delayed or fail. Attendee invitations are disabled; Ootla only changes events it owns.';
async function lock(c:PoolClient,id:string):Promise<void>{await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ootla:google-calendar:'+id]);}
async function authorize(c:PoolClient,u:AuthUser,digest:string,manage=false):Promise<Row>{
 const r=(await c.query("SELECT m.role,o.environment,u.is_demo,EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission='leasing.manage') AS can_manage FROM organization_memberships m JOIN users u ON u.id=m.user_id JOIN organizations o ON o.id=m.organization_id JOIN sessions s ON s.user_id=m.user_id AND s.organization_id=m.organization_id AND s.token_digest=$4 AND s.expires_at>clock_timestamp() WHERE m.id=$1 AND m.organization_id=$2 AND m.user_id=$3 AND m.active AND m.account_kind='staff' AND u.active AND u.account_kind='staff' FOR SHARE OF m,u,o,s",[u.membershipId,u.organization.id,u.id,digest])).rows[0];
 if(!r)throw new ApiError(401,'AUTH_REQUIRED','Your session ended. Sign in again.');
 if(manage&&!r.can_manage)throw new ApiError(403,'GOOGLE_CALENDAR_FORBIDDEN','Calendar connection changes require lead-management permission.');
 return r;
}
function enabled(config:ServerConfig,identity:Row):void{
 if(config.demoMode||identity.is_demo||identity.environment!=='live')throw new ApiError(409,'GOOGLE_CALENDAR_DEMO','Live Google Calendar is disabled in demo environments. Internal scheduling remains available.');
 if(!configured(config))throw new ApiError(409,'GOOGLE_CALENDAR_NOT_CONFIGURED','Google Calendar is not configured. Internal scheduling remains available.');
}
async function connection(c:PoolClient,u:AuthUser):Promise<Row|undefined>{return(await c.query('SELECT * FROM google_calendar_connections WHERE organization_id=$1 AND membership_id=$2',[u.organization.id,u.membershipId])).rows[0];}
async function audit(c:PoolClient,u:AuthUser,action:string,metadata:Record<string,unknown>={}):Promise<void>{await c.query('INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,$3,$4::jsonb)',[u.organization.id,u.id,'google_calendar.'+action,JSON.stringify(metadata)]);}
function safeRemote(error:unknown):ApiError{return new ApiError(error instanceof GoogleCalendarRemoteError&&error.retryable?503:409,'GOOGLE_CALENDAR_REQUEST_FAILED','Google Calendar could not complete this action. Local bookings are unchanged. Check connection status or reconnect.');}
async function revokeLocal(c:PoolClient,r:Row):Promise<void>{
 await c.query("UPDATE google_calendar_connections SET state='revoked',token_envelope=NULL,token_expires_at=NULL,last_error='Access revoked. Reconnect Google Calendar.',version=version+1,updated_at=now() WHERE id=$1",[r.id]);
 await c.query("UPDATE google_calendar_jobs SET state='cancelled',last_error='Connection requires authorization.',updated_at=now() WHERE connection_id=$1 AND state IN ('queued','running','retry')",[r.id]);
}
async function access(c:PoolClient,r:Row,config:ServerConfig,transport:GoogleCalendarTransport,force=false):Promise<string>{
 if(!r.token_envelope||['disconnected','revoked'].includes(r.state))throw new GoogleCalendarRemoteError(401,'invalid_grant',false,true);
 const values=JSON.parse(decryptConnectorCredential(r.token_envelope as CredentialEnvelope,config.googleCalendar.tokenEncryptionKey,context(r))) as Tokens;
 if(!values.accessToken||!values.refreshToken)throw new GoogleCalendarRemoteError(401,'invalid_grant',false,true);
 if(!force&&r.token_expires_at&&new Date(r.token_expires_at).getTime()>Date.now()+60000)return values.accessToken;
 const next=await transport.refresh(config.googleCalendar,values.refreshToken);
 validateToken(next,false);
 const tokens={accessToken:next.access_token,refreshToken:next.refresh_token||values.refreshToken};
 r.token_envelope=encryptConnectorCredential(JSON.stringify(tokens),config.googleCalendar.tokenEncryptionKey,context(r));r.token_expires_at=new Date(Date.now()+next.expires_in*1000);
 await c.query('UPDATE google_calendar_connections SET token_envelope=$2::jsonb,token_expires_at=$3,updated_at=now() WHERE id=$1',[r.id,JSON.stringify(r.token_envelope),r.token_expires_at]);return tokens.accessToken;
}
function validateToken(value:GoogleToken,requireRefresh:boolean):void{
 if(!value||typeof value.access_token!=='string'||!value.access_token||value.access_token.length>16384||(requireRefresh&&(!value.refresh_token||value.refresh_token.length>16384))||!Number.isFinite(value.expires_in)||value.expires_in<1||value.expires_in>86400||value.token_type?.toLowerCase()!=='bearer')throw new GoogleCalendarRemoteError(502,'invalid_response',false);
 if((requireRefresh||value.scope!==undefined)&&(!value.scope||!GOOGLE_CALENDAR_SCOPES.every(s=>value.scope!.split(/\s+/).includes(s))))throw new GoogleCalendarRemoteError(403,'access_denied',false);
}
async function remote<T>(c:PoolClient,r:Row,config:ServerConfig,t:GoogleCalendarTransport,operation:(token:string)=>Promise<T>):Promise<T>{
 try{let token=await access(c,r,config,t);try{return await operation(token);}catch(e){if(!(e instanceof GoogleCalendarRemoteError)||e.status!==401)throw e;token=await access(c,r,config,t,true);return await operation(token);}}
 catch(e){if(e instanceof GoogleCalendarRemoteError&&(e.revoked||e.status===401)){await revokeLocal(c,r);throw new GoogleCalendarRemoteError(401,'invalid_grant',false,true);}throw e;}
}
async function pullJob(c:PoolClient,r:Row,calendarId:string):Promise<void>{
 await c.query("INSERT INTO google_calendar_jobs(connection_id,organization_id,kind,calendar_id,dedupe_key) VALUES($1,$2,'pull',$3,$4) ON CONFLICT(dedupe_key) DO UPDATE SET state='queued',attempts=0,available_at=now(),last_error=NULL,updated_at=now() WHERE google_calendar_jobs.state IN ('succeeded','cancelled')",[r.id,r.organization_id,calendarId,'pull:'+r.id+':'+sha(calendarId)]);
}
/** Call inside the same transaction as the successful local viewing change. No network work. */
export async function enqueueGoogleViewingSync(c:PoolClient,organizationId:string,viewingId:string):Promise<void>{
 await c.query("INSERT INTO google_calendar_jobs(connection_id,organization_id,kind,viewing_id,dedupe_key) SELECT DISTINCT g.id,v.organization_id,'viewing',v.id,'viewing:'||g.id::text||':'||v.id::text||':'||v.version::text FROM viewings v JOIN google_calendar_connections g ON g.organization_id=v.organization_id AND (g.membership_id=v.owner_membership_id OR EXISTS(SELECT 1 FROM google_calendar_event_mappings em WHERE em.connection_id=g.id AND em.viewing_id=v.id)) JOIN organizations o ON o.id=g.organization_id JOIN users u ON u.id=g.user_id WHERE v.id=$1 AND v.organization_id=$2 AND v.managed_by_ootla AND g.state IN ('connected','degraded') AND g.token_envelope IS NOT NULL AND o.environment='live' AND NOT u.is_demo AND EXISTS(SELECT 1 FROM google_calendar_selections cs WHERE cs.connection_id=g.id AND cs.write_target) ON CONFLICT(dedupe_key) DO NOTHING",[viewingId,organizationId]);
}
export class GoogleCalendarService{
 constructor(private readonly database:Database,private readonly config:ServerConfig,private readonly transport=new GoogleCalendarTransport()){}
 async status(u:AuthUser,digest:string):Promise<GoogleCalendarStatus>{return this.database.transaction(async c=>{
  const identity=await authorize(c,u,digest);const r=await connection(c,u);const demo=this.config.demoMode||identity.is_demo||identity.environment!=='live';
  const selections=r?(await c.query('SELECT * FROM google_calendar_selections WHERE connection_id=$1 ORDER BY write_target DESC,display_name,calendar_id',[r.id])).rows:[];
  const jobs=r?(await c.query("SELECT count(*) FILTER(WHERE state IN ('queued','running','retry'))::int AS pending,count(*) FILTER(WHERE state='failed')::int AS failed FROM google_calendar_jobs WHERE connection_id=$1",[r.id])).rows[0]:{pending:0,failed:0};
  const coverage=selections.length&&selections.every(s=>s.coverage_from&&s.coverage_until)?selections:[];const from=coverage.length?new Date(Math.max(...coverage.map(s=>new Date(s.coverage_from).getTime()))):null;const until=coverage.length?new Date(Math.min(...coverage.map(s=>new Date(s.coverage_until).getTime()))):null;
  return{state:demo?'demo':!configured(this.config)?'not_configured':r?.state??'not_configured',configured:configured(this.config)&&!demo,canConnect:Boolean(identity.can_manage)&&!demo&&configured(this.config),canManage:Boolean(identity.can_manage),localSchedulingAvailable:true,demo,notice:demo?'Demo calendar: local scheduling and simulated notifications only. No Google authorization, provider calls or real invitations occur.':notice,lastSuccessfulSync:iso(r?.last_successful_sync),lastError:r?.last_error??null,selectedCalendars:selections.map(s=>({id:s.calendar_id,name:s.display_name,timeZone:s.time_zone,writable:['owner','writer'].includes(s.access_role),writeTarget:s.write_target,lastSuccessfulSync:iso(s.last_successful_sync),state:s.state})),jobs:{pending:Number(jobs.pending),failed:Number(jobs.failed)},invitations:'disabled',ownership:'ootla_only',coverage:from&&until?{from:from.toISOString(),until:until.toISOString()}:null};
 });}
 async start(u:AuthUser,digest:string):Promise<{authorizationUrl:string}>{return this.database.transaction(async c=>{
  const identity=await authorize(c,u,digest,true);enabled(this.config,identity);await lock(c,u.membershipId);
  if(Number((await c.query("SELECT count(*)::int AS count FROM google_calendar_oauth_states WHERE organization_id=$1 AND membership_id=$2 AND created_at>now()-interval '15 minutes'",[u.organization.id,u.membershipId])).rows[0].count)>=5)throw new ApiError(429,'GOOGLE_AUTH_RATE_LIMIT','Wait before starting another Google authorization.');
  const state=randomBytes(32).toString('hex'),digestState=sha(state),verifier=randomBytes(48).toString('base64url');
  const envelope=encryptConnectorCredential(verifier,this.config.googleCalendar.tokenEncryptionKey,stateContext(u.organization.id,u.membershipId,digestState));
  await c.query("INSERT INTO google_calendar_oauth_states(state_digest,organization_id,membership_id,user_id,session_digest,verifier_envelope,expires_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,now()+interval '10 minutes')",[digestState,u.organization.id,u.membershipId,u.id,digest,JSON.stringify(envelope)]);
  await c.query("INSERT INTO google_calendar_connections(organization_id,membership_id,user_id,state) VALUES($1,$2,$3,'connecting') ON CONFLICT(organization_id,membership_id) DO NOTHING",[u.organization.id,u.membershipId,u.id]);await audit(c,u,'authorization_started');
  return{authorizationUrl:this.transport.authorizationUrl(this.config.googleCalendar,state,createHash('sha256').update(verifier).digest('base64url'))};
 });}
 async callback(u:AuthUser,digest:string,input:{state:string;code?:string;error?:string}):Promise<void>{
  const verifier=await this.database.transaction(async c=>{
   const identity=await authorize(c,u,digest,true);enabled(this.config,identity);await lock(c,u.membershipId);
   const r=(await c.query('SELECT * FROM google_calendar_oauth_states WHERE state_digest=$1 AND organization_id=$2 AND membership_id=$3 AND user_id=$4 AND session_digest=$5 AND used_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE',[sha(input.state),u.organization.id,u.membershipId,u.id,digest])).rows[0];
   if(!r)throw new ApiError(400,'GOOGLE_AUTH_STATE_INVALID','This authorization expired or belongs to another sign-in. Start again from Calendar.');
   await c.query('UPDATE google_calendar_oauth_states SET used_at=now() WHERE state_digest=$1',[r.state_digest]);
   await audit(c,u,input.error?'authorization_denied':'authorization_callback');
   return input.error||!input.code?null:decryptConnectorCredential(r.verifier_envelope as CredentialEnvelope,this.config.googleCalendar.tokenEncryptionKey,stateContext(u.organization.id,u.membershipId,r.state_digest));
  });
  if(!verifier)throw new ApiError(409,'GOOGLE_AUTH_DENIED','Google authorization was not completed.');
  let token:GoogleToken;try{token=await this.transport.exchange(this.config.googleCalendar,input.code!,verifier);validateToken(token,true);}catch(e){throw safeRemote(e);}
  await this.database.transaction(async c=>{
   const identity=await authorize(c,u,digest,true);enabled(this.config,identity);await lock(c,u.membershipId);
   const r=await connection(c,u);if(!r)throw new ApiError(409,'GOOGLE_AUTH_RESTART','Start authorization again.');
   await lock(c,r.id);
   const activeState=(await c.query('SELECT 1 FROM google_calendar_oauth_states os WHERE os.state_digest=$1 AND os.organization_id=$2 AND os.membership_id=$3 AND os.user_id=$4 AND os.session_digest=$5 AND os.used_at IS NOT NULL AND os.expires_at>clock_timestamp() AND NOT EXISTS(SELECT 1 FROM google_calendar_oauth_states newer WHERE newer.organization_id=os.organization_id AND newer.membership_id=os.membership_id AND newer.created_at>os.created_at)',[sha(input.state),u.organization.id,u.membershipId,u.id,digest])).rowCount;
   if(!activeState)throw new ApiError(409,'GOOGLE_AUTH_RESTART','This authorization was replaced or disconnected. Start again from Calendar.');
   const envelope=encryptConnectorCredential(JSON.stringify({accessToken:token.access_token,refreshToken:token.refresh_token}),this.config.googleCalendar.tokenEncryptionKey,context(r));
   await c.query("UPDATE google_calendar_connections SET state='connected',token_envelope=$2::jsonb,token_expires_at=$3,scopes=$4,last_error=NULL,version=version+1,updated_at=now() WHERE id=$1",[r.id,JSON.stringify(envelope),new Date(Date.now()+token.expires_in*1000),GOOGLE_CALENDAR_SCOPES]);
   await c.query("UPDATE google_calendar_jobs SET state='cancelled',last_error='Select calendars after authorization.',updated_at=now() WHERE connection_id=$1 AND state IN ('queued','running','retry')",[r.id]);
   await c.query('DELETE FROM google_calendar_selections WHERE connection_id=$1',[r.id]);await audit(c,u,'authorized',{connectionId:r.id});
  });
 }
 private async action<T>(u:AuthUser,digest:string,operation:(c:PoolClient,r:Row)=>Promise<T>):Promise<T>{
  const outcome=await this.database.transaction(async c=>{
   const identity=await authorize(c,u,digest,true);enabled(this.config,identity);const r=await connection(c,u);if(!r||!r.token_envelope||['revoked','disconnected'].includes(r.state))throw new ApiError(409,'GOOGLE_AUTH_REQUIRED','Authorize Google Calendar first.');
   await lock(c,r.id);const current=(await c.query('SELECT * FROM google_calendar_connections WHERE id=$1',[r.id])).rows[0];
   if(!current?.token_envelope||!['connected','degraded'].includes(current.state))throw new ApiError(409,'GOOGLE_AUTH_REQUIRED','Authorize Google Calendar first.');
   try{return{value:await operation(c,current),failed:false} as const;}catch(e){if(e instanceof GoogleCalendarRemoteError){if(e.revoked)await revokeLocal(c,current);else await c.query("UPDATE google_calendar_connections SET state='degraded',last_error='Google request failed. Try sync or reconnect.',updated_at=now() WHERE id=$1",[r.id]);return{failed:true} as const;}throw e;}
  });if(outcome.failed)throw safeRemote(null);return outcome.value;
 }
 async calendars(u:AuthUser,digest:string,pageToken?:string):Promise<GoogleCalendarChoices>{return this.action(u,digest,async(c,r)=>{
  const response=await remote(c,r,this.config,this.transport,t=>this.transport.calendars(t,pageToken));const selected=new Set((await c.query('SELECT calendar_id FROM google_calendar_selections WHERE connection_id=$1',[r.id])).rows.map(s=>s.calendar_id));
  return{items:(response.items??[]).filter(v=>v.id&&!v.deleted&&['reader','writer','owner'].includes(v.accessRole)).map(v=>({id:v.id,name:v.summary||'Google calendar',timeZone:v.timeZone||'UTC',accessRole:v.accessRole,selected:selected.has(v.id),writable:['owner','writer'].includes(v.accessRole)})),nextPageToken:response.nextPageToken??null};
 });}
 async select(u:AuthUser,digest:string,input:{calendarIds:string[];writeCalendarId:string}):Promise<{saved:true}>{
  return this.action(u,digest,async(c,r)=>{
   if(input.calendarIds.length<1||input.calendarIds.length>10||new Set(input.calendarIds).size!==input.calendarIds.length||!input.calendarIds.includes(input.writeCalendarId))throw new ApiError(400,'INVALID_CALENDAR_SELECTION','Select up to ten calendars and one writable destination.');
   const calendars=[];for(const id of input.calendarIds){const item=await remote(c,r,this.config,this.transport,t=>this.transport.calendar(t,id));if(item.id!==id||item.deleted||!['reader','writer','owner'].includes(item.accessRole)||id===input.writeCalendarId&&!['writer','owner'].includes(item.accessRole))throw new ApiError(400,'INVALID_CALENDAR_SELECTION','Each selection must be accessible and the destination writable.');calendars.push(item);}
   if((await c.query("SELECT id FROM google_calendar_event_mappings WHERE connection_id=$1 AND calendar_id<>$2 AND state<>'cancelled' LIMIT 1",[r.id,input.writeCalendarId])).rowCount)throw new ApiError(409,'GOOGLE_DESTINATION_IN_USE','Keep the current destination while its Ootla events remain mapped. Cancel/reconcile them before changing destinations.');
   await c.query('DELETE FROM google_calendar_selections WHERE connection_id=$1 AND NOT(calendar_id=ANY($2::text[]))',[r.id,input.calendarIds]);
   await c.query('UPDATE google_calendar_selections SET write_target=false WHERE connection_id=$1',[r.id]);
   for(const item of calendars){await c.query("INSERT INTO google_calendar_selections(connection_id,organization_id,calendar_id,display_name,time_zone,access_role,write_target) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(connection_id,calendar_id) DO UPDATE SET display_name=EXCLUDED.display_name,time_zone=EXCLUDED.time_zone,access_role=EXCLUDED.access_role,write_target=EXCLUDED.write_target",[r.id,r.organization_id,item.id,(item.summary||'Google calendar').slice(0,200),item.timeZone||'UTC',item.accessRole,item.id===input.writeCalendarId]);await pullJob(c,r,item.id);}
   const viewings=(await c.query("SELECT id FROM viewings WHERE organization_id=$1 AND owner_membership_id=$2 AND managed_by_ootla AND status='scheduled' ORDER BY starts_at",[r.organization_id,r.membership_id])).rows;
   for(const v of viewings)await enqueueGoogleViewingSync(c,r.organization_id,v.id);
   await audit(c,u,'calendars_selected',{connectionId:r.id,count:calendars.length});return{saved:true};
  });
 }
 async sync(u:AuthUser,digest:string):Promise<{queued:true}>{return this.action(u,digest,async(c,r)=>{const selections=(await c.query('SELECT calendar_id FROM google_calendar_selections WHERE connection_id=$1',[r.id])).rows;if(!selections.length)throw new ApiError(409,'GOOGLE_SELECTION_REQUIRED','Select calendars first.');for(const s of selections)await pullJob(c,r,s.calendar_id);await audit(c,u,'sync_requested',{connectionId:r.id});return{queued:true};});}
 async retry(u:AuthUser,digest:string):Promise<{queued:true}>{return this.action(u,digest,async(c,r)=>{await c.query("UPDATE google_calendar_jobs SET state='queued',attempts=0,available_at=now(),last_error=NULL,updated_at=now() WHERE connection_id=$1 AND state='failed'",[r.id]);await c.query("UPDATE google_calendar_event_mappings SET state='pending',last_error=NULL WHERE connection_id=$1 AND state='failed'",[r.id]);await audit(c,u,'retry_requested',{connectionId:r.id});return{queued:true};});}
 async disconnect(u:AuthUser,digest:string):Promise<{disconnected:true;revocation:'requested'|'unavailable';remoteEventsRetained:true}>{
  const token=await this.database.transaction(async c=>{
   const identity=await authorize(c,u,digest,true);const r=await connection(c,u);if(!r)return null;await lock(c,r.id);let token:string|null=null;
   if(!this.config.demoMode&&!identity.is_demo&&identity.environment==='live'&&configured(this.config)&&r.token_envelope){try{token=(JSON.parse(decryptConnectorCredential(r.token_envelope as CredentialEnvelope,this.config.googleCalendar.tokenEncryptionKey,context(r))) as Tokens).refreshToken;}catch{}}
   await c.query("UPDATE google_calendar_connections SET state='disconnected',token_envelope=NULL,token_expires_at=NULL,version=version+1,last_error=NULL,updated_at=now() WHERE id=$1",[r.id]);
   await c.query("UPDATE google_calendar_jobs SET state='cancelled',updated_at=now() WHERE connection_id=$1 AND state IN ('queued','running','retry','failed')",[r.id]);
   await c.query('DELETE FROM google_calendar_oauth_states WHERE organization_id=$1 AND membership_id=$2',[u.organization.id,u.membershipId]);
   await c.query('DELETE FROM google_calendar_selections WHERE connection_id=$1',[r.id]);await audit(c,u,'disconnected',{connectionId:r.id,remoteEventsRetained:true});return token;
  });
  let revocation:'requested'|'unavailable'='unavailable';if(token){try{await this.transport.revoke(token);revocation='requested';}catch{}}
  return{disconnected:true,revocation,remoteEventsRetained:true};
 }
 async busy(u:AuthUser,digest:string,input:{from:string;until:string}):Promise<GoogleCalendarBusy>{
  const status=await this.status(u,digest);if(status.demo||!status.configured||['revoked','disconnected','not_configured'].includes(status.state))return{items:[],lastSuccessfulSync:status.lastSuccessfulSync,coverage:status.coverage,notice:status.notice};
  return this.database.transaction(async c=>{
   await authorize(c,u,digest);const rows=(await c.query("SELECT ec.calendar_id,ec.event_id,ec.starts_at,ec.ends_at,ec.all_day FROM google_calendar_event_cache ec JOIN google_calendar_connections g ON g.id=ec.connection_id WHERE g.organization_id=$1 AND g.membership_id=$2 AND ec.status<>'cancelled' AND ec.opaque AND ec.owned_viewing_id IS NULL AND ec.starts_at<$4 AND ec.ends_at>$3 ORDER BY ec.starts_at,ec.event_id LIMIT 501",[u.organization.id,u.membershipId,input.from,input.until])).rows;
   if(rows.length>500)throw new ApiError(409,'GOOGLE_BUSY_RANGE_TOO_LARGE','Choose a shorter range to view imported Busy blocks.');
   return{items:rows.map(r=>({id:sha(r.calendar_id+':'+r.event_id).slice(0,24),startsAt:iso(r.starts_at)!,endsAt:iso(r.ends_at)!,title:'Busy' as const,allDay:r.all_day})),lastSuccessfulSync:status.lastSuccessfulSync,coverage:status.coverage,notice:'Private Google events appear only as Busy. This cached view may be stale and does not change or reserve local Ootla viewing slots.'};
  });
 }
 async viewing(u:AuthUser,digest:string,id:string):Promise<GoogleViewingSync>{return this.database.transaction(async c=>{
  const identity=await authorize(c,u,digest);const v=(await c.query("SELECT v.id FROM viewings v JOIN leads l ON l.id=v.lead_id AND l.organization_id=v.organization_id WHERE v.id=$1 AND v.organization_id=$2 AND ($3='organization_admin' OR NOT EXISTS(SELECT 1 FROM lead_property_interests li WHERE li.lead_id=l.id AND li.organization_id=l.organization_id AND NOT EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=li.organization_id AND pa.property_id=li.property_id AND pa.membership_id=$4)))",[id,u.organization.id,identity.role,u.membershipId])).rows[0];
  if(!v||!identity.can_manage)throw new ApiError(404,'VIEWING_NOT_FOUND','This viewing is unavailable in your assigned access.');
  const r=(await c.query("SELECT em.*,g.state AS connection_state FROM google_calendar_event_mappings em JOIN google_calendar_connections g ON g.id=em.connection_id WHERE em.viewing_id=$1 AND em.organization_id=$2 AND g.membership_id=$3 ORDER BY em.updated_at DESC LIMIT 1",[id,u.organization.id,u.membershipId])).rows[0];
  const pending=(await c.query("SELECT 1 FROM google_calendar_jobs j JOIN google_calendar_connections g ON g.id=j.connection_id WHERE j.viewing_id=$1 AND j.organization_id=$2 AND g.membership_id=$3 AND j.state IN ('queued','running','retry') LIMIT 1",[id,u.organization.id,u.membershipId])).rowCount;
  const state:GoogleViewingSync['googleStatus']=this.config.demoMode||identity.is_demo||identity.environment!=='live'||!configured(this.config)?'not_configured':r?.connection_state==='disconnected'||r?.connection_state==='revoked'?'disconnected':pending?'pending':r?.state??'not_configured';
  return{localBooking:'saved',googleStatus:state,lastSuccessfulSync:iso(r?.last_successful_sync),message:state==='synced'?'Ootla event synchronized to the selected Google calendar. Attendee invitations are disabled.':state==='conflict'?'Local booking is saved. A Google-side edit or ownership conflict needs staff review; Ootla has not overwritten it.':state==='not_configured'?'Local booking is saved. Google Calendar is not configured for this staff connection.':notice};
 });}
}

function owned(event:GoogleRemoteEvent,m:Row):boolean{const p=event.extendedProperties?.private;return Boolean(event.id===m.event_id&&p&&p.ootlaOrganization===m.organization_id&&p.ootlaConnection===m.connection_id&&p.ootlaViewing===m.viewing_id&&p.ootlaProof===m.ownership_proof);}
function eventBody(v:Row,m:Row):GoogleRemoteEvent{return{id:m.event_id,summary:'Ootla property viewing',description:'Managed by Ootla. Update or cancel this viewing in Ootla.',location:v.location,status:'confirmed',start:{dateTime:iso(v.starts_at)!,timeZone:v.time_zone},end:{dateTime:iso(v.ends_at)!,timeZone:v.time_zone},transparency:'opaque',visibility:'private',reminders:{useDefault:false},guestsCanInviteOthers:false,guestsCanModify:false,guestsCanSeeOtherGuests:false,extendedProperties:{private:{ootlaOrganization:m.organization_id,ootlaConnection:m.connection_id,ootlaViewing:m.viewing_id,ootlaProof:m.ownership_proof,ootlaVersion:String(v.version)}}};}
function matchesViewing(event:GoogleRemoteEvent,v:Row,m:Row):boolean{
 const expected=eventBody(v,m),reminders=event.reminders as {useDefault?:boolean;overrides?:unknown[]}|undefined;
 return owned(event,m)&&event.status==='confirmed'&&!event.attendees?.length&&event.extendedProperties?.private?.ootlaVersion===String(v.version)&&event.summary===expected.summary&&event.description===expected.description&&String(event.location??'')===String(v.location??'')&&Date.parse(event.start?.dateTime??'')===new Date(v.starts_at).getTime()&&Date.parse(event.end?.dateTime??'')===new Date(v.ends_at).getTime()&&(event.transparency??'opaque')==='opaque'&&event.visibility==='private'&&reminders?.useDefault===false&&!reminders.overrides?.length&&event.guestsCanInviteOthers===false&&event.guestsCanModify!==true&&event.guestsCanSeeOtherGuests===false;
}
async function mappingConflict(c:PoolClient,m:Row):Promise<void>{await c.query("UPDATE google_calendar_event_mappings SET state='conflict',last_error='Google event changed or ownership could not be verified. Review before further changes.',updated_at=now() WHERE id=$1",[m.id]);await c.query("UPDATE google_calendar_connections SET state='degraded',last_error='A Google event conflict requires staff review. Local bookings remain saved.',updated_at=now() WHERE id=$1 AND state IN ('connected','degraded')",[m.connection_id]);}
async function reconcileConnection(c:PoolClient,connectionId:string):Promise<void>{
 const summary=(await c.query("SELECT EXISTS(SELECT 1 FROM google_calendar_jobs WHERE connection_id=$1 AND state='failed') OR EXISTS(SELECT 1 FROM google_calendar_event_mappings WHERE connection_id=$1 AND state IN ('failed','conflict')) OR EXISTS(SELECT 1 FROM google_calendar_selections WHERE connection_id=$1 AND state='failed') AS issues,(SELECT max(synced_at) FROM (SELECT last_successful_sync AS synced_at FROM google_calendar_selections WHERE connection_id=$1 UNION ALL SELECT last_successful_sync FROM google_calendar_event_mappings WHERE connection_id=$1) successful) AS last_successful_sync",[connectionId])).rows[0];
 await c.query("UPDATE google_calendar_connections SET state=$2,last_error=$3,last_successful_sync=COALESCE($4,last_successful_sync),updated_at=now() WHERE id=$1 AND state IN ('connected','degraded')",[connectionId,summary.issues?'degraded':'connected',summary.issues?'Some Google events or jobs need staff review. Local bookings remain saved.':null,summary.last_successful_sync]);
}
async function workerIdentity(c:PoolClient,r:Row):Promise<Row|undefined>{
 return(await c.query("SELECT m.id FROM organization_memberships m JOIN users u ON u.id=m.user_id JOIN organizations o ON o.id=m.organization_id WHERE m.id=$1 AND m.organization_id=$2 AND m.user_id=$3 AND m.active AND m.account_kind='staff' AND u.active AND u.account_kind='staff' AND NOT u.is_demo AND o.environment='live' AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission='leasing.manage') FOR SHARE OF m,u,o",[r.membership_id,r.organization_id,r.user_id])).rows[0];
}
async function pushViewing(c:PoolClient,r:Row,job:Row,config:ServerConfig,t:GoogleCalendarTransport):Promise<void>{
 const v=(await c.query("SELECT v.* FROM viewings v WHERE v.id=$1 AND v.organization_id=$2 AND v.managed_by_ootla",[job.viewing_id,r.organization_id])).rows[0];if(!v)return;
 let m=(await c.query('SELECT * FROM google_calendar_event_mappings WHERE connection_id=$1 AND viewing_id=$2 FOR UPDATE',[r.id,v.id])).rows[0];
 const currentOwner=v.owner_membership_id===r.membership_id;
 const allowed=currentOwner&&Boolean((await c.query("SELECT 1 FROM organization_memberships om WHERE om.id=$1 AND om.organization_id=$2 AND (om.role='organization_admin' OR NOT EXISTS(SELECT 1 FROM lead_property_interests li WHERE li.organization_id=$2 AND li.lead_id=$3 AND NOT EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=li.organization_id AND pa.property_id=li.property_id AND pa.membership_id=om.id)))",[r.membership_id,r.organization_id,v.lead_id])).rowCount);
 if(currentOwner&&!allowed)throw new GoogleCalendarRemoteError(403,'forbidden',false);
 const cancel=!currentOwner||v.status==='cancelled';if(!m&&cancel)return;
 if(!m){
  const selection=(await c.query('SELECT * FROM google_calendar_selections WHERE connection_id=$1 AND write_target',[r.id])).rows[0];if(!selection)return;
  const eventId=sha('ootla:google:'+r.organization_id+':'+r.id+':'+v.id);const proof=createHmac('sha256',config.sessionSecret).update('ootla:google:ownership:'+r.organization_id+':'+r.id+':'+v.id).digest('hex');
  m=(await c.query("INSERT INTO google_calendar_event_mappings(connection_id,organization_id,viewing_id,calendar_id,event_id,ownership_proof) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(connection_id,viewing_id) DO UPDATE SET updated_at=google_calendar_event_mappings.updated_at RETURNING *",[r.id,r.organization_id,v.id,selection.calendar_id,eventId,proof])).rows[0];
 }
 if(m.state==='conflict')return;
 if(m.synced_version>=v.version&&(cancel?m.state==='cancelled':m.state==='synced'))return;
 let existing:GoogleRemoteEvent|undefined;
 try{existing=await remote(c,r,config,t,token=>t.event(token,m.calendar_id,m.event_id));}
 catch(e){if(!(e instanceof GoogleCalendarRemoteError)||![404,410].includes(e.status))throw e;}
 if(existing){
  if(existing.status==='cancelled'){
   if(cancel&&(owned(existing,m)||Boolean(m.remote_etag))){await c.query("UPDATE google_calendar_event_mappings SET state='cancelled',synced_version=$2,last_successful_sync=now(),last_error=NULL,updated_at=now() WHERE id=$1",[m.id,v.version]);return;}
   await mappingConflict(c,m);return;
  }
  if(!owned(existing,m)||existing.attendees?.length){await mappingConflict(c,m);return;}
  // A first-write timeout can leave an event without a committed local etag. Only
  // adopt an exact Ootla payload; never overwrite an unverified intervening edit.
  if(!m.remote_etag&&!matchesViewing(existing,v,m)){await mappingConflict(c,m);return;}
  // An etag change is a conflict unless a previously ambiguous Ootla write is now proven complete.
  if(m.remote_etag&&existing.etag!==m.remote_etag){
   const recovered=Number(m.synced_version)<Number(v.version)&&matchesViewing(existing,v,m);
   if(!recovered){await mappingConflict(c,m);return;}
  }
  if(!existing.etag){await mappingConflict(c,m);return;}
  if(cancel){
   try{await remote(c,r,config,t,token=>t.remove(token,m.calendar_id,m.event_id,existing!.etag!));}
   catch(e){if(e instanceof GoogleCalendarRemoteError&&[404,410].includes(e.status)){}else if(e instanceof GoogleCalendarRemoteError&&e.status===412){await mappingConflict(c,m);return;}else throw e;}
   await c.query("UPDATE google_calendar_event_mappings SET state='cancelled',synced_version=$2,last_successful_sync=now(),last_error=NULL,updated_at=now() WHERE id=$1",[m.id,v.version]);return;
  }
  if(matchesViewing(existing,v,m)){
   await c.query("UPDATE google_calendar_event_mappings SET state='synced',remote_etag=$2,synced_version=$3,last_successful_sync=now(),last_error=NULL,updated_at=now() WHERE id=$1",[m.id,existing.etag,v.version]);return;
  }
  try{const updated=await remote(c,r,config,t,token=>t.update(token,m.calendar_id,m.event_id,eventBody(v,m),existing!.etag!));if(!matchesViewing(updated,v,m)||!updated.etag){await mappingConflict(c,m);return;}await c.query("UPDATE google_calendar_event_mappings SET state='synced',remote_etag=$2,synced_version=$3,last_successful_sync=now(),last_error=NULL,updated_at=now() WHERE id=$1",[m.id,updated.etag,v.version]);}
  catch(e){if(e instanceof GoogleCalendarRemoteError&&e.status===412){await mappingConflict(c,m);return;}throw e;}return;
 }
 if(cancel){await c.query("UPDATE google_calendar_event_mappings SET state='cancelled',synced_version=$2,last_successful_sync=now(),last_error=NULL,updated_at=now() WHERE id=$1",[m.id,v.version]);return;}
 if(m.remote_etag){await mappingConflict(c,m);return;}
 let created:GoogleRemoteEvent;
 try{created=await remote(c,r,config,t,token=>t.insert(token,m.calendar_id,eventBody(v,m)));}
 catch(e){if(e instanceof GoogleCalendarRemoteError&&e.status===409){const duplicate=await remote(c,r,config,t,token=>t.event(token,m.calendar_id,m.event_id));if(!matchesViewing(duplicate,v,m)){await mappingConflict(c,m);return;}created=duplicate;}else throw e;}
 if(!matchesViewing(created,v,m)||!created.etag){await mappingConflict(c,m);return;}
 await c.query("UPDATE google_calendar_event_mappings SET state='synced',remote_etag=$2,synced_version=$3,last_successful_sync=now(),last_error=NULL,updated_at=now() WHERE id=$1",[m.id,created.etag,v.version]);
}
async function cacheRecord(c:PoolClient,r:Row,selection:Row,event:GoogleRemoteEvent):Promise<Record<string,unknown>>{
 const mapping=(await c.query('SELECT * FROM google_calendar_event_mappings WHERE connection_id=$1 AND calendar_id=$2 AND event_id=$3',[r.id,selection.calendar_id,event.id])).rows[0];
 if(mapping&&mapping.state==='synced'&&(event.status==='cancelled'||event.etag!==mapping.remote_etag))await mappingConflict(c,mapping);
 const allDay=Boolean(event.start?.date);
 const convert=(point:GoogleRemoteEvent['start']):Date|null=>{
  if(point?.dateTime){const d=new Date(point.dateTime);return Number.isFinite(d.getTime())?d:null;}
  if(point?.date){try{return localInstants(point.date,0,selection.time_zone)[0]??null;}catch{return null;}}return null;
 };
 const start=convert(event.start),end=convert(event.end);if(event.status!=='cancelled'&&(!start||!end||end<=start))throw new GoogleCalendarRemoteError(502,'invalid_response',false);
 return{eventId:event.id,startsAt:start?.toISOString()??null,endsAt:end?.toISOString()??null,allDay,status:event.status==='cancelled'?'cancelled':'confirmed',opaque:event.transparency!=='transparent',etag:event.etag??null,ownedViewingId:mapping&&owned(event,mapping)?mapping.viewing_id:null};
}
async function pullCalendar(c:PoolClient,r:Row,job:Row,config:ServerConfig,t:GoogleCalendarTransport):Promise<boolean>{
 let s=(await c.query('SELECT * FROM google_calendar_selections WHERE connection_id=$1 AND calendar_id=$2 FOR UPDATE',[r.id,job.calendar_id])).rows[0];if(!s)return true;
 if(!s.sync_generation){
  const full=!s.sync_token||!s.next_full_sync_at||new Date(s.next_full_sync_at).getTime()<=Date.now();
  const from=full?new Date(Date.now()-30*86400000):s.coverage_from,until=full?new Date(Date.now()+365*86400000):s.coverage_until;
  s=(await c.query("UPDATE google_calendar_selections SET sync_generation=$3,sync_base_token=$4,page_token=NULL,initial_sync=$5,coverage_from=$6,coverage_until=$7,state='syncing',last_error=NULL WHERE connection_id=$1 AND calendar_id=$2 RETURNING *",[r.id,s.calendar_id,randomUUID(),full?null:s.sync_token,full,from,until])).rows[0];
 }
 const query:Record<string,string>={maxResults:'100',singleEvents:'true',showDeleted:'true',fields:'items(id,etag,status,start,end,transparency,extendedProperties),nextPageToken,nextSyncToken'};
 if(s.sync_base_token)query.syncToken=s.sync_base_token;else{query.timeMin=iso(s.coverage_from)!;query.timeMax=iso(s.coverage_until)!;}
 if(s.page_token)query.pageToken=s.page_token;
 let page:{items?:GoogleRemoteEvent[];nextPageToken?:string;nextSyncToken?:string};
 try{page=await remote(c,r,config,t,token=>t.events(token,s.calendar_id,query));}
 catch(e){
  if(e instanceof GoogleCalendarRemoteError&&e.status===410&&s.sync_base_token){
   await c.query('DELETE FROM google_calendar_event_cache WHERE connection_id=$1 AND calendar_id=$2',[r.id,s.calendar_id]);
   await c.query('DELETE FROM google_calendar_sync_stage WHERE connection_id=$1 AND calendar_id=$2',[r.id,s.calendar_id]);
   await c.query("UPDATE google_calendar_selections SET sync_token=NULL,page_token=NULL,sync_base_token=NULL,sync_generation=NULL,initial_sync=true,state='pending',last_error='Google sync token expired; rebuilding the Google cache.' WHERE connection_id=$1 AND calendar_id=$2",[r.id,s.calendar_id]);return false;
  }throw e;
 }
 if(!Array.isArray(page.items??[])||(page.items?.length??0)>2500||(!page.nextPageToken&&!page.nextSyncToken)||page.nextPageToken&&page.nextPageToken===s.page_token)throw new GoogleCalendarRemoteError(502,'invalid_response',false);
 for(const e of page.items??[]){if(typeof e.id!=='string'||!e.id||e.id.length>2048)throw new GoogleCalendarRemoteError(502,'invalid_response',false);const record=await cacheRecord(c,r,s,e);await c.query('INSERT INTO google_calendar_sync_stage(connection_id,organization_id,calendar_id,generation,event_id,record) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(connection_id,calendar_id,generation,event_id) DO UPDATE SET record=EXCLUDED.record',[r.id,r.organization_id,s.calendar_id,s.sync_generation,e.id,JSON.stringify(record)]);}
 if(page.nextPageToken){await c.query('UPDATE google_calendar_selections SET page_token=$3 WHERE connection_id=$1 AND calendar_id=$2',[r.id,s.calendar_id,page.nextPageToken]);return false;}
 if(s.initial_sync)await c.query('DELETE FROM google_calendar_event_cache WHERE connection_id=$1 AND calendar_id=$2',[r.id,s.calendar_id]);
 await c.query("INSERT INTO google_calendar_event_cache(connection_id,organization_id,calendar_id,event_id,starts_at,ends_at,all_day,status,opaque,etag,owned_viewing_id) SELECT connection_id,organization_id,calendar_id,event_id,(record->>'startsAt')::timestamptz,(record->>'endsAt')::timestamptz,(record->>'allDay')::boolean,record->>'status',(record->>'opaque')::boolean,record->>'etag',(record->>'ownedViewingId')::uuid FROM google_calendar_sync_stage WHERE connection_id=$1 AND calendar_id=$2 AND generation=$3 ON CONFLICT(connection_id,calendar_id,event_id) DO UPDATE SET starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,all_day=EXCLUDED.all_day,status=EXCLUDED.status,opaque=EXCLUDED.opaque,etag=EXCLUDED.etag,owned_viewing_id=EXCLUDED.owned_viewing_id",[r.id,s.calendar_id,s.sync_generation]);
 await c.query('DELETE FROM google_calendar_event_cache WHERE connection_id=$1 AND calendar_id=$2 AND (status=\'cancelled\' OR starts_at>=$4 OR ends_at<=$3)',[r.id,s.calendar_id,s.coverage_from,s.coverage_until]);
 await c.query('DELETE FROM google_calendar_sync_stage WHERE connection_id=$1 AND calendar_id=$2',[r.id,s.calendar_id]);
 await c.query("UPDATE google_calendar_selections SET sync_token=$3,page_token=NULL,sync_base_token=NULL,sync_generation=NULL,initial_sync=false,state='synced',last_error=NULL,last_successful_sync=now(),next_full_sync_at=CASE WHEN initial_sync THEN now()+interval '7 days' ELSE next_full_sync_at END WHERE connection_id=$1 AND calendar_id=$2",[r.id,s.calendar_id,page.nextSyncToken]);
 await c.query("UPDATE google_calendar_connections SET last_successful_sync=now(),updated_at=now() WHERE id=$1",[r.id]);return true;
}
/** Bounded durable worker. Each page/action is committed atomically; callers may safely restart it. */
export async function processGoogleCalendarJobs(config:ServerConfig,database:Database,transport=new GoogleCalendarTransport()):Promise<{processed:number}>{
 if(config.demoMode||!configured(config))return{processed:0};
 await database.transaction(async c=>{
  const due=(await c.query("SELECT g.*,s.calendar_id FROM google_calendar_selections s JOIN google_calendar_connections g ON g.id=s.connection_id JOIN organizations o ON o.id=g.organization_id JOIN users u ON u.id=g.user_id WHERE g.state IN ('connected','degraded') AND g.token_envelope IS NOT NULL AND o.environment='live' AND NOT u.is_demo AND (s.last_successful_sync IS NULL OR s.last_successful_sync<now()-interval '15 minutes') ORDER BY s.last_successful_sync NULLS FIRST LIMIT 10")).rows;
  for(const r of due)await pullJob(c,r,r.calendar_id);
 });
 let processed=0;
 for(let i=0;i<2;i++){
  const worked=await database.transaction(async c=>{
   // Use the same connection-before-job lock order as user actions. Selecting a
   // job row before taking the advisory lock can deadlock with Sync/Select.
   const candidate=(await c.query("SELECT id,connection_id FROM google_calendar_jobs WHERE state IN ('queued','retry') AND available_at<=now() ORDER BY available_at,id LIMIT 1")).rows[0];if(!candidate)return false;
   const acquired=(await c.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired',['ootla:google-calendar:'+candidate.connection_id])).rows[0]?.acquired;if(!acquired)return false;
   const job=(await c.query("SELECT * FROM google_calendar_jobs WHERE id=$1 AND state IN ('queued','retry') AND available_at<=now() FOR UPDATE SKIP LOCKED",[candidate.id])).rows[0];if(!job)return false;
   const r=(await c.query('SELECT * FROM google_calendar_connections WHERE id=$1 AND organization_id=$2 FOR UPDATE',[job.connection_id,job.organization_id])).rows[0];
   if(!r||!r.token_envelope||!['connected','degraded'].includes(r.state)||!await workerIdentity(c,r)){await c.query("UPDATE google_calendar_jobs SET state='cancelled',last_error='Connection or current staff access is unavailable.',updated_at=now() WHERE id=$1",[job.id]);return true;}
   await c.query("UPDATE google_calendar_jobs SET state='running',updated_at=now() WHERE id=$1",[job.id]);
   try{
    const done=job.kind==='pull'?await pullCalendar(c,r,job,config,transport):(await pushViewing(c,r,job,config,transport),true);
    await c.query("UPDATE google_calendar_jobs SET state=$2,attempts=0,available_at=now()+interval '1 second',last_error=NULL,updated_at=now() WHERE id=$1",[job.id,done?'succeeded':'queued']);await reconcileConnection(c,r.id);return true;
   }catch(e){
    if(e instanceof GoogleCalendarRemoteError&&e.revoked){await revokeLocal(c,r);return true;}
    const attempts=Number(job.attempts)+1,retryable=e instanceof GoogleCalendarRemoteError&&e.retryable&&attempts<5;
    const message=e instanceof GoogleCalendarRemoteError&&e.status===403?'Google calendar access is unavailable. Reconnect or review selected-calendar permissions.':'Google synchronization failed. Local bookings remain saved.';
    await c.query("UPDATE google_calendar_jobs SET state=$2,attempts=$3,available_at=now()+$4*interval '1 second',last_error=$5,updated_at=now() WHERE id=$1",[job.id,retryable?'retry':'failed',Math.min(attempts,5),Math.min(900,Math.pow(2,attempts)*5),message]);
    await c.query("UPDATE google_calendar_connections SET state='degraded',last_error=$2,updated_at=now() WHERE id=$1",[r.id,message]);
    if(job.kind==='pull')await c.query("UPDATE google_calendar_selections SET state='failed',last_error=$3 WHERE connection_id=$1 AND calendar_id=$2",[r.id,job.calendar_id,message]);
    else await c.query("UPDATE google_calendar_event_mappings SET state='failed',last_error=$3,updated_at=now() WHERE connection_id=$1 AND viewing_id=$2 AND state<>'conflict'",[r.id,job.viewing_id,message]);return true;
   }
  });if(!worked)break;processed++;
 }
 return{processed};
}
