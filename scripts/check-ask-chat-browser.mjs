import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect as baseExpect} from '@playwright/test';

const base=process.env.OOTLA_ASK_CHAT_URL,fixture=JSON.parse(process.env.OOTLA_ASK_CHAT_CONTEXT||'{}'),expect=baseExpect.configure({timeout:15000});
assert(base);assert.equal(new URL(base).hostname,'127.0.0.1');assert(!['7673','7674','3100','3101'].includes(new URL(base).port));
assert(/^ootla_demo_showcase_[a-f0-9]{32}$/.test(process.env.OOTLA_ASK_CHAT_DATABASE??''));
const groups=[],errors=[],writes=[],blocked=[],external=[],requests=[],measurements=[],screenshots=[];
let browser,page,phase='initialization',failNextQuestion=false;
const pass=label=>{groups.push(label);console.log('PASS '+label);};
async function guardedContext(options={}) {
 const context=await browser.newContext({viewport:{width:1480,height:900},timezoneId:'America/New_York',reducedMotion:'reduce',...options});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(/^https?:$/.test(url.protocol)&&url.origin!==base){external.push(url.origin);return route.abort();}
  if(url.pathname.startsWith('/api/'))requests.push({method:request.method(),path:url.pathname});
  if(url.pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(request.method())) {
   const auth=['/api/auth/login','/api/auth/logout','/api/applicant/auth/login','/api/resident/auth/login'].includes(url.pathname);
   const ownedAsk=/^\/api\/ask\/threads(?:\/[a-f0-9-]+\/(?:messages|actions\/[a-f0-9-]+\/confirm))?$/.test(url.pathname);
   if(!auth&&!ownedAsk){blocked.push(request.method()+' '+url.pathname);return route.abort();}
   if(ownedAsk)writes.push(request.method()+' '+url.pathname);
   if(failNextQuestion&&url.pathname.endsWith('/messages')){failNextQuestion=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'OWNED_TEMPORARY_FAILURE',message:'Temporary connection issue. Please retry.'}})});}
  }
  return route.continue();
 });
 context.on('page',p=>p.on('pageerror',issue=>errors.push(issue.message)));
 return context;
}
const dialog=()=>page.locator('#ask-ootla-dialog');
const launcher=()=>page.locator('[data-ask-ootla]');
const historyRequests=()=>requests.filter(r=>r.method==='GET'&&r.path==='/api/ask/threads').length;
const read=async path=>{const response=await page.request.get(base+path);assert.equal(response.status(),200,path);return response.json();};
const shot=async name=>{await mkdir('.local/screenshots',{recursive:true});const file='.local/screenshots/ask-chat-'+name+'.png';await page.screenshot({path:file,fullPage:false});screenshots.push(file);};
async function assertWithinViewport(locator,label) {
 const box=await locator.boundingBox();assert(box,label+' missing bounding box');const viewport=page.viewportSize();assert(box.x>=-1&&box.y>=-1&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height+1,label+' outside viewport '+JSON.stringify(box));return box;
}
async function markChat() {
 return page.evaluate(()=>{window.__askChatMarker={document:document.documentElement,dialog:document.querySelector('#ask-ootla-dialog'),form:document.querySelector('[data-ask-question]'),textarea:document.querySelector('#ask-question'),scroll:document.querySelector('[data-ask-scroll]')};return{y:scrollY};});
}
async function assertChatIdentity(label) {
 assert(await page.evaluate(()=>{const m=window.__askChatMarker;return m&&m.document===document.documentElement&&m.dialog===document.querySelector('#ask-ootla-dialog')&&m.form===document.querySelector('[data-ask-question]')&&m.textarea===document.querySelector('#ask-question')&&m.scroll===document.querySelector('[data-ask-scroll]');}),label+' replaced document/chat/form/scroller');
}
async function finishAsk() {await expect(dialog().locator('[data-ask-pending]')).toBeHidden();await expect(dialog().locator('[data-ask-question] button[type=submit]')).toBeEnabled();}

