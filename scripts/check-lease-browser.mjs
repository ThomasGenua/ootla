import '../server/config/environment.js';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium,expect as baseExpect} from '@playwright/test';
const expect=baseExpect.configure({timeout:15000});
const base=new URL(process.env.OOTLA_CHECK_URL||'http://invalid.local'),retained=new URL(process.env.APP_URL||'http://127.0.0.1:7673'),scratch=process.env.OOTLA_CHECK_DATABASE||'';
assert(base.protocol==='http:'&&base.hostname==='127.0.0.1'&&base.port&&!['5173','7673','3100'].includes(base.port)&&base.origin!==retained.origin);
assert(/^ootla_demo_lease_browser_[a-f0-9]{32}$/.test(scratch));
const fixture=JSON.parse(process.env.OOTLA_APPLICANT_CONTEXT||'{}');assert(fixture.applicationId&&fixture.staffEmail&&fixture.staffPassword);
const browser=await chromium.launch({headless:true,channel:process.env.OOTLA_BROWSER_CHANNEL||'chrome'});
const outside=[],errors=[],requests=[];let groups=0,dropConfirmation=false,capturedToken='',dropMoveIn=false;
const pass=label=>{groups++;console.log('PASS '+label);},url=path=>new URL(path,base).href;
async function context(){
 const result=await browser.newContext({viewport:{width:1586,height:1000},reducedMotion:'reduce'});
 await result.route('**/*',async route=>{
  const target=new URL(route.request().url());
  if(/^https?:$/.test(target.protocol)&&target.origin!==base.origin){outside.push(target.origin+target.pathname);return route.abort();}
  if(target.pathname.endsWith('/handoff')&&route.request().method()==='POST'){const response=await route.fetch();if(response.ok()){const data=await response.json();capturedToken=new URL(data.url,base).hash.slice(7);}return route.fulfill({response});}
  if(dropConfirmation&&target.pathname==='/api/payment-demo/confirm'){dropConfirmation=false;const response=await route.fetch();assert.equal(response.status(),200);await response.dispose();return route.abort('failed');}
  if(dropMoveIn&&target.pathname.endsWith('/transition')&&route.request().postDataJSON()?.stage==='move_in_scheduled'){dropMoveIn=false;const response=await route.fetch();assert.equal(response.status(),200);await response.dispose();return route.abort('failed');}return route.continue();
 });
 result.on('page',page=>{page.setDefaultTimeout(30000);page.on('pageerror',issue=>errors.push(issue.message));page.on('request',request=>requests.push(request.method()+' '+request.url()));});return result;
}
const applicantContext=await context(),staffContext=await context(),applicant=await applicantContext.newPage(),staff=await staffContext.newPage();
const id=fixture.applicationId,applicantPath='/applicant?application='+id,staffPath='/admin/applications?application='+id,applicantApi='/api/applicant/application-payments/'+id,staffApi='/api/application-payments/'+id;
async function read(page,path){const response=await page.request.get(url(path));assert.equal(response.status(),200);return response.json();}
async function go(page,path,selector){await page.goto(url(path));await expect(page.locator(selector)).toBeVisible();}
async function portalAction(selector,button){
 const old=await applicant.locator('[data-applicant-workspace]').elementHandle();await applicant.locator(selector).getByRole('button',{name:button,exact:true}).click();await old.waitForElementState('hidden');await expect(applicant.locator('[data-applicant-workspace]')).toBeVisible();
}
async function paymentAction(page,action,button){
 const old=await page.locator('[data-payment-workspace]').elementHandle();await page.locator('[data-payment-action='+action+']').getByRole('button',{name:button,exact:true}).click();await old.waitForElementState('hidden');await expect(page.locator('[data-payment-workspace] [data-payment-success]')).toBeVisible();
}

const leaseApi='/api/application-leases/'+id;

