import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { PoolClient,QueryResultRow } from 'pg';
import { z } from 'zod';
import type { AuthUser } from '../../shared/contracts.js';
import type { Paginated } from '../../shared/property-contracts.js';
import type { ConnectorConnection,ConnectorConflict,ConnectorEntity,ConnectorEvent,ConnectorJob,ConnectorMapping,ConnectorOverview } from '../../shared/connector-contracts.js';
import type { ServerConfig } from '../config/env.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { isIsolatedDemo,requireIsolatedDemo } from './demo-environment.js';
import { yardiDemoAdapter,appendDemoEvent,seedDemoProvider,demoIds } from '../connectors/yardi-demo.js';
import { encryptConnectorCredential } from '../connectors/vault.js';
import type { ConnectorAdapter,ConnectorEnvelope } from '../connectors/adapter.js';
import { getConnectorAdapter } from '../connectors/registry.js';
type Row=QueryResultRow;
type Page={page:number;pageSize:number};
const iso=(value:unknown):string|null=>value?(value instanceof Date?value:new Date(String(value))).toISOString():null;
const pageResult=<T>(items:T[],total:number,p:Page):Paginated<T>=>({items,total,page:p.page,pageSize:p.pageSize,totalPages:Math.ceil(total/p.pageSize)});
const missing=():never=>{throw new ApiError(404,'CONNECTOR_NOT_FOUND','This connection is unavailable in your organization.');};
const denied=():never=>{throw new ApiError(403,'CONNECTOR_ADMIN_REQUIRED','An organization administrator must manage connectors and diagnostics.');};
const table:Record<ConnectorEntity,string>={property:'properties',unit:'units',contact:'contacts',lead:'leads'};
const column:Record<ConnectorEntity,string>={property:'property_id',unit:'unit_id',contact:'contact_id',lead:'lead_id'};
const sourceFields=yardiDemoAdapter.fieldOwnership;
const recordId=(mapping:Row):string=>mapping.property_id??mapping.unit_id??mapping.contact_id??mapping.lead_id;
const related=(kind:ConnectorEntity,id:string,propertyId?:string):string=>kind==='property'?'/admin/properties?property='+encodeURIComponent(id):kind==='unit'?'/admin/properties?property='+encodeURIComponent(propertyId??''):kind==='contact'?'/admin/contacts?contact='+encodeURIComponent(id):'/admin/leads?lead='+encodeURIComponent(id);
const safeError=(code:string|null):string|null=>code?({
 SIMULATED_PROVIDER_UNAVAILABLE:'The synthetic provider is temporarily unavailable.',
 RECORD_APPLY_FAILED:'One or more source records could not be applied. Safe records were retained; retry will resume safely.',
 AUTHORIZATION_REVOKED:'The requesting administrator no longer has permission. Queue a sync with a current administrator.',
 DEMO_UNAVAILABLE:'The isolated simulator is unavailable.',
} as Record<string,string>)[code]??'The sync could not be completed. Review the job and retry.':null;
function connectionDto(row:Row):ConnectorConnection{return{id:row.id,provider:'yardi_demo',state:row.state,version:row.version,cursor:String(row.cursor),lastSuccessAt:iso(row.last_success_at),lastAttemptAt:iso(row.last_attempt_at),lastError:safeError(row.last_error),credentialConfigured:Boolean(row.credential_configured??row.credential_envelope),createdAt:iso(row.created_at)!};}
function jobDto(row:Row):ConnectorJob{return{id:row.id,mode:row.mode,status:row.status,attempts:row.attempts,maxAttempts:3,processedCount:row.processed_count,nextAttemptAt:iso(row.next_attempt_at)!,error:safeError(row.error),createdAt:iso(row.created_at)!,completedAt:iso(row.completed_at)};}
async function audit(client:PoolClient,user:AuthUser,action:string,metadata:Record<string,unknown>):Promise<void>{
 await client.query('INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,$3,$4::jsonb)',[user.organization.id,user.id,action,JSON.stringify(metadata)]);
}
async function authorize(client:PoolClient,user:AuthUser,digest:string):Promise<void>{
 const row=await client.query(`SELECT m.id FROM organization_memberships m JOIN users u ON u.id=m.user_id
  WHERE m.id=$1 AND m.organization_id=$2 AND m.user_id=$3 AND m.active AND m.account_kind='staff'
   AND m.role='organization_admin' AND u.active AND u.account_kind='staff' FOR SHARE OF m,u`,[user.membershipId,user.organization.id,user.id]);
 if(!row.rowCount)denied();
 const session=await client.query(`SELECT id FROM sessions WHERE token_digest=$1 AND user_id=$2 AND organization_id=$3 AND expires_at>clock_timestamp() FOR SHARE`,[digest,user.id,user.organization.id]);
 if(!session.rowCount)throw new ApiError(401,'AUTH_REQUIRED','Your session ended. Sign in again.');
}
async function demo(client:PoolClient,user:AuthUser,config:ServerConfig):Promise<void>{
 await requireIsolatedDemo(config,client);
 if(!(await client.query("SELECT id FROM organizations WHERE id=$1 AND environment='demo' FOR KEY SHARE",[user.organization.id])).rowCount)
  throw new ApiError(403,'DEMO_ENVIRONMENT_REQUIRED','Use a separate isolated demo organization for the simulator.');
}
async function locked(client:PoolClient,user:AuthUser,id:string):Promise<Row>{
 const row=(await client.query("SELECT * FROM connector_connections WHERE id=$1 AND organization_id=$2 AND provider='yardi_demo' FOR NO KEY UPDATE",[id,user.organization.id])).rows[0];
 return row??missing();
}
async function action<T extends Record<string,unknown>>(client:PoolClient,connection:Row,key:string,operation:string,input:unknown,run:()=>Promise<T>):Promise<T>{
 const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 const prior=(await client.query('SELECT operation,payload_hash,result FROM connector_action_receipts WHERE connection_id=$1 AND request_key=$2',[connection.id,key])).rows[0];
 if(prior){if(prior.operation!==operation||prior.payload_hash!==hash)throw new ApiError(409,'REQUEST_KEY_REUSED','Use a new request identifier for a different connector action.');return prior.result as T;}
 const result=await run();
 await client.query(`INSERT INTO connector_action_receipts(connection_id,organization_id,request_key,operation,payload_hash,result) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,[connection.id,connection.organization_id,key,operation,hash,JSON.stringify(result)]);
 return result;
}
async function enqueue(client:PoolClient,connection:Row,user:AuthUser,requestKey:string,mode:'incremental'|'replay'):Promise<Row>{
 const upper=String((await client.query('SELECT COALESCE(max(sequence),0)::text AS upper FROM connector_demo_events WHERE connection_id=$1',[connection.id])).rows[0].upper);
 const active=(await client.query("SELECT * FROM connector_jobs WHERE connection_id=$1 AND mode=$2 AND status IN ('queued','running') AND upper_sequence >= $3::bigint ORDER BY created_at,id LIMIT 1",[connection.id,mode,upper])).rows[0];
 if(active)return active;
 return (await client.query(`INSERT INTO connector_jobs(organization_id,connection_id,request_key,mode,upper_sequence,scan_cursor,requested_by_user_id,requested_by_membership_id)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[user.organization.id,connection.id,requestKey,mode,upper,mode==='replay'?'0':String(connection.cursor),user.id,user.membershipId])).rows[0];
}
const connectionColumns='id,organization_id,provider,state,version,cursor,last_success_at,last_attempt_at,last_error,(credential_envelope IS NOT NULL) AS credential_configured,created_at';
export class Connectors{
 constructor(private readonly database:Database,private readonly config:ServerConfig){}
 async overview(user:AuthUser,digest:string):Promise<ConnectorOverview>{
  return this.database.transaction(async client=>{
   await authorize(client,user,digest);
   const row=(await client.query(`SELECT ${connectionColumns} FROM connector_connections WHERE organization_id=$1 AND provider='yardi_demo'`,[user.organization.id])).rows[0];
   const available=await isIsolatedDemo(this.config,client)&&Boolean((await client.query("SELECT id FROM organizations WHERE id=$1 AND environment='demo'",[user.organization.id])).rowCount);
   const counts=row?(await client.query(`SELECT
     (SELECT count(*)::int FROM connector_jobs WHERE connection_id=$1) AS jobs,
     (SELECT count(*)::int FROM external_record_mappings WHERE connection_id=$1) AS mappings,
     (SELECT count(*)::int FROM connector_event_logs WHERE connection_id=$1) AS events,
     (SELECT count(*)::int FROM connector_conflicts WHERE connection_id=$1 AND status='open') AS conflicts`,[row.id])).rows[0]:null;
   return{connection:row?connectionDto(row):null,adapter:{key:'yardi_demo',name:yardiDemoAdapter.name,label:yardiDemoAdapter.label,capabilities:yardiDemoAdapter.capabilities,fieldOwnership:sourceFields,liveSetupMessage:'Yardi-ready integration. Live activation depends on the client\'s licensed interfaces, permissions and configuration. No live Yardi adapter is configured.'},
    access:{canManage:true,demoAvailable:available,credentialStorageAvailable:Boolean(this.config.connectorCredentialKey),liveAvailable:false},
    summary:{jobs:Number(counts?.jobs??0),mappings:Number(counts?.mappings??0),events:Number(counts?.events??0),openConflicts:Number(counts?.conflicts??0)}};
  });
 }
 async createDemo(user:AuthUser,digest:string,requestKey:string):Promise<{connection:ConnectorConnection;job:ConnectorJob}>{
  return this.database.transaction(async client=>{
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ootla:connector:'+user.organization.id]);
   let connection=(await client.query("SELECT * FROM connector_connections WHERE organization_id=$1 AND provider='yardi_demo' FOR NO KEY UPDATE",[user.organization.id])).rows[0];
   await authorize(client,user,digest);await demo(client,user,this.config);
   if(!connection)connection=(await client.query(`INSERT INTO connector_connections(organization_id,provider,state,created_by_user_id,created_by_membership_id) VALUES($1,'yardi_demo','connecting',$2,$3) RETURNING *`,[user.organization.id,user.id,user.membershipId])).rows[0];
   const result=await action(client,connection,requestKey,'demo_start',{},async()=>{
    if(connection.state==='disconnected')throw new ApiError(409,'CONNECTOR_DISCONNECTED','Use Reconnect to resume this simulator.');
    await seedDemoProvider(client,user.organization.id,connection.id);
    const job=await enqueue(client,connection,user,requestKey,'incremental');
    await audit(client,user,'connector.demo_started',{connectionId:connection.id,jobId:job.id});
    return{jobId:job.id};
   });
   const job=(await client.query('SELECT * FROM connector_jobs WHERE id=$1 AND connection_id=$2',[result.jobId,connection.id])).rows[0];
   return{connection:connectionDto(connection),job:jobDto(job)};
  });
 }
 async sync(user:AuthUser,digest:string,id:string,requestKey:string,mode:'incremental'|'replay'):Promise<{job:ConnectorJob}>{
  return this.database.transaction(async client=>{
   const connection=await locked(client,user,id);await authorize(client,user,digest);await demo(client,user,this.config);
   const result=await action(client,connection,requestKey,'sync',{mode},async()=>{
    if(connection.state==='disconnected')throw new ApiError(409,'CONNECTOR_DISCONNECTED','Reconnect the simulator before syncing.');
    const job=await enqueue(client,connection,user,requestKey,mode);
    await audit(client,user,'connector.sync_requested',{connectionId:id,jobId:job.id,mode});return{jobId:job.id};
   });
   return{job:jobDto((await client.query('SELECT * FROM connector_jobs WHERE id=$1 AND connection_id=$2',[result.jobId,id])).rows[0])};
  });
 }
 async disconnect(user:AuthUser,digest:string,id:string,requestKey:string):Promise<{connection:ConnectorConnection}>{
  return this.database.transaction(async client=>{
   const connection=await locked(client,user,id);await authorize(client,user,digest);await demo(client,user,this.config);
   await action(client,connection,requestKey,'disconnect',{},async()=>{
    await client.query("UPDATE connector_connections SET state='disconnected',version=version+1,updated_at=now() WHERE id=$1",[id]);
    await client.query("UPDATE connector_jobs SET status='cancelled',completed_at=now() WHERE connection_id=$1 AND status IN ('queued','running')",[id]);
    await audit(client,user,'connector.disconnected',{connectionId:id});return{disconnected:true};
   });
   return{connection:connectionDto((await client.query(`SELECT ${connectionColumns} FROM connector_connections WHERE id=$1`,[id])).rows[0])};
  });
 }
 async reconnect(user:AuthUser,digest:string,id:string,requestKey:string):Promise<{connection:ConnectorConnection;job:ConnectorJob}>{
  return this.database.transaction(async client=>{
   const connection=await locked(client,user,id);await authorize(client,user,digest);await demo(client,user,this.config);
   const result=await action(client,connection,requestKey,'reconnect',{},async()=>{
    await client.query("UPDATE connector_connections SET state='connecting',last_error=NULL,version=version+1,updated_at=now() WHERE id=$1",[id]);
    const job=await enqueue(client,connection,user,requestKey,'incremental');
    await audit(client,user,'connector.reconnected',{connectionId:id,jobId:job.id});return{jobId:job.id};
   });
   return{connection:connectionDto((await client.query(`SELECT ${connectionColumns} FROM connector_connections WHERE id=$1`,[id])).rows[0]),job:jobDto((await client.query('SELECT * FROM connector_jobs WHERE id=$1 AND connection_id=$2',[result.jobId,id])).rows[0])};
  });
 }
 async demoAction(user:AuthUser,digest:string,id:string,input:{requestKey:string;action:'availability_update'|'contact_update'|'fail_next'|'duplicate_event'|'stale_event';status?:'available'|'reserved'|'occupied'}):Promise<{queuedEvents:number}>{
  return this.database.transaction(async client=>{
   const connection=await locked(client,user,id);await authorize(client,user,digest);await demo(client,user,this.config);
   return action(client,connection,input.requestKey,'demo_action',{action:input.action,status:input.status??null},async()=>{
    if(connection.state==='disconnected')throw new ApiError(409,'CONNECTOR_DISCONNECTED','Reconnect the simulator before staging source changes.');
    let count=0;
    if(input.action==='fail_next')await client.query('UPDATE connector_demo_state SET fail_next=least(3,fail_next+1) WHERE connection_id=$1',[id]);
    else if(input.action==='duplicate_event'){
     const event=(await client.query('SELECT * FROM connector_demo_events WHERE connection_id=$1 ORDER BY sequence DESC LIMIT 1',[id])).rows[0];
     if(event){await appendDemoEvent(client,user.organization.id,id,event.entity_type,event.external_id,event.provider_version,event.payload,event.provider_event_id);count=1;}
    }else{
     const kind=input.action==='contact_update'?'contact':'unit';
     const record=(await client.query('SELECT * FROM connector_demo_records WHERE connection_id=$1 AND entity_type=$2 FOR UPDATE',[id,kind])).rows[0];
     if(!record)throw new ApiError(409,'SIMULATOR_NOT_READY','Start the simulator before staging source changes.');
     if(input.action==='stale_event'){
      await appendDemoEvent(client,user.organization.id,id,kind,record.external_id,Math.max(1,record.provider_version-1),{...record.payload,status:record.payload.status==='occupied'?'available':'occupied'});
     }else{
      const payload={...record.payload,...(kind==='unit'?{status:input.status??(record.payload.status==='available'?'reserved':'available')}:{phone:record.payload.phone==='+234 555 0102'?'+234 555 0103':'+234 555 0102'})};
      const version=record.provider_version+1;
      await client.query('UPDATE connector_demo_records SET payload=$3::jsonb,provider_version=$4,updated_at=now() WHERE connection_id=$1 AND entity_type=$2',[id,kind,JSON.stringify(payload),version]);
      await appendDemoEvent(client,user.organization.id,id,kind,record.external_id,version,payload);
     }
     count=1;
    }
    await audit(client,user,'connector.simulator_action',{connectionId:id,action:input.action});return{queuedEvents:count};
   });
  });
 }
 async credentials(user:AuthUser,digest:string,id:string,secret:string):Promise<{configured:true}>{
  return this.database.transaction(async client=>{
   const connection=await locked(client,user,id);await authorize(client,user,digest);await demo(client,user,this.config);
   const envelope=encryptConnectorCredential(secret,this.config.connectorCredentialKey,user.organization.id+':'+connection.id+':yardi_demo');
   await client.query('UPDATE connector_connections SET credential_envelope=$2::jsonb,version=version+1,updated_at=now() WHERE id=$1',[id,JSON.stringify(envelope)]);
   await audit(client,user,'connector.credential_saved',{connectionId:id});return{configured:true};
  });
 }
 private async read<T>(user:AuthUser,digest:string,id:string,run:(client:PoolClient)=>Promise<T>):Promise<T>{
  return this.database.transaction(async client=>{await authorize(client,user,digest);if(!(await client.query("SELECT id FROM connector_connections WHERE id=$1 AND organization_id=$2 AND provider='yardi_demo'",[id,user.organization.id])).rowCount)missing();return run(client);});
 }
 async jobs(user:AuthUser,digest:string,id:string,p:Page):Promise<Paginated<ConnectorJob>>{
  return this.read(user,digest,id,async client=>{
   const total=Number((await client.query('SELECT count(*) AS total FROM connector_jobs WHERE connection_id=$1',[id])).rows[0].total);
   const rows=await client.query('SELECT * FROM connector_jobs WHERE connection_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3',[id,p.pageSize,(p.page-1)*p.pageSize]);return pageResult(rows.rows.map(jobDto),total,p);
  });
 }
 async mappings(user:AuthUser,digest:string,id:string,p:Page):Promise<Paginated<ConnectorMapping>>{
  return this.read(user,digest,id,async client=>{
   const total=Number((await client.query('SELECT count(*) AS total FROM external_record_mappings WHERE connection_id=$1',[id])).rows[0].total);
   const rows=await client.query(`SELECT m.*,u.property_id AS unit_property_id FROM external_record_mappings m LEFT JOIN units u ON u.id=m.unit_id AND u.organization_id=m.organization_id WHERE m.connection_id=$1 ORDER BY m.entity_type,m.external_id,m.id LIMIT $2 OFFSET $3`,[id,p.pageSize,(p.page-1)*p.pageSize]);
   return pageResult(rows.rows.map(row=>({id:row.id,entityType:row.entity_type,externalId:row.external_id,recordId:recordId(row),relatedUrl:related(row.entity_type,recordId(row),row.unit_property_id),lastProviderVersion:row.provider_version,sourceOwnedFields:sourceFields[row.entity_type as ConnectorEntity],lastSyncedAt:iso(row.last_synced_at)})),total,p);
  });
 }
 async events(user:AuthUser,digest:string,id:string,p:Page):Promise<Paginated<ConnectorEvent>>{
  return this.read(user,digest,id,async client=>{
   const total=Number((await client.query('SELECT count(*) AS total FROM connector_event_logs WHERE connection_id=$1',[id])).rows[0].total);
   const rows=await client.query(`SELECT l.*,r.provider_event_id,r.entity_type,r.external_id,r.provider_version,m.property_id,m.unit_id,m.contact_id,m.lead_id,u.property_id AS unit_property_id FROM connector_event_logs l JOIN connector_event_receipts r ON r.id=l.receipt_id AND r.organization_id=l.organization_id JOIN external_record_mappings m ON m.id=r.mapping_id AND m.organization_id=r.organization_id LEFT JOIN units u ON u.id=m.unit_id AND u.organization_id=m.organization_id WHERE l.connection_id=$1 ORDER BY l.sequence DESC,l.id LIMIT $2 OFFSET $3`,[id,p.pageSize,(p.page-1)*p.pageSize]);
   return pageResult(rows.rows.map(row=>({id:row.id,providerEventId:row.provider_event_id,sequence:String(row.sequence),entityType:row.entity_type,externalId:row.external_id,providerVersion:row.provider_version,status:row.status,summary:row.summary,recordId:recordId(row),relatedUrl:related(row.entity_type,recordId(row),row.unit_property_id),occurredAt:iso(row.created_at)!})),total,p);
  });
 }
 async conflicts(user:AuthUser,digest:string,id:string,p:Page):Promise<Paginated<ConnectorConflict>>{
  return this.read(user,digest,id,async client=>{
   const total=Number((await client.query('SELECT count(*) AS total FROM connector_conflicts WHERE connection_id=$1',[id])).rows[0].total);
   const rows=await conflictRows(client,id,p);return pageResult(rows.map(conflictDto),total,p);
  });
 }
 async resolve(user:AuthUser,digest:string,id:string,conflictId:string,input:{requestKey:string;resolution:'use_provider'|'keep_ootla'}):Promise<{conflict:ConnectorConflict}>{
  return this.database.transaction(async client=>{
   const connection=await locked(client,user,id);await authorize(client,user,digest);await demo(client,user,this.config);
   await action(client,connection,input.requestKey,'resolve_conflict',{conflictId,resolution:input.resolution},async()=>{
    if(connection.state==='disconnected')throw new ApiError(409,'CONNECTOR_DISCONNECTED','Reconnect before reviewing a source conflict.');
    const conflict=(await client.query(`SELECT c.*,r.first_sequence,r.provider_version,r.entity_type,r.mapping_id FROM connector_conflicts c JOIN connector_event_receipts r ON r.id=c.receipt_id AND r.organization_id=c.organization_id WHERE c.id=$1 AND c.connection_id=$2 FOR UPDATE OF c`,[conflictId,id])).rows[0];
    if(!conflict)throw new ApiError(404,'CONFLICT_NOT_FOUND','This conflict is unavailable in your organization.');
    if(conflict.status!=='open')throw new ApiError(409,'CONFLICT_RESOLVED','This conflict was already reviewed. Reload the results.');
    const event=await envelopeAt(client,id,String(conflict.first_sequence));
    const mapping=(await client.query('SELECT * FROM external_record_mappings WHERE id=$1 AND connection_id=$2 FOR UPDATE',[conflict.mapping_id,id])).rows[0];
    const latest=Number((await client.query('SELECT provider_version FROM connector_demo_records WHERE connection_id=$1 AND entity_type=$2 AND external_id=$3',[id,event.entityType,event.externalId])).rows[0]?.provider_version??0);
    if(input.resolution==='use_provider'&&(conflict.reason==='stale_event'||event.providerVersion<mapping.provider_version||event.providerVersion<latest))throw new ApiError(409,'STALE_PROVIDER_EVENT','Keep the newer current record. An older event cannot overwrite it.');
    let values=await canonicalValues(client,mapping,true);
    if(input.resolution==='use_provider'){values=await updateCanonical(client,mapping,event); }
    // Keeping the current values consumes this revision without changing field
    // ownership. Future genuinely newer source revisions can sync normally.
    if(event.providerVersion>=mapping.provider_version)await client.query('UPDATE external_record_mappings SET provider_version=greatest(provider_version,$2),provider_snapshot=$3::jsonb,last_synced_at=now() WHERE id=$1',[mapping.id,event.providerVersion,JSON.stringify(values)]);
    await client.query("UPDATE connector_event_receipts SET status=$2 WHERE id=$1",[conflict.receipt_id,input.resolution==='use_provider'?'applied':'ignored']);
    await client.query("UPDATE connector_event_logs SET status=$2,summary=$3 WHERE receipt_id=$1 AND status='conflict'",[conflict.receipt_id,input.resolution==='use_provider'?'applied':'ignored',input.resolution==='use_provider'?'Staff applied the reviewed synthetic provider revision.':'Staff kept the current record and skipped this incoming revision.']);
    await client.query("UPDATE connector_conflicts SET status='resolved',resolution=$2,resolved_by_user_id=$3,resolved_by_membership_id=$4,resolved_at=now() WHERE id=$1",[conflictId,input.resolution,user.id,user.membershipId]);
    await audit(client,user,'connector.conflict_resolved',{connectionId:id,conflictId,resolution:input.resolution});return{resolved:true};
   });
   return{conflict:conflictDto((await conflictRows(client,id,{page:1,pageSize:1},conflictId))[0])};
  });
 }
}

