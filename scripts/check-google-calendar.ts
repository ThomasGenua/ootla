import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { Client } from 'pg';
import { createApp } from '../server/app.js';
import { loadConfig, type ServerConfig } from '../server/config/env.js';
import { Database } from '../server/db/pool.js';
import { hashPassword } from '../server/services/passwords.js';
import type { AuthUser } from '../shared/contracts.js';
import { ApiError } from '../server/http/errors.js';
import { Calendar } from '../server/services/calendar.js';
import {localDayBounds,localInstants,validatesOffsetDateTime} from '../server/services/calendar-time.js';
import { GoogleCalendarService,processGoogleCalendarJobs } from '../server/services/google-calendar.js';
import { GoogleCalendarTransport } from '../server/services/google-calendar-transport.js';
import { encryptConnectorCredential,decryptConnectorCredential } from '../server/connectors/vault.js';
// Every mutation in this script targets a freshly-created, uniquely owned scratch
// database. The retained review/demo database is never migrated, seeded or reset.
const root = path.resolve(import.meta.dirname, '..');
const source = loadConfig();
const sourceUrl = new URL(source.databaseUrl);
assert(source.demoMode && !source.production && /^ootla_demo(?:_[a-z0-9_]+)?$/.test(source.databaseName ?? ''), 'Use the documented non-production isolated Ootla demo configuration.');
assert(sourceUrl.hostname === '127.0.0.1' && sourceUrl.port === '55439' && sourceUrl.username === 'ootla' && !sourceUrl.search && !sourceUrl.hash, 'Use only the verified project-owned cluster and restricted application role.');
const scratchName = `ootla_demo_google_${randomUUID().replaceAll('-', '')}`;
const scratchUrl = new URL(sourceUrl);
scratchUrl.pathname = `/${scratchName}`;
const config: ServerConfig = { ...source, googleCalendar:{enabled:true,clientId:'synthetic-client.apps.googleusercontent.com',clientSecret:'stage14-synthetic-client-secret',redirectUri:'http://127.0.0.1:5177/api/google-calendar/oauth/callback',tokenEncryptionKey:randomBytes(32).toString('base64')}, nodeEnv: 'test', production: false, demoMode: false, appUrl: 'http://127.0.0.1:5177', connectorCredentialKey: randomBytes(32).toString('base64'), databaseUrl: scratchUrl.toString(), databaseName: scratchName };
const ownerUrl = new URL(sourceUrl);
ownerUrl.username = 'ootla_cluster_owner';
ownerUrl.pathname = '/postgres';
const owner = new Client({ connectionString: ownerUrl.toString(), connectionTimeoutMillis: 5000 });
const database = new Database(config);
const organizationIds = [randomUUID(), randomUUID()];
const roles = ['organization_admin', 'leasing_agent', 'property_manager', 'read_only_analyst', 'organization_admin'] as const;
const userIds = roles.map(() => randomUUID());
const membershipIds = roles.map(() => randomUUID());
const emails = userIds.map(id => `google-${id}@example.test`);
const password = `Stage14-${randomUUID()}!`;
const propertyId = randomUUID(), unitId = randomUUID(), leadId = randomUUID();
let ownerConnected = false, ownsScratch = false, groups = 0, phase = 'safe scratch setup';
const servers: Array<() => Promise<void>> = [];
const pass = (label: string) => { groups++; console.log(`PASS ${label}`); };
const normalize = (value: string) => path.resolve(value).replaceAll('\\', '/').toLowerCase();
async function verifiedCluster() {
    const r = await owner.query<{
        data_directory: string;
    }>('SHOW data_directory');
    assert.equal(normalize(r.rows[0]?.data_directory ?? ''), normalize(path.join(root, '.local/postgres/data')), 'Refusing to operate outside the Ootla-owned PostgreSQL data directory.');
}
async function createScratch() {
    await owner.connect();
    ownerConnected = true;
    await verifiedCluster();
    assert(/^ootla_demo_google_[a-f0-9]{32}$/.test(scratchName));
    assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1', [scratchName])).rowCount, 0);
    const role = (await owner.query<{
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
    }>('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1', ['ootla'])).rows[0];
    assert(role && !role.rolsuper && !role.rolcreatedb && !role.rolcreaterole);
    const quoted = (await owner.query<{
        name: string;
    }>('SELECT quote_ident($1) AS name', [scratchName])).rows[0]!.name;
    await owner.query(`CREATE DATABASE ${quoted} OWNER ootla`);
    ownsScratch = true;
    assert.equal((await database.query<{
        name: string;
    }>('SELECT current_database() AS name')).rows[0]?.name, scratchName);
}
type Snapshot = Record<string, {
    columns: string[];
    count: number;
    hash: string;
}>;
async function snapshot(previous?: Snapshot): Promise<Snapshot> {
    const tables = previous ? Object.keys(previous) : (await database.query<{
        tablename: string;
    }>("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename")).rows.map(r => r.tablename);
    const result: Snapshot = {};
    for (const table of tables) {
        const columns = previous?.[table]?.columns ?? (await database.query<{
            column_name: string;
        }>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [table])).rows.map(r => r.column_name);
        assert(/^[a-z_][a-z0-9_]*$/.test(table) && columns.every(c => /^[a-z_][a-z0-9_]*$/.test(c)));
        const rows = (await database.query(`SELECT ${columns.map(c => `"${c}"`).join(',')} FROM "${table}"`)).rows.map(r => JSON.stringify(r)).sort();
        result[table] = { columns, count: rows.length, hash: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
    }
    return result;
}
async function baseline() {
    await database.query('CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
    for (const name of ['001_foundation.sql', '002_staff_roles_property_access.sql', '003_demo_dataset.sql', '004_property_contact_foundation.sql', '005_lead_pipeline.sql', '006_lead_workspace.sql', '007_tasks_reminders.sql', '008_standalone_imports.sql', '009_staff_account.sql', '010_connectors.sql']) {
        const sql = await readFile(path.join(root, 'migrations', name), 'utf8');
        await database.transaction(async (client) => { await client.query(sql.replace(/^\uFEFF/, '')); await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name, createHash('sha256').update(sql).digest('hex')]); });
    }
    const hash = await hashPassword(password);
    await database.transaction(async (client) => {
        for (const [i, id] of organizationIds.entries()) {
            await client.query("INSERT INTO organizations(id,name,slug,environment) VALUES($1,$2,$3,'live')", [id, `Stage 14 isolated ${i}`, `google-${randomUUID()}`]);
            await client.query('INSERT INTO organization_data_settings(organization_id,mode) VALUES($1,$2)', [id, i === 0 ? 'standalone' : 'yardi_connected']);
        }
        for (const [i, id] of userIds.entries()) {
            await client.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)', [id, emails[i], `Stage 14 ${roles[i]}`, hash]);
            await client.query('INSERT INTO organization_memberships(id,organization_id,user_id,role) VALUES($1,$2,$3,$4)', [membershipIds[i], organizationIds[i === 4 ? 1 : 0], id, roles[i]]);
        }
        await client.query("INSERT INTO properties(id,organization_id,name,address,city) VALUES($1,$2,'Legacy property','1 Retained Way','Lagos')", [propertyId, organizationIds[0]]);
        await client.query("INSERT INTO units(id,organization_id,property_id,label,bedrooms,status,monthly_rent) VALUES($1,$2,$3,'A1',2,'available',1500)", [unitId, organizationIds[0], propertyId]);
        await client.query("INSERT INTO leads(id,organization_id,property_id,unit_id,display_name,email,status,intent,notes) VALUES($1,$2,$3,$4,'Taylor Brooks','taylor.brooks@simulator.ootla.test','new','leasing','Untouched historical work')", [leadId, organizationIds[0], propertyId, unitId]);
        await client.query("INSERT INTO tasks(organization_id,property_id,lead_id,contact_id,title,due_at,status) SELECT organization_id,property_id,id,contact_id,'Legacy task',now()+interval '1 day','open' FROM leads WHERE id=$1", [leadId]);
        for (const i of [1, 2, 3])
            await client.query('INSERT INTO property_access_assignments(organization_id,membership_id,property_id) VALUES($1,$2,$3)', [organizationIds[0], membershipIds[i], propertyId]);
    });
}
async function start(localConfig: ServerConfig = config) {
    const db = new Database(localConfig), app = createApp(localConfig, db);
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); listener.once('error', reject); });
    let closed = false;
    const close = async () => {
        if (closed)
            return;
        closed = true;
        server.closeIdleConnections();
        await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
        await db.close();
    };
    servers.push(close);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const request = (route: string, cookie = '', method = 'GET', body?: unknown) => fetch(base + route, { method, redirect: 'manual', headers: { ...(cookie ? { Cookie: cookie } : {}), ...(method === 'GET' ? {} : { Origin: localConfig.appUrl }), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { close, request, base, login: async (index: number) => { const response = await request('/api/auth/login', '', 'POST', { email: emails[index], password }); assert.equal(response.status, 200, 'Normal hashed-password sign-in must work.'); const cookie = response.headers.get('set-cookie')?.split(';')[0]; assert(cookie && /HttpOnly/i.test(response.headers.get('set-cookie')!)); return cookie; } };
}


/** A fake at the Fetch boundary uses only the official Google URL contract. No Google network request is made. */
class SyntheticGoogle {
 calls:Array<{url:URL;method:string;body:Record<string,unknown>;headers:Headers}>=[];
 events=new Map<string,Record<string,unknown>>();
 tokenCalls=0;refreshCalls=0;revokes=0;createCalls=0;updateCalls=0;deleteCalls=0;
 failNext=0;ambiguousCreate=false;revoked=false;invalidSync=false;syncNumber=0;
 firstPage:Record<string,unknown>[]=[];secondPage:Record<string,unknown>[]=[];
 tokenGate:(()=>Promise<void>)|null=null;duplicateMismatch=false;
 readonly scope='https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events';
 readonly access='stage14-synthetic-access-never-live';readonly refresh='stage14-synthetic-refresh-never-live';
 private response(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});}
 readonly fetch:typeof fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url),method=request.method;
  assert(['accounts.google.com','oauth2.googleapis.com','www.googleapis.com'].includes(url.hostname),'Transport must remain on fixed official Google hosts.');
  const raw=await request.text(),body:Record<string,unknown>=raw?(request.headers.get('Content-Type')?.includes('application/x-www-form-urlencoded')?Object.fromEntries(new URLSearchParams(raw)):JSON.parse(raw)):{};
  this.calls.push({url,method,body,headers:request.headers});
  if(url.hostname==='oauth2.googleapis.com'&&url.pathname==='/token'){
   this.tokenCalls++;
   if(body.grant_type==='refresh_token'){this.refreshCalls++;if(this.revoked)return this.response({error:'invalid_grant',error_description:'Do not expose stage14-synthetic-refresh-never-live'},400);}
   if(this.tokenGate)await this.tokenGate();
   return this.response({access_token:this.access,refresh_token:this.refresh,expires_in:3600,scope:this.scope,token_type:'Bearer'});
  }
  if(url.hostname==='oauth2.googleapis.com'&&url.pathname==='/revoke'){this.revokes++;return this.response({});}
  assert.equal(url.hostname,'www.googleapis.com');assert.equal(request.headers.get('Authorization'),'Bearer '+this.access,'Tokens are sent in an Authorization header only.');
  assert(!url.searchParams.has('access_token'));
  if(this.failNext>0){this.failNext--;return this.response({error:{code:503,message:'Do not expose '+this.access,errors:[{reason:'backendError'}]}},503);}
  if(this.revoked)return this.response({error:{code:401,errors:[{reason:'authError'}]}},401);
  const prefix='/calendar/v3/';
  assert(url.pathname.startsWith(prefix));
  const route=url.pathname.slice(prefix.length);
  const owned={id:'ootla-selected@example.test',summary:'Synthetic Ootla team',accessRole:'owner',timeZone:'Africa/Lagos',primary:true};
  const readonly={id:'read-only@example.test',summary:'Synthetic private staff calendar',accessRole:'reader',timeZone:'America/New_York'};
  if(route==='users/me/calendarList'){
   if(url.searchParams.get('pageToken'))return this.response({items:[readonly]});
   return this.response({items:[owned],nextPageToken:'calendar-page-2'});
  }
  if(route.startsWith('users/me/calendarList/')){
   const id=decodeURIComponent(route.slice('users/me/calendarList/'.length));return id===owned.id?this.response(owned):id===readonly.id?this.response(readonly):this.response({error:{code:404}},404);
  }
  const match=/^calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(route);assert(match,'Only supported official Calendar API operations are allowed.');
  const calendar=decodeURIComponent(match[1]!);const id=match[2]?decodeURIComponent(match[2]):null;
  assert([owned.id,readonly.id].includes(calendar),'Only explicitly selected calendars can be used.');
  const key=(eventId:string)=>calendar+'|'+eventId;
  if(method==='GET'&&!id){
   assert.equal(url.searchParams.get('showDeleted'),'true');
   if(this.invalidSync&&url.searchParams.has('syncToken')){this.invalidSync=false;return this.response({error:{code:410,message:'Sync token is no longer valid'}},410);}
   if(url.searchParams.get('pageToken'))return this.response({items:this.secondPage,nextSyncToken:'sync-token-'+(++this.syncNumber)});
   return this.response({items:this.firstPage,nextPageToken:'events-page-2'});
  }
  if(method==='GET'&&id){const event=this.events.get(key(id));return event?this.response(event):this.response({error:{code:404}},404);}
  assert.equal(calendar,owned.id,'Read-only selected calendars can never be mutation destinations.');
  assert.equal(url.searchParams.get('sendUpdates'),'none','No synthetic or live attendee invitations are sent on retries.');
  assert(!body.attendees||(Array.isArray(body.attendees)&&body.attendees.length===0),'Attendees are deliberately omitted.');
  if(method==='POST'&&!id){
   this.createCalls++;const eventId=String(body.id);assert(/^[a-v0-9]{5,1024}$/.test(eventId),'Deterministic Google ids use lowercase base32hex characters.');
   if(this.events.has(key(eventId)))return this.response({error:{code:409,errors:[{reason:'duplicate'}]}},409);
   const event:Record<string,unknown>={...body,id:eventId,etag:'"synthetic-'+this.createCalls+'"',status:'confirmed'};delete event.transparency;this.events.set(key(eventId),event);
   if(this.duplicateMismatch){this.duplicateMismatch=false;this.events.set(key(eventId),{...event,description:'Someone changed this event during an ambiguous write.'});return this.response({error:{code:409,errors:[{reason:'duplicate'}]}},409);}
   if(this.ambiguousCreate){this.ambiguousCreate=false;throw new TypeError('Synthetic response interrupted after provider commit.');}
   return this.response(event);
  }
  if((method==='PUT'||method==='PATCH')&&id){
   this.updateCalls++;const event={...this.events.get(key(id)),...body,id,etag:'"synthetic-update-'+this.updateCalls+'"'};this.events.set(key(id),event);return this.response(event);
  }
  if(method==='DELETE'&&id){this.deleteCalls++;this.events.delete(key(id));return new Response(null,{status:204});}
  assert.fail('Unexpected official Calendar operation.');
 };
}



