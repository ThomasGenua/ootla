import type {PoolClient,QueryResultRow} from 'pg';
import type {AuthUser} from '../../shared/contracts.js';
import type {ServerConfig} from '../config/env.js';
import {ApiError} from '../http/errors.js';
import {staffOrganizationAccess} from './application-access.js';
import {residentCanonicalJoin,residentCanonicalContact} from './resident-access.js';
export const maintenanceStaffScope=(a:string)=>`(${a}.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=${a}.organization_id AND pa.property_id=${a}.property_id AND pa.membership_id=$3)) AND EXISTS(SELECT 1 FROM resident_relationships rr ${residentCanonicalJoin} WHERE rr.id=${a}.resident_relationship_id AND rr.organization_id=${a}.organization_id AND rr.property_id=${a}.property_id AND rr.contact_id=${a}.contact_id AND rr.unit_id IS NOT DISTINCT FROM ${a}.unit_id AND ${residentCanonicalContact}) AND NOT EXISTS(SELECT 1 FROM resident_relationships rr JOIN lead_property_interests li ON li.organization_id=rr.organization_id AND li.lead_id=rr.lead_id WHERE rr.id=${a}.resident_relationship_id AND rr.organization_id=${a}.organization_id AND $2<>'organization_admin' AND NOT EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=li.organization_id AND pa.property_id=li.property_id AND pa.membership_id=$3)))`;
export async function staffMaintenanceRecordAccess(c:PoolClient,u:AuthUser,id:string,options:{lock?:boolean;manage?:boolean}={}):Promise<{actor:AuthUser;request:QueryResultRow}>{
 const m=(await c.query("SELECT m.role,ARRAY(SELECT rp.permission FROM role_permissions rp WHERE rp.role_key=m.role) AS permissions FROM organization_memberships m JOIN users us ON us.id=m.user_id AND us.active AND us.account_kind='staff' WHERE m.id=$1 AND m.organization_id=$2 AND m.user_id=$3 AND m.active AND m.account_kind='staff' FOR SHARE OF m,us",[u.membershipId,u.organization.id,u.id])).rows[0];
 if(!m||!m.permissions.includes('leasing.manage')||options.manage&&!['organization_admin','property_manager'].includes(m.role))throw new ApiError(403,'MAINTENANCE_ACCESS_DENIED','Current authorized property staff are required; assignment and status changes require an administrator or property manager.');
 const actor={...u,permissions:m.permissions,organization:{...u.organization,role:m.role}} as AuthUser;
 const r=(await c.query("SELECT mr.*,rr.lead_id,rr.application_id,rr.lease_id FROM maintenance_requests mr JOIN resident_relationships rr ON rr.id=mr.resident_relationship_id AND rr.organization_id=mr.organization_id "+residentCanonicalJoin+" WHERE "+maintenanceStaffScope('mr')+" AND mr.id=$4 AND mr.property_id=rr.property_id AND mr.contact_id=rr.contact_id AND mr.unit_id IS NOT DISTINCT FROM rr.unit_id AND "+residentCanonicalContact+(options.lock?' FOR UPDATE OF mr FOR SHARE OF rr,ls,app,co':' FOR SHARE OF mr,rr,ls,app,co'),[actor.organization.id,actor.organization.role,actor.membershipId,id])).rows[0];
 if(!r)throw new ApiError(404,'MAINTENANCE_NOT_FOUND','This request is unavailable or outside your current property access.');
 if(actor.organization.role!=='organization_admin'){
  const ids=[...new Set([r.property_id,...(await c.query('SELECT property_id FROM lead_property_interests WHERE organization_id=$1 AND lead_id=$2 ORDER BY property_id FOR SHARE',[actor.organization.id,r.lead_id])).rows.map(v=>v.property_id)])].sort();
  if((await c.query('SELECT property_id FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=ANY($3::uuid[]) FOR SHARE',[actor.organization.id,actor.membershipId,ids])).rowCount!==ids.length)throw new ApiError(404,'MAINTENANCE_NOT_FOUND','This request is unavailable or outside your current property access.');
 }
 return{actor,request:r};
}
export async function staffMaintenanceAccess(c:PoolClient,config:ServerConfig,u:AuthUser,digest:string,id:string,options:{lock?:boolean;manage?:boolean}={}):Promise<{actor:AuthUser;request:QueryResultRow}>{
 const actor=await staffOrganizationAccess(c,config,u,digest,{permission:'leasing.manage'});return staffMaintenanceRecordAccess(c,actor,id,options);
}