const sourceText=(max:number)=>z.string().trim().min(1).max(max).refine(value=>!/[\u0000-\u001f\u007f]/.test(value));
const propertyPayload=z.object({name:sourceText(200),address:z.string().max(500),city:sourceText(200),type:sourceText(100)}).strict();
const unitPayload=z.object({propertyExternalId:sourceText(200),label:sourceText(100),bedrooms:z.number().int().min(0).max(100),status:z.enum(['available','reserved','occupied']),monthlyRent:z.number().min(0).max(9999999999.99)}).strict();
const contactPayload=z.object({propertyExternalId:sourceText(200),displayName:sourceText(200),email:z.email().max(254),phone:z.string().max(100)}).strict();
const leadPayload=z.object({propertyExternalId:sourceText(200),unitExternalId:sourceText(200),contactExternalId:sourceText(200)}).strict();
function payload(event:ConnectorEnvelope):Row{
 const schema=event.entityType==='property'?propertyPayload:event.entityType==='unit'?unitPayload:event.entityType==='contact'?contactPayload:leadPayload;
 const parsed=schema.safeParse(event.payload);if(!parsed.success)throw new Error('INVALID_SOURCE_RECORD');return parsed.data;
}
function providerValues(event:ConnectorEnvelope):Record<string,string|number|null>{
 const input=payload(event);
 if(event.entityType==='property')return{name:input.name,address:input.address,city:input.city,type:input.type};
 if(event.entityType==='unit')return{label:input.label,bedrooms:input.bedrooms,status:input.status,monthlyRent:input.monthlyRent,availabilitySource:'demo',lastVerifiedAt:null};
 if(event.entityType==='contact')return{displayName:input.displayName,email:input.email.toLowerCase(),phone:input.phone};
 return{};
}
const same=(a:unknown,b:unknown):boolean=>JSON.stringify(a)===JSON.stringify(b);
const changes=(a:Row,b:Row,kind:ConnectorEntity):string[]=>sourceFields[kind].filter(field=>!same(a[field],b[field]));
async function envelopeAt(client:PoolClient,connectionId:string,sequence:string):Promise<ConnectorEnvelope>{
 const row=(await client.query('SELECT sequence::text,provider_event_id,entity_type,external_id,provider_version,payload FROM connector_demo_events WHERE connection_id=$1 AND sequence=$2::bigint',[connectionId,sequence])).rows[0];
 if(!row)throw new ApiError(404,'SOURCE_EVENT_NOT_FOUND','This source event is unavailable.');
 return{sequence:row.sequence,providerEventId:row.provider_event_id,entityType:row.entity_type,externalId:row.external_id,providerVersion:row.provider_version,payload:row.payload};
}
async function mapped(client:PoolClient,connection:Row,kind:ConnectorEntity,externalId:string):Promise<Row|undefined>{
 return (await client.query('SELECT * FROM external_record_mappings WHERE connection_id=$1 AND organization_id=$2 AND entity_type=$3 AND external_id=$4 FOR UPDATE',[connection.id,connection.organization_id,kind,externalId])).rows[0];
}
async function dependency(client:PoolClient,connection:Row,kind:ConnectorEntity,id:string):Promise<Row>{
 const mapping=await mapped(client,connection,kind,id);if(!mapping)throw new Error('MISSING_SOURCE_DEPENDENCY');return mapping;
}
async function canonicalValues(client:PoolClient,mapping:Row,lock=false):Promise<Record<string,string|number|null>>{
 const kind=mapping.entity_type as ConnectorEntity;
 const row=(await client.query(`SELECT * FROM ${table[kind]} WHERE id=$1 AND organization_id=$2${lock?' FOR UPDATE':''}`,[recordId(mapping),mapping.organization_id])).rows[0];
 if(!row)throw new Error('MISSING_CANONICAL_RECORD');
 if(kind==='lead')return{};
 if(row.source_system!=='demo'||sourceFields[kind].some(field=>!row.source_owned_fields.includes(field)))throw new Error('SOURCE_OWNERSHIP_CHANGED');
 if(kind==='property')return{name:row.name,address:row.address,city:row.city,type:row.property_type};
 if(kind==='unit')return{label:row.label,bedrooms:row.bedrooms,status:row.status,monthlyRent:Number(row.monthly_rent),availabilitySource:row.availability_source,lastVerifiedAt:iso(row.availability_verified_at)};
 return{displayName:row.display_name,email:row.email,phone:row.phone};
}
async function createCanonical(client:PoolClient,connection:Row,event:ConnectorEnvelope,userId:string,membershipId:string):Promise<Row>{
 const input=payload(event);let id:string;
 if(event.entityType==='property'){
  id=(await client.query(`INSERT INTO properties(organization_id,name,address,city,property_type,source_system,source_owned_fields) VALUES($1,$2,$3,$4,$5,'demo',$6) RETURNING id`,[connection.organization_id,input.name,input.address,input.city,input.type,sourceFields.property])).rows[0].id;
 }else{
  const property=await dependency(client,connection,'property',input.propertyExternalId);
  if(event.entityType==='unit'){
   id=(await client.query(`INSERT INTO units(organization_id,property_id,label,bedrooms,status,monthly_rent,source_system,source_owned_fields,availability_source,availability_verified_at) VALUES($1,$2,$3,$4,$5,$6,'demo',$7,'demo',NULL) RETURNING id`,[connection.organization_id,property.property_id,input.label,input.bedrooms,input.status,input.monthlyRent,sourceFields.unit])).rows[0].id;
  }else if(event.entityType==='contact'){
   id=(await client.query(`INSERT INTO contacts(organization_id,display_name,email,phone,source_system,source_owned_fields) VALUES($1,$2,$3,$4,'demo',$5) RETURNING id`,[connection.organization_id,input.displayName,input.email.toLowerCase(),input.phone,sourceFields.contact])).rows[0].id;
   await client.query('INSERT INTO contact_property_links(organization_id,contact_id,property_id) VALUES($1,$2,$3)',[connection.organization_id,id,property.property_id]);
  }else{
   const contact=await dependency(client,connection,'contact',input.contactExternalId),unit=await dependency(client,connection,'unit',input.unitExternalId);
   const identity=(await client.query('SELECT display_name,email FROM contacts WHERE id=$1 AND organization_id=$2',[contact.contact_id,connection.organization_id])).rows[0];
   if(!identity)throw new Error('MISSING_SOURCE_DEPENDENCY');
   id=(await client.query(`INSERT INTO leads(organization_id,property_id,unit_id,contact_id,display_name,email,status,intent,pipeline_stage,source) VALUES($1,$2,$3,$4,$5,$6,'new','leasing','new_inquiry','demo') RETURNING id`,[connection.organization_id,property.property_id,unit.unit_id,contact.contact_id,identity.display_name,identity.email])).rows[0].id;
   await client.query(`INSERT INTO lead_events(organization_id,lead_id,kind,stage,actor_user_id,actor_membership_id,metadata) VALUES($1,$2,'created','new_inquiry',$3,$4,$5::jsonb)`,[connection.organization_id,id,userId,membershipId,JSON.stringify({source:'yardi_demo',simulated:true,connectionId:connection.id})]);
  }
 }
 // No adoption or name/email matching: only a new record can receive a new
 // simulator identity. The unique mapping constraint rolls back orphan creates.
 const mapping=(await client.query(`INSERT INTO external_record_mappings(organization_id,entity_type,${column[event.entityType]},provider,external_id,connection_id,provider_version,provider_snapshot,last_synced_at) VALUES($1,$2,$3,'yardi_demo',$4,$5,$6,$7::jsonb,now()) RETURNING *`,[connection.organization_id,event.entityType,id,event.externalId,connection.id,event.providerVersion,JSON.stringify(providerValues(event))])).rows[0];
 return mapping;
}
async function updateCanonical(client:PoolClient,mapping:Row,event:ConnectorEnvelope):Promise<Record<string,string|number|null>>{
 const values=providerValues(event),id=recordId(mapping),org=mapping.organization_id;
 if(event.entityType==='property')await client.query('UPDATE properties SET name=$3,address=$4,city=$5,property_type=$6,updated_at=now() WHERE id=$1 AND organization_id=$2',[id,org,values.name,values.address,values.city,values.type]);
 else if(event.entityType==='unit')await client.query("UPDATE units SET label=$3,bedrooms=$4,status=$5,monthly_rent=$6,availability_source='demo',availability_verified_at=NULL,updated_at=now() WHERE id=$1 AND organization_id=$2",[id,org,values.label,values.bedrooms,values.status,values.monthlyRent]);
 else if(event.entityType==='contact')await client.query('UPDATE contacts SET display_name=$3,email=$4,phone=$5,updated_at=now() WHERE id=$1 AND organization_id=$2',[id,org,values.displayName,values.email,values.phone]);
 // Guest-card revisions never own pipeline, owner, preferences, tasks, notes,
 // application state or lease milestones. Existing CRM work stays untouched.
 return values;
}
async function conflictRows(client:PoolClient,id:string,p:Page,conflictId?:string):Promise<Row[]>{
 return(await client.query(`SELECT c.*,r.entity_type,r.external_id,r.provider_version,m.provider_version AS mapping_version,m.property_id,m.unit_id,m.contact_id,m.lead_id,u.property_id AS unit_property_id,
  s.provider_version AS current_provider_version FROM connector_conflicts c JOIN connector_event_receipts r ON r.id=c.receipt_id AND r.organization_id=c.organization_id
  JOIN external_record_mappings m ON m.id=c.mapping_id AND m.organization_id=c.organization_id
  LEFT JOIN units u ON u.id=m.unit_id AND u.organization_id=m.organization_id
  LEFT JOIN connector_demo_records s ON s.connection_id=c.connection_id AND s.entity_type=r.entity_type AND s.external_id=r.external_id
  WHERE c.connection_id=$1 AND ($4::uuid IS NULL OR c.id=$4) ORDER BY c.created_at DESC,c.id DESC LIMIT $2 OFFSET $3`,[id,p.pageSize,(p.page-1)*p.pageSize,conflictId??null])).rows;
}
function conflictDto(row:Row):ConnectorConflict{
 return{id:row.id,entityType:row.entity_type,externalId:row.external_id,recordId:recordId(row),relatedUrl:related(row.entity_type,recordId(row),row.unit_property_id),reason:row.reason,fields:row.fields,currentValues:row.current_values,providerValues:row.provider_values,status:row.status,resolution:row.resolution,canUseProvider:row.status==='open'&&row.reason!=='stale_event'&&row.provider_version>=row.mapping_version&&row.provider_version>=Number(row.current_provider_version??0),createdAt:iso(row.created_at)!,resolvedAt:iso(row.resolved_at)};
}
async function applyEvent(client:PoolClient,connection:Row,event:ConnectorEnvelope,job:Row,adapter:ConnectorAdapter):Promise<void>{
 const capability={property:'properties',unit:'units',contact:'contacts',lead:'guestCards'} as const;
 if(!adapter.capabilities[capability[event.entityType]])throw new Error('UNSUPPORTED_SOURCE_RECORD');
 const prior=(await client.query('SELECT * FROM connector_event_receipts WHERE connection_id=$1 AND provider_event_id=$2',[connection.id,event.providerEventId])).rows[0];
 if(prior){
  const original=await envelopeAt(client,connection.id,String(prior.first_sequence));
  if(original.entityType!==event.entityType||original.externalId!==event.externalId||original.providerVersion!==event.providerVersion||!isDeepStrictEqual(original.payload,event.payload))
   throw new Error('PROVIDER_EVENT_ID_REUSED');
  await client.query(`INSERT INTO connector_event_logs(organization_id,connection_id,sequence,receipt_id,status,summary) VALUES($1,$2,$3,$4,'duplicate','Repeated synthetic event skipped safely.') ON CONFLICT(connection_id,sequence) DO NOTHING`,[connection.organization_id,connection.id,event.sequence,prior.id]);return;
 }
 let mapping=await mapped(client,connection,event.entityType,event.externalId);
 let status:'applied'|'ignored'|'conflict'='applied',reason:'local_change'|'stale_event'|null=null,fields:string[]=[];
 let current:Record<string,string|number|null>={},incoming=providerValues(event);
 if(!mapping)mapping=await createCanonical(client,connection,event,job.requested_by_user_id,job.requested_by_membership_id);
 else{
  current=await canonicalValues(client,mapping,true);
  const revision=Number(mapping.provider_version);
  if(event.providerVersion<=revision){
   const previouslySkipped=Boolean((await client.query(`SELECT 1 FROM connector_event_receipts r JOIN connector_demo_events e ON e.sequence=r.first_sequence AND e.connection_id=r.connection_id WHERE r.connection_id=$1 AND r.entity_type=$2 AND r.external_id=$3 AND r.provider_version=$4 AND r.status='ignored' AND e.payload=$5::jsonb LIMIT 1`,[connection.id,event.entityType,event.externalId,event.providerVersion,JSON.stringify(event.payload)])).rowCount);
   const incomingDifference=changes(mapping.provider_snapshot,incoming,event.entityType);
   if(!previouslySkipped&&(event.providerVersion<revision||incomingDifference.length)){
    status='conflict';reason='stale_event';fields=incomingDifference.length?incomingDifference:sourceFields[event.entityType];
   }else status='ignored';
  }else{
   fields=changes(mapping.provider_snapshot,current,event.entityType);
   if(fields.length){status='conflict';reason='local_change';}
   else{
    const values=await updateCanonical(client,mapping,event);
    await client.query('UPDATE external_record_mappings SET provider_version=$2,provider_snapshot=$3::jsonb,last_synced_at=now() WHERE id=$1',[mapping.id,event.providerVersion,JSON.stringify(values)]);
   }
  }
 }
 const receipt=(await client.query(`INSERT INTO connector_event_receipts(organization_id,connection_id,provider_event_id,entity_type,external_id,provider_version,status,mapping_id,first_sequence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[connection.organization_id,connection.id,event.providerEventId,event.entityType,event.externalId,event.providerVersion,status,mapping.id,event.sequence])).rows[0];
 if(reason)await client.query(`INSERT INTO connector_conflicts(organization_id,connection_id,receipt_id,mapping_id,reason,fields,current_values,provider_values) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,[connection.organization_id,connection.id,receipt.id,mapping.id,reason,fields,JSON.stringify(current),JSON.stringify(incoming)]);
 await client.query(`INSERT INTO connector_event_logs(organization_id,connection_id,sequence,receipt_id,status,summary) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(connection_id,sequence) DO NOTHING`,[connection.organization_id,connection.id,event.sequence,receipt.id,status,status==='conflict'?(reason==='stale_event'?'Out-of-order synthetic update awaits staff review.':'A source-owned value changed locally; staff review is required.'):status==='ignored'?'An already-consumed provider revision was skipped.':'Synthetic provider record applied to the CRM.']);
}
async function failJob(client:PoolClient,connection:Row,job:Row,code:'SIMULATED_PROVIDER_UNAVAILABLE'|'RECORD_APPLY_FAILED'|'AUTHORIZATION_REVOKED'):Promise<void>{
 const attempts=Math.max(1,job.attempts),terminal=attempts>=3||code==='AUTHORIZATION_REVOKED';
 await client.query(`UPDATE connector_jobs SET attempts=$2,status=$3,error=$4,next_attempt_at=clock_timestamp()+($5::text||' seconds')::interval,completed_at=CASE WHEN $6 THEN now() ELSE NULL END WHERE id=$1`,[job.id,Math.min(3,attempts),terminal?'failed':'queued',code,attempts===1?30:60,terminal]);
 await client.query("UPDATE connector_connections SET state='degraded',last_error=$2,last_attempt_at=now(),version=version+1,updated_at=now() WHERE id=$1",[connection.id,code]);
}
/** One bounded tick. Every canonical change, receipt and safe cursor is committed together. */
export async function processConnectorJobs(database:Database,config:ServerConfig,options:{batchSize?:number}={}):Promise<number>{
 if(!config.demoMode||config.production||!await isIsolatedDemo(config,database))return 0;
 const ready=(await database.query<{ready:boolean}>("SELECT to_regclass('public.connector_jobs') IS NOT NULL AS ready")).rows[0]?.ready;
 if(!ready)return 0;
 const limit=Math.max(1,Math.min(100,Math.floor(options.batchSize??50)));
 return database.transaction(async client=>{
  const connection=(await client.query(`SELECT c.* FROM connector_connections c WHERE c.provider='yardi_demo' AND c.state IN ('connecting','demo','degraded')
   AND EXISTS(SELECT 1 FROM connector_jobs j WHERE j.connection_id=c.id AND j.status='queued' AND j.next_attempt_at<=clock_timestamp())
   ORDER BY c.updated_at,c.id FOR NO KEY UPDATE OF c SKIP LOCKED LIMIT 1`)).rows[0];
  if(!connection)return 0;
  const job=(await client.query("SELECT * FROM connector_jobs WHERE connection_id=$1 AND status='queued' AND next_attempt_at<=clock_timestamp() ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1",[connection.id])).rows[0];
  if(!job)return 0;
  const authorized=await client.query(`SELECT m.id FROM organization_memberships m JOIN users u ON u.id=m.user_id JOIN organizations o ON o.id=m.organization_id WHERE m.id=$1 AND m.user_id=$2 AND m.organization_id=$3 AND m.role='organization_admin' AND m.active AND m.account_kind='staff' AND u.active AND u.account_kind='staff' AND o.environment='demo' FOR SHARE OF m,u`,[job.requested_by_membership_id,job.requested_by_user_id,connection.organization_id]);
  if(!authorized.rowCount){await failJob(client,connection,job,'AUTHORIZATION_REVOKED');return 0;}
  // An attempt may span several bounded chunks. Only an initial run or a retry
  // after an actual error consumes another attempt; clean chunks do not.
  job.attempts=job.attempts===0?1:job.error?Math.min(3,job.attempts+1):job.attempts;
  await client.query("UPDATE connector_jobs SET status='running',attempts=$2 WHERE id=$1",[job.id,job.attempts]);
  const failure=await client.query('UPDATE connector_demo_state SET fail_next=fail_next-1 WHERE connection_id=$1 AND fail_next>0 RETURNING connection_id',[connection.id]);
  if(failure.rowCount){await failJob(client,connection,job,'SIMULATED_PROVIDER_UNAVAILABLE');return 0;}
  const adapter=getConnectorAdapter(connection.provider);
  if(!adapter)throw new Error('UNREGISTERED_CONNECTOR');
  const events=await adapter.poll(client,connection.id,String(job.scan_cursor),String(job.upper_sequence),limit);
  let safeCursor=String(job.scan_cursor),failed=false,processed=0;
  for(const event of events){
   await client.query('SAVEPOINT connector_event_apply');
   try{
    await applyEvent(client,connection,event,job,adapter);
    await client.query('RELEASE SAVEPOINT connector_event_apply');
    processed++;
    if(!failed)safeCursor=event.sequence;
   }catch{
    await client.query('ROLLBACK TO SAVEPOINT connector_event_apply');await client.query('RELEASE SAVEPOINT connector_event_apply');failed=true;
   }
  }
  const more=Boolean((await client.query('SELECT 1 FROM connector_demo_events WHERE connection_id=$1 AND sequence>$2::bigint AND sequence<=$3::bigint LIMIT 1',[connection.id,safeCursor,String(job.upper_sequence)])).rowCount);
  await client.query('UPDATE connector_jobs SET scan_cursor=$2,processed_count=processed_count+$3 WHERE id=$1',[job.id,safeCursor,processed]);
  // Only the contiguous successful prefix can advance the shared cursor.
  await client.query('UPDATE connector_connections SET cursor=greatest(cursor,$2::bigint),last_attempt_at=now(),updated_at=now() WHERE id=$1',[connection.id,safeCursor]);
  if(failed){await failJob(client,connection,job,'RECORD_APPLY_FAILED');return processed;}
  await client.query(`UPDATE connector_jobs SET status=$2,attempts=greatest(1,attempts),error=NULL,next_attempt_at=now(),completed_at=CASE WHEN $3 THEN now() ELSE NULL END WHERE id=$1`,[job.id,more?'queued':'completed',!more]);
  await client.query("UPDATE connector_connections SET state=CASE WHEN NOT $2::boolean AND state='connecting' THEN 'connecting' ELSE 'demo' END,last_error=NULL,last_success_at=CASE WHEN $2 THEN now() ELSE last_success_at END,version=version+1,updated_at=now() WHERE id=$1",[connection.id,!more]);
  return processed;
 });
}
export function startConnectorWorker(database:Database,config:ServerConfig):()=>Promise<void>{
 let stopped=false,running:Promise<unknown>|undefined;
 const tick=()=>{if(stopped||running)return;running=processConnectorJobs(database,config).catch(()=>console.error('Connector worker failed. Review database availability and connector diagnostics.')).finally(()=>{running=undefined;});};
 const timer=setInterval(tick,2000);timer.unref();tick();
 return async()=>{stopped=true;clearInterval(timer);await running;};
}
