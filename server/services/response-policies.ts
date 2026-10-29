import type {z} from 'zod';
import type {responsePolicySchema,portfolioQuery} from '../../shared/property-operations-contracts.js';
import {PropertyOperations,fail,type Actor} from './property-operations-base.js';
import {propertyScope,propertyAccess,scopeArgs,requireAdmin,eligibleOwner,stale} from './operations-access.js';
export class ResponsePolicies extends PropertyOperations {
 async policies(u:Actor,d:string,q:z.infer<typeof portfolioQuery>){return this.staff(u,d,async(c,a)=>({items:(await c.query(`SELECT p.id AS property_id,p.name,r.enabled,r.time_zone,r.windows,r.response_minutes,r.escalation_minutes,r.manager_membership_id,r.version,count(*) OVER()::int AS total FROM properties p LEFT JOIN property_response_policies r ON r.property_id=p.id WHERE ${propertyScope('p').replaceAll('p.property_id','p.id')} AND ($4::uuid IS NULL OR p.id=$4) AND strpos(lower(p.name),lower($5))>0 ORDER BY p.name,p.id LIMIT 25 OFFSET $6`,[...scopeArgs(a),q.propertyId??null,q.q,(q.page-1)*25])).rows,page:q.page,canConfigure:a.organization.role==='organization_admin'}));}
 async save(u:Actor,d:string,i:z.infer<typeof responsePolicySchema>){return this.staff(u,d,async(c,a)=>{
  requireAdmin(a);await propertyAccess(c,a,i.propertyId);await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['response-policy:'+i.propertyId]);
  return this.receipt(c,a,'response-policy:save',i,async()=>{
   const old=(await c.query('SELECT * FROM property_response_policies WHERE property_id=$1 FOR UPDATE',[i.propertyId])).rows[0];if(old&&old.version!==i.version||!old&&i.version)throw stale();
   if(!(await c.query('SELECT 1 FROM pg_timezone_names WHERE name=$1',[i.timeZone])).rowCount)fail('Choose a recognized timezone such as America/Toronto.');
   await eligibleOwner(c,a.organization.id,i.managerMembershipId,[i.propertyId]);
   if(i.managerMembershipId&&!(await c.query("SELECT id FROM organization_memberships WHERE id=$1 AND role IN ('organization_admin','property_manager')",[i.managerMembershipId])).rowCount)fail('Choose an administrator or property manager for escalations.');
   const row=(await c.query('INSERT INTO property_response_policies(organization_id,property_id,enabled,time_zone,windows,response_minutes,escalation_minutes,manager_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(property_id) DO UPDATE SET enabled=$3,time_zone=$4,windows=$5,response_minutes=$6,escalation_minutes=$7,manager_membership_id=$8,version=property_response_policies.version+1,updated_at=now() RETURNING *',[a.organization.id,i.propertyId,i.enabled,i.timeZone,JSON.stringify(i.windows),i.responseMinutes,i.escalationMinutes,i.managerMembershipId])).rows[0];
   await this.history(c,a,{...row,id:i.propertyId},'response_policy.updated',{...i,requestKey:undefined});return row;
  });
 });}
}
// The queue calculates against the latest inbound message. Manual deadlines win.
export const inquiryDeadline=`COALESCE(co.response_due_at,CASE WHEN policy.enabled THEN ootla_response_deadline(inbound.created_at,policy.time_zone,policy.response_minutes,policy.windows) ELSE inbound.created_at+interval '4 hours' END)`;
export const inquiryEscalation=`CASE WHEN policy.enabled THEN ootla_response_deadline(${inquiryDeadline},policy.time_zone,policy.escalation_minutes,policy.windows) END`;
