import {createHash} from 'node:crypto';
import type {Database} from '../db/pool.js';
import type {ServerConfig} from '../config/env.js';
import {ApiError} from '../http/errors.js';
import {requireIsolatedDemo} from './demo-environment.js';
import {demoShowcaseId} from './demo-showcase.js';
import {hashPassword} from './passwords.js';

const dataset='demo.renewals.pilot.v1';
export function renewalsPilotId(organizationId:string,key:string):string{
 const digest=createHash('sha256').update('ootla:'+dataset+':'+organizationId+':'+key).digest('hex');
 return digest.slice(0,8)+'-'+digest.slice(8,12)+'-5'+digest.slice(13,16)+'-a'+digest.slice(17,20)+'-'+digest.slice(20,32);
}
export interface RenewalsPilotCase{key:string;label:string;relationshipId:string;leaseId:string;applicationId:string;contactId:string;propertyId:string;unitId:string;residentEmail:string;taskId:string;offerId:string|null}
export interface RenewalsPilotResult{organizationId:string;preparedAt:string;basedOnDate:string;cases:RenewalsPilotCase[];changedRecords:number}
/** Deliberate, append-only preview snapshots. Never imported or invoked by application startup. */
export async function prepareRenewalsPilotDemo(db:Database,config:ServerConfig):Promise<RenewalsPilotResult>{
 await db.requireReady();
 return db.transaction(async c=>{
  await requireIsolatedDemo(config,c);
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ootla:'+dataset]);
  const admin=(await c.query("SELECT o.id AS organization_id,u.id AS user_id,m.id AS membership_id FROM organizations o JOIN organization_memberships m ON m.organization_id=o.id AND m.active AND m.role='organization_admin' JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' AND u.is_demo WHERE o.slug='ootla-demo' AND o.environment='demo' AND u.email=$1 FOR SHARE OF o,m,u",[config.demoAdminEmail])).rows[0];
  if(!admin)throw new ApiError(409,'RENEWALS_PILOT_ADMIN_REQUIRED','The existing isolated demo administrator must be available. No records were changed.');
  const org=String(admin.organization_id),uid=String(admin.user_id),mid=String(admin.membership_id),id=(key:string)=>renewalsPilotId(org,key);
  const previous=(await c.query("SELECT metadata FROM audit_events WHERE organization_id=$1 AND action='demo.renewals.pilot.prepared' AND metadata->>'dataset'=$2 LIMIT 1",[org,dataset])).rows[0];
  if(previous?.metadata?.result)return{...previous.metadata.result,changedRecords:0} as RenewalsPilotResult;
  const mode=(await c.query('SELECT mode FROM organization_data_settings WHERE organization_id=$1',[org])).rows[0]?.mode;
  if(mode!=='standalone')throw new ApiError(409,'RENEWALS_PILOT_STANDALONE_REQUIRED','Preview preparation cannot change a provider-owned organization.');
  const properties=[demoShowcaseId(org,'property.cedar'),demoShowcaseId(org,'property.grove')];
  const available=(await c.query("SELECT id FROM properties WHERE organization_id=$1 AND id=ANY($2::uuid[]) AND source_system='demo' FOR SHARE",[org,properties])).rows;
  if(available.length!==properties.length)throw new ApiError(409,'RENEWALS_PILOT_PROPERTIES_REQUIRED','Prepare the existing isolated showcase properties first. No properties were created or changed.');
  const clock=(await c.query("SELECT clock_timestamp() AS now,to_char((clock_timestamp() AT TIME ZONE 'UTC')::date,'YYYY-MM-DD') AS today")).rows[0];
  const now=new Date(clock.now),today=String(clock.today),date=(offset:number)=>new Date(Date.parse(today+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10),at=(offset:number)=>date(offset)+'T12:00:00.000Z';
  const definitions=[
   {key:'upcoming',label:'Upcoming expiry',name:'Morgan Lewis',property:properties[0]!,unit:'RP-101',bedrooms:1,rent:1700,ends:75,title:'Review the upcoming lease expiry',details:'Review the lease expiry and agree the next staff action before preparing terms.',due:10,completed:false,assigned:false,offer:null},
   {key:'preparing',label:'Staff preparing terms',name:'Samira Okafor',property:properties[0]!,unit:'RP-102',bedrooms:2,rent:2150,ends:55,title:'Prepare renewal terms for staff review',details:'Prepare a proposal for authorized staff review. No terms have been published to the resident.',due:3,completed:false,assigned:true,offer:null},
   {key:'review',label:'Approved terms available for review',name:'Daniel Brooks',property:properties[1]!,unit:'RP-201',bedrooms:2,rent:2350,ends:35,title:'Check the resident review of approved terms',details:'Follow up on the approved information already shown in this preview. Any agreement requires the normal verified lease process.',due:7,completed:false,assigned:true,offer:'current'},
   {key:'followup',label:'Expired terms need follow-up',name:'Elena Rossi',property:properties[1]!,unit:'RP-202',bedrooms:2,rent:2200,ends:12,title:'Follow up on the expired renewal information',details:'The previous review deadline has passed. Confirm the next step before issuing any new terms.',due:-2,completed:false,assigned:true,offer:'expired'},
   {key:'followup_completed',label:'Staff follow-up completed',name:'Amir Patel',property:properties[0]!,unit:'RP-103',bedrooms:1,rent:1750,ends:-7,title:'Complete the renewal follow-up review',details:'Staff follow-up is complete and the old information is inactive. This is not evidence of an accepted, signed or completed renewal.',due:-3,completed:true,assigned:true,offer:'inactive'},
  ] as const;
  let changed=0;
  const put=async(table:string,key:string,values:Record<string,unknown>):Promise<string>=>{
   const record=id(key);if((await c.query('SELECT id FROM '+table+' WHERE id=$1',[record])).rowCount)throw new ApiError(409,'RENEWALS_PILOT_CONFLICT','A reserved preview record already exists without its completed preparation receipt. Existing work was preserved.');
   const columns=['id','organization_id',...Object.keys(values)],parameters=[record,org,...Object.values(values)];
   await c.query('INSERT INTO '+table+'('+columns.join(',')+') VALUES('+parameters.map((_,index)=>'$'+(index+1)).join(',')+')',parameters);changed++;return record;
  };
  const cases:RenewalsPilotCase[]=[],passwordHash=await hashPassword(config.demoAdminPassword);
  for(const item of definitions){
   const email='renewals.'+(item.key==='followup_completed'?'followup-completed':item.key)+'@demo.ootla.test',residentId=id('user.'+item.key);
   if((await c.query('SELECT id FROM users WHERE id=$1 OR email=$2',[residentId,email])).rowCount)throw new ApiError(409,'RENEWALS_PILOT_IDENTITY_CONFLICT','A reserved preview resident identity is already in use. No account or password was changed.');
   await c.query("INSERT INTO users(id,email,display_name,password_hash,account_kind,is_demo) VALUES($1,$2,$3,$4,'resident',true)",[residentId,email,item.name,passwordHash]);changed++;
   const unit=await put('units','unit.'+item.key,{property_id:item.property,label:item.unit,bedrooms:item.bedrooms,monthly_rent:item.rent,status:item.completed?'available':'occupied',source_system:'demo',availability_source:'demo',availability_verified_at:now,seed_key:dataset+'.unit.'+item.key});
   const contact=await put('contacts','contact.'+item.key,{display_name:item.name,email,source_system:'demo'});
   await c.query('INSERT INTO contact_property_links(organization_id,contact_id,property_id) VALUES($1,$2,$3)',[org,contact,item.property]);changed++;
   const application=await put('applications','application.'+item.key,{contact_id:contact,property_id:item.property,unit_id:unit,status:'staff_review',source_system:'demo'});
   await put('application_decisions','decision.'+item.key,{application_id:application,decision:'approved',reason:'Synthetic pilot snapshot of previously reviewed resident records; no live applicant decision was made.',actor_user_id:uid,actor_membership_id:mid,request_key:id('decision.request.'+item.key)});
   const lease=await put('leases','lease.'+item.key,{contact_id:contact,property_id:item.property,unit_id:unit,application_id:application,status:item.completed?'ended':'active',starts_on:date(item.ends-365),ends_on:date(item.ends),source_system:'demo'});
   const relationship=await put('resident_relationships','relationship.'+item.key,{contact_id:contact,property_id:item.property,unit_id:unit,application_id:application,lease_id:lease,source:'demo_event',status:'active'});
   await put('resident_access_grants','grant.'+item.key,{relationship_id:relationship,user_id:residentId,account_kind:'resident',granted_by_user_id:uid,active:!item.completed,revoked_at:item.completed?at(-7):null});
   const task=await put('tasks','task.'+item.key,{property_id:item.property,contact_id:contact,application_id:application,lead_id:null,title:item.title,details:item.details,due_at:at(item.due),status:item.completed?'completed':'open',priority:item.key==='followup'?'high':'normal',origin:'demo',owner_membership_id:item.assigned?mid:null,created_by_user_id:uid,created_by_membership_id:mid,completed_at:item.completed?at(-1):null,completed_by_user_id:item.completed?uid:null,completed_by_membership_id:item.completed?mid:null,purpose:'crm',seed_key:dataset+'.task.'+item.key});
   await put('task_events','task.event.'+item.key,{task_id:task,kind:item.completed?'completed':'created',actor_user_id:uid,actor_membership_id:mid,occurred_at:item.completed?at(-1):at(-7),metadata:JSON.stringify({dataset,synthetic:true,previewOnly:true,preloadedSnapshot:true,outboundSent:false,comment:item.details})});
   let offer:string|null=null;
   if(item.offer){
    // A preloaded historical preview snapshot on a NEW synthetic relationship, not a publish operation.
    // No existing offer is deactivated; no publishing service, invitation, outbox or notification is invoked.
    const terms='Synthetic pilot preview only: a proposed 12-month continuation at monthly rent '+item.rent.toLocaleString('en-US')+' in the recorded property currency, subject to staff review and a separate verified agreement. This preview does not amend or sign a lease.';
    offer=await put('resident_renewal_offers','offer.'+item.key,{relationship_id:relationship,terms,source:'staff_approved',evidence:'Preloaded synthetic pilot snapshot; reviewed fixture information only. No automatic publication action, notification or live offer occurred.',approved_by_user_id:uid,approved_at:at(item.offer==='inactive'?-20:-9),valid_until:at(item.offer==='expired'?-1:21),active:item.offer!=='inactive'});
   }
   cases.push({key:item.key,label:item.label,relationshipId:relationship,leaseId:lease,applicationId:application,contactId:contact,propertyId:item.property,unitId:unit,residentEmail:email,taskId:task,offerId:offer});
  }
  const result:RenewalsPilotResult={organizationId:org,preparedAt:now.toISOString(),basedOnDate:today,cases,changedRecords:changed+1};
  await c.query("INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,'demo.renewals.pilot.prepared',$3)",[org,uid,JSON.stringify({dataset,synthetic:true,previewOnly:true,preloadedSnapshot:true,outboundSent:false,publishOperationPerformed:false,result})]);
  return result;
 });
}