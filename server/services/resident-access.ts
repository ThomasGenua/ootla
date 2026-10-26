import type {PoolClient,QueryResultRow} from 'pg';
import type {ResidentUser} from '../../shared/resident-contracts.js';
import type {ServerConfig} from '../config/env.js';
import {ApiError} from '../http/errors.js';
import {isIsolatedDemo} from './demo-environment.js';
export interface ResidentPrincipal extends ResidentUser{sessionDigest:string}
export const residentCanonicalJoin="JOIN leases ls ON ls.id=rr.lease_id AND ls.organization_id=rr.organization_id AND ls.property_id=rr.property_id AND ls.unit_id IS NOT DISTINCT FROM rr.unit_id AND ls.application_id=rr.application_id AND ls.lead_id IS NOT DISTINCT FROM rr.lead_id JOIN applications app ON app.id=rr.application_id AND app.organization_id=rr.organization_id AND app.property_id=rr.property_id JOIN contacts co ON co.id=rr.contact_id AND co.organization_id=rr.organization_id JOIN contact_property_links cp ON cp.organization_id=rr.organization_id AND cp.contact_id=rr.contact_id AND cp.property_id=rr.property_id";
export const residentCanonicalContact="(ls.contact_id=rr.contact_id OR EXISTS(SELECT 1 FROM application_participants ap WHERE ap.organization_id=rr.organization_id AND ap.application_id=rr.application_id AND ap.property_id=rr.property_id AND ap.contact_id=rr.contact_id AND ap.active))";
export async function residentSessionAccess(c:PoolClient,config:ServerConfig,u:ResidentPrincipal):Promise<void>{
 const r=(await c.query("SELECT us.is_demo,o.environment FROM resident_sessions s JOIN users us ON us.id=s.user_id AND us.account_kind=s.account_kind AND us.active JOIN organizations o ON o.id=s.organization_id WHERE s.token_digest=$1 AND s.user_id=$2 AND s.organization_id=$3 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() FOR SHARE OF s,us,o",[u.sessionDigest,u.id,u.organization.id])).rows[0];
 if(!r)throw new ApiError(401,'RESIDENT_AUTH_REQUIRED','Your resident session ended. Sign in again.');
 const isolated=config.demoMode&&await isIsolatedDemo(config,c);
 if(config.demoMode&&!isolated||(r.is_demo||r.environment==='demo')&&!isolated||r.is_demo&&r.environment!=='demo')throw new ApiError(403,'RESIDENT_ENVIRONMENT_DENIED','Use the resident account in its configured environment.');
}
export async function residentRelationshipAccess(c:PoolClient,config:ServerConfig,u:ResidentPrincipal,id:string):Promise<QueryResultRow>{
 await residentSessionAccess(c,config,u);
 const r=(await c.query("SELECT rr.*,ls.status AS lease_status,to_char(ls.starts_on,'YYYY-MM-DD') AS starts_on,to_char(ls.ends_on,'YYYY-MM-DD') AS ends_on,co.display_name AS contact_name,p.name AS property_name,un.label AS unit_label,COALESCE(pvs.time_zone,'UTC') AS time_zone,ms.emergency_instructions,ms.enabled AS maintenance_enabled,ms.default_due_hours,ms.emergency_staff_membership_id FROM resident_access_grants g JOIN resident_relationships rr ON rr.id=g.relationship_id AND rr.organization_id=g.organization_id "+residentCanonicalJoin+" JOIN properties p ON p.id=rr.property_id AND p.organization_id=rr.organization_id LEFT JOIN units un ON un.id=rr.unit_id AND un.organization_id=rr.organization_id AND un.property_id=rr.property_id LEFT JOIN property_viewing_settings pvs ON pvs.property_id=rr.property_id AND pvs.organization_id=rr.organization_id LEFT JOIN property_maintenance_settings ms ON ms.property_id=rr.property_id AND ms.organization_id=rr.organization_id WHERE g.organization_id=$1 AND g.user_id=$2 AND g.active AND g.revoked_at IS NULL AND rr.id=$3 AND rr.status IN('active','pending_move_in') AND ls.status='active' AND "+residentCanonicalContact+" FOR SHARE OF g,rr,ls,app,co,p",[u.organization.id,u.id,id])).rows[0];
 if(!r)throw new ApiError(404,'RESIDENT_RECORD_UNAVAILABLE','This resident record is unavailable or outside your explicit access.');
 return r;
}
