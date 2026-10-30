import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {AuthUser} from '../../shared/contracts.js';
import type {Row} from '../../shared/operations-contracts.js';
import {Operations} from './operations.js';
import {LeadWorkspaces} from './lead-workspace.js';
import {leadScope,scopeArgs,propertyAccess,missing,operationEvent} from './operations-access.js';
import {ApiError} from '../http/errors.js';
export type Actor=AuthUser;
export type Client=PoolClient;
export class PropertyOperations extends Operations {
 async scoped(c:Client,a:Actor,table:'maintenance_work_orders'|'tenancy_plans'|'resident_requests'|'resident_relationships'|'unit_waitlist'|'resident_documents',id:string){
  const sql=`SELECT r.* FROM ${table} r WHERE r.id=$4 AND ${leadScope('r')}`,args=[...scopeArgs(a),id];
  const raw=(await c.query(sql,args)).rows[0];if(!raw)throw missing();
  if(raw.lead_id)await new LeadWorkspaces(this.database).assertLeadAccess(a,raw.lead_id,c,true);
  await propertyAccess(c,a,raw.property_id);
  if(table==='tenancy_plans'||table==='resident_documents')await c.query('SELECT id FROM resident_relationships WHERE id=$1 FOR UPDATE',[raw.resident_id]);
  const row=(await c.query(sql+' FOR UPDATE OF r',args)).rows[0];if(!row)throw missing();return row;
 }
 async unit(c:Client,a:Actor,id:string){const u=(await c.query('SELECT * FROM units WHERE id=$1 AND organization_id=$2',[id,a.organization.id])).rows[0];if(!u)throw missing();await propertyAccess(c,a,u.property_id);return u;}
 async lead(c:Client,a:Actor,id:string){return new LeadWorkspaces(this.database).assertLeadAccess(a,id,c,true);}
 async receipt(c:Client,a:{id:string;organization:{id:string}},operation:string,input:{requestKey:string},run:()=>Promise<Row>){
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['property-operation:'+a.organization.id+':'+input.requestKey]);
  const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const old=(await c.query('SELECT * FROM property_operation_receipts WHERE organization_id=$1 AND request_key=$2',[a.organization.id,input.requestKey])).rows[0];
  if(old){if(old.actor_id!==a.id||old.operation!==operation||old.payload_hash!==hash)throw new ApiError(409,'REQUEST_CONFLICT','Use a new request for changed details.');return old.result;}
  const result=await run();await c.query('INSERT INTO property_operation_receipts(organization_id,request_key,actor_id,operation,payload_hash,result) VALUES($1,$2,$3,$4,$5,$6)',[a.organization.id,input.requestKey,a.id,operation,hash,JSON.stringify(result)]);return result;
 }
 async history(c:Client,a:{id:string;organization:{id:string}},r:Row,kind:string,details:Row){
  await c.query('INSERT INTO property_operation_history(organization_id,property_id,lead_id,entity_id,actor_id,kind,details) VALUES($1,$2,$3,$4,$5,$6,$7)',[a.organization.id,r.property_id??null,r.lead_id??null,r.id,a.id,kind,JSON.stringify(details)]);
  if(r.property_id)await operationEvent(c,a.organization.id,r.property_id,r.lead_id??null,a.id,kind,'Property workflow updated.');
 }
 async timeline(c:Client,id:string){return(await c.query('SELECT h.id,h.kind,h.details,h.created_at,u.display_name AS author FROM property_operation_history h JOIN users u ON u.id=h.actor_id WHERE h.entity_id=$1 ORDER BY h.created_at DESC,h.id LIMIT 100',[id])).rows;}
 async draft(c:Client,a:Actor,leadId:string,key:string,subject:string,body:string){
  const l=await this.lead(c,a,leadId);
  const co=(await c.query('INSERT INTO conversations(organization_id,property_id,lead_id,owner_membership_id) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id,lead_id) DO UPDATE SET updated_at=now() RETURNING id',[a.organization.id,l.property_id,l.id,l.owner_membership_id])).rows[0];
  const m=(await c.query("INSERT INTO conversation_messages(organization_id,conversation_id,request_key,direction,channel,subject,body,status,created_by) VALUES($1,$2,$3,'outbound','email',$4,$5,'draft',$6) RETURNING id",[a.organization.id,co.id,key,subject,body,a.id])).rows[0];
  return{draftId:m.id,conversationId:co.id,url:'/admin/inbox?conversation='+co.id};
 }
}
export const fail=(message:string,code='WORKFLOW_CONFLICT'):never=>{throw new ApiError(409,code,message);};
export const day=(v:unknown)=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
