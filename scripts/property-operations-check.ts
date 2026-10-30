import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import type {OperationsFixture} from './operations-check.js';
import type {Row} from '../shared/operations-contracts.js';
export const completionPhoto=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
export async function checkPropertyOperations(f:OperationsFixture,records:{leadId:string;conversationId:string;requestId:string}){
 const {api,database:db,config,admin,agent,analyst,foreignAdmin,applicant,orgs,properties,memberships}=f,b='/api/property-operations';
 const call=async(path:string,body?:unknown,cookie=admin,method=body?'POST':'GET',status=200)=>{const r=await api.request(path,cookie,method,body);const text=await r.text();assert.equal(r.status,status,method+' '+path+': '+text);return text?JSON.parse(text) as Row:{};};
 const key=()=>randomUUID(),date=(days:number)=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
 for(const path of ['/maintenance','/vendors','/tenancies','/vacancies','/duplicates','/response-policies']){
  for(const cookie of ['',analyst,applicant])assert([401,403].includes((await api.request(b+path,cookie)).status));
  assert((await call(b+path,undefined,foreignAdmin)).items.every((r:Row)=>r.property_id!==properties[0]&&r.property_id!==properties[1]),'Foreign organization lists exclude this portfolio: '+path);
 }
 const vendorBody={requestKey:key(),propertyId:properties[0],name:'Synthetic repair partner',trade:'Plumbing',email:'vendor@example.test',phone:'+14165550124',active:true};
 await call(b+'/vendors',vendorBody,agent,'POST',403);
 const vendor=await call(b+'/vendors',vendorBody,admin,'POST',201);assert.equal((await call(b+'/vendors',vendorBody,admin,'POST',201)).id,vendor.id);
 const foreignVendor=await call(b+'/vendors',{...vendorBody,requestKey:key(),propertyId:properties[1],name:'Restricted partner'},admin,'POST',201);
 const create={requestKey:key(),requestId:records.requestId},orders=await Promise.all([call(b+'/maintenance',create,admin,'POST',201),call(b+'/maintenance',{...create,requestKey:key()},admin,'POST',201)]);assert.equal(orders[0].id,orders[1].id);
 let order=orders[0];await call(b+'/maintenance/'+order.id,undefined,foreignAdmin,'GET',404);
 let update={requestKey:key(),version:order.version,vendorId:vendor.id,ownerMembershipId:memberships[1],status:'scheduled',appointmentStart:new Date(Date.now()+86400000).toISOString(),appointmentEnd:new Date(Date.now()+90000000).toISOString(),entryInstructions:'Contact resident for entry; no access permission assumed.',estimate:125,actualCost:null as number|null,currency:'CAD',completionNote:'',residentUpdate:'Your repair appointment has been planned.'};
 await call(b+'/maintenance/'+order.id,{...update,vendorId:foreignVendor.id},admin,'PATCH',409);
 order=await call(b+'/maintenance/'+order.id,update,admin,'PATCH');assert.equal((await call(b+'/maintenance/'+order.id,update,admin,'PATCH')).id,order.id);
 await call(b+'/maintenance/'+order.id,{...update,requestKey:key()},admin,'PATCH',409);
 const rawUpload=async(content:Buffer,type='image/png',name='completion.png')=>fetch(api.base+b+'/maintenance/'+order.id+'/photos?'+new URLSearchParams({name}),{method:'POST',headers:{Cookie:admin,Origin:config.appUrl,'Content-Type':type},body:content});
 assert.equal((await rawUpload(Buffer.from('not an image'))).status,400);
 const photoResponse=await rawUpload(completionPhoto);assert.equal(photoResponse.status,201);const photo=await photoResponse.json() as Row;
 const imageResponse=await api.request('/api/resident-workflows/maintenance/'+order.id+'/photos/'+photo.id,applicant);assert.equal(imageResponse.status,200);assert.equal(createHash('sha256').update(Buffer.from(await imageResponse.arrayBuffer())).digest('hex'),createHash('sha256').update(completionPhoto).digest('hex'));
 assert([401,403,404].includes((await api.request('/api/resident-workflows/maintenance/'+order.id+'/photos/'+photo.id,foreignAdmin)).status));
 update={...update,requestKey:key(),version:order.version,status:'completed',actualCost:120,completionNote:'Replaced tap washer.',residentUpdate:'The repair is complete. Please check the result.'};order=await call(b+'/maintenance/'+order.id,update,admin,'PATCH');
 const portal=await call('/api/resident-workflows',undefined,applicant);assert.equal(portal.orders.find((o:Row)=>o.id===order.id).status,'completed');assert(!JSON.stringify(portal.orders).includes('entry_instructions'));assert(!JSON.stringify(portal.orders).includes('actual_cost'));
 await call('/api/resident-workflows/maintenance/'+order.id,{requestKey:key(),version:order.version,confirmed:false,note:'Still dripping.'},applicant);
 order=(await call(b+'/maintenance/'+order.id)).order;assert.equal(order.status,'in_progress');order=await call(b+'/maintenance/'+order.id,{...update,requestKey:key(),version:order.version},admin,'PATCH');
 const confirm={requestKey:key(),version:order.version,confirmed:true,note:'Fixed, thank you.'};await call('/api/resident-workflows/maintenance/'+order.id,confirm,applicant);await call('/api/resident-workflows/maintenance/'+order.id,confirm,applicant);
 assert.equal((await call('/api/resident/requests/'+records.requestId,undefined,applicant)).request.status,'closed');
 console.log('PASS property operations: scoped vendor dispatch, versioned appointment/cost updates, private validated photos and resident completion/reopen with replay protection');

 const resident=(await call('/api/resident',undefined,applicant)).residents[0];
 const unit=(await db.query("INSERT INTO units(organization_id,property_id,label,bedrooms,status,monthly_rent,availability_source,availability_verified_at) VALUES($1,$2,'Operations-101',2,'available',1800,'staff_reported',now()) RETURNING *",[orgs[0],properties[0]])).rows[0];
 await db.query('UPDATE resident_relationships SET unit_id=$2 WHERE id=$1',[resident.id,unit.id]);
 const tenantBody={requestKey:key(),residentId:resident.id,leaseStart:date(-300),leaseEnd:date(60),monthlyRent:1800,currency:'CAD',followupDays:[90,60,30],ownerMembershipId:memberships[1]};
 let plan=await call(b+'/tenancies',tenantBody,admin,'POST',201);assert.equal((await call(b+'/tenancies',tenantBody,admin,'POST',201)).id,plan.id);
 assert((await call('/api/operations/attention?kind=renewal')).items.some((r:Row)=>r.id===plan.id));
 await call(b+'/tenancies/'+plan.id,undefined,foreignAdmin,'GET',404);
 const offerBody={requestKey:key(),startsOn:date(61),endsOn:date(425),monthlyRent:1850,respondBy:date(14),terms:'Synthetic renewal proposal for workflow checks.'};
 let offer=await call(b+'/tenancies/'+plan.id+'/offers',offerBody,admin,'POST',201);assert.equal((await call('/api/resident-workflows',undefined,applicant)).offers.length,0);
 await call(b+'/tenancies/'+plan.id+'/offers',{...offerBody,requestKey:key()},admin,'POST',409);
 const publish={requestKey:key(),version:offer.version,action:'offer',confirmed:true};
 const prepared=await call(b+'/tenancies/'+plan.id+'/offers/'+offer.id,publish);assert(prepared.draftId);assert.equal((await call(b+'/tenancies/'+plan.id+'/offers/'+offer.id,publish)).draftId,prepared.draftId);
 offer=(await call('/api/resident-workflows',undefined,applicant)).offers[0];const respond={requestKey:key(),version:offer.version,response:'accepted',note:'I would like to renew.'};await call('/api/resident-workflows/renewals/'+offer.id,respond,applicant);await call('/api/resident-workflows/renewals/'+offer.id,respond,applicant);
 const expiredDraft=await call('/api/operations/inbox/'+prepared.conversationId+'/drafts/'+prepared.draftId+'/send',{version:1,confirmed:true},admin,'POST',409);assert.equal(expiredDraft.code,'PROPERTY_WORKFLOW_CHANGED');
 let detail=await call(b+'/tenancies/'+plan.id);assert.equal(String(detail.plan.lease_end).slice(0,10),date(60));offer=detail.offers[0];
 const canonicalLease=(await db.query('SELECT * FROM leases WHERE id=$1',[resident.lease_id])).rows[0];
 await call(b+'/tenancies/'+plan.id+'/offers/'+offer.id,{requestKey:key(),version:offer.version,action:'record',evidence:'',confirmed:true},admin,'POST',409);
 await call(b+'/tenancies/'+plan.id+'/offers/'+offer.id,{requestKey:key(),version:offer.version,action:'record',evidence:'Synthetic signed renewal reference R-1',confirmed:true});
 assert(!(await call('/api/resident-workflows',undefined,applicant)).offers.some((o:Row)=>'evidence_reference' in o));
 detail=await call(b+'/tenancies/'+plan.id);plan=detail.plan;assert.equal(String(plan.lease_end).slice(0,10),date(425));assert.deepEqual((await db.query('SELECT * FROM leases WHERE id=$1',[resident.lease_id])).rows[0],canonicalLease);
 console.log('PASS property operations: tenancy follow-ups, private proposal drafts, resident preference response and separately evidenced renewal recording preserve canonical lease evidence');

 let turnover={requestKey:key(),unitId:unit.id,expectedReadyOn:date(-1),ownerMembershipId:memberships[1],inspectionDone:false,repairsDone:false,cleaningDone:false,notes:'Prepare the unit.'};
 let turn=await call(b+'/turnovers',turnover);assert.equal(turn.status,'inspection');assert((await call('/api/operations/attention?kind=vacancy')).items.some((r:Row)=>r.id===turn.id));
 const listBody={requestKey:key(),unitId:unit.id,leadId:records.leadId,note:'Interested in this unit.'},entry=await call(b+'/waitlist',listBody,admin,'POST',201);assert.equal((await call(b+'/waitlist',listBody,admin,'POST',201)).id,entry.id);
 await call(b+'/waitlist/'+entry.id,{requestKey:key(),version:entry.version,action:'prepare'},admin,'POST',409);
 turn=await call(b+'/turnovers',{...turnover,requestKey:key(),version:turn.version,inspectionDone:true,repairsDone:true,cleaningDone:true});assert.equal(turn.status,'ready');
 assert((await call('/api/operations/attention?kind=waitlist')).items.some((r:Row)=>r.id===entry.id));
 await db.query("UPDATE units SET availability_verified_at=now()-interval '8 days' WHERE id=$1",[unit.id]);await call(b+'/waitlist/'+entry.id,{requestKey:key(),version:1,action:'prepare'},admin,'POST',409);await db.query('UPDATE units SET availability_verified_at=now() WHERE id=$1',[unit.id]);
 const prepare={requestKey:key(),version:1,action:'prepare'},draft=await call(b+'/waitlist/'+entry.id,prepare);assert.equal((await call(b+'/waitlist/'+entry.id,prepare)).draftId,draft.draftId);assert.equal((await db.query('SELECT status FROM conversation_messages WHERE id=$1',[draft.draftId])).rows[0].status,'draft');
 await db.query("UPDATE units SET status='reserved' WHERE id=$1",[unit.id]);
 const blockedSend=await call('/api/operations/inbox/'+draft.conversationId+'/drafts/'+draft.draftId+'/send',{version:1,confirmed:true},admin,'POST',409);assert.equal(blockedSend.code,'PROPERTY_WORKFLOW_CHANGED');
 await db.query("UPDATE units SET status='available' WHERE id=$1",[unit.id]);
 const sent=await call('/api/operations/inbox/'+draft.conversationId+'/drafts/'+draft.draftId+'/send',{version:1,confirmed:true});assert.equal(sent.status,'simulated');
 console.log('PASS property operations: turnover checklist and scoped prospect shortlist require ready, recently verified availability before one unsent follow-up draft');

 const candidates=await call(b+'/duplicates');const pair=candidates.items.find((p:Row)=>p.email==='operations@example.test');assert(pair);
 const pairPath=b+'/duplicates/'+pair.first_id+'/'+pair.second_id,before=(await call(pairPath)).contacts;
 const resolution={requestKey:key(),firstContactId:pair.first_id,secondContactId:pair.second_id,canonicalContactId:pair.first_id,resolution:'linked',reason:'Staff verified these synthetic inquiries refer to the same person.',confirmed:true};
 await call(b+'/duplicates',resolution,agent,'POST',403);const resolved=await call(b+'/duplicates',resolution);assert.equal((await call(b+'/duplicates',resolution)).id,resolved.id);
 const after=await call(pairPath);assert.deepEqual(after.contacts,before);assert.equal(after.review.resolution,'linked');assert(after.history.length);
 await call(pairPath,undefined,foreignAdmin,'GET',404);await call(b+'/duplicates',{...resolution,requestKey:key(),secondContactId:randomUUID()},admin,'POST',404);
 const ct=(await db.query('SELECT contact_id FROM leads WHERE id=$1',[records.leadId])).rows[0].contact_id;
 await db.query('INSERT INTO contact_property_links(organization_id,contact_id,property_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[orgs[0],ct,properties[1]]);await call(pairPath,undefined,agent,'GET',404);assert(!(await call(b+'/duplicates',undefined,agent)).items.some((r:Row)=>r.first_id===ct||r.second_id===ct));await db.query('DELETE FROM contact_property_links WHERE contact_id=$1 AND property_id=$2',[ct,properties[1]]);
 console.log('PASS property operations: reviewed duplicate links preserve identities, applications, conversations and independent consent; cross-property review is denied');

 const hours=[1,2,3,4,5].map(weekday=>({weekday,start:540,end:1020}));
 const due=(await db.query("SELECT ootla_response_deadline('2026-10-30T20:00:00Z','America/Toronto',120,$1::jsonb) AS value",[JSON.stringify(hours)])).rows[0].value;assert.equal(due.toISOString(),'2026-11-02T15:00:00.000Z');
 const policy={requestKey:key(),propertyId:properties[0],enabled:true,timeZone:'America/Toronto',windows:[0,1,2,3,4,5,6].map(weekday=>({weekday,start:0,end:1440})),responseMinutes:1,escalationMinutes:1,managerMembershipId:memberships[0]};
 await call(b+'/response-policies',policy,agent,'POST',403);await call(b+'/response-policies',{...policy,windows:[]},admin,'POST',400);
 await call(b+'/response-policies',{...policy,timeZone:'+05:00'},admin,'POST',409);
 const saved=await call(b+'/response-policies',policy);assert.equal((await call(b+'/response-policies',policy)).version,saved.version);
 await db.query("UPDATE conversation_messages SET created_at=now()-interval '1 hour' WHERE conversation_id=$1 AND direction='inbound'",[records.conversationId]);
 await db.query("UPDATE conversation_messages SET sent_at=now()-interval '2 hours' WHERE conversation_id=$1 AND direction='outbound' AND sent_at IS NOT NULL",[records.conversationId]);
 await db.query("UPDATE conversations SET response_due_at=NULL,snoozed_until=NULL,owner_membership_id=$2,status='open' WHERE id=$1",[records.conversationId,memberships[1]]);
 const queue=await call('/api/operations/attention?kind=inquiry&owner=mine');const escalated=queue.items.find((r:Row)=>r.id===records.conversationId);assert(escalated);assert.equal(escalated.urgency,0);assert.equal(escalated.action,'Review escalated reply');
 await db.query("UPDATE conversations SET response_due_at=now()+interval '1 day' WHERE id=$1",[records.conversationId]);assert.equal((await call('/api/operations/attention?kind=inquiry')).items.find((r:Row)=>r.id===records.conversationId).urgency,1);
 console.log('PASS property operations: business-hour response targets cross weekends and DST, escalate to the scoped manager, and preserve manual deadlines');

 plan=(await call(b+'/tenancies/'+plan.id)).plan;
 await call(b+'/tenancies/'+plan.id+'/move-out',{requestKey:key(),version:plan.version,action:'notice',moveOutOn:date(7),note:'Resident supplied a notice.',confirmed:true});plan=(await call(b+'/tenancies/'+plan.id)).plan;
 await call(b+'/tenancies/'+plan.id+'/move-out',{requestKey:key(),version:plan.version,action:'complete',moveOutOn:null,note:'Premature completion denied.',confirmed:true},admin,'POST',409);
 await call(b+'/tenancies/'+plan.id+'/move-out',{requestKey:key(),version:plan.version,action:'cancel_notice',moveOutOn:null,note:'Notice cancelled by resident.',confirmed:true});
 const {checkPropertyCollaboration}=await import('./property-collaboration-check.js');const collaborationRecords=await checkPropertyCollaboration(f,{orderId:order.id,unitId:unit.id,residentId:resident.id});
 // The browser fixture needs this same resident active until its journey completes.
 if(process.env.OOTLA_JOURNEY_BROWSER!=='operations'){
  plan=(await call(b+'/tenancies/'+plan.id)).plan;await call(b+'/tenancies/'+plan.id+'/move-out',{requestKey:key(),version:plan.version,action:'notice',moveOutOn:date(0),note:'Completed notice fixture.',confirmed:true});plan=(await call(b+'/tenancies/'+plan.id)).plan;
  const finish={requestKey:key(),version:plan.version,action:'complete',moveOutOn:null,note:'Keys returned; staff inspected departure.',confirmed:true};await call(b+'/tenancies/'+plan.id+'/move-out',finish);await call(b+'/tenancies/'+plan.id+'/move-out',finish);
  assert.equal((await call('/api/resident',undefined,applicant)).residents.length,0);assert.equal((await call('/api/resident-documents',undefined,applicant)).items.length,0);await call('/api/resident-documents/'+collaborationRecords.documentId+'/files/2',undefined,applicant,'GET',404);assert.equal((await call(b+'/vacancies/'+unit.id)).turnover.status,'inspection');assert.equal((await db.query('SELECT status FROM units WHERE id=$1',[unit.id])).rows[0].status,'available');
 }
 console.log('PASS property operations: reviewed move-out notice/cancellation and dated completion preserve source inventory and create a turnover handoff');
 return{collaborationRecords,orderId:order.id,unitId:unit.id,planId:plan.id,vendorId:vendor.id,firstContactId:pair.first_id,secondContactId:pair.second_id};
}
