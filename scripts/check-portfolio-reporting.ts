import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {PortfolioReport,ReportingOptions} from '../shared/reporting-contracts.js';
import type {AskThreadDetail} from '../shared/conversation-contracts.js';
import {withConversationFixture} from './lib/conversation-fixture.js';
import {seedReportingFixture} from './lib/reporting-fixture.js';
let groups=0,phase='safe isolated reporting setup';const pass=(name:string)=>{groups++;console.log('PASS '+name);};
try{await withConversationFixture('api',async f=>{
 if(process.env.PORTFOLIO_DEBUG==='true'){const transaction=f.database.transaction.bind(f.database);f.database.transaction=async<T>(operation:(client:PoolClient)=>Promise<T>):Promise<T>=>transaction(async c=>{try{return await operation(c);}catch(issue){const pg=issue as{code?:string;constraint?:string;routine?:string;position?:string;message?:string};if(pg.code&&/^[A-Z0-9]{5}$/.test(pg.code))console.error('Scratch SQL diagnostic: '+pg.code+' '+(pg.constraint??'')+' '+(pg.routine??'')+' position '+(pg.position??'')+' parameter '+(pg.message?.match(/\$[0-9]+/)?.[0]??''));throw issue;}});}
 const fixture=await seedReportingFixture(f);
 if(process.env.PORTFOLIO_FIXTURE_ONLY==='true'){pass('controlled canonical lead, tour, application, task and synthetic lease-evidence relationships persist without provider calls');return;}
 const {base}=await f.start();
 const request=(route:string,cookie='',method='GET',body?:unknown,headers:Record<string,string>={})=>fetch(base+route,{method,redirect:'manual',headers:{...(cookie?{Cookie:cookie}:{}),...(method==='GET'?{}:{Origin:f.config.appUrl}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const json=async<T=Record<string,unknown>>(route:string,cookie='',method='GET',body?:unknown,status:number|number[]=200):Promise<T>=>{const response=await request(route,cookie,method,body);assert((Array.isArray(status)?status:[status]).includes(response.status),method+' '+route.split('?')[0]+' expected '+JSON.stringify(status)+'; received '+response.status);return response.json() as Promise<T>;};
 const deny=async(route:string,cookie='',method='GET',body?:unknown,status:number|number[]=[400,401,403,404,409,410])=>{const response=await request(route,cookie,method,body);assert((Array.isArray(status)?status:[status]).includes(response.status),'Expected denial for '+method+' '+route.split('?')[0]+'; received '+response.status);return response;};
 const login=async(email:string,password:string)=>{const response=await request('/api/auth/login','','POST',{email,password});assert.equal(response.status,200);const cookie=response.headers.get('set-cookie')??'';assert(/HttpOnly/i.test(cookie)&&/SameSite=Lax/i.test(cookie));return cookie.split(';')[0]!;};
 const admin=await login(f.staffEmail,f.adminPassword),foreign=await login(f.foreignEmail,f.adminPassword),analyst=await login(f.staff[2]!.email,f.staffPassword);
 const path='/api/portfolio-reporting',query=(extra:Record<string,string>={})=>new URLSearchParams({from:fixture.range.from,to:fixture.range.to,propertyId:fixture.propertyId,...extra}).toString();
 const report=(extra:Record<string,string>={},cookie=admin)=>json<PortfolioReport>(path+'?'+query(extra),cookie);

 if(process.env.PORTFOLIO_TOPOLOGY_ONLY==='true'){
  phase='report history topology authorization';
  const created=await json<AskThreadDetail>('/api/ask/threads',analyst,'POST',{requestKey:randomUUID(),context:{page:'/admin/reports',report:{from:fixture.range.from,to:fixture.range.to,groupId:fixture.groupId}}},[200,201]);
  const answered=await json<AskThreadDetail>('/api/ask/threads/'+created.thread.id+'/messages',analyst,'POST',{requestKey:randomUUID(),message:'How did this portfolio perform during the selected period?'},[200,201,202]);
  assert.equal(answered.messages.items.filter(m=>m.role==='assistant').at(-1)?.status,'completed');
  const before=await json<AskThreadDetail>('/api/ask/threads/'+created.thread.id,analyst);assert.equal(before.messages.total,2);
  await f.database.query("INSERT INTO leads(organization_id,property_id,display_name,email,status,intent,pipeline_stage,source) VALUES($1,$2,'Unrelated later inquiry','','new','leasing','new_inquiry','website')",[f.organizationId,fixture.propertyId]);
  assert.equal((await json<AskThreadDetail>('/api/ask/threads/'+created.thread.id,analyst)).messages.total,2);
  await f.database.query('INSERT INTO contact_property_links(organization_id,contact_id,property_id) VALUES($1,$2,$3)',[f.organizationId,fixture.leads.b.contact_id,fixture.otherPropertyId]);
  await f.database.query('INSERT INTO lead_property_interests(organization_id,lead_id,contact_id,property_id) VALUES($1,$2,$3,$4)',[f.organizationId,fixture.leads.b.id,fixture.leads.b.contact_id,fixture.otherPropertyId]);
  await deny('/api/ask/threads/'+created.thread.id,analyst,'GET',undefined,[403,404,409]);
  assert(!(await json<{items:Array<{id:string}>}>('/api/ask/threads',analyst)).items.some(t=>t.id===created.thread.id));

  const newer=await json<AskThreadDetail>('/api/ask/threads',analyst,'POST',{requestKey:randomUUID(),context:{page:'/admin/reports',report:{from:fixture.range.from,to:fixture.range.to,groupId:fixture.groupId}}},[200,201]);
  await f.database.query('DELETE FROM lead_property_interests WHERE organization_id=$1 AND lead_id=$2 AND property_id=$3',[f.organizationId,fixture.leads.b.id,fixture.otherPropertyId]);
  assert.equal((await json<AskThreadDetail>('/api/ask/threads/'+created.thread.id,analyst)).messages.total,2);
  await deny('/api/ask/threads/'+newer.thread.id,analyst,'GET',undefined,[403,404,409]);
  const firstPage=await json<{items:Array<{id:string}>;total:number;totalPages:number}>('/api/ask/threads?page=1&pageSize=1',analyst);
  assert.equal(firstPage.total,1);assert.equal(firstPage.totalPages,1);assert.equal(firstPage.items.length,1);assert.equal(firstPage.items[0]?.id,created.thread.id);
  const secondPage=await json<{items:Array<{id:string}>;total:number}>('/api/ask/threads?page=2&pageSize=1',analyst);assert.equal(secondPage.total,1);assert.equal(secondPage.items.length,0);
  pass('saved unscoped report history rechecks changed record-property relationships even when grants stay the same, while unrelated later inquiries preserve valid history and unauthorized threads are filtered before pagination');
  return;
 }

 phase='controlled period counts and true cohorts';await deny(path+'?'+query());
 const actual=await report();assert.deepEqual(actual.periodCounts,{leadsCreated:5,viewingsBooked:3,applicationsSubmitted:3,leasesVerified:1});assert.equal(actual.range.timeZone,'UTC');assert.equal(actual.range.fromInstant,'2026-10-01T00:00:00.000Z');assert.equal(actual.range.untilInstant,'2026-10-15T00:00:00.000Z');assert.equal(actual.range.cohortCutoff,'2026-10-15T00:00:00.000Z');
 const expected={lead_to_tour:[2,4],tour_to_application:[2,3],application_to_lease:[1,3]} as const;
 for(const cohort of actual.cohorts){const [numerator,denominator]=expected[cohort.key];assert.equal(cohort.numerator,numerator);assert.equal(cohort.denominator,denominator);assert(cohort.ratePercent!==null&&Math.abs(cohort.ratePercent-numerator/denominator*100)<0.02);assert(actual.definitions.some(d=>d.id===cohort.definitionId&&d.kind==='cohort_conversion'&&d.denominator&&d.dateBasis));}
 assert.equal(actual.provenance.providerVerified,0);assert.equal(actual.provenance.demoEvent,1);assert(actual.definitions.every(d=>d.source&&d.dateBasis&&d.included&&d.excluded&&d.limitation));assert(actual.limitations.length>0);
 const empty=await report({from:'2026-08-01',to:'2026-08-02'});assert.deepEqual(empty.periodCounts,{leadsCreated:0,viewingsBooked:0,applicationsSubmitted:0,leasesVerified:0});assert(empty.cohorts.every(c=>c.denominator===0&&c.ratePercent===null));
 for(const bad of ['from=2026-02-30&to=2026-03-02','from=2026-10-14&to=2026-10-01','from=2020-01-01&to=2026-10-14',query()+'&pageSize=101',query()+'&raw=true'])await deny(path+'?'+bad,admin,'GET',undefined,400);
 pass('native period counts match controlled records and distinct leasing cohorts use ordered exact relationships through the UTC cutoff, with null zero-denominator rates and explicit synthetic evidence');

 phase='current evidence validity';
 const beforeLease=(await f.database.query('SELECT updated_at FROM leases WHERE id=$1',[fixture.leases.leaseA])).rows[0].updated_at;
 await f.database.query("UPDATE leases SET updated_at=updated_at+interval '1 second' WHERE id=$1",[fixture.leases.leaseA]);const changed=await report();assert.equal(changed.periodCounts.leasesVerified,0);assert.equal(changed.cohorts.find(c=>c.key==='application_to_lease')?.numerator,0);await f.database.query('UPDATE leases SET updated_at=$2 WHERE id=$1',[fixture.leases.leaseA,beforeLease]);
 assert.equal((await report()).periodCounts.leasesVerified,1);const separate=await report({propertyId:fixture.otherPropertyId});assert.equal(separate.periodCounts.viewingsBooked,1);assert.equal(separate.cohorts.find(c=>c.key==='lead_to_tour')?.numerator,1);assert.equal(separate.cohorts.find(c=>c.key==='tour_to_application')?.denominator,0);

 await f.database.query('INSERT INTO contact_property_links(organization_id,contact_id,property_id) VALUES($1,$2,$3)',[f.organizationId,fixture.leads.old.contact_id,fixture.otherPropertyId]);
 await f.database.query('INSERT INTO lead_property_interests(organization_id,lead_id,contact_id,property_id) VALUES($1,$2,$3,$4)',[f.organizationId,fixture.leads.old.id,fixture.leads.old.contact_id,fixture.otherPropertyId]);
 const secondaryViewing=(await f.database.query("INSERT INTO viewings(organization_id,property_id,lead_id,starts_at,status,created_at) VALUES($1,$2,$3,'2026-10-09T12:00:00Z','scheduled','2026-10-08T12:00:00Z') RETURNING id",[f.organizationId,fixture.otherPropertyId,fixture.leads.old.id])).rows[0].id;
 assert.equal((await report({propertyId:fixture.otherPropertyId})).periodCounts.viewingsBooked,2);
 assert.equal((await report()).periodCounts.viewingsBooked,3);
 await f.database.query('DELETE FROM viewings WHERE id=$1',[secondaryViewing]);
 await f.database.query('DELETE FROM lead_property_interests WHERE organization_id=$1 AND lead_id=$2 AND property_id=$3',[f.organizationId,fixture.leads.old.id,fixture.otherPropertyId]);
 pass('lease evidence must still match the current canonical lease version; cancelled bookings and no-show versus completed tours follow their published distinct definitions');

 phase='organization and authorized filters';
 await json(path+'/regions',admin,'PUT',{requestKey:randomUUID(),propertyId:fixture.propertyId,region:'Controlled North'});await json(path+'/regions',admin,'PUT',{requestKey:randomUUID(),propertyId:fixture.otherPropertyId,region:'Controlled South'});
 for(const extra of [{groupId:fixture.groupId},{region:'Controlled North'},{agentMembershipId:f.staffMembershipId},{teamId:fixture.teamId}] as Array<Record<string,string>>)assert.deepEqual((await report(extra)).periodCounts,actual.periodCounts);
 assert.equal((await report({agentMembershipId:f.staff[0]!.membershipId})).periodCounts.leadsCreated,0);
 await deny(path+'?'+query({propertyId:f.foreignPropertyId}),admin,'GET',undefined,[403,404]);await deny(path+'?'+query(),foreign,'GET',undefined,[403,404]);await deny(path+'/regions',analyst,'PUT',{requestKey:randomUUID(),propertyId:fixture.propertyId,region:'Denied'},403);
 assert.deepEqual((await report({},analyst)).periodCounts,actual.periodCounts);
 await f.database.query('INSERT INTO contact_property_links(organization_id,contact_id,property_id) VALUES($1,$2,$3)',[f.organizationId,fixture.leads.b.contact_id,fixture.otherPropertyId]);
 await f.database.query('INSERT INTO lead_property_interests(organization_id,lead_id,contact_id,property_id) VALUES($1,$2,$3,$4)',[f.organizationId,fixture.leads.b.id,fixture.leads.b.contact_id,fixture.otherPropertyId]);
 const scoped=await report({},analyst);assert.equal(scoped.periodCounts.leadsCreated,4);assert.equal(scoped.cohorts.find(c=>c.key==='lead_to_tour')?.denominator,3);
 await f.database.query('DELETE FROM lead_property_interests WHERE organization_id=$1 AND lead_id=$2 AND property_id=$3',[f.organizationId,fixture.leads.b.id,fixture.otherPropertyId]);
 pass('property, group, configured region, agent and team filters stay server-side and organization scoped; every additional lead interest must remain authorized before aggregation');

 phase='current pipeline, follow-up and workload facts';
 const follow=await report({view:'follow_ups'}),workload=await report({view:'workload'}),pipeline=await report({view:'pipeline'}),applications=await report({view:'applications'}),sources=await report({view:'sources'});
 assert.equal(follow.followUp.unassignedOpenTasks,1);assert(follow.followUp.overdueLeadCount>=2);assert(follow.followUp.loggedLeadCount>=1);assert(follow.followUp.averageFirstLoggedHours!==null&&Math.abs(follow.followUp.averageFirstLoggedHours-2)<0.01);
 for(const data of [follow,workload,pipeline,applications,sources]){assert(data.table.columns.length>0);assert.equal(data.table.page,1);assert(data.table.items.length<=data.table.pageSize);assert(data.table.items.every(row=>!JSON.stringify(row).includes('PRIVATE_REPORTING_NOTE_NEVER_EXPORTED')));}
 assert(follow.table.items.some(row=>row.label==='Controlled lead two'));assert(workload.table.items.some(row=>Object.values(row.values).includes(1)||Object.values(row.values).includes(2)));
 assert(sources.table.items.some(row=>row.label==='website'));assert(applications.table.items.some(row=>row.id===fixture.applications.applicationC));
 const attention=await report({view:'applications',attention:'missing_documents'});assert(attention.table.items.some(row=>row.id===fixture.applications.applicationC));assert.deepEqual(attention.periodCounts,actual.periodCounts);
 pass('pipeline, attribution, native follow-up timing, staff workload and missing-document attention use current real records while retaining separate period summaries');

 phase='bounded large-list pagination and safe export';
 await f.database.query("INSERT INTO properties(organization_id,name,address,city,source_system) SELECT $1,'Stage23 page marker '||lpad(n::text,3,'0'),'Synthetic volume address','Synthetic city','demo' FROM generate_series(1,43)n",[f.organizationId]);
 const allQuery=new URLSearchParams({from:fixture.range.from,to:fixture.range.to,q:'Stage23 page marker',page:'5',pageSize:'10'});
 const last=await json<PortfolioReport>(path+'?'+allQuery,admin);assert.equal(last.table.total,43);assert.equal(last.table.items.length,3);assert.equal(last.table.totalPages,5);assert(last.table.items.every(r=>r.label.startsWith('Stage23 page marker')));
 const options=await json<ReportingOptions>(path+'/options?q=Stage23%20page%20marker&page=2&pageSize=10',admin);assert.equal(options.properties.total,43);assert.equal(options.properties.items.length,10);assert(options.properties.items.every(p=>p.name.startsWith('Stage23 page marker')));
 const exported=await request(path+'/export?'+query(),admin);assert.equal(exported.status,200);assert.match(exported.headers.get('content-type')??'',/text\/csv/);assert.match(exported.headers.get('content-disposition')??'',/attachment/);const csv=await exported.text();assert(csv.includes("'=SUM(1,2)"));assert(!csv.includes('PRIVATE_REPORTING_NOTE_NEVER_EXPORTED'));assert(!csv.includes('reporting@example.test'));
 await deny(path+'/export?'+query(),analyst,'GET',undefined,403);
 pass('server search and pagination return only bounded property pages; permission-controlled CSV neutralizes formula cells and excludes private identity and staff-note content');

 phase='Ask Ootla exact report facts and history revocation';
 const askContext={page:'/admin/reports',propertyId:fixture.propertyId,report:{from:fixture.range.from,to:fixture.range.to,groupId:fixture.groupId,region:'Controlled North',agentMembershipId:f.staffMembershipId,teamId:fixture.teamId}};
 const threadRequest={requestKey:randomUUID(),context:askContext};const thread=await json<AskThreadDetail>('/api/ask/threads',analyst,'POST',threadRequest,[200,201]);const reordered={requestKey:threadRequest.requestKey,context:{report:{teamId:fixture.teamId,agentMembershipId:f.staffMembershipId,region:'Controlled North',groupId:fixture.groupId,to:fixture.range.to,from:fixture.range.from},propertyId:fixture.propertyId,page:'/admin/reports'}};assert.equal((await json<AskThreadDetail>('/api/ask/threads',analyst,'POST',reordered,[200,201])).thread.id,thread.thread.id);const unscoped=await json<AskThreadDetail>('/api/ask/threads',analyst,'POST',{requestKey:randomUUID(),context:{page:'/admin/reports',report:{from:fixture.range.from,to:fixture.range.to,groupId:fixture.groupId}}},[200,201]);
 assert.deepEqual(thread.thread.context.report,askContext.report);
 const response=await json<AskThreadDetail>('/api/ask/threads/'+thread.thread.id+'/messages',analyst,'POST',{requestKey:randomUUID(),message:'How did this property perform during the selected period?'},[200,201,202]);
 const answer=response.messages.items.filter(m=>m.role==='assistant').at(-1);assert(answer);assert.equal(answer.status,'completed');assert(answer.body.includes(fixture.range.from)&&answer.body.includes(fixture.range.to));assert.match(answer.body,/5/);assert.match(answer.body,/3/);assert.match(answer.body,/1/);assert(answer.sources.some(s=>s.url.startsWith('/admin/reports?')&&s.url.includes(fixture.propertyId)&&s.url.includes('from=2026-10-01')&&s.verifiedAt));
 await deny('/api/ask/threads/'+thread.thread.id,foreign,'GET',undefined,404);
 await f.database.query('DELETE FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=$3',[f.organizationId,f.staff[2]!.membershipId,fixture.propertyId]);
 await deny(path+'?'+query(),analyst,'GET',undefined,[403,404]);await deny('/api/ask/threads/'+thread.thread.id,analyst,'GET',undefined,[403,404]);await deny('/api/ask/threads/'+unscoped.thread.id,analyst,'GET',undefined,[403,404]);assert(!(await json<{items:Array<{id:string}>}>('/api/ask/threads',analyst)).items.some(t=>t.id===thread.thread.id||t.id===unscoped.thread.id));
 pass('Ask Ootla preserves the exact report dates and filters, links the same canonical results and refuses old report history after current property authorization is revoked');
});console.log('Stage 23 portfolio reporting verification passed ('+groups+' focused groups).');}catch(issue){console.error('Portfolio reporting verification failed during '+phase+'.');console.error(issue instanceof Error?issue.message:'Unknown verification issue.');process.exitCode=1;}