async function migrateStage14(){
 const before=await snapshot();
 const names=(await readdir(path.join(root,'migrations'))).filter(n=>/^\d{3}_[a-z0-9_]+\.sql$/.test(n)).sort();
 assert(names.includes('011_calendar_viewings.sql')&&names.includes('012_google_calendar.sql'));
 for(const name of names.filter(n=>n>'010_connectors.sql')){
  assert(/^01[12]_/.test(name),'Only Stage 13 dependency and current Stage 14 migration may be applied.');
  const sql=await readFile(path.join(root,'migrations',name),'utf8');
  await database.transaction(async c=>{await c.query(sql.replace(/^\uFEFF/,''));await c.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[name,createHash('sha256').update(sql).digest('hex')]);});
 }
 assert.deepEqual(await snapshot(before),before,'All established columns and record values survive additive calendar migrations.');
 return names.map(name=>({name,hash:''}));
}
async function rejects(action:()=>Promise<unknown>,codes?:string[]){
 await assert.rejects(action,(error:unknown)=>{
  assert(error instanceof ApiError,'Authorization/input rejection uses a bounded public API error.');
  if(codes)assert(codes.includes(error.code),'Expected error code '+codes.join('/')+'; received '+error.code);
  assert(![fake.access,fake.refresh,'stage14-synthetic-client-secret'].some(secret=>error.message.includes(secret)),'Errors never echo remote secret material.');
  return true;
 });
}
const fake=new SyntheticGoogle();
const transport=new GoogleCalendarTransport(fake.fetch);
const service=new GoogleCalendarService(database,config,transport);
const calendar=new Calendar(database,config);
async function drain(){
 for(let i=0;i<30;i++){await database.query("UPDATE google_calendar_jobs SET available_at=now() WHERE state='queued' AND available_at>now() AND available_at<now()+interval '2 seconds'");const result=await processGoogleCalendarJobs(config,database,transport);if(!result.processed)return;}
 assert.fail('Durable worker should stop after bounded due work.');
}
async function due(){await database.query("UPDATE google_calendar_jobs SET available_at=now() WHERE state='retry'");await drain();}
async function session(api:Awaited<ReturnType<typeof start>>,index:number){
 const cookie=await api.login(index);const response=await api.request('/api/auth/me',cookie);assert.equal(response.status,200);
 const {user}=await response.json() as {user:AuthUser};
 const digest=createHmac('sha256',config.sessionSecret).update(cookie.split('=')[1]!).digest('hex');
 return {cookie,user,digest};
}
async function connect(user:AuthUser,digest:string){
 const start=await service.start(user,digest);const url=new URL(start.authorizationUrl);assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('response_type'),'code');assert.equal(url.searchParams.get('access_type'),'offline');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('redirect_uri'),config.googleCalendar.redirectUri);
 const state=url.searchParams.get('state')!;assert(/^[a-f0-9]{64}$/.test(state));assert(url.searchParams.get('scope')?.includes('calendar.calendarlist.readonly'));assert(!start.authorizationUrl.includes(config.googleCalendar.clientSecret));
 const before=fake.tokenCalls;await service.callback(user,digest,{state,code:'synthetic-authorization-code'});
 assert.equal(fake.tokenCalls,before+1);
 const tokenCall=[...fake.calls].reverse().find(c=>c.url.pathname==='/token')!;
 assert.equal(createHash('sha256').update(String(tokenCall.body.code_verifier)).digest('base64url'),url.searchParams.get('code_challenge'),'PKCE token exchange uses the matching secret verifier.');
 return state;
}
async function main(){
 await createScratch();await baseline();
 await database.query("INSERT INTO viewings(organization_id,property_id,lead_id,unit_id,starts_at,status) VALUES($1,$2,$3,$4,now()-interval '10 days','completed')",[organizationIds[0],propertyId,leadId,unitId]);
 await migrateStage14();pass('additive migrations preserve established columns and history; all record mutations use a uniquely owned guarded scratch database');
 const api=await start();const admin=await session(api,0),agent=await session(api,1),analyst=await session(api,3),other=await session(api,4);

 phase='HTTP authentication, origin and diagnostic protection';
 assert.equal((await api.request('/api/google-calendar')).status,401);
 assert.equal((await api.request('/api/google-calendar',admin.cookie)).status,200);
 assert.equal((await api.request('/api/google-calendar/oauth/start',analyst.cookie,'POST',{})).status,403);
 assert.equal((await api.request('/api/google-calendar/selection',admin.cookie,'PUT',{calendarIds:[],writeCalendarId:null})).status,400);
 const foreignOrigin=await fetch(api.base+'/api/google-calendar/sync',{method:'POST',headers:{Cookie:admin.cookie,Origin:'https://other.example.test','Content-Type':'application/json'},body:'{}'});
 assert.equal(foreignOrigin.status,403);
 const wrongContentType=await fetch(api.base+'/api/google-calendar/sync',{method:'POST',headers:{Cookie:admin.cookie,Origin:config.appUrl,'Content-Type':'text/plain'},body:'{}'});
 assert.equal(wrongContentType.status,415);
 const diagnostic=await api.request('/api/google-calendar',admin.cookie);assert.equal(diagnostic.headers.get('cache-control'),'no-store');
 assert.equal(diagnostic.headers.get('referrer-policy'),'no-referrer');
 const diagnosticBody=JSON.stringify(await diagnostic.json());
 assert(![fake.access,fake.refresh,config.googleCalendar.clientSecret].some(secret=>diagnosticBody.includes(secret)));
 pass('HTTP session, current-role, strict input, exact-origin and JSON gates protect all Google diagnostics; no-store/referrer headers are present');
 phase='native calendar dependency, timezone transitions and atomic slot safety';
 const zone='America/New_York';
 assert.throws(()=>validatesOffsetDateTime('2026-03-08T02:30:00-05:00',zone),(error:unknown)=>error instanceof ApiError&&error.code==='INVALID_LOCAL_TIME','A nonexistent spring-forward local time cannot become a booking.');
 assert.equal(localInstants('2026-03-08',150,zone).length,0);
 const firstFold=validatesOffsetDateTime('2026-11-01T01:30:00-04:00',zone),secondFold=validatesOffsetDateTime('2026-11-01T01:30:00-05:00',zone);
 assert.equal(secondFold.getTime()-firstFold.getTime(),3600000,'Explicit offsets distinguish both fall-back occurrences.');
 assert.deepEqual(localInstants('2026-11-01',90,zone).map(value=>value.getTime()),[firstFold.getTime(),secondFold.getTime()]);
 const springBounds=localDayBounds('2026-03-08',zone),fallBounds=localDayBounds('2026-11-01',zone);
 assert.equal(springBounds.until.getTime()-springBounds.from.getTime(),23*3600000,'Spring all-day coverage follows the property timezone rather than assuming24hours.');
 assert.equal(fallBounds.until.getTime()-fallBounds.from.getTime(),25*3600000,'Fall all-day coverage spans both repeated-hour occurrences.');

 const localProperty=randomUUID(),localLead=randomUUID();
 await database.query("INSERT INTO properties(id,organization_id,name,address,city) VALUES($1,$2,'Independent calendar fixture','2 Test Way','Lagos')",[localProperty,organizationIds[1]]);
 await database.query("INSERT INTO leads(id,organization_id,property_id,display_name,email,status,intent) VALUES($1,$2,$3,'Native Calendar Prospect','native-calendar@example.test','new','leasing')",[localLead,organizationIds[1],localProperty]);
 await calendar.configure(other.user,other.digest,localProperty,{version:1,enabled:true,timeZone:'Africa/Lagos',durationMinutes:30,bufferBeforeMinutes:10,bufferAfterMinutes:10,location:'Fixture reception',publicBookingEnabled:false});
 await calendar.setAvailability(other.user,other.digest,localProperty,other.user.membershipId,{version:1,enabled:true,windows:Array.from({length:7},(_,weekday)=>({weekday,start:'08:00',end:'18:00'}))});
 const localDay=new Date(Date.now()+6*86400000).toISOString().slice(0,10);
 const localSlots=await calendar.slots(other.user,other.digest,{page:1,pageSize:100,propertyId:localProperty,leadId:localLead,ownerMembershipId:other.user.membershipId,date:localDay,days:1});
 assert(localSlots.items.length>=3);assert(localSlots.items[0]!.startsAt.endsWith('+01:00'));
 const candidate={leadId:localLead,propertyId:localProperty,unitId:null,ownerMembershipId:other.user.membershipId,startsAt:localSlots.items[0]!.startsAt};
 const outcomes=await Promise.allSettled([calendar.book(other.user,other.digest,{...candidate,requestKey:randomUUID()}),calendar.book(other.user,other.digest,{...candidate,requestKey:randomUUID()})]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1,'Concurrent constrained-slot requests have exactly one winner.');
 assert.equal(outcomes.filter(r=>r.status==='rejected').length,1);
 const winner=outcomes.find(r=>r.status==='fulfilled');assert(winner?.status==='fulfilled');
 const localMove=await calendar.reschedule(other.user,other.digest,winner.value.viewing.id,{requestKey:randomUUID(),version:winner.value.viewing.version,ownerMembershipId:other.user.membershipId,startsAt:localSlots.items[2]!.startsAt});
 await calendar.status(other.user,other.digest,winner.value.viewing.id,{requestKey:randomUUID(),version:localMove.viewing.version,status:'cancelled',reason:'Native dependency smoke complete'});
 assert.equal((await database.query('SELECT count(*)::int AS count FROM viewing_events WHERE viewing_id=$1',[winner.value.viewing.id])).rows[0]!.count,3);
 assert.equal((await database.query('SELECT pipeline_stage FROM leads WHERE id=$1',[localLead])).rows[0]!.pipeline_stage,'new_inquiry');
 pass('native Calendar timezone helpers reject DST gaps/distinguish folds and23/25-hour days; booking atomically rejects concurrent conflicts, reschedules/cancels with timeline and safe stage reversal');
 phase='OAuth authorization, PKCE, binding and expiry';
 await rejects(()=>service.start(analyst.user,analyst.digest));
 const authorization=await service.start(admin.user,admin.digest);const state=new URL(authorization.authorizationUrl).searchParams.get('state')!;
 const count=fake.calls.length;await rejects(()=>service.callback(other.user,other.digest,{state,code:'synthetic-code'}));assert.equal(fake.calls.length,count);
 await database.query("UPDATE google_calendar_oauth_states SET expires_at=now()-interval '1 second' WHERE used_at IS NULL");
 await rejects(()=>service.callback(admin.user,admin.digest,{state,code:'synthetic-code'}));assert.equal(fake.calls.length,count);
 const validState=await connect(admin.user,admin.digest);await rejects(()=>service.callback(admin.user,admin.digest,{state:validState,code:'synthetic-code'}));
 const publicState=JSON.stringify(await service.status(admin.user,admin.digest));
 assert(![fake.access,fake.refresh,'synthetic-authorization-code','stage14-synthetic-client-secret'].some(s=>publicState.includes(s)));
 const stored=JSON.stringify((await database.query('SELECT token_envelope FROM google_calendar_connections')).rows);
 assert(!stored.includes(fake.access)&&!stored.includes(fake.refresh),'Encrypted server tokens never persist in plaintext.');
 const states=JSON.stringify((await database.query('SELECT * FROM google_calendar_oauth_states')).rows);
 assert(!states.includes(validState));assert(!states.includes(String([...fake.calls].reverse().find(c=>c.url.pathname==='/token')?.body.code_verifier)));
 pass('normal hashed-password sessions, OAuth random state, PKCE, tenant/session binding, expiry and single use; server-encrypted tokens and redacted public status');

 phase='selected-calendar permissions and org isolation';
 const choices=await service.calendars(admin.user,admin.digest);assert.equal(choices.items.length,1);assert(choices.nextPageToken);
 const second=await service.calendars(admin.user,admin.digest,choices.nextPageToken!);assert(second.items.some(c=>c.id==='read-only@example.test'));
 await rejects(()=>service.select(admin.user,admin.digest,{calendarIds:['read-only@example.test'],writeCalendarId:'read-only@example.test'}));
 await service.select(admin.user,admin.digest,{calendarIds:['ootla-selected@example.test','read-only@example.test'],writeCalendarId:'ootla-selected@example.test'});
 assert.equal((await service.status(other.user,other.digest)).selectedCalendars.length,0);
 await rejects(()=>service.select(agent.user,agent.digest,{calendarIds:['ootla-selected@example.test'],writeCalendarId:'ootla-selected@example.test'}));
 pass('calendar-list pagination, provider-verified write permission and selected write target; another organization and unauthorized member cannot configure or inherit the connection');

 phase='initial/incremental sync and privacy';
 const upcoming=new Date(Date.now()+3*86400000);upcoming.setUTCHours(10,0,0,0);const initialStart=upcoming.toISOString(),initialEnd=new Date(upcoming.getTime()+3600000).toISOString();
 fake.firstPage=[{id:'private-1',status:'confirmed',summary:'Private medical information',description:'Private staff content',attendees:[{email:'private@example.test'}],start:{dateTime:initialStart},end:{dateTime:initialEnd},etag:'"private-1"'}];
 fake.secondPage=[{id:'private-all-day',status:'confirmed',summary:'Private leave',start:{date:initialStart.slice(0,10)},end:{date:new Date(upcoming.getTime()+86400000).toISOString().slice(0,10)}}];
 await drain();
 const connection=(await database.query("SELECT id FROM google_calendar_connections WHERE membership_id=$1",[admin.user.membershipId])).rows[0]!;
 const selection=(await database.query("SELECT * FROM google_calendar_selections WHERE connection_id=$1 AND write_target",[connection.id])).rows[0]!;
 assert(selection.sync_token&&selection.last_successful_sync);
 const busy=await service.busy(admin.user,admin.digest,{from:new Date(upcoming.getTime()-86400000).toISOString(),until:new Date(upcoming.getTime()+2*86400000).toISOString()});
 assert(busy.items.length>=1);assert(busy.items.every(i=>i.title==='Busy'));
 assert(!JSON.stringify(busy).includes('medical')&&!JSON.stringify(busy).includes('private@example.test'));
 const cache=JSON.stringify((await database.query('SELECT * FROM google_calendar_event_cache')).rows);
 assert(!cache.includes('Private medical')&&!cache.includes('Private staff')&&!cache.includes('private@example.test'));
 const allStart=fake.calls.length;await service.sync(admin.user,admin.digest);await drain();
 const incremental=fake.calls.slice(allStart).filter(c=>c.url.pathname.endsWith('/events')&&c.method==='GET');
 assert(incremental.some(c=>c.url.searchParams.has('syncToken')));assert(incremental.some(c=>c.url.searchParams.has('pageToken')));
 for(const call of incremental.filter(c=>c.url.searchParams.has('syncToken')))for(const forbidden of ['timeMin','timeMax','orderBy','q','privateExtendedProperty'])assert(!call.url.searchParams.has(forbidden));
 fake.invalidSync=true;const before=(await database.query('SELECT count(*)::int AS count FROM viewings')).rows[0]!.count;
 await service.sync(admin.user,admin.digest);await drain();
 assert.equal((await database.query('SELECT count(*)::int AS count FROM viewings')).rows[0]!.count,before,'Invalid sync tokens reset only Google cache, never local bookings.');
 assert(fake.calls.slice(allStart).some(c=>c.url.pathname.endsWith('/events')&&!c.url.searchParams.has('syncToken')),'410 is followed by a full synchronization.');
 pass('initial and incremental event pagination, final sync cursor, deleted-event support and410 full recovery preserve local tours; native overlays contain Busy only and no private descriptions/attendees');

 phase='local tour persistence, event mapping and retry-safe updates';
 await calendar.configure(admin.user,admin.digest,propertyId,{version:1,enabled:true,timeZone:'Africa/Lagos',durationMinutes:30,bufferBeforeMinutes:10,bufferAfterMinutes:10,location:'Synthetic property reception',publicBookingEnabled:true});
 await calendar.setAvailability(admin.user,admin.digest,propertyId,admin.user.membershipId,{version:1,enabled:true,windows:Array.from({length:7},(_,weekday)=>({weekday,start:'08:00',end:'18:00'}))});
 const day=new Date(Date.now()+5*86400000).toISOString().slice(0,10);
 const slots=await calendar.slots(admin.user,admin.digest,{page:1,pageSize:100,propertyId,leadId,ownerMembershipId:admin.user.membershipId,unitId,date:day,days:1});
 assert(slots.items.length>=3);
 const booking=await calendar.book(admin.user,admin.digest,{requestKey:randomUUID(),leadId,propertyId,unitId,ownerMembershipId:admin.user.membershipId,startsAt:slots.items[0]!.startsAt});
 assert.equal(booking.viewing.status,'scheduled');assert.equal((await service.viewing(admin.user,admin.digest,booking.viewing.id)).localBooking,'saved');
 fake.ambiguousCreate=true;await drain();await due();
 const mapping=(await database.query('SELECT * FROM google_calendar_event_mappings WHERE viewing_id=$1',[booking.viewing.id])).rows[0]!;
 assert(mapping);assert.equal(mapping.state,'synced');assert.equal(fake.events.size,1,'An ambiguous create commit followed by retry produces one provider event.');
 assert.equal((await service.viewing(admin.user,admin.digest,booking.viewing.id)).googleStatus,'synced');
 const originalEvent=mapping.event_id;
 const moved=await calendar.reschedule(admin.user,admin.digest,booking.viewing.id,{requestKey:randomUUID(),version:booking.viewing.version,ownerMembershipId:admin.user.membershipId,startsAt:slots.items[2]!.startsAt});
 await drain();const updated=(await database.query('SELECT * FROM google_calendar_event_mappings WHERE viewing_id=$1',[booking.viewing.id])).rows[0]!;
 assert.equal(updated.event_id,originalEvent);assert.equal(updated.synced_version,moved.viewing.version);assert(fake.updateCalls>=1);
 const event=fake.events.get('ootla-selected@example.test|'+originalEvent)!;
 assert.equal((event.start as {dateTime:string}).dateTime,moved.viewing.startsAt);
 const cancelled=await calendar.status(admin.user,admin.digest,booking.viewing.id,{requestKey:randomUUID(),version:moved.viewing.version,status:'cancelled',reason:'Synthetic cancellation'});
 await drain();assert.equal(cancelled.viewing.status,'cancelled');assert.equal(fake.events.size,0);assert.equal(fake.deleteCalls,1);
 await drain();assert.equal(fake.deleteCalls,1,'Worker retries never repeat already-completed cancellation.');
 pass('local booking succeeds separately from Google state; deterministic owned event mapping, ambiguous-create retry, reschedule and cancellation converge without duplicate events or attendee invitations');

 phase='event ownership enforcement';
 const more=await calendar.slots(admin.user,admin.digest,{page:1,pageSize:100,propertyId,leadId,ownerMembershipId:admin.user.membershipId,unitId,date:day,days:1});
 const next=await calendar.book(admin.user,admin.digest,{requestKey:randomUUID(),leadId,propertyId,unitId,ownerMembershipId:admin.user.membershipId,startsAt:more.items[0]!.startsAt});await drain();
 const secondMapping=(await database.query('SELECT * FROM google_calendar_event_mappings WHERE viewing_id=$1',[next.viewing.id])).rows[0]!;
 const remote=fake.events.get('ootla-selected@example.test|'+secondMapping.event_id)!;remote.extendedProperties={private:{foreignOwner:'someone-else'}};
 const updatesBefore=fake.updateCalls,deletesBefore=fake.deleteCalls;
 await calendar.status(admin.user,admin.digest,next.viewing.id,{requestKey:randomUUID(),version:next.viewing.version,status:'cancelled',reason:'Synthetic ownership rejection'});await drain();
 assert.equal(fake.updateCalls,updatesBefore);assert.equal(fake.deleteCalls,deletesBefore);
 assert.equal((await database.query('SELECT state FROM google_calendar_event_mappings WHERE viewing_id=$1',[next.viewing.id])).rows[0]!.state,'conflict');
 pass('foreign or tampered event ownership blocks update/delete while retaining local booking history');
 const duplicateSlots=await calendar.slots(admin.user,admin.digest,{page:1,pageSize:100,propertyId,leadId,ownerMembershipId:admin.user.membershipId,unitId,date:day,days:1});
 const duplicateBooking=await calendar.book(admin.user,admin.digest,{requestKey:randomUUID(),leadId,propertyId,unitId,ownerMembershipId:admin.user.membershipId,startsAt:duplicateSlots.items[0]!.startsAt});
 fake.duplicateMismatch=true;const beforeMismatchUpdates=fake.updateCalls;await drain();
 assert.equal((await database.query('SELECT state FROM google_calendar_event_mappings WHERE viewing_id=$1',[duplicateBooking.viewing.id])).rows[0]!.state,'conflict','An insert409 may recover only an exact owned event; changed content stays a conflict.');
 assert.equal(fake.updateCalls,beforeMismatchUpdates,'Retry recovery must never overwrite a changed remote event.');
 assert.equal((await api.request('/api/google-calendar/viewings/'+duplicateBooking.viewing.id,other.cookie)).status,404);
 pass('ambiguous duplicate event content remains a conflict and another organization cannot inspect a viewing mapping');

 phase='temporary failure, bounded retry and revoked access';
 fake.failNext=1;await service.sync(admin.user,admin.digest);await drain();
 assert((await database.query("SELECT 1 FROM google_calendar_jobs WHERE state='retry'")).rowCount);
 await due();assert(!JSON.stringify(await service.status(admin.user,admin.digest)).includes(fake.access));
 await database.query("UPDATE google_calendar_connections SET token_expires_at=now()-interval '1 minute' WHERE id=$1",[connection.id]);
 fake.revoked=true;await service.sync(admin.user,admin.digest);await drain();
 assert.equal((await service.status(admin.user,admin.digest)).state,'revoked');
 assert.equal((await database.query('SELECT token_envelope FROM google_calendar_connections WHERE id=$1',[connection.id])).rows[0]!.token_envelope,null);
 assert.equal((await database.query('SELECT status FROM viewings WHERE id=$1',[booking.viewing.id])).rows[0]!.status,'cancelled');
 fake.revoked=false;await connect(admin.user,admin.digest);await service.disconnect(admin.user,admin.digest);
 assert.equal((await service.status(admin.user,admin.digest)).state,'disconnected');
 assert.equal((await database.query('SELECT token_envelope FROM google_calendar_connections WHERE id=$1',[connection.id])).rows[0]!.token_envelope,null);
 pass('temporary provider failures use durable bounded retries; invalid_grant removes encrypted credentials and requires reconnect; disconnect preserves all local history');
 phase='authorization callback racing a deliberate disconnect';
 const lateAuthorization=await service.start(admin.user,admin.digest),lateState=new URL(lateAuthorization.authorizationUrl).searchParams.get('state')!;
 let releaseToken!:()=>void,exchangeStarted!:()=>void;
 const tokenReleased=new Promise<void>(resolve=>{releaseToken=resolve;}),startedExchange=new Promise<void>(resolve=>{exchangeStarted=resolve;});
 fake.tokenGate=async()=>{exchangeStarted();await tokenReleased;};
 const pendingCallback=service.callback(admin.user,admin.digest,{state:lateState,code:'synthetic-late-code'});
 const rejectedCallback=rejects(()=>pendingCallback);
 await startedExchange;await service.disconnect(admin.user,admin.digest);releaseToken();await rejectedCallback;fake.tokenGate=null;
 assert.equal((await service.status(admin.user,admin.digest)).state,'disconnected');
 assert.equal((await database.query('SELECT token_envelope FROM google_calendar_connections WHERE id=$1',[connection.id])).rows[0]!.token_envelope,null);
 pass('an OAuth response arriving after deliberate disconnect cannot restore credentials or reconnect the organization');

 phase='demo and disabled configuration safety';
 const blockedConfig:ServerConfig={...config,demoMode:true,googleCalendar:{...config.googleCalendar,enabled:false}};
 const demoService=new GoogleCalendarService(database,blockedConfig,transport);const networkBefore=fake.calls.length;
 await rejects(()=>demoService.start(admin.user,admin.digest));await processGoogleCalendarJobs(blockedConfig,database,transport);assert.equal(fake.calls.length,networkBefore);
 assert.equal((await demoService.status(admin.user,admin.digest)).demo,true);
 const enabledDemoConfig:ServerConfig={...config,demoMode:true};
 await rejects(()=>new GoogleCalendarService(database,enabledDemoConfig,transport).start(admin.user,admin.digest));
 await processGoogleCalendarJobs(enabledDemoConfig,database,transport);assert.equal(fake.calls.length,networkBefore,'DEMO_MODE blocks network even when synthetic credential configuration is present.');
 await database.query('UPDATE users SET is_demo=true WHERE id=$1',[admin.user.id]);
 await rejects(()=>service.start(admin.user,admin.digest));assert.equal((await service.status(admin.user,admin.digest)).demo,true);
 await database.query('UPDATE users SET is_demo=false WHERE id=$1',[admin.user.id]);
 for(const call of fake.calls.filter(c=>['POST','PUT','PATCH','DELETE'].includes(c.method)&&c.url.hostname==='www.googleapis.com')){assert.equal(call.url.searchParams.get('sendUpdates'),'none');assert(!call.body.attendees);}
 await database.query("UPDATE organization_memberships SET active=false WHERE id=$1",[admin.user.membershipId]);await rejects(()=>service.status(admin.user,admin.digest));
 pass('ordinary demo actions cannot reach Google; disabled integration leaves local calendar operational, no attendees/invitations on any event write, current membership revocation enforced');
 console.log('Stage 14 Google Calendar checks complete: '+groups+' groups passed. Google behavior used an injected synthetic official-API transport; live authorization and delivery were not verified.');
}
try{await main();}catch(error){
 const detail=error instanceof assert.AssertionError?error.message.split(/\r?\n/,1)[0]:JSON.stringify({name:error instanceof Error?error.name:'unknown',code:(error as {code?:string})?.code});
 console.error('Stage14 checks failed during '+phase+': '+detail);
 console.error('Check location: '+(error instanceof Error?error.stack?.split(/\r?\n/).find(l=>l.includes('check-google-calendar.ts'))?.trim():'unknown'));
 process.exitCode=1;
}finally{
 try{
  for(const close of servers.reverse())await close();await database.close();
  if(ownsScratch){await verifiedCluster();assert(/^ootla_demo_google_[a-f0-9]{32}$/.test(scratchName));const target=await owner.query<{owner:string}>('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1',[scratchName]);assert(target.rowCount===1&&target.rows[0]?.owner==='ootla','Scratch ownership changed; no deletion attempted.');const quoted=(await owner.query<{name:string}>('SELECT quote_ident($1) AS name',[scratchName])).rows[0]!.name;await owner.query('DROP DATABASE '+quoted);assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1',[scratchName])).rowCount,0);console.log('PASS removed only the uniquely owned Stage14 scratch database; retained data was never modified');}
 }catch{console.error('Stage14 owned scratch cleanup failed. No unrelated database deletion was attempted.');process.exitCode=1;}finally{if(ownerConnected)await owner.end();}
}

