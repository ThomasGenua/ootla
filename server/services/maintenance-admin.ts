import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient,QueryResultRow} from 'pg';
import type {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import type {MaintenanceOptions,maintenanceOptionsSchema,maintenanceSettingsSchema,residentInvitationSchema,residentRenewalSchema} from '../../shared/resident-contracts.js';
import type {Database} from '../db/pool.js';
import type {ServerConfig} from '../config/env.js';
import {ApiError} from '../http/errors.js';
import {staffOrganizationAccess} from './application-access.js';
import {staffResidentRelationshipAccess} from './resident-staff-access.js';
import {residentCanonicalJoin,residentCanonicalContact} from './resident-access.js';
import {residentDigest,residentInvitationToken} from './resident-portal.js';
import {renewalOwnership} from './renewal-ownership.js';
export const maintenanceHash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const like=(s:string)=>s?'%'+s.replace(/[\\%_]/g,c=>'\\'+c)+'%':'';
export class MaintenanceAdministration{
 constructor(protected db:Database,protected config:ServerConfig){}
 protected async lock(c:PoolClient,org:string):Promise<void>{await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ootla.maintenance:'+org]);}
 protected async receipt<T>(c:PoolClient,org:string,actorId:string,key:string,operation:string,payload:unknown,run:()=>Promise<T>):Promise<T>{
  const hash=maintenanceHash(payload),prior=(await c.query('SELECT * FROM maintenance_action_receipts WHERE organization_id=$1 AND actor_user_id=$2 AND request_key=$3',[org,actorId,key])).rows[0];
  if(prior){if(prior.operation!==operation||prior.payload_hash!==hash)throw new ApiError(409,'MAINTENANCE_REQUEST_CONFLICT','Use a new request identifier for changed information.');return prior.result as T;}
  const result=await run();await c.query('INSERT INTO maintenance_action_receipts(organization_id,actor_user_id,request_key,operation,payload_hash,result) VALUES($1,$2,$3,$4,$5,$6)',[org,actorId,key,operation,hash,JSON.stringify(result)]);return result;
 }
 protected async property(c:PoolClient,a:AuthUser,id:string,manage=false):Promise<void>{
  if(manage&&!['organization_admin','property_manager'].includes(a.organization.role))throw new ApiError(403,'MAINTENANCE_MANAGEMENT_DENIED','An authorized organization administrator or property manager must manage maintenance configuration.');
  if(!(await c.query("SELECT p.id FROM properties p WHERE p.organization_id=$1 AND p.id=$4 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=p.organization_id AND pa.property_id=p.id AND pa.membership_id=$3)) FOR SHARE OF p",[a.organization.id,a.organization.role,a.membershipId,id])).rowCount)throw new ApiError(404,'PROPERTY_ACCESS_DENIED','Choose a property within your current assigned access.');
  if(a.organization.role!=='organization_admin'&&!(await c.query('SELECT property_id FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=$3 FOR SHARE',[a.organization.id,a.membershipId,id])).rowCount)throw new ApiError(404,'PROPERTY_ACCESS_DENIED','Your current property access changed.');
 }
 protected async owner(c:PoolClient,a:AuthUser,id:string,propertyId:string,leadId:string|null):Promise<void>{
  const row=(await c.query("SELECT m.role FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' WHERE m.id=$1 AND m.organization_id=$2 AND m.active AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission='leasing.manage') FOR SHARE OF m,u",[id,a.organization.id])).rows[0];
  if(!row)throw new ApiError(400,'MAINTENANCE_OWNER_UNAVAILABLE','Choose current authorized staff for this property.');
  if(row.role!=='organization_admin'){const ids=[...new Set([propertyId,...(await c.query('SELECT property_id FROM lead_property_interests WHERE organization_id=$1 AND lead_id=$2 FOR SHARE',[a.organization.id,leadId])).rows.map(r=>r.property_id)])];if((await c.query('SELECT property_id FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=ANY($3::uuid[]) FOR SHARE',[a.organization.id,id,ids])).rowCount!==ids.length)throw new ApiError(400,'MAINTENANCE_OWNER_UNAVAILABLE','The assigned staff member must have access to every related property.');}
 }
 protected async audit(c:PoolClient,a:AuthUser,action:string,metadata:Record<string,unknown>):Promise<void>{await c.query('INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,$3,$4)',[a.organization.id,a.id,'maintenance.'+action,JSON.stringify(metadata)]);}
 async options(u:AuthUser,digest:string,q:z.infer<typeof maintenanceOptionsSchema>):Promise<MaintenanceOptions>{return this.db.transaction(async c=>{
  const a=await staffOrganizationAccess(c,this.config,u,digest,{permission:'leasing.manage'});if(q.propertyId)await this.property(c,a,q.propertyId);
  const base=[a.organization.id,a.organization.role,a.membershipId,q.propertyId??null,like(q.q)],scope="p.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=p.organization_id AND pa.property_id=p.id AND pa.membership_id=$3)) AND ($4::uuid IS NULL OR p.id=$4)";
  const paged=async(sql:string)=>{const total=Number((await c.query('SELECT count(*) AS total FROM ('+sql+') z WHERE ($5::text=\'\' OR label ILIKE $5)',base)).rows[0].total),rows=(await c.query('SELECT * FROM ('+sql+') z WHERE ($5::text=\'\' OR label ILIKE $5) ORDER BY label,id LIMIT $6 OFFSET $7',[...base,q.pageSize,(q.page-1)*q.pageSize])).rows;return{items:rows,total,page:q.page,pageSize:q.pageSize,totalPages:Math.ceil(total/q.pageSize)};};
  const properties=await paged('SELECT p.id,p.name AS label FROM properties p WHERE '+scope);
  const owners=await paged("SELECT m.id,u.display_name AS label FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' WHERE m.organization_id=$1 AND m.active AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission='leasing.manage') AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM properties p WHERE "+scope+")) AND ($4::uuid IS NULL OR m.role='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=m.organization_id AND pa.membership_id=m.id AND pa.property_id=$4))");
  const relationships=await paged('SELECT rr.id,co.display_name||\' ? \'||p.name AS label,rr.property_id FROM resident_relationships rr '+residentCanonicalJoin+' JOIN properties p ON p.id=rr.property_id AND p.organization_id=rr.organization_id WHERE '+scope+" AND ls.status='active' AND "+residentCanonicalContact+" AND NOT EXISTS(SELECT 1 FROM lead_property_interests li WHERE li.organization_id=rr.organization_id AND li.lead_id=rr.lead_id AND $2<>'organization_admin' AND NOT EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=li.organization_id AND pa.property_id=li.property_id AND pa.membership_id=$3))");
  const setting=q.propertyId?(await c.query('SELECT * FROM property_maintenance_settings WHERE organization_id=$1 AND property_id=$2',[a.organization.id,q.propertyId])).rows[0]:null;
  return{properties:{...properties,items:properties.items.map(r=>({id:r.id,name:r.label}))},owners:{...owners,items:owners.items.map(r=>({membershipId:r.id,name:r.label}))},relationships:{...relationships,items:relationships.items.map(r=>({id:r.id,label:r.label,propertyId:r.property_id}))},settings:setting?{propertyId:setting.property_id,enabled:setting.enabled,emergencyInstructions:setting.emergency_instructions,emergencyStaffMembershipId:setting.emergency_staff_membership_id,defaultDueHours:setting.default_due_hours}:null,canManage:['organization_admin','property_manager'].includes(a.organization.role)};
 });}
 async settings(u:AuthUser,digest:string,i:z.infer<typeof maintenanceSettingsSchema>):Promise<{propertyId:string}>{return this.db.transaction(async c=>{
  await this.lock(c,u.organization.id);const a=await staffOrganizationAccess(c,this.config,u,digest,{permission:'leasing.manage'});await this.property(c,a,i.propertyId,true);if(i.emergencyStaffMembershipId)await this.owner(c,a,i.emergencyStaffMembershipId,i.propertyId,null);
  await this.receipt(c,a.organization.id,a.id,i.requestKey,'settings',i,async()=>{await c.query('INSERT INTO property_maintenance_settings(organization_id,property_id,enabled,emergency_instructions,emergency_staff_membership_id,default_due_hours,configured_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(organization_id,property_id) DO UPDATE SET enabled=EXCLUDED.enabled,emergency_instructions=EXCLUDED.emergency_instructions,emergency_staff_membership_id=EXCLUDED.emergency_staff_membership_id,default_due_hours=EXCLUDED.default_due_hours,configured_by_user_id=EXCLUDED.configured_by_user_id,updated_at=clock_timestamp()',[a.organization.id,i.propertyId,i.enabled,i.emergencyInstructions,i.emergencyStaffMembershipId,i.defaultDueHours,a.id]);await this.audit(c,a,'settings',{propertyId:i.propertyId});return{propertyId:i.propertyId};});return{propertyId:i.propertyId};
 });}
 async invitation(u:AuthUser,digest:string,i:z.infer<typeof residentInvitationSchema>):Promise<{url:string;expiresAt:string;mode:'simulation'}>{return this.db.transaction(async c=>{
  await this.lock(c,u.organization.id);const{actor:a,relationship:rr}=await staffResidentRelationshipAccess(c,this.config,u,digest,i.relationshipId);
  if(rr.lease_status!=='active')throw new ApiError(409,'RESIDENT_LEASE_NOT_ACTIVE','Resident invitations require the canonical active lease.');
  const saved=await this.receipt(c,a.organization.id,a.id,i.requestKey,'resident_invitation',i,async()=>{
   const id=randomUUID(),raw=residentInvitationToken(this.config,id,i.requestKey),expires=new Date(Date.now()+i.expiresHours*3600000).toISOString();
   await c.query('INSERT INTO resident_invitations(id,organization_id,relationship_id,email,token_digest,created_by_user_id,created_by_membership_id,expires_at,request_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,a.organization.id,i.relationshipId,i.email,residentDigest(this.config,raw,'invitation'),a.id,a.membershipId,expires,i.requestKey]);await this.audit(c,a,'resident_invitation',{relationshipId:i.relationshipId});return{id,expiresAt:expires};
  });
  const raw=residentInvitationToken(this.config,saved.id,i.requestKey);return{url:this.config.appUrl+'/resident/invite#token='+raw,expiresAt:saved.expiresAt,mode:'simulation'};
 });}
 async renewal(u:AuthUser,digest:string,i:z.infer<typeof residentRenewalSchema>):Promise<{relationshipId:string}>{return this.db.transaction(async c=>{
  await this.lock(c,u.organization.id);const{actor:a,relationship:rr}=await staffResidentRelationshipAccess(c,this.config,u,digest,i.relationshipId);
  if(rr.lease_status!=='active')throw new ApiError(409,'RESIDENT_LEASE_NOT_ACTIVE','Approved renewal information requires the canonical active lease.');
  const ownership=await renewalOwnership(c,a.organization.id,rr.lease_id);
  if(i.source==='provider_verified'||ownership.blocked)throw new ApiError(501,'RENEWAL_PROVIDER_UNSUPPORTED',ownership.reason??'Verified provider renewal terms require documented licensed read capability. Staff cannot label their own text as provider verified.');
  if(i.validUntil&&Date.parse(i.validUntil)<=Date.now())throw new ApiError(400,'RENEWAL_EXPIRED','Approved renewal terms must still be valid.');
  await this.receipt(c,a.organization.id,a.id,i.requestKey,'renewal',i,async()=>{await c.query('UPDATE resident_renewal_offers SET active=false WHERE organization_id=$1 AND relationship_id=$2 AND active',[a.organization.id,i.relationshipId]);await c.query('INSERT INTO resident_renewal_offers(organization_id,relationship_id,terms,source,evidence,approved_by_user_id,valid_until) VALUES($1,$2,$3,$4,$5,$6,$7)',[a.organization.id,i.relationshipId,i.terms,'staff_approved',i.evidence,a.id,i.validUntil]);await this.audit(c,a,'renewal_approved',{relationshipId:i.relationshipId});return{relationshipId:i.relationshipId};});return{relationshipId:i.relationshipId};
 });}
 async setGrant(u:AuthUser,digest:string,id:string,active:boolean,relationshipId?:string):Promise<{id:string;active:boolean}>{return this.db.transaction(async c=>{
  await this.lock(c,u.organization.id);const row=(await c.query('SELECT * FROM resident_access_grants WHERE id=$1 AND organization_id=$2 AND ($3::uuid IS NULL OR relationship_id=$3) FOR UPDATE',[id,u.organization.id,relationshipId??null])).rows[0];if(!row)throw new ApiError(404,'RESIDENT_GRANT_UNAVAILABLE','This resident grant is unavailable.');const{actor:a,relationship:rr}=await staffResidentRelationshipAccess(c,this.config,u,digest,row.relationship_id);if(active&&rr.lease_status!=='active')throw new ApiError(409,'RESIDENT_LEASE_NOT_ACTIVE','Reactivating resident access requires the canonical active lease.');
  await c.query('UPDATE resident_access_grants SET active=$2,revoked_at=CASE WHEN $2 THEN NULL ELSE clock_timestamp() END WHERE id=$1',[id,active]);await this.audit(c,a,'resident_grant_changed',{grantId:id,active});return{id,active};
 });}
}
