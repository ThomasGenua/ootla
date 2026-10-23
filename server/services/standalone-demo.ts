import type { ServerConfig } from '../config/env.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { requireIsolatedDemo, isIsolatedDemo } from './demo-environment.js';
import { hashPassword, verifyPassword } from './passwords.js';
export const standaloneDemoEmail='standalone@demo.ootla.test';
const slug='ootla-standalone-demo';
/** Deliberate isolated-demo setup only. Never called at application startup. */
export async function seedStandaloneDemo(database:Database,config:ServerConfig){
 await database.requireReady();
 return database.transaction(async client=>{
  await client.query('SELECT pg_advisory_xact_lock($1)',[6856210]);
  await requireIsolatedDemo(config,client);
  let organization=(await client.query<{id:string;environment:string}>('SELECT id,environment FROM organizations WHERE slug=$1 FOR UPDATE',[slug])).rows[0];
  if(organization&&organization.environment!=='demo')throw new ApiError(409,'DEMO_SEED_CONFLICT','The standalone demo identity is already in use. No records changed.');
  let user=(await client.query<{id:string;is_demo:boolean;account_kind:string}>('SELECT id,is_demo,account_kind FROM users WHERE email=$1 FOR UPDATE',[standaloneDemoEmail])).rows[0];
  if(user){const membership=organization?(await client.query('SELECT id FROM organization_memberships WHERE organization_id=$1 AND user_id=$2',[organization.id,user.id])).rowCount:0;if(!user.is_demo||user.account_kind!=='staff'||!membership)throw new ApiError(409,'DEMO_SEED_CONFLICT','The standalone demo email belongs to another identity. No records changed.');}
  let changedRecords=0;
  if(!organization){organization=(await client.query<{id:string;environment:string}>("INSERT INTO organizations(name,slug,environment) VALUES('Ootla Standalone Demo',$1,'demo') RETURNING id,environment",[slug])).rows[0]!;changedRecords++;}
  const settings=(await client.query<{mode:string}>('SELECT mode FROM organization_data_settings WHERE organization_id=$1 FOR UPDATE',[organization.id])).rows[0];
  if(settings&&settings.mode!=='standalone')throw new ApiError(409,'DEMO_SEED_CONFLICT','Existing organization source settings are preserved.');
  if(!settings){await client.query("INSERT INTO organization_data_settings(organization_id,mode) VALUES($1,'standalone')",[organization.id]);changedRecords++;}
  if(!user){user=(await client.query<{id:string;is_demo:boolean;account_kind:string}>("INSERT INTO users(email,display_name,password_hash,is_demo) VALUES($1,'Standalone Demo Administrator',$2,true) RETURNING id,is_demo,account_kind",[standaloneDemoEmail,await hashPassword(config.demoAdminPassword)])).rows[0]!;await client.query("INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,'organization_admin')",[organization.id,user.id]);changedRecords++;}
  if(changedRecords)await client.query('INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,$3,$4)',[organization.id,user.id,'demo.standalone.seed',JSON.stringify({changedRecords,records:'empty standalone onboarding',outboundMode:'simulation'})]);
  return {organizationId:organization.id,userId:user.id,changedRecords};
 });
}
export async function preparedStandaloneDemo(config:ServerConfig,database:Database):Promise<boolean>{
 if(!await isIsolatedDemo(config,database))return false;
 const record=(await database.query<{password_hash:string}>("SELECT u.password_hash FROM users u JOIN organization_memberships m ON m.user_id=u.id AND m.active AND m.role='organization_admin' AND m.account_kind='staff' JOIN organizations o ON o.id=m.organization_id AND o.environment='demo' AND o.slug=$2 JOIN organization_data_settings ds ON ds.organization_id=o.id AND ds.mode='standalone' WHERE u.email=$1 AND u.active AND u.is_demo AND u.account_kind='staff'",[standaloneDemoEmail,slug])).rows[0];
 return Boolean(record&&await verifyPassword(record.password_hash,config.demoAdminPassword));
}
