import {createHash} from 'node:crypto';
import type {PoolClient,QueryResultRow} from 'pg';
import type {AuthUser,OrganizationRole,Permission} from '../../shared/contracts.js';
import type {ServerConfig} from '../config/env.js';
import {requireIsolatedDemo} from './demo-environment.js';
import {ApiError} from '../http/errors.js';
export const automationHash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const automationIso=(v:unknown)=>(v instanceof Date?v:new Date(String(v))).toISOString();
export async function automationActor(c:PoolClient,config:ServerConfig,rule:QueryResultRow):Promise<AuthUser|null>{
 const r=(await c.query("SELECT u.id,u.email,u.display_name,u.is_demo,m.id AS membership_id,m.role,o.name AS organization_name,o.environment,ARRAY(SELECT permission FROM role_permissions WHERE role_key=m.role) AS permissions FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' JOIN organizations o ON o.id=m.organization_id WHERE m.id=$1 AND m.user_id=$2 AND m.organization_id=$3 AND m.active AND m.account_kind='staff' AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission='leasing.manage') AND ($4::uuid IS NOT NULL OR m.role='organization_admin') AND ($4::uuid IS NULL OR m.role='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=m.organization_id AND pa.property_id=$4 AND pa.membership_id=m.id)) FOR SHARE OF m,u,o",[rule.created_by_membership_id,rule.created_by_user_id,rule.organization_id,rule.property_id])).rows[0];
 if(!r)return null;if(config.demoMode)await requireIsolatedDemo(config,c);else if(r.is_demo||r.environment==='demo')return null;
 return{id:r.id,email:r.email,name:r.display_name,membershipId:r.membership_id,sessionExpiresAt:new Date(Date.now()+60000).toISOString(),permissions:r.permissions as Permission[],organization:{id:rule.organization_id,name:r.organization_name,role:r.role as OrganizationRole}};
}
export async function automationProperty(c:PoolClient,u:AuthUser,id:string):Promise<void>{
 if(!(await c.query("SELECT p.id FROM properties p WHERE p.organization_id=$1 AND p.id=$4 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=p.organization_id AND pa.property_id=p.id AND pa.membership_id=$3)) FOR SHARE OF p",[u.organization.id,u.organization.role,u.membershipId,id])).rowCount)throw new ApiError(404,'AUTOMATION_PROPERTY_DENIED','This automation property is outside your current assignment.');
}
export async function automationEvent(c:PoolClient,rule:QueryResultRow,job:QueryResultRow|null,kind:string,reason:string,actorId:string|null=null):Promise<void>{
 await c.query('INSERT INTO automation_events(organization_id,rule_id,job_id,kind,reason,actor_user_id) VALUES($1,$2,$3,$4,$5,$6)',[rule.organization_id,rule.id,job?.id??null,kind,reason,actorId]);
}
export async function automationKnowledgeValid(c:PoolClient,rule:QueryResultRow):Promise<boolean>{
 if(!rule.knowledge_id)return true;return Boolean((await c.query("SELECT id FROM ai_knowledge WHERE id=$1 AND organization_id=$2 AND status='approved' AND ($3::uuid IS NULL OR property_id=$3) AND ($4<>'website' OR public_enabled) AND ($5::integer IS NULL OR version=$5) FOR SHARE",[rule.knowledge_id,rule.organization_id,rule.property_id,rule.channel,rule.knowledge_version??null])).rowCount);
}
export function validateAutomationTemplate(value:string):void{
 if(/\{(?!property\}|portal\}|next_step\})[^}]*\}/.test(value)||/\b(?:password|screening report|passport|social security|ssn|credit card|approve[d]? applicant|payment authorized)\b/i.test(value))throw new ApiError(400,'AUTOMATION_TEMPLATE_POLICY','Use only approved plain wording and {property}, {portal}, {next_step}; private documents, decisions and payment authorizations are unavailable.');
}
