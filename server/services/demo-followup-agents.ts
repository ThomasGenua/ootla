import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import {hashPassword}from'./passwords.js';
import {requireIsolatedDemo}from'./demo-environment.js';
import {ApiError}from'../http/errors.js';
export const followupDemoAgents=[
 {name:'Amara Okafor',email:'amara.okafor@demo.ootla.test'},
 {name:'Lucas Bennett',email:'lucas.bennett@demo.ootla.test'},
 {name:'Elena Rivera',email:'elena.rivera@demo.ootla.test'},
]as const;
/** Deliberate additive preparation. Never imported by startup and never reassigns existing work. */
export async function prepareFollowupAgents(db:Database,config:ServerConfig){
 await db.requireReady();return db.transaction(async c=>{
  await requireIsolatedDemo(config,c);if(config.outboundMode!=='simulation'||config.integrationsMode!=='simulation')throw new ApiError(403,'DEMO_SIMULATION_REQUIRED','Isolated simulated integrations are required.');
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended('ootla:followup-agents:v1',0))");
  const org=(await c.query("SELECT id FROM organizations WHERE slug='ootla-demo' AND environment='demo' FOR SHARE")).rows[0];
  if(!org)throw new ApiError(409,'DEMO_REQUIRED','Prepare the existing isolated demo first.');
  let added=0,grants=0;const agents=[];
  for(const a of followupDemoAgents){
   let user=(await c.query('SELECT id,is_demo,account_kind,active FROM users WHERE email=$1 FOR UPDATE',[a.email])).rows[0];
   if(user&&!user.active)throw new ApiError(409,'DEMO_STAFF_CHANGED','An existing prepared agent was disabled; preserve that staff decision.');
   if(user&&(!user.is_demo||user.account_kind!=='staff'||(await c.query('SELECT 1 FROM organization_memberships WHERE user_id=$1 AND organization_id<>$2',[user.id,org.id])).rowCount))throw new ApiError(409,'DEMO_IDENTITY_CONFLICT','An agent address conflicts with an unrelated account.');
   if(!user){user=(await c.query("INSERT INTO users(email,display_name,password_hash,is_demo,account_kind)VALUES($1,$2,$3,true,'staff')RETURNING id",[a.email,a.name,await hashPassword(config.demoAdminPassword)])).rows[0];added++;}
   let member=(await c.query('SELECT id,role,active FROM organization_memberships WHERE organization_id=$1 AND user_id=$2',[org.id,user.id])).rows[0];
   if(!member){member=(await c.query("INSERT INTO organization_memberships(organization_id,user_id,role,account_kind)VALUES($1,$2,'leasing_agent','staff')RETURNING id,role,active",[org.id,user.id])).rows[0];}
   if(member.role!=='leasing_agent'||!member.active)throw new ApiError(409,'DEMO_STAFF_CHANGED','An existing prepared agent was changed; preserve that staff decision.');
   grants+=(await c.query('INSERT INTO property_access_assignments(organization_id,membership_id,property_id)SELECT organization_id,$2,id FROM properties WHERE organization_id=$1 ON CONFLICT DO NOTHING',[org.id,member.id])).rowCount??0;
   await c.query("INSERT INTO viewing_staff_availability(organization_id,property_id,membership_id,enabled,windows) SELECT s.organization_id,s.property_id,$2,true,'[{\"weekday\":1,\"start\":\"09:00\",\"end\":\"17:00\"},{\"weekday\":2,\"start\":\"09:00\",\"end\":\"17:00\"},{\"weekday\":3,\"start\":\"09:00\",\"end\":\"17:00\"},{\"weekday\":4,\"start\":\"09:00\",\"end\":\"17:00\"},{\"weekday\":5,\"start\":\"09:00\",\"end\":\"17:00\"}]'::jsonb FROM property_viewing_settings s WHERE s.organization_id=$1 ON CONFLICT DO NOTHING",[org.id,member.id]);
   agents.push({...a,membershipId:member.id});
  }
  if(added||grants)await c.query("INSERT INTO audit_events(organization_id,action,metadata)VALUES($1,'demo.followup_agents_prepared',$2)",[org.id,JSON.stringify({added,grants})]);
  return{added,grants,agents};
 });
}
