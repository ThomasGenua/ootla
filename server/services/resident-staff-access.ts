import type {PoolClient,QueryResultRow} from 'pg';
import type {AuthUser} from '../../shared/contracts.js';
import type {ServerConfig} from '../config/env.js';
import {staffOrganizationAccess} from './application-access.js';
import {residentCanonicalJoin,residentCanonicalContact} from './resident-access.js';
import {ApiError} from '../http/errors.js';
export async function staffResidentRelationshipAccess(c:PoolClient,config:ServerConfig,u:AuthUser,digest:string,id:string,manage=true):Promise<{actor:AuthUser;relationship:QueryResultRow}>{
 const a=await staffOrganizationAccess(c,config,u,digest,{permission:'leasing.manage'});
 if(manage&&!['organization_admin','property_manager'].includes(a.organization.role))throw new ApiError(403,'RESIDENT_MANAGEMENT_DENIED','An authorized organization administrator or property manager must manage resident access and approved terms.');
 const rr=(await c.query('SELECT rr.*,ls.status AS lease_status,ls.source_system AS lease_source_system FROM resident_relationships rr '+residentCanonicalJoin+" WHERE rr.id=$4 AND rr.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=rr.organization_id AND pa.property_id=rr.property_id AND pa.membership_id=$3)) AND NOT EXISTS(SELECT 1 FROM lead_property_interests li WHERE li.organization_id=rr.organization_id AND li.lead_id=rr.lead_id AND $2<>'organization_admin' AND NOT EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=li.organization_id AND pa.property_id=li.property_id AND pa.membership_id=$3)) AND "+residentCanonicalContact+' FOR SHARE OF rr,ls,app,co',[a.organization.id,a.organization.role,a.membershipId,id])).rows[0];
 if(!rr)throw new ApiError(404,'RESIDENT_RECORD_UNAVAILABLE','This canonical resident relationship is unavailable within your current assigned property access.');
 if(a.organization.role!=='organization_admin'){const ids=[...new Set([rr.property_id,...(await c.query('SELECT property_id FROM lead_property_interests WHERE organization_id=$1 AND lead_id=$2 FOR SHARE',[a.organization.id,rr.lead_id])).rows.map(r=>r.property_id)])];if((await c.query('SELECT property_id FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=ANY($3::uuid[]) FOR SHARE',[a.organization.id,a.membershipId,ids])).rowCount!==ids.length)throw new ApiError(404,'RESIDENT_RECORD_UNAVAILABLE','Your current property access changed.');}
 return{actor:a,relationship:rr};
}