async function leaseAction(action,button){const old=await staff.locator('[data-lease-workspace]').elementHandle();await staff.locator('[data-lease-action='+action+']').getByRole('button',{name:button,exact:true}).click();await old.waitForElementState('hidden');await expect(staff.locator('[data-lease-success]')).toBeVisible();return read(staff,leaseApi);}
async function decision(kind,reason){const form=staff.locator('[data-screening-action=decision]');await form.getByLabel('Staff decision',{exact:true}).selectOption(kind);await form.getByLabel('Reason and next steps',{exact:true}).fill(reason);await form.locator('[name=confirmed]').check();const old=await staff.locator('[data-screening-workspace]').elementHandle();await form.getByRole('button',{name:'Record staff decision',exact:true}).click();await old.waitForElementState('hidden');await expect(staff.locator('[data-screening-success]')).toBeVisible();}
async function transition(stage,kind='demo_event'){const form=staff.locator('[data-lease-action=transition]');await form.getByLabel('Next lease stage',{exact:true}).selectOption(stage);await form.getByLabel('Evidence type',{exact:true}).selectOption(kind);await form.getByLabel('Evidence reference and staff note',{exact:true}).fill('Synthetic '+kind+' evidence for '+stage+'.');await form.locator('[name=confirmed]').check();return leaseAction('transition','Record lease transition');}
try{
 await go(staff,'/admin/login','#login-form');await staff.getByLabel('Email address',{exact:true}).fill(fixture.staffEmail);await staff.getByLabel('Password',{exact:true}).fill(fixture.staffPassword);await expect(staff.getByRole('button',{name:/Sign in to your workspace/})).toBeEnabled();await staff.getByRole('button',{name:/Sign in to your workspace/}).click();await expect(staff).toHaveURL(url('/admin'));
 await go(staff,staffPath,'[data-lease-workspace]');assert.equal(await staff.getByRole('button',{name:'Create lease preparation',exact:true}).count(),0);
  await go(applicant,'/applicant/login','[data-applicant-form=login]');await expect(applicant.locator('#fill-demo-applicant')).toBeVisible();await applicant.locator('#fill-demo-applicant').click();await applicant.getByRole('button',{name:'Sign in',exact:true}).click();await expect(applicant).toHaveURL(url('/applicant'));
 await go(applicant,applicantPath,'[data-applicant-workspace]');
 const details=applicant.locator('[data-applicant-form=details]');
 await details.getByLabel('Full name',{exact:true}).fill('Demo Payment Applicant');await details.getByLabel('Phone number',{exact:true}).fill('+44 7700 900321');await details.getByLabel('Current address',{exact:true}).fill('Synthetic payment browser address');await details.getByLabel('Preferred move-in date',{exact:true}).fill('2027-02-15');
 await portalAction('[data-applicant-form=details]','Save details');
 for(const [index,item]of (await read(applicant,'/api/applicant/applications/'+id)).checklist.entries()){
  const selector='[data-applicant-form=upload][data-checklist-id="'+item.id+'"]';await applicant.locator(selector+' input[type=file]').setInputFiles({name:'synthetic-payment-'+index+'.txt',mimeType:'text/plain',buffer:Buffer.from('Invented synthetic application document. No actual identity or payment details.')});await portalAction(selector,'Upload document');
 }
 await applicant.locator('[data-applicant-form=consent] input[type=checkbox]').check();await portalAction('[data-applicant-form=consent]','Record my consent');
 await portalAction('[data-applicant-form=ready]','Mark my section ready');await applicant.locator('[data-applicant-form=submit] input[type=checkbox]').check();await portalAction('[data-applicant-form=submit]','Submit application');
 await go(staff,staffPath,'[data-lease-workspace]');
 const original=await read(staff,'/api/applications/'+id),contactId=original.primaryContact.id,leadId=original.application.leadId;assert.equal((await read(staff,leaseApi)).workflow,null,'Uploading documents does not create signature evidence or a lease.');
 await decision('request_information','Synthetic staff request: please verify your contact phone before review.');
 const reopen=staff.locator('[data-lease-action=reopen]');await expect(reopen).toBeVisible();await reopen.locator('[name=confirmed]').check();await leaseAction('reopen','Reopen applicant details');
 await go(applicant,applicantPath,'[data-applicant-workspace]');await expect(applicant.getByLabel('Phone number',{exact:true})).toBeEnabled();await applicant.getByLabel('Phone number',{exact:true}).fill('+44 7700 900322');await portalAction('[data-applicant-form=details]','Save details');await portalAction('[data-applicant-form=ready]','Mark my section ready');await applicant.locator('[data-applicant-form=submit] input[type=checkbox]').check();await portalAction('[data-applicant-form=submit]','Submit application');
 assert.equal((await read(applicant,'/api/applicant/applications/'+id)).checklist.filter(item=>item.document).length,2);
 pass('existing decision workflow requests information, explicitly reopens applicant edits and preserves documents, consent, identity and resubmission history');

 await go(staff,staffPath,'[data-lease-workspace]');await decision('approved','Synthetic authorized staff approval after review of the requested information.');
 await staff.getByText('Lease milestone and move-in task settings',{exact:true}).click();const settings=staff.locator('[data-lease-action=settings]');
 await settings.getByLabel('Leased milestone for new workflows',{exact:true}).selectOption('completed');
 const rows=settings.locator('[data-lease-task-row]');assert.equal(await rows.count(),2);
 await rows.nth(0).locator('[data-lease-task-title]').fill('Synthetic move-in welcome task');await rows.nth(0).locator('[data-lease-task-offset]').fill('-1');await rows.nth(1).locator('[data-lease-task-title]').fill('Synthetic key handover task');
 await leaseAction('settings','Save lease workflow settings');
 const create=staff.locator('[data-lease-action=create]');await create.getByLabel('Lease start date',{exact:true}).fill('2026-10-01');await create.getByLabel('Lease end date (optional)',{exact:true}).fill('2027-09-30');
 let current=await leaseAction('create','Create lease preparation');assert.equal(current.workflow.stage,'lease_preparation');assert.equal(current.workflow.leasedMilestone,'completed');
 const skipped=await staff.request.post(url(leaseApi+'/transition'),{headers:{Origin:base.origin},data:{requestKey:randomUUID(),stage:'fully_signed',evidence:{kind:'demo_event',reference:'Forbidden synthetic skip attempt'}}});assert.equal(skipped.status(),409);
 current=await transition('signature_requested','manual_attestation');assert.equal(current.workflow.stage,'signature_requested');current=await transition('partially_signed');assert.equal(current.workflow.stage,'partially_signed');current=await transition('fully_signed','manual_attestation');assert.equal(current.workflow.signatureEvidenceKind,'manual_attestation');assert.equal(current.workflow.stage,'fully_signed');assert.equal(current.workflow.residentCount,1);
 const beforeMilestone=await read(staff,'/api/lead-workspaces/'+leadId);assert.notEqual(beforeMilestone.leadDetail.lead.stage,'leased');assert.equal((await read(staff,'/api/applications/'+id)).primaryContact.id,contactId);
 await go(applicant,applicantPath,'[data-applicant-workspace]');assert((await read(applicant,'/api/applicant/applications/'+id)).nextSteps.some(step=>/fully signed/i.test(step)));
 pass('approval gates lease preparation; stage skip is denied; manual/demo evidence and resident contact are distinct while Leased waits for its configured milestone');

 const move=staff.locator('[data-lease-action=transition]');await move.getByLabel('Next lease stage',{exact:true}).selectOption('move_in_scheduled');await move.getByLabel('Evidence type',{exact:true}).selectOption('demo_event');await move.getByLabel('Evidence reference and staff note',{exact:true}).fill('Synthetic move-in arrangements confirmed for the property timezone.');await move.getByLabel('Move-in date and time',{exact:true}).fill('2026-10-22T09:30');await move.locator('[name=confirmed]').check();
 dropMoveIn=true;await move.getByRole('button',{name:'Record lease transition',exact:true}).click();await expect(move.locator('[data-lease-error]')).toContainText(/reach|connection|try again/i);
 current=await leaseAction('transition','Record lease transition');assert.equal(current.workflow.stage,'move_in_scheduled');assert.equal(current.propertyTimeZone,'Africa/Lagos');assert.equal(current.workflow.moveInAt,'2026-10-22T08:30:00.000Z');assert.equal(current.tasks.length,2);assert(current.tasks.every(task=>task.ownerName===null));assert.equal(new Set(current.tasks.map(task=>task.id)).size,2);await expect(staff.locator('[data-lease-workspace]')).toContainText('Unassigned');
 current=await transition('completed');assert.equal(current.workflow.stage,'completed');assert.equal(current.workflow.residentCount,1);assert.equal(current.tasks.length,2);
 const completeLead=await read(staff,'/api/lead-workspaces/'+leadId);assert.equal(completeLead.leadDetail.lead.stage,'leased');assert.equal(completeLead.leadDetail.lead.contactId,contactId);
 await go(applicant,applicantPath,'[data-applicant-workspace]');assert((await read(applicant,'/api/applicant/applications/'+id)).nextSteps.some(step=>/completed/i.test(step)));
 pass('property timezone resolves the exact instant; lost-response retry creates routed/unassigned tasks once; completion reaches Leased without duplicate resident identity');

 const task=current.tasks[0];await go(staff,'/admin/tasks?task='+task.id,'[data-task-workspace]');await expect(staff.getByRole('heading',{name:task.title,exact:true})).toBeVisible();
 const before=requests.filter(request=>request.includes('/api/application-leases/')).length;await go(staff,staffPath+'&preview=1','.ap-preview-banner');assert.equal(await staff.locator('[data-lease-workspace],[data-lease-action]').count(),0);assert.equal(requests.filter(request=>request.includes('/api/application-leases/')).length,before);
 await mkdir('.local/screenshots',{recursive:true});for(const width of [320,390,768,1586]){await staff.setViewportSize({width,height:1000});await go(staff,staffPath,'[data-lease-workspace]');await applicant.setViewportSize({width,height:1000});await go(applicant,applicantPath,'[data-applicant-workspace]');for(const page of [staff,applicant])assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(width===390)await staff.screenshot({path:'.local/screenshots/lease-390-isolated.png',fullPage:true});}
 assert.deepEqual(outside,[]);assert.deepEqual(errors,[]);
 pass('move-in task links open actual authorized tasks; preview stays read-only and four responsive widths fit without browser errors or outbound actions');console.log('Completed '+groups+' focused isolated Stage18 browser groups.');
}catch(issue){let message=String(issue?.stack||issue);for(const secret of [fixture.staffPassword,fixture.applicantPassword])if(secret)message=message.replaceAll(secret,'[redacted test secret]');console.error(message);console.error('Safe diagnostic: '+JSON.stringify({path:new URL(staff.url()).pathname,errors}));process.exitCode=1;}finally{await browser.close();}