try {
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await guardedContext();page=await context.newPage();
 assert.equal((await page.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{email:fixture.email,password:fixture.password}})).status(),200);
 phase='single staff launcher';
 for(const route of ['/admin','/admin/leads','/admin/properties','/admin/tasks?view=team&pageSize=1','/admin/calendar','/admin/reports']) {
  await page.goto(base+route);await expect(launcher()).toHaveCount(1);await expect(launcher()).toBeVisible();
  assert.equal(await page.locator('.admin-header [data-ask-ootla]').count(),0);
  const box=await assertWithinViewport(launcher(),'Launcher'),viewport=page.viewportSize();assert(box.x>viewport.width-100&&box.y>viewport.height-120,'Launcher is not bottom right');
 }
 pass('Six staff pages show exactly one bottom-right launcher and no header Ask button');
 phase='compact keyboard open and lazy history';
 await page.goto(base+'/admin/leads?propertyId='+fixture.propertyId);await expect(launcher()).toBeVisible();
 const historyBefore=historyRequests();await launcher().focus();await page.keyboard.press('Enter');
 await expect(dialog()).toBeVisible();await expect(dialog().locator('[data-ask-greeting]')).toContainText('How can I help today?');await finishAsk();
 assert.equal(historyRequests(),historyBefore,'History fetched before staff requested it');
 assert((await dialog().locator('[data-ask-prompt]').count())<=3,'Too many greeting suggestions');
 assert.equal(await dialog().evaluate(node=>node.matches(':modal')),false,'Desktop should be nonmodal');
 const desktop=await assertWithinViewport(dialog(),'Desktop chat');assert(desktop.width<=421&&desktop.height<=641,'Desktop chat is not compact');
 await assertWithinViewport(dialog().locator('[data-ask-question]'),'Desktop composer');
 assert(await dialog().evaluate(node=>{const scroll=node.querySelector('[data-ask-scroll]'),form=node.querySelector('[data-ask-question]');return scroll&&!scroll.contains(form);}), 'Composer belongs inside scrolling transcript');
 measurements.push({layout:'desktop',...desktop});await shot('desktop-greeting');
 await page.keyboard.press('Escape');await expect(dialog()).not.toBeVisible();await expect(launcher()).toBeFocused();
 pass('Keyboard opens a compact nonmodal desktop chat with pinned composer, three starters, lazy history and Escape focus return');
 phase='real owned question and failed draft';
 await launcher().click();const question=dialog().locator('[data-ask-question]'),input=question.locator('[name=message]');
 await input.fill('Summarize the outstanding work for this property.');await markChat();const originalScroll=await page.evaluate(()=>scrollY);
 failNextQuestion=true;await question.locator('button[type=submit]').click();await expect(dialog().locator('[data-ask-error]')).not.toBeEmpty();await expect(input).toHaveValue('Summarize the outstanding work for this property.');await finishAsk();await assertChatIdentity('Failed question');
 const priorQuestions=writes.filter(p=>p.endsWith('/messages')).length;await question.evaluate(form=>{form.requestSubmit();form.requestSubmit();});
 await expect(dialog().locator('[data-ask-message-id]')).toHaveCount(2);await finishAsk();assert.equal(writes.filter(p=>p.endsWith('/messages')).length-priorQuestions,1);await assertChatIdentity('Saved question');assert(Math.abs((await page.evaluate(()=>scrollY))-originalScroll)<5,'Question moved main page');
 await expect(dialog().locator('[data-ask-greeting]')).toBeHidden();
 const threadRequests=requests.filter(r=>r.method==='GET'&&/^\/api\/ask\/threads\/[a-f0-9-]+$/.test(r.path));assert(threadRequests.length,'No persisted thread loaded');
 const threadId=threadRequests.at(-1).path.split('/').at(-1);assert.equal((await read('/api/ask/threads/'+threadId)).messages.total,2);
 pass('Failed question retains draft; rapid retry persists one question and answer without document/chat replacement or page jump');
 phase='saved task confirmation remains functional';
 await input.fill('Create a follow-up task.');const details=question.locator('[data-ask-task-details]');await details.locator('summary').click();await details.locator('[name=taskTitle]').fill('OWNED_ASK_CHAT_REDESIGN_TASK');await details.locator('[name=taskDue]').fill(new Date(Date.now()+7*86400000).toISOString().slice(0,16));
 await question.locator('button[type=submit]').click();await expect(dialog().locator('[data-ask-confirm]')).toBeVisible();await finishAsk();
 await input.fill('UNSENT_CHAT_DRAFT_ACROSS_NAVIGATION');const confirmBefore=writes.filter(p=>p.endsWith('/confirm')).length;await dialog().locator('[data-ask-confirm]').evaluate(button=>{button.click();button.click();});await expect(dialog().getByRole('link',{name:'Open saved task',exact:true})).toBeVisible();await finishAsk();assert.equal(writes.filter(p=>p.endsWith('/confirm')).length-confirmBefore,1);assert.equal((await read('/api/tasks?q=OWNED_ASK_CHAT_REDESIGN_TASK&view=team&pageSize=25')).items.filter(t=>t.title==='OWNED_ASK_CHAT_REDESIGN_TASK').length,1);await expect(input).toHaveValue('UNSENT_CHAT_DRAFT_ACROSS_NAVIGATION');await assertChatIdentity('Task confirmation');
 pass('Existing explicit confirmation creates one real task only inside the owned fixture and preserves the next unsent question');
 phase='close reopen lazy history and staff navigation';
 await dialog().locator('[data-ask-close]').click();await expect(launcher()).toBeFocused();await launcher().click();await expect(input).toHaveValue('UNSENT_CHAT_DRAFT_ACROSS_NAVIGATION');await assertChatIdentity('Close/reopen');
 const beforeHistory=historyRequests();await dialog().locator('[data-ask-history-toggle]').click();await expect(dialog().locator('[data-ask-history-panel]')).toBeVisible();await expect.poll(historyRequests).toBeGreaterThan(beforeHistory);await expect(dialog().locator('[data-ask-thread]')).toHaveCount(1);await dialog().locator('[data-ask-back]').click();await expect(input).toHaveValue('UNSENT_CHAT_DRAFT_ACROSS_NAVIGATION');
 await details.locator('summary').click();
 const beforeFresh=writes.length;await dialog().locator('[data-ask-new]').click();await expect(dialog().locator('[data-ask-greeting]')).toBeVisible();await expect(input).toHaveValue('');assert.equal(writes.length,beforeFresh,'New conversation should wait for a message before saving');await dialog().locator('[data-ask-history-toggle]').click();await expect(dialog().locator('[data-ask-thread]')).toHaveCount(1);await dialog().locator('[data-ask-thread]').click();await expect(dialog().locator('[data-ask-message-id]')).toHaveCount(4);await expect(input).toHaveValue('UNSENT_CHAT_DRAFT_ACROSS_NAVIGATION');await finishAsk();
 for(const [name,route,selector] of [['Calendar','/admin/calendar','.vc-month'],['Reports','/admin/reports','[data-report-results]'],['Tasks','/admin/tasks','[data-task-results]']]) {
  const nav=page.locator('.admin-top-nav,.admin-sidebar').getByRole('link',{name,exact:true});if(name==='Tasks')await nav.first().evaluate(node=>node.href='/admin/tasks?view=team&pageSize=1');await nav.first().click();await expect(page.locator(selector)).toBeVisible();assert.equal(new URL(page.url()).pathname,route);await assertChatIdentity('Staff navigation to '+name);await expect(dialog()).toBeVisible();await expect(input).toHaveValue('UNSENT_CHAT_DRAFT_ACROSS_NAVIGATION');await expect(dialog().locator('[data-ask-message-id]')).toHaveCount(4);assert.equal(await launcher().count(),1);
 }
 await shot('desktop-conversation');pass('Close/reopen and explicit History retain thread/draft; Calendar, Reports and Tasks navigation preserve the same chat controller and conversation');
 phase='launcher does not cover pagination';
 await dialog().locator('[data-ask-close]').click();
 assert.equal(new URL(page.url()).searchParams.get('pageSize'),'1');
 const pager=page.locator('[data-table-pagination]').first();await pager.scrollIntoViewIfNeeded();await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
 const next=pager.getByRole('link',{name:'Next',exact:true});await expect(next).toBeVisible();
 assert(await next.evaluate(node=>{const r=node.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return top===node||node.contains(top);}), 'Launcher covers pagination');
 pass('Final table pagination remains visible and clickable above the floating launcher');
 phase='mobile fit and keyboard';
 await page.setViewportSize({width:390,height:844});await launcher().click();await expect(dialog()).toBeVisible();assert.equal(await dialog().evaluate(node=>node.matches(':modal')),true,'Mobile should contain dialog focus');
 const mobile=await assertWithinViewport(dialog(),'Mobile chat');await assertWithinViewport(question,'Mobile composer');await expect(input).toBeVisible();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile page overflows');
 measurements.push({layout:'mobile',...mobile});await page.keyboard.press('Tab');assert(await dialog().evaluate(node=>node.contains(document.activeElement)),'Mobile focus left dialog');await page.keyboard.press('Shift+Tab');assert(await dialog().evaluate(node=>node.contains(document.activeElement)),'Mobile backwards focus left dialog');await shot('mobile-conversation');
 await page.keyboard.press('Escape');await expect(dialog()).not.toBeVisible();await expect(launcher()).toBeFocused();await launcher().click();await expect(input).toHaveValue('UNSENT_CHAT_DRAFT_ACROSS_NAVIGATION');await dialog().locator('[data-ask-close]').click();
 await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));assert(await next.evaluate(node=>{const r=node.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return top===node||node.contains(top);}), 'Mobile launcher covers pagination');
 pass('390px mobile chat fits viewport with pinned composer, contained keyboard focus, retained draft and unobscured pagination');
 phase='logout cleanup and nonstaff absence';
 await page.setViewportSize({width:1480,height:900});await page.locator('[data-action=account-menu]').click();await page.locator('[data-action=logout]').click();await expect(page).toHaveURL(/\/admin\/login/);assert.equal(await launcher().count(),0);assert.equal(await dialog().count(),0);
 for(const route of ['/','/admin/login','/applicant/login','/resident/login']) {await page.goto(base+route);await expect(page.locator('main').first()).toBeVisible();assert.equal(await launcher().count(),0,route);assert.equal(await dialog().count(),0,route);}
 for(const kind of ['applicant','resident']) {
  const separate=await guardedContext(),portal=await separate.newPage();
  assert.equal((await portal.request.post(base+'/api/'+kind+'/auth/login',{headers:{Origin:base},data:{email:fixture[kind+'Email'],password:fixture[kind+'Password']}})).status(),200,kind+' normal auth');
  await portal.goto(base+'/'+kind);await expect(portal.locator('main').first()).toBeVisible();assert.equal(await portal.locator('[data-ask-ootla]').count(),0,kind);assert.equal(await portal.locator('#ask-ootla-dialog').count(),0,kind);await separate.close();
 }
 pass('Logout removes the chat; public, staff login, applicant and resident portals expose no staff launcher or dialog');
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
 await mkdir('.local',{recursive:true});await writeFile('.local/ask-chat-browser-observations.json',JSON.stringify({verifiedAt:new Date().toISOString(),groups,measurements,screenshots,ownedAskWrites:writes.length,retainedBusinessWrites:0,browserExceptions:errors.length,unexpectedMutations:blocked.length,externalRequestsBlocked:external.length},null,2)+'\n');
 console.log('PASS '+groups.length+' focused Ask chat groups. No retained business mutations.');
} catch(issue) {
 await mkdir('.local',{recursive:true});await writeFile('.local/ask-chat-browser-failure.json',JSON.stringify({verifiedAt:new Date().toISOString(),phase,groups,writes,errors,blocked,measurements,requests:requests.slice(-35)},null,2)+'\n');
 if(page)await page.screenshot({path:'.local/screenshots/ask-chat-failure.png',fullPage:false}).catch(()=>undefined);
 console.error('Ask chat failed during '+phase+'. '+String(issue instanceof Error?issue.message:issue).slice(0,3500));process.exitCode=1;
} finally {await browser?.close();}
