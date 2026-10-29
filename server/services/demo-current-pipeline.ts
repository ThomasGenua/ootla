import {createHash,randomBytes} from 'node:crypto';
import type {PoolClient,QueryResultRow} from 'pg';
import type {AuthUser} from '../../shared/contracts.js';
import {calendarBookSchema,calendarSlotsSchema} from '../../shared/calendar-contracts.js';
import {readInstanceDefaults} from '../config/instance-files.js';
import type {ServerConfig} from '../config/env.js';
import type {Database} from '../db/pool.js';
import {ApiError} from '../http/errors.js';
import {Calendar} from './calendar.js';
import {addLocalDays,localDate} from './calendar-time.js';
import {requireIsolatedDemo} from './demo-environment.js';
import {demoShowcaseId} from './demo-showcase.js';

const dataset='demo.current-pipeline.v1';
const receiptAction='demo.current-pipeline.prepared';
export function demoCurrentPipelineId(organizationId:string,key:string):string{
 const hex=createHash('sha256').update('ootla:'+dataset+':'+organizationId+':'+key).digest('hex');
 return hex.slice(0,8)+'-'+hex.slice(8,12)+'-5'+hex.slice(13,16)+'-a'+hex.slice(17,20)+'-'+hex.slice(20,32);
}
export interface CurrentPipelineCase{key:string;name:string;contactId:string;leadId:string;taskId:string;propertyId:string;unitId:string;viewingId:string|null;startsAt:string|null;dueAt:string;leadUrl:string;taskUrl:string;viewingUrl:string|null}
export interface DemoCurrentPipelineResult{organizationId:string;preparedAt:string;basedOnDate:string;changedRecords:number;cases:CurrentPipelineCase[];externalActions:'none'}

/** Deliberate one-time additive preparation. A completed receipt wins over every later staff edit.
 * All fixtures, real Calendar operations and the receipt share one transaction; failure leaves no partial dataset.
 * Never called by startup and never rewrites an old date, lead, task, availability setting or lease.
 */
