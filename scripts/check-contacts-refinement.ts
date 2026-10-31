import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {withRenewalsPilotFixture} from './lib/renewals-pilot-fixture.js';
import {prepareDemoShowcase} from '../server/services/demo-showcase.js';
import {seedResidentDemo} from '../server/services/resident-demo.js';
const groups:string[]=[],pass=(text:string)=>{groups.push(text);console.log('PASS '+text);};
try {
 await withRenewalsPilotFixture(async f=>{
  const org=f.staff.organization.id,prefix='/api/property-foundation';
  const households=async()=>Number((await f.database.query('SELECT count(*)::int n FROM households')).rows[0].n);
  assert.equal(await households(),0);
  assert.equal((await prepareDemoShowcase(f.database,f.config)).changedRecords,0);assert.equal((await seedResidentDemo(f.database,f.config)).changedRecords,0);assert.equal(await households(),0);
  const resident=await f.json('/api/resident/leases','resident');assert(resident.items.length);assert((await f.json('/api/resident/leases/'+resident.items[0].relationshipId,'resident')).lease.contactName);
  pass('Fresh showcase/resident preparation creates no households, remains repeatable and keeps person-specific resident access operational.');
  const property=(await f.json(prefix+'/properties','staff','POST',{name:'Modal Court',address:'45 Preview Avenue',city:'Ottawa',type:'residential',groupId:null},201)).property;
  const lead=(await f.json('/api/leads','staff','POST',{propertyId:property.id,intent:'leasing',newContact:{displayName:'Contact Workflow Primary',email:'primary.contacts@example.test',phone:''}},201)).lead;
  const second=(await f.json(prefix+'/contacts','staff','POST',{displayName:'Contact Workflow Co-applicant',email:'co.contacts@example.test',phone:'',propertyIds:[property.id]},201)).contact;
  let app=await f.json('/api/applications','staff','POST',{leadId:lead.id},201);
  const appId=app.application.id;
  app=await f.json('/api/applications/'+appId+'/settings','staff','PUT',{version:app.application.version,coApplicantsEnabled:true,checklist:app.checklist.map((item:any)=>({id:item.id,label:item.label,required:false}))});
  app=await f.json('/api/applications/'+appId+'/participants','staff','POST',{contactId:second.id,email:second.email},201);
  assert.equal(app.participants.length,2);assert.equal(await households(),0);
  const co=app.participants.find((p:any)=>p.contactId===second.id);assert(co);
  const invitation=await f.json('/api/applications/'+appId+'/invitations','staff','POST',{participantId:co.id,expiresInHours:24},201);
  const token=new URLSearchParams(new URL(invitation.url,f.config.appUrl).hash.slice(1)).get('token');assert(token);
  const response=await f.raw('/api/applicant/invitations/accept','anonymous','POST',{token,password:'Contacts-Verification!2026'});assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie')?.split(';')[0];assert(cookie);f.cookies.set('coApplicant',cookie);
  const portalRoute='/api/applicant/applications/'+appId;let portal=await f.json(portalRoute,'coApplicant');
  portal=await f.json(portalRoute,'coApplicant','PATCH',{version:portal.participant.version,details:{...portal.participant.details,currentAddress:'A saved contact address',phone:'+1 202 555 0100',moveInDate:'2027-01-15'}});
  const resumed=await f.json(portalRoute,'coApplicant');assert.equal(resumed.participant.details.currentAddress,'A saved contact address');assert.equal(resumed.participant.role,'co_applicant');assert.equal(await households(),0);
  await f.json('/api/applications/'+appId+'/participants','foreign','POST',{contactId:second.id,email:second.email},404);
  pass('Applications and independently authorized co-applicants work through real invitation/session/save-resume services without household selection or automatic creation.');
  const appBefore=(await f.database.query('SELECT household_id FROM applications WHERE id=$1',[appId])).rows[0];assert.equal(appBefore.household_id,null);
  // Approved evidence is fixture-only; the actual staff lease service still enforces the decision.
  await f.database.query("UPDATE applications SET status='submitted' WHERE id=$1",[appId]);
  await f.database.query("INSERT INTO application_decisions(organization_id,application_id,decision,reason,actor_user_id,actor_membership_id,request_key)VALUES($1,$2,'approved','Owned fixture staff review',$3,$4,$5)",[org,appId,f.staff.id,f.staff.membershipId,randomUUID()]);
  const workflow=await f.json('/api/application-leases/'+appId+'/create','staff','POST',{requestKey:randomUUID(),startsOn:'2027-01-15',endsOn:'2028-01-14'});
  assert(workflow.workflow?.leaseId);const leaseRow=(await f.database.query('SELECT contact_id,application_id,lead_id,household_id FROM leases WHERE id=$1',[workflow.workflow.leaseId])).rows[0];
  assert.equal(leaseRow.contact_id,lead.contactId);assert.equal(leaseRow.application_id,appId);assert.equal(leaseRow.lead_id,lead.id);assert.equal(leaseRow.household_id,null);assert.equal(await households(),0);
  pass('Staff-approved managed lease creation preserves canonical contact/application/lead links and creates no household dependency.');
  const foundationApp=(await f.json(prefix+'/applications','staff','POST',{contactId:lead.contactId,propertyId:property.id,leadId:lead.id,status:'draft'},201)).application;
  const foundationLease=(await f.json(prefix+'/leases','staff','POST',{contactId:lead.contactId,propertyId:property.id,leadId:lead.id,applicationId:foundationApp.id,status:'draft',startsOn:'2027-01-15',endsOn:'2028-01-14'},201)).lease;
  assert(!('householdId' in foundationApp));assert(!('householdId' in foundationLease));
  // Historical rows are populated only as an owned preservation fixture, never by active workflows.
  const archived=randomUUID();await f.database.query("INSERT INTO households(id,organization_id,name)VALUES($1,$2,'Archived relationship')",[archived,org]);
  await f.database.query('INSERT INTO household_property_links(organization_id,household_id,property_id)VALUES($1,$2,$3)',[org,archived,property.id]);
  await f.database.query('INSERT INTO household_members(organization_id,household_id,contact_id)VALUES($1,$2,$3)',[org,archived,lead.contactId]);
  await f.database.query('UPDATE applications SET household_id=$2 WHERE id=$1',[foundationApp.id,archived]);await f.database.query('UPDATE leases SET household_id=$2 WHERE id=$1',[foundationLease.id,archived]);
  const archiveBefore=(await f.database.query('SELECT row_to_json(h)::text value FROM households h WHERE id=$1',[archived])).rows[0].value;
  await f.json(prefix+'/leases/'+foundationLease.id,'staff','PATCH',{endsOn:'2028-02-14'});await f.json(prefix+'/applications/'+foundationApp.id,'staff','PATCH',{status:'submitted'});
  assert.equal((await f.database.query('SELECT household_id FROM applications WHERE id=$1',[foundationApp.id])).rows[0].household_id,archived);assert.equal((await f.database.query('SELECT household_id FROM leases WHERE id=$1',[foundationLease.id])).rows[0].household_id,archived);
  assert.equal((await f.database.query('SELECT row_to_json(h)::text value FROM households h WHERE id=$1',[archived])).rows[0].value,archiveBefore);
  for(const method of ['GET','POST'])assert.equal((await f.raw(prefix+'/households','staff',method,method==='POST'?{name:'Retired'}:undefined)).status,404);
  await f.json(prefix+'/applications','staff','POST',{contactId:lead.contactId,propertyId:property.id,householdId:archived},400);
  const contact=await f.json(prefix+'/contacts/'+lead.contactId);assert(!('households' in contact));assert(contact.history.items.some((r:any)=>r.id===foundationApp.id));assert(contact.history.items.some((r:any)=>r.id===foundationLease.id));
  const metrics=await f.json('/api/admin/summary?page=contacts');assert.equal(metrics.metrics.length,4);assert(metrics.metrics.every((m:any)=>typeof m.value==='number'));assert(!JSON.stringify(metrics).toLowerCase().includes('household'));
  pass('Historical data stays intact, application/lease edits need no membership checks, retired APIs cannot create households and Contacts/history/metrics expose the contact model.');
  const analyst=await f.createStaff('analyst','read_only_analyst',[property.id]);
  await f.json(prefix+'/contacts/'+lead.contactId,'foreign','GET',undefined,404);await f.json(prefix+'/contacts','analyst','POST',{displayName:'Denied',propertyIds:[property.id]},403);
  const otherProperty=(await f.json(prefix+'/properties','staff','POST',{name:'Restricted Court',address:'Private lane',city:'Ottawa',type:'residential',groupId:null},201)).property;
  const other=(await f.json(prefix+'/contacts','staff','POST',{displayName:'Restricted Contact',propertyIds:[otherProperty.id]},201)).contact;
  await f.json(prefix+'/contacts/'+other.id,'analyst','GET',undefined,404);assert.equal((await f.json(prefix+'/properties?q=Restricted','analyst')).total,0);
  const countBefore=await households();for(let i=0;i<12;i++)await f.json(prefix+'/contacts','staff','POST',{displayName:'Pagination Contact '+i,email:'contact'+i+'@example.test',phone:'',propertyIds:[property.id]},201);
  assert.equal(await households(),countBefore);pass('Contact/property search and writes retain organization/property/role restrictions; ordinary contact creation does not create households.');
  if(process.argv.includes('--browser')){
   const web=await createServer({configFile:false,root:path.join(f.root,'client'),publicDir:path.join(f.root,'public'),envDir:false,envPrefix:[],server:{host:'127.0.0.1',port:0,proxy:{'/api':{target:f.apiBase,changeOrigin:false}}},logLevel:'error'});
   try{await web.listen();const address=web.httpServer?.address();assert(address&&typeof address!=='string');const base='http://127.0.0.1:'+address.port;Object.assign(f.config,{appUrl:base});
    const child=await promisify(execFile)(process.execPath,[path.join(f.root,'scripts/check-contacts-refinement-browser.mjs')],{cwd:f.root,windowsHide:true,timeout:180000,maxBuffer:1000000,env:{...process.env,OOTLA_CONTACT_UI_URL:base,OOTLA_CONTACT_UI_CONTEXT:JSON.stringify({email:f.config.demoAdminEmail,password:f.config.demoAdminPassword,analystEmail:analyst.email,propertyId:property.id,contactId:lead.contactId,leadId:lead.id,applicationId:appId})}});
    process.stdout.write(child.stdout);if(child.stderr)process.stderr.write(child.stderr);assert.equal(await households(),countBefore);
   }finally{await web.close();}
  }
  assert.equal(f.outsideRequests(),0);await writeFile('.local/contacts-refinement-service-observations.json',JSON.stringify({verifiedAt:new Date().toISOString(),groups,externalRequests:0,isolated:true},null,2)+'\n');
 });
}catch(e){const fail=e as{message?:string;stdout?:string;stderr?:string};if(fail.stdout)process.stdout.write(fail.stdout);if(fail.stderr)process.stderr.write(fail.stderr.slice(0,3000));console.error(String(fail.message??e).slice(0,1600));process.exitCode=1;}
