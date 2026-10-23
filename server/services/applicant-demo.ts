import type { ServerConfig } from '../config/env.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { isIsolatedDemo, requireIsolatedDemo } from './demo-environment.js';
import { hashPassword, verifyPassword } from './passwords.js';
export const applicantDemoEmail='applicant@demo.ootla.test',applicantDemoPassword='OotlaApplicant!2026',applicantDemoStaffEmail='applications@demo.ootla.test';
const slug='ootla-applicant-demo',prefix='stage15.portal.';
/** Explicit, additive setup only. No startup seeding, password reset or demo bypass. */
export async function seedApplicantDemo(database:Database,config:ServerConfig){
 await database.requireReady();return database.transaction(async c=>{
  await requireIsolatedDemo(config,c);await c.query('SELECT pg_advisory_xact_lock($1)',[6856215]);let changedRecords=0;
  const conflict=(message:string):never=>{throw new ApiError(409,'DEMO_SEED_CONFLICT',message)};
  let org=(await c.query("SELECT id,environment FROM organizations WHERE slug=$1 FOR UPDATE",[slug])).rows[0];
  if(org&&org.environment!=='demo')conflict('The reserved applicant demo identity is already in use.');
  if(!org){org=(await c.query("INSERT INTO organizations(name,slug,environment) VALUES('Ootla Applicant Demo',$1,'demo') RETURNING id",[slug])).rows[0];changedRecords++;}
  const settings=(await c.query('SELECT mode FROM organization_data_settings WHERE organization_id=$1 FOR UPDATE',[org.id])).rows[0];
  if(settings&&settings.mode!=='standalone')conflict('Existing source settings are preserved.');
  if(!settings){await c.query("INSERT INTO organization_data_settings(organization_id,mode) VALUES($1,'standalone')",[org.id]);changedRecords++;}
  let staff=(await c.query('SELECT id,is_demo,account_kind FROM users WHERE email=$1 FOR UPDATE',[applicantDemoStaffEmail])).rows[0];
  if(staff&&(!staff.is_demo||staff.account_kind!=='staff'||!(await c.query("SELECT id FROM organization_memberships WHERE organization_id=$1 AND user_id=$2 AND role='organization_admin' AND active",[org.id,staff.id])).rowCount))conflict('The reserved applicant-demo staff email belongs to another identity.');
  if(!staff){staff=(await c.query("INSERT INTO users(email,display_name,password_hash,account_kind,is_demo) VALUES($1,'Applicant Demo Administrator',$2,'staff',true) RETURNING id",[applicantDemoStaffEmail,await hashPassword(config.demoAdminPassword)])).rows[0];await c.query("INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,'organization_admin')",[org.id,staff.id]);changedRecords++;}
  let applicant=(await c.query('SELECT id,is_demo,account_kind FROM users WHERE email=$1 FOR UPDATE',[applicantDemoEmail])).rows[0];
  if(applicant&&(!applicant.is_demo||applicant.account_kind!=='applicant'||!(await c.query('SELECT id FROM application_participants WHERE organization_id=$1 AND user_id=$2',[org.id,applicant.id])).rowCount))conflict('The reserved applicant demo email belongs to another identity.');
  if(!applicant){applicant=(await c.query("INSERT INTO users(email,display_name,password_hash,account_kind,is_demo) VALUES($1,'Demo Applicant',$2,'applicant',true) RETURNING id",[applicantDemoEmail,await hashPassword(applicantDemoPassword)])).rows[0];changedRecords++;}
  let property=(await c.query('SELECT id FROM properties WHERE organization_id=$1 AND seed_key=$2',[org.id,prefix+'property'])).rows[0];
  if(!property){property=(await c.query("INSERT INTO properties(organization_id,name,address,city,property_type,seed_key,source_system) VALUES($1,'Willow Court - applicant demo','Illustrative property address','Demo city','residential',$2,'demo') RETURNING id",[org.id,prefix+'property'])).rows[0];changedRecords++;}
  let unit=(await c.query('SELECT id FROM units WHERE organization_id=$1 AND seed_key=$2',[org.id,prefix+'unit'])).rows[0];
  if(!unit){unit=(await c.query("INSERT INTO units(organization_id,property_id,label,bedrooms,status,monthly_rent,seed_key,source_system,availability_source) VALUES($1,$2,'1A',2,'available',1800,$3,'demo','demo') RETURNING id",[org.id,property.id,prefix+'unit'])).rows[0];changedRecords++;}
  let lead=(await c.query('SELECT id,contact_id FROM leads WHERE organization_id=$1 AND seed_key=$2',[org.id,prefix+'lead'])).rows[0];
  if(!lead){lead=(await c.query("INSERT INTO leads(organization_id,property_id,unit_id,display_name,email,status,intent,seed_key,pipeline_stage,source,next_action) VALUES($1,$2,$3,'Demo Applicant',$4,'qualified','leasing',$5,'application_started','demo','Complete the private applicant checklist') RETURNING id,contact_id",[org.id,property.id,unit.id,applicantDemoEmail,prefix+'lead'])).rows[0];changedRecords++;}
  let app=(await c.query("SELECT id FROM applications WHERE organization_id=$1 AND lead_id=$2 AND source_system='demo' ORDER BY created_at,id LIMIT 1",[org.id,lead.id])).rows[0];
  if(!app){app=(await c.query("INSERT INTO applications(organization_id,contact_id,property_id,unit_id,lead_id,status,source_system,portal_enabled) VALUES($1,$2,$3,$4,$5,'draft','demo',true) RETURNING id",[org.id,lead.contact_id,property.id,unit.id,lead.id])).rows[0];changedRecords++;}
  let participant=(await c.query("SELECT id,user_id,contact_id FROM application_participants WHERE organization_id=$1 AND application_id=$2 AND role='primary' ORDER BY created_at,id LIMIT 1",[org.id,app.id])).rows[0];
  if(participant&&(participant.user_id!==applicant.id||participant.contact_id!==lead.contact_id))conflict('Existing applicant access is preserved.');
  if(!participant){participant=(await c.query("INSERT INTO application_participants(organization_id,application_id,contact_id,role,invited_email,user_id) VALUES($1,$2,$3,'primary',$4,$5) RETURNING id",[org.id,app.id,lead.contact_id,applicantDemoEmail,applicant.id])).rows[0];changedRecords++;}
  // Preserve staff-edited/disabled checklists; never reopen submitted work.
  if(!Number((await c.query('SELECT count(*)::int AS count FROM application_checklist_items WHERE organization_id=$1 AND application_id=$2',[org.id,app.id])).rows[0].count)){await c.query("INSERT INTO application_checklist_items(organization_id,application_id,label,required,position) VALUES($1,$2,'Identity document - use an invented demo file',true,0),($1,$2,'Supporting document - use an invented demo file',true,1)",[org.id,app.id]);changedRecords+=2;}
  if(changedRecords){await c.query("UPDATE leads SET application_summary_id=$3,application_summary_status=a.status FROM applications a WHERE leads.organization_id=$1 AND leads.id=$2 AND a.id=$3 AND a.organization_id=$1 AND leads.application_summary_id IS NULL",[org.id,lead.id,app.id]);await c.query("INSERT INTO application_portal_events(organization_id,application_id,participant_id,actor_user_id,actor_kind,kind,summary,metadata) VALUES($1,$2,$3,$4,'staff','demo_prepared','A separate synthetic applicant demo was prepared. No invitation or external message was sent.','{\"simulation\":true}')",[org.id,app.id,participant.id,staff.id]);await c.query("INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,'demo.applicant.seed',$3)",[org.id,staff.id,JSON.stringify({changedRecords,applicationId:app.id,outboundSent:false})]);}
  return{organizationId:org.id,staffUserId:staff.id,applicantUserId:applicant.id,applicationId:app.id,changedRecords};
 });
}
export async function preparedApplicantDemo(config:ServerConfig,database:Database):Promise<boolean>{
 if(!await isIsolatedDemo(config,database))return false;
 if(!(await database.query("SELECT to_regclass('public.application_participants') IS NOT NULL AS ready")).rows[0].ready)return false;
 const user=(await database.query("SELECT u.password_hash FROM users u JOIN application_participants p ON p.user_id=u.id AND p.active AND p.role='primary' JOIN applications a ON a.id=p.application_id AND a.organization_id=p.organization_id AND a.portal_enabled AND p.property_id=a.property_id AND p.contact_id=a.contact_id JOIN organizations o ON o.id=p.organization_id AND o.environment='demo' AND o.slug=$2 WHERE u.email=$1 AND u.account_kind='applicant' AND u.active AND u.is_demo LIMIT 1",[applicantDemoEmail,slug])).rows[0];
 return Boolean(user&&await verifyPassword(user.password_hash,applicantDemoPassword));
}
