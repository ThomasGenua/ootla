import type { PoolClient, QueryResultRow } from 'pg';
import type { AuthUser, OrganizationRole, Permission } from '../../shared/contracts.js';
import type { ServerConfig } from '../config/env.js';
import { ApiError } from '../http/errors.js';
import type { ApplicantPrincipal } from './applicant-portal.js';
import { isIsolatedDemo } from './demo-environment.js';
export type ApplicationRow = QueryResultRow & {id:string;organization_id:string;property_id:string;contact_id:string;lead_id:string|null;status:string};
const unavailable=():never=>{throw new ApiError(404,'APPLICATION_NOT_FOUND','This application is unavailable or outside your authorized access.');};
export const applicationReviewerRoles=['organization_admin','property_manager'] as const;
export function isApplicationReviewer(role:string):boolean{return (applicationReviewerRoles as readonly string[]).includes(role);}
async function environment(c:PoolClient,config:ServerConfig,row:QueryResultRow):Promise<void>{
 const isolated=config.demoMode&&await isIsolatedDemo(config,c);
 if(config.demoMode&&!isolated||row.environment==='demo'&&!isolated||row.is_demo&&row.environment!=='demo')throw new ApiError(403,'ENVIRONMENT_ACCESS_DENIED','Use an authorized account in its configured application environment.');
}
export async function staffOrganizationAccess(c:PoolClient,config:ServerConfig,user:AuthUser,digest:string,options:{permission?:Permission;review?:boolean}={}):Promise<AuthUser>{
 const r=(await c.query("SELECT m.role,u.is_demo,o.environment,ARRAY(SELECT rp.permission FROM role_permissions rp WHERE rp.role_key=m.role ORDER BY rp.permission) AS permissions FROM sessions s JOIN users u ON u.id=s.user_id AND u.active AND u.account_kind='staff' JOIN organizations o ON o.id=s.organization_id JOIN organization_memberships m ON m.user_id=u.id AND m.organization_id=o.id AND m.account_kind='staff' AND m.active WHERE s.token_digest=$1 AND s.user_id=$2 AND s.organization_id=$3 AND m.id=$4 AND s.expires_at>clock_timestamp() FOR SHARE OF s,u,m,o",[digest,user.id,user.organization.id,user.membershipId])).rows[0];
 if(!r)throw new ApiError(401,'AUTH_REQUIRED','Your staff session or membership ended. Sign in again.');
 await environment(c,config,r);
 if(!r.permissions.includes(options.permission??'organization.read')||options.review&&!isApplicationReviewer(r.role))throw new ApiError(403,'APPLICATION_REVIEW_DENIED','This action requires an authorized application review role and assigned property access.');
 const actor:AuthUser={...user,permissions:r.permissions as Permission[],organization:{...user.organization,role:r.role as OrganizationRole}};
 return actor;
}
export async function staffApplicationAccess(c:PoolClient,config:ServerConfig,user:AuthUser,digest:string,applicationId:string,options:{permission?:Permission;review?:boolean;lock?:boolean}={}):Promise<{actor:AuthUser;application:ApplicationRow}>{
 const actor=await staffOrganizationAccess(c,config,user,digest,{...options,permission:options.permission??'leasing.manage'}),r={role:actor.organization.role};
 const a=(await c.query<ApplicationRow>("SELECT a.*,p.name AS property_name,co.display_name AS contact_name FROM applications a JOIN properties p ON p.id=a.property_id AND p.organization_id=a.organization_id JOIN contacts co ON co.id=a.contact_id AND co.organization_id=a.organization_id WHERE a.organization_id=$1 AND a.id=$4 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=a.organization_id AND pa.property_id=a.property_id AND pa.membership_id=$3)) AND NOT EXISTS(SELECT 1 FROM lead_property_interests li WHERE li.organization_id=a.organization_id AND li.lead_id=a.lead_id AND $2<>'organization_admin' AND NOT EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=li.organization_id AND pa.property_id=li.property_id AND pa.membership_id=$3))"+(options.lock?' FOR UPDATE OF a':' FOR SHARE OF a'),[user.organization.id,r.role,user.membershipId,applicationId])).rows[0];
 if(!a)unavailable();
 if(actor.organization.role!=='organization_admin'){
  const interests=(await c.query('SELECT property_id FROM lead_property_interests WHERE organization_id=$1 AND lead_id=$2 ORDER BY property_id FOR SHARE',[a.organization_id,a.lead_id])).rows.map(v=>v.property_id);
  const ids=[...new Set([a.property_id,...interests])].sort();
  if((await c.query('SELECT property_id FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=ANY($3::uuid[]) FOR SHARE',[a.organization_id,user.membershipId,ids])).rowCount!==ids.length)unavailable();
 }
 return{actor,application:a};
}
export async function applicantApplicationAccess(c:PoolClient,config:ServerConfig,user:ApplicantPrincipal,id:string):Promise<{application:ApplicationRow;participant:QueryResultRow}>{
 const r=(await c.query("SELECT u.is_demo,o.environment FROM applicant_sessions s JOIN users u ON u.id=s.user_id AND u.active AND u.account_kind='applicant' JOIN organizations o ON o.id=s.organization_id WHERE s.token_digest=$1 AND s.user_id=$2 AND s.organization_id=$3 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() FOR SHARE OF s,u,o",[user.sessionDigest,user.id,user.organization.id])).rows[0];
 if(!r)throw new ApiError(401,'APPLICANT_AUTH_REQUIRED','Your applicant session ended. Sign in again.');
 await environment(c,config,r);
 const a=(await c.query<ApplicationRow>('SELECT a.* FROM applications a WHERE a.id=$1 AND a.organization_id=$2 AND a.portal_enabled FOR UPDATE',[id,user.organization.id])).rows[0];
 if(!a)unavailable();
 const p=(await c.query("SELECT ap.* FROM application_participants ap WHERE ap.application_id=$1 AND ap.organization_id=$2 AND ap.user_id=$3 AND ap.active AND ap.property_id=$4 AND (ap.role='primary' AND ap.contact_id=$5 OR ap.role='co_applicant' AND $6) AND EXISTS(SELECT 1 FROM contact_property_links cp WHERE cp.contact_id=ap.contact_id AND cp.organization_id=ap.organization_id AND cp.property_id=ap.property_id) FOR SHARE",[a.id,a.organization_id,user.id,a.property_id,a.contact_id,a.co_applicants_enabled])).rows[0];
 if(!p)unavailable();
 return{application:a,participant:p};
}
