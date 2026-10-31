import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium,expect as baseExpect} from '@playwright/test';

// Retained demo: authentication and authorized GETs only. Every business mutation is blocked.
const base='http://127.0.0.1:7673',expect=baseExpect.configure({timeout:12000});
const receiptPath='.local/ask-chat-browser-observations.json';
const before=createHash('sha256').update(await readFile(receiptPath)).digest('hex');
const groups=[],measurements=[],blocked=[],external=[],errors=[];let browser,page,phase='normal demo authentication',historyMode='fail',historyFailures=0,actualHistoryTotal=null,savedThreadVerified=false;
const pass=label=>{groups.push(label);console.log('PASS '+label);};
try {
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',timezoneId:'America/New_York'});
 await context.addInitScript(()=>{const viewport=window.visualViewport;if(!viewport)return;let fakeHeight=null;Object.defineProperty(viewport,'height',{configurable:true,get:()=>fakeHeight??innerHeight});Object.defineProperty(viewport,'offsetTop',{configurable:true,get:()=>0});window.__askSetVisualHeight=height=>{fakeHeight=height;viewport.dispatchEvent(new Event('resize'));viewport.dispatchEvent(new Event('scroll'));};});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(/^https?:$/.test(url.protocol)&&url.origin!==base){external.push(url.origin);return route.abort();}
  if(url.pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(request.method())&&url.pathname!=='/api/auth/login'){blocked.push(request.method()+' '+url.pathname);return route.abort();}
  if(request.method()==='GET'&&url.pathname==='/api/ask/threads') {
   if(historyMode==='fail'){historyFailures++;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'OWNED_HISTORY_FAILURE',message:'Conversations could not be loaded. Please retry.'}})});}
   if(historyMode==='prime-one-row') {
    const response=await route.fetch(),data=await response.json();assert.equal(response.status(),200);actualHistoryTotal=data.total;
    // A one-row network fixture uses real authorized records; no server data changes.
    historyMode='normal';return route.fulfill({response,json:{...data,items:data.items.slice(0,1),page:1,pageSize:1,totalPages:Math.max(1,Math.ceil(data.total))}});
   }
  }
  return route.continue();
 });
 page=await context.newPage();page.on('pageerror',issue=>errors.push(issue.message));
 assert.equal((await page.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{email:'admin@demo.ootla.test',password:'OotlaDemo!2026'}})).status(),200);
 await page.goto(base+'/admin/tasks');const launcher=page.locator('[data-ask-ootla]'),dialog=page.locator('#ask-ootla-dialog'),input=dialog.locator('#ask-question');await launcher.click();await input.fill('UNSENT_READ_ONLY_VIEWPORT_CHECK');
 phase='history failure and retry';await dialog.locator('[data-ask-history-toggle]').click();await expect(dialog.locator('[data-ask-history-error]')).not.toBeEmpty();await expect(dialog.locator('[data-ask-history-status]')).not.toContainText('Loading');await expect(dialog.locator('[data-ask-history-toggle]')).toBeEnabled();await dialog.locator('[data-ask-back]').click();await expect(input).toHaveValue('UNSENT_READ_ONLY_VIEWPORT_CHECK');
 historyMode='prime-one-row';await dialog.locator('[data-ask-history-toggle]').click();await expect(dialog.locator('[data-ask-history-status]')).not.toContainText('Loading');
 await expect.poll(()=>actualHistoryTotal).not.toBe(null);
 if(actualHistoryTotal>0) {
  await expect(dialog.locator('[data-ask-thread]')).toHaveCount(1);await dialog.locator('[data-ask-thread]').click();await expect(dialog).toHaveAttribute('data-ask-thread-id',/[a-f0-9-]+/);await expect(dialog.locator('[data-ask-pending]')).toBeHidden();await input.fill('UNSENT_SAVED_THREAD_VIEWPORT_CHECK');const savedId=await dialog.getAttribute('data-ask-thread-id'),messageIds=await dialog.locator('[data-ask-message-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.askMessageId));
  if(actualHistoryTotal>1) {
   await dialog.locator('[data-ask-history-toggle]').click();historyMode='fail';await dialog.locator('[data-ask-history="1"]').click();await expect(dialog.locator('[data-ask-history-error]')).not.toBeEmpty();await expect(dialog.locator('[data-ask-history-status]')).not.toContainText('Loading');await dialog.locator('[data-ask-back]').click();assert.equal(await dialog.getAttribute('data-ask-thread-id'),savedId);assert.deepEqual(await dialog.locator('[data-ask-message-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.askMessageId)),messageIds);await expect(input).toHaveValue('UNSENT_SAVED_THREAD_VIEWPORT_CHECK');savedThreadVerified=true;
  }
 }
 pass('History GET503 clears its loading label, reports failure and retains the draft; explicit retry works'+(savedThreadVerified?' and a saved thread survives a subsequent history failure':''));
 phase='fake visual viewport keyboard';await page.evaluate(()=>{window.__askSetVisualHeight(350);});
 await expect.poll(()=>dialog.evaluate(node=>Math.round(node.getBoundingClientRect().bottom))).toBeLessThanOrEqual(350);
 const fake=await dialog.boundingBox(),composer=await dialog.locator('[data-ask-question]').boundingBox(),textarea=await input.boundingBox();assert(fake&&composer&&textarea);for(const [label,box]of[['dialog',fake],['composer',composer],['textarea',textarea]])assert(box.y>=-1&&box.y+box.height<=350+1,label+' covered by simulated keyboard');assert(fake.height>=250,'Mobile keyboard leaves unusable chat');measurements.push({layout:'390x844-visible350',dialog:fake,composer});await mkdir('.local/screenshots',{recursive:true});await page.screenshot({path:'.local/screenshots/ask-chat-keyboard-viewport.png'});pass('At390×844 with350px visual viewport, chat and composer remain fully above the simulated keyboard');
 phase='actual smaller mobile viewport';await page.evaluate(()=>window.__askSetVisualHeight(null));await page.setViewportSize({width:390,height:450});await expect.poll(()=>dialog.evaluate(node=>Math.round(node.getBoundingClientRect().bottom))).toBeLessThanOrEqual(450);const small=await dialog.boundingBox(),smallComposer=await dialog.locator('[data-ask-question]').boundingBox();assert(small&&smallComposer&&small.y>=-1&&smallComposer.y>=-1&&smallComposer.y+smallComposer.height<=450+1);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));measurements.push({layout:'390x450',dialog:small,composer:smallComposer});pass('Actual390×450 mobile viewport keeps the composer visible without horizontal overflow');
 phase='close and desktop reset';await dialog.locator('[data-ask-close]').click();for(const property of ['--ask-visual-height','--ask-covered-bottom','--ask-window-gap'])assert.equal(await dialog.evaluate((node,key)=>node.style.getPropertyValue(key),property),'');await page.setViewportSize({width:1480,height:900});await launcher.click();await expect.poll(()=>dialog.evaluate(node=>Math.round(node.getBoundingClientRect().width))).toBe(420);assert.equal(await dialog.evaluate(node=>node.matches(':modal')),false);for(const property of ['--ask-visual-height','--ask-covered-bottom','--ask-window-gap'])assert.equal(await dialog.evaluate((node,key)=>node.style.getPropertyValue(key),property),'');const desktop=await dialog.boundingBox();assert(desktop&&desktop.height===640);measurements.push({layout:'desktop-reset',dialog:desktop});pass('Closing clears keyboard offsets; reopening desktop restores420×640 nonmodal layout');
 assert.deepEqual(blocked,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);assert.equal(createHash('sha256').update(await readFile(receiptPath)).digest('hex'),before,'Original eight-group receipt changed');
 await writeFile('.local/ask-chat-viewport-observations.json',JSON.stringify({verifiedAt:new Date().toISOString(),groups,measurements,historyFailures,actualHistoryTotal,savedThreadFailureVerified:savedThreadVerified,priorEightGroupReceiptUnchanged:true,retainedBusinessWrites:0,browserExceptions:0,externalRequests:0},null,2)+'\n');console.log('PASS '+groups.length+' narrow continuation groups; original8-group receipt unchanged.');
} catch(issue) {
 await writeFile('.local/ask-chat-viewport-failure.json',JSON.stringify({verifiedAt:new Date().toISOString(),phase,groups,measurements,errors,blocked,historyFailures,actualHistoryTotal},null,2)+'\n');if(page)await page.screenshot({path:'.local/screenshots/ask-chat-viewport-failure.png'}).catch(()=>undefined);console.error('Ask viewport continuation failed during '+phase+'. '+String(issue instanceof Error?issue.message:issue).slice(0,2500));process.exitCode=1;
} finally {await browser?.close();}
