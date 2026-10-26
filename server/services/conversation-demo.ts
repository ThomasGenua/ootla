import type {Database} from '../db/pool.js';
import type {ServerConfig} from '../config/env.js';
import {ApiError} from '../http/errors.js';
import {requireIsolatedDemo} from './demo-environment.js';
/** Explicit, repeatable synthetic setup only. No startup seeding, user reset or existing record update. */
export async function seedConversationDemo(db:Database,config:ServerConfig):Promise<{propertyId:string;channelId:string;changedRecords:number}>{
 return db.transaction(async c=>{
  await requireIsolatedDemo(config,c);await c.query("SELECT pg_advisory_xact_lock(hashtextextended('ootla.demo.stage20',0))");
  const admin=(await c.query("SELECT o.id AS organization_id,u.id AS user_id,m.id AS membership_id FROM organizations o JOIN organization_memberships m ON m.organization_id=o.id AND m.active AND m.role='organization_admin' JOIN users u ON u.id=m.user_id AND u.active AND u.is_demo AND u.account_kind='staff' WHERE o.slug='ootla-demo' AND o.environment='demo' AND u.email=$1",[config.demoAdminEmail])).rows[0];
  if(!admin)throw new ApiError(409,'DEMO_STAFF_REQUIRED','Prepare the existing isolated staff demo first.');
  let n=0;
  let property=(await c.query("SELECT id FROM properties WHERE organization_id=$1 AND seed_key='stage20.public_chat.property'",[admin.organization_id])).rows[0];
  if(!property){property=(await c.query("INSERT INTO properties(organization_id,name,address,city,property_type,seed_key) VALUES($1,'Harbor View — conversation demo','Synthetic waterfront example','Lagos','residential','stage20.public_chat.property') RETURNING id",[admin.organization_id])).rows[0];n++;}
  n+=(await c.query("INSERT INTO units(organization_id,property_id,label,bedrooms,status,monthly_rent,seed_key) VALUES($1,$2,'Demo 101',2,'available',2200,'stage20.public_chat.unit') ON CONFLICT(organization_id,seed_key) DO NOTHING",[admin.organization_id,property!.id])).rowCount??0;
  n+=(await c.query("INSERT INTO property_viewing_settings(organization_id,property_id,enabled,time_zone,duration_minutes,buffer_before_minutes,buffer_after_minutes,location,public_booking_enabled,version) VALUES($1,$2,true,'Africa/Lagos',30,10,10,'Harbor View demo reception',true,1) ON CONFLICT(property_id) DO NOTHING",[admin.organization_id,property!.id])).rowCount??0;
  const windows=Array.from({length:7},(_,weekday)=>({weekday,start:'09:00',end:'17:00'}));
  n+=(await c.query("INSERT INTO viewing_staff_availability(organization_id,property_id,membership_id,enabled,windows,version) VALUES($1,$2,$3,true,$4,1) ON CONFLICT(property_id,membership_id) DO NOTHING",[admin.organization_id,property!.id,admin.membership_id,JSON.stringify(windows)])).rowCount??0;
  for(const [title,body]of[
   ['Public demo viewing guidance','Viewings last 30 minutes at the demo reception. Use Show viewing options for current slots, then confirm your choice. A slot is booked only after the normal scheduling service succeeds.'],
   ['Public demo property information','Harbor View is a synthetic property used only for an isolated Ootla demonstration. Its example unit has two bedrooms. Ask staff to verify current availability and application requirements; no rent concession, approval or payment is offered.']
  ]){if(!(await c.query('SELECT id FROM ai_knowledge WHERE organization_id=$1 AND property_id=$2 AND title=$3',[admin.organization_id,property!.id,title])).rowCount){await c.query("INSERT INTO ai_knowledge(organization_id,property_id,title,body,status,approved_at,approved_by_user_id,created_by_user_id,updated_by_user_id,public_enabled) VALUES($1,$2,$3,$4,'approved',clock_timestamp(),$5,$5,$5,true)",[admin.organization_id,property!.id,title,body,admin.user_id]);n++;}}
  n+=(await c.query("INSERT INTO conversation_channels(organization_id,property_id,label,enabled,published_by_user_id,published_by_membership_id,time_zone,quiet_start,quiet_end) VALUES($1,$2,'Harbor View demo team',true,$3,$4,'Africa/Lagos',0,0) ON CONFLICT(organization_id,property_id) DO NOTHING",[admin.organization_id,property!.id,admin.user_id,admin.membership_id])).rowCount??0;
  const channel=(await c.query('SELECT id FROM conversation_channels WHERE organization_id=$1 AND property_id=$2',[admin.organization_id,property!.id])).rows[0]!;
  return{propertyId:property!.id,channelId:channel.id,changedRecords:n};
 });
}
