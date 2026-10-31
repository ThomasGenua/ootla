import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
const base=process.env.OOTLA_PROPERTIES_UI_URL,f=JSON.parse(process.env.OOTLA_PROPERTIES_UI_CONTEXT??'null');assert(base&&f);
let browser,page,phase='directory';const groups=[],errors=[],external=[],screenshots=[];
const pass=t=>{groups.push(t);console.log('PASS '+t);};
const within=async locator=>{const b=await locator.boundingBox(),v=page.viewportSize();assert(b&&v);assert(b.x>=-1&&b.y>=-1&&b.x+b.width<=v.width+1&&b.y+b.height<=v.height+1,JSON.stringify({box:b,viewport:v}));};
try {
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1480,height:950},timezoneId:'America/Toronto',reducedMotion:'reduce'});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(/^https?:$/.test(u.protocol)&&u.origin!==base){external.push(u.origin);return route.abort();}return route.continue();});
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const login=async(email=f.email)=>{assert.equal((await page.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{email,password:f.password}})).status(),200);};
 const json=async route=>{const response=await page.request.get(base+route);assert.equal(response.status(),200);return response.json();};
 await login();await page.goto(base+'/admin/properties');
 await expect(page.locator('.pw-directory-toolbar')).toBeVisible();
 assert.equal(await page.getByText('Search your portfolio',{exact:true}).count(),0);
 await expect(page.getByRole('button',{name:'Add a property',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Add a property group',exact:true})).toBeVisible();
 assert.equal(await page.locator('summary').filter({hasText:/^Add a property/}).count(),0);
 const searchBox=await page.locator('.pw-directory-search').boundingBox(),filterBox=await page.locator('[data-property-filters] summary').boundingBox();
 assert(searchBox&&filterBox&&filterBox.x>=searchBox.x+searchBox.width-1&&Math.abs(filterBox.y-searchBox.y)<4);
 const add=page.getByRole('button',{name:'Add a property',exact:true});await add.click();
 const propertyDialog=page.locator('#property-create-dialog');
 await expect(propertyDialog).toBeVisible();await propertyDialog.getByLabel('Property name',{exact:true}).fill('Preserved local draft');
 for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert(await page.evaluate(()=>!!document.activeElement.closest('#property-create-dialog')));}
 await page.keyboard.press('Escape');await expect(propertyDialog).not.toBeVisible();await expect(add).toBeFocused();
 await add.click();await expect(propertyDialog.getByLabel('Property name',{exact:true})).toHaveValue('Preserved local draft');
 await propertyDialog.getByRole('button',{name:'Close add a property',exact:true}).click();
 pass('Creation controls are real modal buttons; keyboard focus stays contained, Escape restores focus and closing preserves drafts.');

 phase='group persistence and error';await page.getByRole('button',{name:'Add a property group',exact:true}).click();
 const groupDialog=page.locator('#property-group-dialog');await groupDialog.getByLabel('Group name',{exact:true}).fill('Refinement modal group');
 const groupEndpoint='**/api/property-foundation/groups';
 const failGroup=route=>route.request().method()==='POST'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Please try again.',code:'TEMPORARY_FAILURE'})}):route.continue();
 await page.route(groupEndpoint,failGroup);await groupDialog.getByRole('button',{name:'Save group',exact:true}).click();
 await expect(groupDialog.locator('[data-form-error]')).not.toBeEmpty();await expect(groupDialog).toBeVisible();await expect(groupDialog.getByLabel('Group name',{exact:true})).toHaveValue('Refinement modal group');
 await page.unroute(groupEndpoint,failGroup);await groupDialog.getByRole('button',{name:'Save group',exact:true}).click();await expect(groupDialog).not.toBeVisible();await expect(page.locator('.pw-notice[role=status]')).toContainText('saved');
 const group=(await json('/api/property-foundation/groups')).items.find(g=>g.name==='Refinement modal group');assert(group);
 await page.getByRole('button',{name:'Add a property',exact:true}).click();
 await propertyDialog.getByLabel('Property name',{exact:true}).fill('Refinement modal property');
 await propertyDialog.getByLabel('City',{exact:true}).fill('Toronto');
 await propertyDialog.getByLabel('Street address',{exact:true}).fill('28 Preview Lane');
 await propertyDialog.getByLabel('Property group',{exact:true}).selectOption(group.id);
 let creates=0;page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/property-foundation/properties')creates++;});
 await propertyDialog.locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
 await expect(page.locator('.pw-record-name')).toHaveText('Refinement modal property');assert.equal(creates,1);
 const id=new URL(page.url()).searchParams.get('property');assert(id);
 const detail=await json('/api/property-foundation/properties/'+id);assert.equal(detail.property.group.id,group.id);assert.equal(detail.property.address,'28 Preview Lane');assert.equal(detail.units.total,0);
 assert.equal(await page.getByText('Property-system references',{exact:true}).count(),0);
 assert(!(await page.locator('[data-property-workspace]').textContent()).includes('Availability reflects the source'));
 assert(!(await page.locator('[data-property-workspace]').textContent()).includes('Each has its own identity'));
 pass('Group and property forms persist through the existing API; failed saves retain drafts and duplicate submissions are blocked.');

 phase='unit create and edit';await page.getByRole('button',{name:'Add a unit',exact:true}).click();let unitDialog=page.locator('#unit-editor-new');await expect(unitDialog).toBeVisible();
 await unitDialog.getByLabel('Unit label',{exact:true}).fill('201');await unitDialog.getByLabel('Bedrooms (0 for studio)',{exact:true}).fill('2');await unitDialog.getByLabel('Monthly rent amount',{exact:true}).fill('2350');
 await unitDialog.getByRole('button',{name:'Save unit',exact:true}).click();await expect(unitDialog).not.toBeVisible();
 await expect(page.locator('.pw-table tbody tr')).toHaveCount(1);let updated=await json('/api/property-foundation/properties/'+id);const unit=updated.units.items[0];assert.equal(unit.label,'201');assert.equal(unit.lastVerifiedAt,null);
 const unitButton=page.getByRole('button',{name:'Edit unit 201',exact:true});await unitButton.click();unitDialog=page.locator('#unit-editor-'+unit.id);await expect(unitDialog.getByLabel('Unit label',{exact:true})).toHaveValue('201');
 await unitDialog.getByLabel('Unit label',{exact:true}).fill('202');await unitDialog.getByLabel('Monthly rent amount',{exact:true}).fill('2400');await unitDialog.locator('[name=verifyAvailability]').check();
 const before=await page.evaluate(()=>{window.__propertiesDocumentId=crypto.randomUUID();return window.__propertiesDocumentId;});
 await unitDialog.getByRole('button',{name:'Save unit',exact:true}).click();await expect(page.getByRole('button',{name:'Edit unit 202',exact:true})).toBeVisible();
 assert.equal(await page.evaluate(()=>window.__propertiesDocumentId),before);updated=await json('/api/property-foundation/properties/'+id);assert.equal(updated.units.items[0].monthlyRent,2400);assert(updated.units.items[0].lastVerifiedAt);
 await page.reload();await expect(page.getByRole('button',{name:'Edit unit 202',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Availability evidence',exact:true})).toHaveCount(0);
 await page.screenshot({path:'.local/properties-refinement-detail-desktop.png',fullPage:true});screenshots.push('.local/properties-refinement-detail-desktop.png');
 pass('Unit creation/editing uses modals, survives refresh and preserves explicit availability verification and source evidence.');

 phase='compact filters and pagination';await page.goto(base+'/admin/properties?q=Refinement&page=2&pageSize=10&sort=name_desc');
 await expect(page.locator('tr[data-property-record]')).toHaveCount(4);const identity=await page.evaluate(()=>window.__propertiesDocumentId=crypto.randomUUID());
 await page.locator('[data-property-filters] summary').click();const filter=page.locator('#property-filter-panel');
 await filter.getByLabel('City',{exact:true}).fill('Toronto');await filter.getByLabel('Record source',{exact:true}).selectOption('local');
 const expected=await json('/api/property-foundation/properties?q=Refinement&city=Toronto&source=local&sort=name_desc&pageSize=10');
 await filter.getByRole('button',{name:'Apply filters',exact:true}).click();await expect(page.locator('tr[data-property-record]')).toHaveCount(expected.items.length);
 assert.deepEqual(await page.locator('tr[data-property-record]').evaluateAll(rows=>rows.map(row=>row.dataset.propertyRecord)),expected.items.map(p=>p.id));
 let query=new URL(page.url()).searchParams;assert.equal(query.get('page'),null);assert.equal(query.get('sort'),'name_desc');assert.equal(query.get('pageSize'),'10');await expect(page.locator('.pw-filter-chips')).toContainText('Toronto');
 assert.equal(await page.evaluate(()=>window.__propertiesDocumentId),identity);
 await page.locator('[data-property-filters] summary').click();await filter.getByLabel('City',{exact:true}).fill('Unsaved city');await filter.getByRole('button',{name:'Cancel',exact:true}).click();await page.locator('[data-property-filters] summary').click();await expect(filter.getByLabel('City',{exact:true})).toHaveValue('Toronto');await page.keyboard.press('Escape');
 await page.getByLabel('Search properties',{exact:true}).fill('28 Preview Lane');await page.locator('.pw-directory-search').getByRole('button',{name:'Search',exact:true}).click();
 await expect(page.locator('tr[data-property-record]')).toHaveCount(1);assert.equal(await page.locator('tr[data-property-record]').getAttribute('data-property-record'),id);
 await page.getByRole('link',{name:'Clear all',exact:true}).click();await expect(page.getByLabel('Search properties',{exact:true})).toHaveValue('');
 const size=page.getByLabel('Rows per page',{exact:true});await size.scrollIntoViewIfNeeded();await size.selectOption('25');const scrollBefore=await page.evaluate(()=>scrollY);
 await page.locator('[data-page-size-control]').getByRole('button',{name:'Apply',exact:true}).click();await expect.poll(()=>new URL(page.url()).searchParams.get('pageSize')).toBe('25');await expect(page.getByLabel('Rows per page',{exact:true})).toHaveValue('25');
 const resized=await json('/api/property-foundation/properties?pageSize=25&sort=name_desc');await expect(page.locator('tr[data-property-record]')).toHaveCount(resized.items.length);
 assert.equal(await page.evaluate(()=>window.__propertiesDocumentId),identity);assert(Math.abs((await page.evaluate(()=>scrollY))-scrollBefore)<400);
 await page.screenshot({path:'.local/properties-refinement-directory-desktop.png',fullPage:true});screenshots.push('.local/properties-refinement-directory-desktop.png');
 pass('Unified search and compact filters preserve server result scope/sort/page size, reset pagination, show active filters and update without a document reload.');

 phase='ownership and access';await page.goto(base+'/admin/properties?property='+f.ownedId);await page.getByRole('button',{name:'Edit unit Source 101',exact:true}).click();
 const locked=page.locator('#unit-editor-'+f.ownedUnitId);await expect(locked.getByLabel('Unit label',{exact:true})).toBeDisabled();await expect(locked.getByLabel('Availability status',{exact:true})).toBeDisabled();assert.equal(await locked.getByRole('button',{name:'Save unit',exact:true}).count(),0);
 await page.keyboard.press('Escape');await login(f.analystEmail);await page.goto(base+'/admin/properties');await expect(page.locator('tr[data-property-record]')).toHaveCount(1);assert.equal(await page.locator('[data-foundation-dialog-open]').count(),0);
 await page.goto(base+'/admin/properties?property='+f.authorizedId);await expect(page.locator('.pw-record-name')).toBeVisible();assert.equal(await page.locator('[data-foundation-dialog-open]').count(),0);
 assert.equal((await page.request.get(base+'/api/property-foundation/properties/'+id)).status(),404);
 await login();await page.goto(base+'/admin/contacts');await expect(page.locator('[data-property-workspace] h2').filter({hasText:'Contacts'})).toBeVisible();
 pass('Source-owned fields stay locked, server rejects overwrite/foreign access and read-only staff receive no creation/edit controls; Contacts still opens.');

 phase='mobile bounds';await page.setViewportSize({width:390,height:844});await page.goto(base+'/admin/properties');await expect(page.locator('.pw-directory-toolbar')).toBeVisible();
 const mobileSearch=await page.locator('.pw-directory-search').boundingBox(),mobileFilter=await page.locator('[data-property-filters] summary').boundingBox();assert(mobileSearch&&mobileFilter&&mobileFilter.x>=mobileSearch.x+mobileSearch.width-1);
 await page.locator('[data-property-filters] summary').click();await within(page.locator('#property-filter-panel'));assert(await page.locator('#property-filter-panel').evaluate(n=>getComputedStyle(n).overflowY==='auto'));await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Add a property',exact:true}).click();await expect(propertyDialog).toBeVisible();await within(propertyDialog);await propertyDialog.getByLabel('Street address',{exact:true}).fill('Mobile draft');
 for(let i=0;i<10;i++){await page.keyboard.press('Tab');assert(await page.evaluate(()=>!!document.activeElement.closest('#property-create-dialog')));}
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:'.local/properties-refinement-modal-mobile.png',fullPage:true});screenshots.push('.local/properties-refinement-modal-mobile.png');await page.keyboard.press('Escape');
 await page.goto(base+'/admin/properties?property='+id);await page.getByRole('button',{name:'Edit unit 202',exact:true}).click();await within(page.locator('#unit-editor-'+unit.id));await page.keyboard.press('Escape');
 await page.screenshot({path:'.local/properties-refinement-detail-mobile.png',fullPage:true});screenshots.push('.local/properties-refinement-detail-mobile.png');
 pass('Mobile search keeps Filters on the right, popovers scroll internally and property/unit modals fit the viewport with keyboard containment.');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await mkdir('.local',{recursive:true});await writeFile('.local/properties-refinement-browser-observations.json',JSON.stringify({verifiedAt:new Date().toISOString(),groups,errors,externalRequests:external.length,screenshots,isolated:true},null,2)+'\n');
} catch(e) {console.error('Properties refinement browser phase: '+phase);if(page)await page.screenshot({path:'.local/properties-refinement-failure.png',fullPage:true}).catch(()=>{});throw e;}
finally {await browser?.close();}
