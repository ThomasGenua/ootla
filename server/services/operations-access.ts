import type { PoolClient } from 'pg';
import type { AuthUser } from '../../shared/contracts.js';
import { ApiError } from '../http/errors.js';
export const scopeArgs = (user: AuthUser): unknown[] => [user.organization.id,user.organization.role,user.membershipId];
export const propertyScope = (alias: string) => `${alias}.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=${alias}.organization_id AND pa.property_id=${alias}.property_id AND pa.membership_id=$3))`;
export const leadScope = (alias: string) => `${propertyScope(alias)} AND ($2='organization_admin' OR NOT EXISTS(SELECT 1 FROM lead_property_interests li WHERE li.organization_id=${alias}.organization_id AND li.lead_id=${alias}.lead_id AND NOT EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=li.organization_id AND pa.property_id=li.property_id AND pa.membership_id=$3)))`;
export const missing = () => new ApiError(404,'RECORD_UNAVAILABLE','This record is unavailable or outside your access.');
export const stale = () => new ApiError(409,'VERSION_CONFLICT','This record changed. Refresh it before saving.');
export function requireAdmin(user: AuthUser) { if(user.organization.role!=='organization_admin')throw new ApiError(403,'ADMIN_REQUIRED','An organization administrator is required.'); }
export async function propertyAccess(c: PoolClient,user: AuthUser,id: string) {
 const row=(await c.query(`SELECT p.* FROM properties p WHERE p.id=$4 AND p.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=p.organization_id AND pa.property_id=p.id AND pa.membership_id=$3)) FOR SHARE OF p`,[...scopeArgs(user),id])).rows[0];if(!row)throw missing();
 if(user.organization.role!=='organization_admin' && !(await c.query('SELECT 1 FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=$3 FOR SHARE',[user.organization.id,user.membershipId,id])).rowCount)throw missing();return row;
}
export async function eligibleOwner(c: PoolClient,org: string,id: string|null,properties: string[]) {
 if(!id)return;
 const row=(await c.query("SELECT m.id,m.role FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' WHERE m.id=$1 AND m.organization_id=$2 AND m.active AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission='leasing.manage') FOR SHARE OF m,u",[id,org])).rows[0];
 if(!row || row.role!=='organization_admin' && (await c.query('SELECT 1 FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=ANY($3::uuid[]) FOR SHARE',[org,id,[...new Set(properties)]])).rowCount!==new Set(properties).size)throw new ApiError(400,'INVALID_OWNER','Choose active staff with access to every related property.');
}
export async function operationEvent(c:PoolClient,org:string,propertyId:string|null,leadId:string|null,actorId:string|null,kind:string,summary:string) {
 await c.query('INSERT INTO operation_events(organization_id,property_id,lead_id,actor_user_id,kind,summary) VALUES($1,$2,$3,$4,$5,$6)',[org,propertyId,leadId,actorId,kind,summary]);
}