export async function prepareDemoCurrentPipeline(db:Database,config:ServerConfig):Promise<DemoCurrentPipelineResult>{
 if(readInstanceDefaults()?.kind!=='demo'||!config.demoMode||config.production||!/^ootla_demo(?:_[a-z0-9_]+)?$/.test(config.databaseName??'')||config.ai.provider!=='simulated'||config.integrationsMode!=='simulation'||config.outboundMode!=='simulation'||config.googleCalendar.enabled||config.googleAnalytics.enabled)throw new ApiError(403,'CURRENT_PIPELINE_DEMO_REQUIRED','Use the dedicated non-production demo checkout with simulated integrations and outbound communication. No records were changed.');
 await db.requireReady();
 return db.transaction(async c=>{
  await requireIsolatedDemo(config,c);
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ootla:'+dataset]);
  const a=(await c.query("SELECT o.id AS organization_id,o.name AS organization_name,u.id AS user_id,u.display_name,u.email,m.id AS membership_id,ARRAY(SELECT permission FROM role_permissions WHERE role_key=m.role) AS permissions FROM organizations o JOIN organization_memberships m ON m.organization_id=o.id AND m.active AND m.account_kind='staff' AND m.role='organization_admin' JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' AND u.is_demo WHERE o.slug='ootla-demo' AND o.environment='demo' AND u.email=$1 FOR SHARE OF o,m,u",[config.demoAdminEmail])).rows[0];
  if(!a)throw new ApiError(409,'CURRENT_PIPELINE_ADMIN_REQUIRED','Prepare the existing isolated demo administrator first. Existing accounts were preserved.');
  const org=String(a.organization_id),uid=String(a.user_id),mid=String(a.membership_id),id=(key:string)=>demoCurrentPipelineId(org,key);
  const receipt=(await c.query("SELECT metadata FROM audit_events WHERE organization_id=$1 AND action=$2 AND metadata->>'dataset'=$3 LIMIT 1",[org,receiptAction,dataset])).rows[0];
  if(receipt){if(!receipt.metadata?.result)throw new ApiError(409,'CURRENT_PIPELINE_RECEIPT_CONFLICT','The preparation receipt needs review. Existing work was preserved.');return{...receipt.metadata.result,changedRecords:0} as DemoCurrentPipelineResult;}
  if((await c.query('SELECT mode FROM organization_data_settings WHERE organization_id=$1',[org])).rows[0]?.mode!=='standalone')throw new ApiError(409,'CURRENT_PIPELINE_STANDALONE_REQUIRED','Current-pipeline examples cannot modify a provider-owned organization.');
  const now=new Date((await c.query('SELECT clock_timestamp() AS now')).rows[0].now),today=now.toISOString().slice(0,10);
  const actor:AuthUser={id:uid,email:a.email,name:a.display_name,membershipId:mid,permissions:a.permissions,sessionExpiresAt:new Date(now.getTime()+10*60000).toISOString(),organization:{id:org,name:a.organization_name,role:'organization_admin'}};
  const cases:CurrentPipelineCase[]=[];
  const definitions=[
   {key:'nina',name:'Nina Mensah',property:'cedar',unit:'cedar101',source:'website',book:false,title:"Confirm Nina's move-in preferences",details:'Review the stated one-bedroom budget and preferred move-in date. Check current Cedar House availability, agree a next step and record it before offering a viewing.'},
   {key:'oliver',name:'Oliver Grant',property:'cedar',unit:'cedar101',source:'referral',book:true,title:"Prepare Oliver's Cedar House viewing",details:'Review the saved viewing time and location in Calendar. Check the one-bedroom preferences, prepare access arrangements and record attendance and the next action after the viewing.'},
   {key:'camila',name:'Camila Reed',property:'grove',unit:'grove2B',source:'phone',book:true,title:"Prepare Camila's Grove Lofts viewing",details:'Review the confirmed viewing in Calendar, stated two-bedroom budget and move-in preferences. Confirm the meeting arrangements and record the viewing outcome after it takes place.'},
  ] as const;
  // Reuse real configured showcase resources. Staff edits to availability/settings remain authoritative.
  const resources=new Map<string,QueryResultRow>();
  for(const definition of definitions){
   const propertyId=demoShowcaseId(org,'property.'+definition.property),unitId=demoShowcaseId(org,'unit.'+definition.unit);
   const row=(await c.query("SELECT p.id AS property_id,p.name,p.city,un.id AS unit_id,un.bedrooms,un.monthly_rent,un.status,s.time_zone FROM properties p JOIN units un ON un.organization_id=p.organization_id AND un.property_id=p.id AND un.id=$3 JOIN property_viewing_settings s ON s.organization_id=p.organization_id AND s.property_id=p.id AND s.enabled WHERE p.organization_id=$1 AND p.id=$2 AND p.source_system='demo' AND un.source_system='demo' FOR SHARE OF p,un,s",[org,propertyId,unitId])).rows[0];
   if(!row||row.status!=='available')throw new ApiError(409,'CURRENT_PIPELINE_RESOURCES_REQUIRED','The existing showcase units and enabled schedule must be available. Current staff configuration was preserved.');
   resources.set(definition.key,row);
  }
  const put=async(table:string,key:string,values:Record<string,unknown>):Promise<string>=>{
   const record=id(key);if((await c.query('SELECT id FROM '+table+' WHERE id=$1',[record])).rowCount)throw new ApiError(409,'CURRENT_PIPELINE_RECORD_CONFLICT','A reserved example identity exists without its completed receipt. Existing records were preserved.');
   const columns=['id','organization_id',...Object.keys(values)],parameters=[record,org,...Object.values(values)];
   await c.query('INSERT INTO '+table+'('+columns.join(',')+') VALUES('+parameters.map((_,index)=>'$'+(index+1)).join(',')+')',parameters);return record;
  };
  // Normal Calendar authorization still sees a genuine, scoped, short-lived server-side session.
  // It exists only inside this transaction, has no browser token and never touches another session.
  const digest=createHash('sha256').update(randomBytes(32)).digest('hex');
  const commandSession=(await c.query('INSERT INTO sessions(token_digest,user_id,organization_id,expires_at) VALUES($1,$2,$3,$4) RETURNING id',[digest,uid,org,actor.sessionExpiresAt])).rows[0].id;
  // Calendar uses its normal transaction/query interface; bind both to this transaction for atomic rollback.
  const transactionDb=Object.create(db) as Database;
  transactionDb.transaction=<T>(operation:(client:PoolClient)=>Promise<T>)=>operation(c);
  transactionDb.query=<T extends QueryResultRow=QueryResultRow>(sql:string,values:unknown[]=[])=>c.query<T>(sql,values);
  const calendar=new Calendar(transactionDb,config);
  for(const definition of definitions){
   const resource=resources.get(definition.key)!,propertyId=String(resource.property_id),unitId=String(resource.unit_id),rent=Number(resource.monthly_rent),bedrooms=Number(resource.bedrooms);
   const contactId=await put('contacts','contact.'+definition.key,{display_name:definition.name,email:'current.'+definition.key+'@demo.ootla.test',source_system:'demo'});
   await c.query('INSERT INTO contact_property_links(organization_id,contact_id,property_id) VALUES($1,$2,$3)',[org,contactId,propertyId]);
   let dueAt=new Date(now.getTime()+24*3600000).toISOString();
   const leadId=await put('leads','lead.'+definition.key,{property_id:propertyId,unit_id:unitId,contact_id:contactId,display_name:definition.name,email:'current.'+definition.key+'@demo.ootla.test',status:'new',intent:'leasing',pipeline_stage:'new_inquiry',owner_membership_id:mid,source:definition.source,preferences:JSON.stringify({bedrooms,budgetMin:Math.max(0,rent-200),budgetMax:rent+200,moveInOn:addLocalDays(today,30),locations:[resource.city],requirements:bedrooms===1?'One-bedroom home near transport.':'Two-bedroom home with space to work from home.'}),next_action:definition.title,next_action_at:dueAt,notes:definition.book?'The prospect would like to view the selected home and discuss the move-in arrangements.':'Confirm the stated budget and move-in date before arranging a viewing.',seed_key:dataset+'.lead.'+definition.key});
   await c.query('INSERT INTO lead_property_interests(organization_id,lead_id,contact_id,property_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[org,leadId,contactId,propertyId]);
   await put('lead_events','lead.created.'+definition.key,{lead_id:leadId,kind:'created',stage:'new_inquiry',actor_user_id:uid,actor_membership_id:mid,occurred_at:now,metadata:JSON.stringify({dataset,synthetic:true,previewOnly:true,outboundSent:false})});
   await put('lead_workspace_events','lead.note.'+definition.key,{lead_id:leadId,property_id:propertyId,contact_id:contactId,kind:'note',summary:definition.details,actor_user_id:uid,actor_membership_id:mid,occurred_at:now,metadata:JSON.stringify({dataset,synthetic:true,previewOnly:true,outboundSent:false})});
   let viewingId:string|null=null,startsAt:string|null=null;
   if(definition.book){
    const slots=await calendar.slots(actor,digest,calendarSlotsSchema.parse({propertyId,leadId,unitId,ownerMembershipId:mid,date:addLocalDays(localDate(now,resource.time_zone),1),days:7,page:1,pageSize:100}));
    const slot=slots.items.find(item=>Date.parse(item.startsAt)>now.getTime()+5*60000);
    if(!slot)throw new ApiError(409,'CURRENT_PIPELINE_NO_SLOTS','No actual staff viewing slot is available in the coming week. Existing availability and bookings were preserved.');
    const booked=await calendar.book(actor,digest,calendarBookSchema.parse({requestKey:id('booking.'+definition.key),propertyId,leadId,unitId,ownerMembershipId:mid,startsAt:slot.startsAt}));
    viewingId=booked.viewing.id;startsAt=booked.viewing.startsAt;dueAt=new Date(Date.parse(startsAt)-3600000).toISOString();
    await c.query('UPDATE leads SET next_action_at=$2 WHERE id=$1 AND organization_id=$3',[leadId,dueAt,org]);
   }
   const taskId=await put('tasks','task.'+definition.key,{property_id:propertyId,lead_id:leadId,contact_id:contactId,tour_id:viewingId,title:definition.title,details:definition.details,due_at:dueAt,status:'open',priority:definition.key==='nina'?'high':'normal',origin:'demo',owner_membership_id:mid,created_by_user_id:uid,created_by_membership_id:mid,purpose:'crm',seed_key:dataset+'.task.'+definition.key});
   await put('task_events','task.created.'+definition.key,{task_id:taskId,kind:'created',actor_user_id:uid,actor_membership_id:mid,occurred_at:now,metadata:JSON.stringify({dataset,synthetic:true,previewOnly:true,outboundSent:false})});
   await put('task_reminders','reminder.'+definition.key,{task_id:taskId,generation:1,recipient_membership_id:mid,status:'pending',scheduled_at:dueAt,next_attempt_at:dueAt});
   cases.push({key:definition.key,name:definition.name,contactId,leadId,taskId,propertyId,unitId,viewingId,startsAt,dueAt,leadUrl:'/admin/leads?lead='+leadId,taskUrl:'/admin/tasks?task='+taskId,viewingUrl:viewingId?'/admin/calendar?viewing='+viewingId:null});
  }
  await c.query('DELETE FROM sessions WHERE id=$1 AND token_digest=$2 AND organization_id=$3 AND user_id=$4',[commandSession,digest,org,uid]);
  const leadIds=cases.map(item=>item.leadId),taskIds=cases.map(item=>item.taskId),contactIds=cases.map(item=>item.contactId),viewingIds=cases.flatMap(item=>item.viewingId?[item.viewingId]:[]);
  // Count only this dataset's new rows, never unrelated concurrent worker output.
  const count=(await c.query(`SELECT
   (SELECT count(*) FROM contacts WHERE organization_id=$1 AND id=ANY($2::uuid[]))+
   (SELECT count(*) FROM contact_property_links WHERE organization_id=$1 AND contact_id=ANY($2::uuid[]))+
   (SELECT count(*) FROM leads WHERE organization_id=$1 AND id=ANY($3::uuid[]))+
   (SELECT count(*) FROM lead_property_interests WHERE organization_id=$1 AND lead_id=ANY($3::uuid[]))+
   (SELECT count(*) FROM lead_events WHERE organization_id=$1 AND lead_id=ANY($3::uuid[]))+
   (SELECT count(*) FROM lead_workspace_events WHERE organization_id=$1 AND lead_id=ANY($3::uuid[]))+
   (SELECT count(*) FROM tasks WHERE organization_id=$1 AND id=ANY($4::uuid[]))+
   (SELECT count(*) FROM task_events WHERE organization_id=$1 AND task_id=ANY($4::uuid[]))+
   (SELECT count(*) FROM task_reminders WHERE organization_id=$1 AND task_id=ANY($4::uuid[]))+
   (SELECT count(*) FROM viewings WHERE organization_id=$1 AND id=ANY($5::uuid[]))+
   (SELECT count(*) FROM viewing_events WHERE organization_id=$1 AND viewing_id=ANY($5::uuid[]))+
   (SELECT count(*) FROM viewing_notification_receipts WHERE organization_id=$1 AND event_id IN(SELECT id FROM viewing_events WHERE viewing_id=ANY($5::uuid[])))+
   (SELECT count(*) FROM viewing_action_receipts WHERE organization_id=$1 AND request_key=ANY($6::uuid[]))+
   (SELECT count(*) FROM viewing_lead_summaries WHERE organization_id=$1 AND lead_id=ANY($3::uuid[]))+
   (SELECT count(*) FROM audit_events WHERE organization_id=$1 AND action='viewing.booked' AND metadata->>'viewingId'=ANY($7::text[])) AS total`,[org,contactIds,leadIds,taskIds,viewingIds,[id('booking.oliver'),id('booking.camila')],viewingIds])).rows[0].total;
  const result:DemoCurrentPipelineResult={organizationId:org,preparedAt:now.toISOString(),basedOnDate:today,changedRecords:Number(count)+1,cases,externalActions:'none'};
  await c.query('INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,$3,$4)',[org,uid,receiptAction,JSON.stringify({dataset,synthetic:true,previewOnly:true,outboundSent:false,result})]);
  return result;
 });
}
