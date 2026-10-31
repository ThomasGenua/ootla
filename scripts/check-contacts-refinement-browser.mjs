import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
const base=process.env.OOTLA_CONTACT_UI_URL,f=JSON.parse(process.env.OOTLA_CONTACT_UI_CONTEXT??'null');assert(base&&f);
let browser,page,phase='directory';const groups=[],errors=[],external=[],screenshots=[];
const pass=t=>{groups.push(t);console.log('PASS '+t);};
const within=async locator=>{const b=await locator.boundingBox(),v=page.viewportSize();assert(b&&v&&b.x>=-1&&b.y>=-1&&b.x+b.width<=v.width+1&&b.y+b.height<=v.height+1,JSON.stringify({b,v}));};
try {
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1480,height:950},timezoneId:'America/Toronto',reducedMotion:'reduce'});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(/^https?:$/.test(u.protocol)&&u.origin!==base){external.push(u.origin);return route.abort();}return route.continue();});
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const login=async(email=f.email)=>assert.equal((await page.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{email,password:f.password}})).status(),200);
 const json=async route=>{const response=await page.request.get(base+route);assert.equal(response.status(),200);return response.json();};
 await login();await page.goto(base+'/admin/contacts?propertyId='+f.propertyId+'&q=Pagination&page=2&pageSize=10');
 await expect(page.locator('tr[data-contact-record]')).toHaveCount(2);await expect(page.locator('[data-property-workspace] h2')).toHaveText('Contacts');
 assert(!/household/i.test(await page.locator('body').innerText()));assert.equal(await page.getByRole('heading',{name:'Search contacts',exact:true}).count(),0);
 await expect(page.getByRole('button',{name:'Find a property',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Add a contact',exact:true})).toBeVisible();assert.equal(await page.locator('.pw-identity-banner').count(),0);
 let documentId=await page.evaluate(()=>window.__contactsDocumentId=crypto.randomUUID());
 const search=page.getByRole('searchbox',{name:'Search contacts',exact:true});await search.fill('contact4@example.test');await page.locator('.pw-directory-search').getByRole('button',{name:'Search',exact:true}).click();
 await expect(page.locator('tr[data-contact-record]')).toHaveCount(1);assert.equal(new URL(page.url()).searchParams.get('page'),null);assert.equal(new URL(page.url()).searchParams.get('propertyId'),f.propertyId);assert.equal(new URL(page.url()).searchParams.get('pageSize'),'10');assert.equal(await page.evaluate(()=>window.__contactsDocumentId),documentId);
 await page.getByRole('link',{name:'Clear',exact:true}).click();await expect(search).toHaveValue('');
 const rows=page.getByLabel('Rows per page',{exact:true});await rows.scrollIntoViewIfNeeded();await rows.selectOption('25');const at=await page.evaluate(()=>scrollY);await page.locator('[data-page-size-control]').getByRole('button',{name:'Apply',exact:true}).click();await expect.poll(()=>new URL(page.url()).searchParams.get('pageSize')).toBe('25');
 const directory=await json('/api/property-foundation/contacts?pageSize=25');await expect(page.locator('tr[data-contact-record]')).toHaveCount(directory.items.length);assert.equal(await page.evaluate(()=>window.__contactsDocumentId),documentId);assert(Math.abs((await page.evaluate(()=>scrollY))-at)<400);
 pass('Contacts has compact modal buttons and one top search bar; authorized search resets pagination, retains scope/page size and updates without document reload.');

 phase='finder';await page.goto(base+'/admin/contacts?propertySearch=no-initial-property-match');await expect(page.locator('[data-property-workspace] h2')).toHaveText('Contacts');documentId=await page.evaluate(()=>window.__contactsDocumentId=crypto.randomUUID());await page.getByRole('button',{name:'Find a property',exact:true}).click();const finder=page.locator('#contact-property-dialog');
 await expect(finder).toBeVisible();await finder.getByRole('searchbox',{name:'Search accessible properties',exact:true}).fill('Modal Court');await finder.getByRole('button',{name:'Search',exact:true}).click();await expect(finder.locator('[data-contact-property-select]')).toHaveCount(1);await expect(finder.locator('[data-contact-property-status]')).toContainText('1 of 1');
 assert.equal(await page.evaluate(()=>window.__contactsDocumentId),documentId);
 await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Find a property',exact:true})).toBeFocused();await page.getByRole('button',{name:'Find a property',exact:true}).click();await expect(finder.getByRole('searchbox',{name:'Search accessible properties',exact:true})).toHaveValue('Modal Court');
 await finder.locator('[data-contact-property-select]').click();const editor=page.locator('#contact-create-dialog');await expect(editor).toBeVisible();await expect(finder).not.toBeVisible();await expect(editor.locator('[name=propertyIds]')).toHaveValue(f.propertyId);
 for(let i=0;i<10;i++){await page.keyboard.press('Tab');assert(await page.evaluate(()=>!!document.activeElement.closest('#contact-create-dialog')));}
 await editor.getByLabel('Full name',{exact:true}).fill('Sam Contacts');await editor.getByLabel('Email (optional)',{exact:true}).fill('sam.contacts@example.test');
 const endpoint='**/api/property-foundation/contacts',fail=route=>route.request().method()==='POST'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Please try again.',code:'TEMPORARY_FAILURE'})}):route.continue();
 await page.route(endpoint,fail);await editor.getByRole('button',{name:'Save contact',exact:true}).click();await expect(editor.locator('[data-form-error]')).not.toBeEmpty();await expect(editor.getByLabel('Full name',{exact:true})).toHaveValue('Sam Contacts');await expect(editor).toBeVisible();await page.unroute(endpoint,fail);
 await editor.getByRole('button',{name:'Save contact',exact:true}).click();await expect(page.locator('.pw-record-name')).toHaveText('Sam Contacts');const created=new URL(page.url()).searchParams.get('contact');assert(created);
 const saved=await json('/api/property-foundation/contacts/'+created);assert(saved.contact.propertyIds.includes(f.propertyId));assert.equal(saved.contact.email,'sam.contacts@example.test');assert(!('households' in saved));
 assert(!(await page.locator('[data-property-workspace]').innerText()).includes('A single identity across'));assert(!/household/i.test(await page.locator('body').innerText()));
 await page.reload();await expect(page.locator('.pw-record-name')).toHaveText('Sam Contacts');
 pass('Property finder searches in its modal and selects an authorized property for Add contact; contact drafts survive errors and successful creation persists.');

 phase='detail and canonical history';await page.goto(base+'/admin/contacts?contact='+f.contactId);
 await expect(page.locator('[data-contact-history=application]')).not.toHaveCount(0);
 await page.getByText('Edit contact details',{exact:true}).click();const edit=page.locator('[data-foundation-form]');await edit.getByLabel('Phone (optional)',{exact:true}).fill('+1 202 555 0199');await edit.getByRole('button',{name:'Save contact',exact:true}).click();await expect(page.locator('.pw-notice[role=status]')).toContainText('saved');assert.equal((await json('/api/property-foundation/contacts/'+f.contactId)).contact.phone,'+1 202 555 0199');
 await page.goto(base+'/admin/leads?lead='+f.leadId);await expect(page.locator('[data-lead-workspace]')).toBeVisible();assert(!/household/i.test(await page.locator('body').innerText()));await page.getByRole('button',{name:'Edit details',exact:true}).click();assert(!/household/i.test(await page.locator('#lead-edit-dialog').innerText()));await page.keyboard.press('Escape');
 await page.goto(base+'/admin/applications?application='+f.applicationId);await expect(page.getByRole('main')).toBeVisible();assert(!/household/i.test(await page.locator('body').innerText()));
 pass('Contact editing/history and linked Leads/Applications continue to work, with no household sections, navigation or creation controls.');

 phase='mobile';await page.setViewportSize({width:390,height:844});await page.goto(base+'/admin/contacts');await expect(page.getByRole('searchbox',{name:'Search contacts',exact:true})).toBeVisible();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:'.local/contacts-refinement-directory-mobile.png',fullPage:true});screenshots.push('.local/contacts-refinement-directory-mobile.png');
 await page.getByRole('button',{name:'Find a property',exact:true}).click();await within(finder);assert(await finder.locator('.pw-dialog-body').evaluate(n=>getComputedStyle(n).overflowY==='auto'));await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Add a contact',exact:true}).click();await within(editor);await editor.getByLabel('Full name',{exact:true}).fill('Retained mobile draft');await page.keyboard.press('Escape');await page.getByRole('button',{name:'Add a contact',exact:true}).click();await expect(editor.getByLabel('Full name',{exact:true})).toHaveValue('Retained mobile draft');
 await page.screenshot({path:'.local/contacts-refinement-modal-mobile.png',fullPage:true});screenshots.push('.local/contacts-refinement-modal-mobile.png');await page.keyboard.press('Escape');
 await page.setViewportSize({width:1480,height:950});await page.goto(base+'/admin/contacts');await expect(page.locator('.pw-directory-toolbar')).toBeVisible();await page.screenshot({path:'.local/contacts-refinement-directory-desktop.png',fullPage:true});screenshots.push('.local/contacts-refinement-directory-desktop.png');
 pass('Mobile search, property finder and creation modal fit the viewport, scroll internally and preserve drafts/keyboard behavior.');
 phase='read-only access';await login(f.analystEmail);await page.goto(base+'/admin/contacts');await expect(page.locator('[data-property-workspace] h2')).toHaveText('Contacts');assert.equal(await page.locator('[data-foundation-dialog-open]').count(),0);
 await page.getByRole('searchbox',{name:'Search contacts',exact:true}).fill('Restricted Contact');await page.locator('.pw-directory-search').getByRole('button',{name:'Search',exact:true}).click();await expect(page.getByRole('heading',{name:'No contacts found.',exact:true})).toBeVisible();
 pass('Read-only staff keep authorized search access without property/contact creation controls or restricted contact results.');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await writeFile('.local/contacts-refinement-browser-observations.json',JSON.stringify({verifiedAt:new Date().toISOString(),groups,errors,externalRequests:external.length,screenshots,isolated:true},null,2)+'\n');
}catch(e){console.error('Contacts refinement browser phase: '+phase);if(page)await page.screenshot({path:'.local/contacts-refinement-failure.png',fullPage:true}).catch(()=>{});throw e;}
finally{await browser?.close();}
