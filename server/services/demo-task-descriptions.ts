import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import type {AuthUser} from '../../shared/contracts.js';
import {ApiError} from '../http/errors.js';
import {requireIsolatedDemo} from './demo-environment.js';
import {Tasks} from './tasks.js';
export const demoTaskDescriptions:Readonly<Record<string,string>>={
 'stage03.task.maya':"Confirm Maya's budget, bedroom preference and move-in date. Offer a currently available viewing slot at Harbor House, save the booking in Calendar and record the agreed next step.",
 'stage03.task.jordan':"Review Jordan's property interest and preferred move-in timing. Check the current viewing record, confirm an available time with the assigned staff member and record the outcome.",
 'stage03.task.priya':"Discuss Priya's sales requirements, budget and preferred completion date with the property team. Confirm suitable inventory and save a clear next action; rental application stages do not apply.",
 'demo.showcase.v1.task.avery':"Review Avery's one-bedroom preference and stated budget. Confirm current availability at Cedar House, offer a viewing time through Calendar and record the response.",
 'demo.showcase.v1.task.noah':"Review Noah's viewing in Calendar, confirm the location and assigned staff member, then record attendance and a follow-up after the viewing.",
 'demo.showcase.v1.task.leila':"Review Leila's saved application and document checklist. Request only outstanding required items and record the next review date; keep staff review separate from application submission.",
 'demo.showcase.v1.task.ethan':"Check Ethan's submitted application, required documents and consent records. Record any missing information and assign the next staff review step without making an automated approval decision.",
 'demo.showcase.v1.task.sofia':"Review Sofia's application details and supporting documents. Record the staff review outcome or missing requirements; provider screening and consent must be handled through the approved process.",
 'demo.showcase.v1.task.ben':"Review Ben's lease preparation checklist and verify the recorded parties, unit and dates. Resolve outstanding items with the assigned agent before recording a signed lease milestone.",
 'demo.showcase.v1.task.alex':"Review Alex's lease and move-in checklist. Confirm the agreed move-in arrangements, assign outstanding operational work and record the outcome without changing provider-owned accounting data.",
 'demo.showcase.v1.task.riley':"Record Riley's sales budget, preferred location and property requirements. Review available sales inventory with the property team and retain the agreed negotiation next step.",
};
export const originalShowcaseTaskDescription='Saved showcase work. Complete, reassign or change it through the normal task workflow.';
/** Deliberate, repeatable copy upgrade. Exact shipped text only; never reset work, owners or status. */
export async function polishDemoTaskDescriptions(database:Database,config:ServerConfig):Promise<{updated:number;preserved:number}>{
 await database.requireReady();
 return database.transaction(async c=>{
  await requireIsolatedDemo(config,c);
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended('ootla:demo:task-descriptions:v1',0))");
  const row=(await c.query("SELECT u.id,u.email,u.display_name,m.id AS membership_id,o.id AS organization_id,o.name AS organization_name,ARRAY(SELECT permission FROM role_permissions WHERE role_key=m.role) AS permissions FROM users u JOIN organization_memberships m ON m.user_id=u.id AND m.active AND m.role='organization_admin' JOIN organizations o ON o.id=m.organization_id AND o.environment='demo' AND o.slug='ootla-demo' WHERE u.email=$1 AND u.active AND u.is_demo AND u.account_kind='staff' FOR SHARE OF u,m",[config.demoAdminEmail])).rows[0];
  if(!row)throw new ApiError(409,'DEMO_ADMIN_REQUIRED','Prepare the isolated administrator before updating the shipped task descriptions.');
  const actor:AuthUser={id:row.id,email:row.email,name:row.display_name,membershipId:row.membership_id,permissions:row.permissions,sessionExpiresAt:new Date(Date.now()+60000).toISOString(),organization:{id:row.organization_id,name:row.organization_name,role:'organization_admin'}};
  let updated=0,preserved=0;
  for(const[seed,description]of Object.entries(demoTaskDescriptions)){
   const t=(await c.query('SELECT id,details,version FROM tasks WHERE organization_id=$1 AND seed_key=$2 FOR UPDATE',[row.organization_id,seed])).rows[0];
   if(!t)continue;
   const original=seed.startsWith('stage03.')?'':originalShowcaseTaskDescription;
   if(t.details!==original){preserved++;continue;}
   await new Tasks(database).updateLinked(c,actor,t.id,{version:t.version,details:description});updated++;
  }
  return{updated,preserved};
 });
}
