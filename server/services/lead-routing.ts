import type {PoolClient} from 'pg';
import type {AuthUser} from '../../shared/contracts.js';
/** Opt-in organization routing. Explicit staff owner selection remains authoritative. */
export async function routeNewLead(c:PoolClient,a:AuthUser,propertyId:string,interests:string[]):Promise<string|null>{
 if(!(await c.query("SELECT to_regclass('public.lead_routing_rules') IS NOT NULL AS ready")).rows[0]?.ready)return null;
 const r=(await c.query("SELECT team_id FROM lead_routing_rules WHERE organization_id=$1 AND property_id=$2 AND enabled AND strategy='least_open_leads' FOR SHARE",[a.organization.id,propertyId])).rows[0];if(!r)return null;
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ootla.lead-routing:'+a.organization.id+':'+propertyId]);
 const m=(await c.query("SELECT m.id FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' WHERE m.organization_id=$1 AND m.active AND m.account_kind='staff' AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission='leasing.manage') AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM task_team_members tm WHERE tm.organization_id=m.organization_id AND tm.membership_id=m.id AND tm.team_id=$3)) AND (m.role='organization_admin' OR NOT EXISTS(SELECT 1 FROM unnest($2::uuid[]) p WHERE NOT EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=m.organization_id AND pa.membership_id=m.id AND pa.property_id=p))) ORDER BY (SELECT count(*) FROM leads l WHERE l.organization_id=m.organization_id AND l.owner_membership_id=m.id AND l.pipeline_stage NOT IN ('leased','lost_closed','won')),m.id LIMIT 1 FOR SHARE OF m,u",[a.organization.id,interests,r.team_id])).rows[0];return m?.id??null;
}
