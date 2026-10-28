import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect as baseExpect} from '@playwright/test';

// Read-only CRM smoke check for two already-running, deliberately separate runtimes.
// The only writes are ordinary authentication/session audit records and local evidence.
const localOrigin=(value)=>{const u=new URL(value);assert.equal(u.protocol,'http:','Use an owned local HTTP runtime.');assert(['localhost','127.0.0.1','[::1]'].includes(u.hostname),'Use an owned loopback runtime.');assert(u.port&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash,'Use a bare local origin.');return u.origin;};
const live=localOrigin(process.env.OOTLA_LIVE_CHECK_URL||'http://localhost:7674');
const demo=localOrigin(process.env.OOTLA_DEMO_CHECK_URL||'http://127.0.0.1:7673');
assert.notEqual(live,demo,'Two separate application origins are required.');
const allowed=new Set([live,demo]);
const read=async(origin,path,options={})=>{assert(allowed.has(origin));return fetch(origin+path,{...options,redirect:'manual',signal:AbortSignal.timeout(15000)});};
const expect=baseExpect.configure({timeout:15000});
const paths=['/','/platform','/ai-workflows','/integrations','/workflows/leasing','/workflows/resident-support','/contact','/privacy'];
let phase='runtime readiness',groups=0,external=0,loginCalls=0;
const errors=[],privateValues=[];
const observations={live,demo,groups:[],externalRequestsBlocked:0,browserExceptions:0,screenshots:[],completedAt:null};
const pass=(description)=>{groups++;observations.groups.push(description);console.log('PASS '+description);};
const assertStatus=(response,status)=>assert.equal(response.status,status,'Unexpected HTTP status for '+phase+'.');
let browser;
const contexts=[];
const evidence='.local/screenshots';
const take=async(page,name)=>{const filename=evidence+'/live-demo-'+name+'.png';await page.screenshot({path:filename,fullPage:true});observations.screenshots.push(filename);};
const layout=async(page)=>{await expect(page.locator('main')).toBeVisible();await page.evaluate(()=>document.fonts.ready.then(()=>true));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Unintended page horizontal overflow.');};
const fresh=async(origin)=>{const context=await browser.newContext({viewport:{width:1586,height:1050},reducedMotion:'reduce'});contexts.push(context);await context.route('**/*',route=>{const u=new URL(route.request().url());if(!['http:','https:'].includes(u.protocol)||u.origin===origin)return route.continue();external++;return route.abort();});const p=await context.newPage();p.on('pageerror',()=>errors.push('Browser exception'));p.on('request',request=>{if(new URL(request.url()).pathname==='/api/auth/login')loginCalls++;});return p;};
try{
 await mkdir(evidence,{recursive:true});
 for(const origin of [live,demo]){const response=await read(origin,'/api/health');assertStatus(response,200);assert.equal((await response.json()).database,'ready','Application database is not ready.');}
 const configs=[];
 for(const [origin,enabled]of [[live,false],[demo,true]]){
  let response=await read(origin,'/api/public-access');assertStatus(response,200);assert.equal((await response.json()).demoAccess,enabled,'Server access presentation does not match its runtime.');
  response=await read(origin,'/api/config');assertStatus(response,200);const config=await response.json();configs.push(config);for(const account of [config.demoCredentials,config.standaloneDemoCredentials])if(account)for(const value of Object.values(account))if(typeof value==='string'&&value)privateValues.push(value);assert.equal(config.databaseReady,true);assert.equal(config.appUrl,origin);assert.equal(config.demoEnabled,enabled);assert.equal(Boolean(config.demoCredentials),enabled);assert.equal(Boolean(config.standaloneDemoCredentials),enabled);
  for(const endpoint of ['/api/applicant/config','/api/resident/config']){response=await read(origin,endpoint);assertStatus(response,200);const portal=await response.json();assert.equal(portal.demoEnabled,enabled,'Portal demo availability crossed a runtime boundary.');assert.equal(Boolean(portal.demoCredentials),enabled,'Portal demo credentials crossed a runtime boundary.');}
  for(const endpoint of ['/api/auth/me','/api/admin/overview','/api/leads','/api/tasks'])assertStatus(await read(origin,endpoint),401);
 }
 pass('two ready databases expose only their own access configuration; staff and both portal fill credentials are absent from live and present in demo, with private APIs protected');
 phase='fixed entry redirects';
 for(const origin of [live,demo]){const r=await read(origin,'/try');assertStatus(r,302);assert.equal(new URL(r.headers.get('location'),origin).href,origin+'/admin/login','Entry must stay within its own application.');assert.match(r.headers.get('cache-control')||'',/no-store/);assert.equal(r.headers.get('set-cookie'),null);}
 pass('live and demo entry redirects stay on their own sign-in pages, without a session or demo bypass');
 browser=await chromium.launch({channel:process.env.OOTLA_BROWSER_CHANNEL||'chrome',headless:true});
 phase='eight initial documents and browser routes';
 for(const [origin,enabled,name]of [[live,false,'live'],[demo,true,'demo']]){
  const p=await fresh(origin);
  for(const path of paths){
   phase=name+' initial document '+path;
   const response=await read(origin,path);assertStatus(response,200);const html=await response.text();
   const serverLabels=[...html.matchAll(/<span data-public-access-label>([^<]*)<\/span>/g)].map(m=>m[1]);assert(serverLabels.length>0,'Initial HTML must contain the public access controls.');assert(serverLabels.every(label=>label===(enabled?'Explore demo':'Sign in')),'Initial HTML advertised the other runtime access.');
   assert.equal(/href="\/try"/.test(html),enabled,'Initial HTML contains the wrong entry destination.');
   if(!enabled)assert(!/explore demo|try ootla|fill (?:demo|preview) credentials/i.test(html),'Live initial HTML contains demo entry copy.');
   phase=name+' browser route '+path;await p.goto(origin+path,{waitUntil:'domcontentloaded'});await expect(p.locator('main h1')).toBeVisible();
   const ctas=p.locator('[data-public-access-label]');await expect(ctas.first()).toHaveText(enabled?'Explore demo':'Sign in');const labels=await ctas.allTextContents();assert(labels.every(label=>label===(enabled?'Explore demo':'Sign in')),'A client-rendered access control crossed runtime presentation.');
   assert.equal(await p.locator('a[href="/try"]').count()>0,enabled,'A client-rendered entry destination crossed runtime presentation.');
   if(!enabled)assert(!/explore demo|try ootla|fill (?:demo|preview) credentials/i.test(await p.locator('body').innerText()),'Live browser contains demo entry copy.');
   await p.setViewportSize({width:390,height:1050});await layout(p);await p.setViewportSize({width:1586,height:1050});
  }
  phase=name+' public keyboard and layout';await p.goto(origin+'/');await layout(p);await take(p,name+'-home-desktop');await p.setViewportSize({width:390,height:1050});await layout(p);await take(p,name+'-home-mobile');await p.setViewportSize({width:1586,height:1050});
  // The normal main navigation and its mobile toggle retain keyboard operation.
  const cta=p.locator('.site-header [data-public-access-label]').first().locator('..');await cta.focus();await expect(cta).toBeFocused();await p.keyboard.press('Enter');await expect(p).toHaveURL(origin+'/admin/login');await expect(p.locator('#login-submit')).toBeEnabled();
  assert.equal(await p.locator('#fill-demo').count()>0,enabled,'The sign-in fill helper crossed runtime presentation.');assert.equal((await p.request.get(origin+'/api/auth/me')).status(),401);
  await layout(p);await take(p,name+'-login-desktop');await p.setViewportSize({width:390,height:1050});await layout(p);await take(p,name+'-login-mobile');
  phase=name+' mobile menu keyboard';await p.goto(origin+'/');await p.setViewportSize({width:390,height:1050});const toggle=p.locator('.site-menu-toggle');await expect(toggle).toBeVisible();await toggle.focus();await p.keyboard.press('Enter');await expect(toggle).toHaveAttribute('aria-expanded','true');
 }
 pass('all eight public routes render correct live/demo controls in initial HTML and browser output; desktop/mobile pages and keyboard entry/navigation remain usable');
 phase='demo autofill without authentication';
 const demoPage=await fresh(demo);await demoPage.goto(demo+'/admin/login');await expect(demoPage.locator('#fill-demo')).toBeVisible();const before=loginCalls;await demoPage.locator('#fill-demo').focus();await demoPage.keyboard.press('Enter');
 const demoConfig=configs[1];assert.equal(await demoPage.locator('#login-email').inputValue(),demoConfig.demoCredentials.email,'Autofill email does not match the prepared account.');assert((await demoPage.locator('#login-password').inputValue())===demoConfig.demoCredentials.password,'Autofill password does not match the prepared account.');await expect(demoPage.locator('#login-password')).toHaveAttribute('type','password');assert.equal(loginCalls,before,'Fill credentials must not call authentication.');assert.equal((await demoPage.request.get(demo+'/api/auth/me')).status(),401);await expect(demoPage.locator('#login-submit')).toBeFocused();
 pass('demo keyboard fill populates the prepared email and masked password, focuses Sign in, and makes no authentication request');
 phase='normal demo sign-in navigation';
 await demoPage.locator('#login-submit').click();await expect(demoPage).toHaveURL(demo+'/admin');phase='authenticated demo Overview';await expect(demoPage.locator('#workspace-title')).toHaveText('Overview');phase='authenticated demo identity';let me=await demoPage.request.get(demo+'/api/auth/me');assert.equal(me.status(),200);const identity=await me.json();assert.equal(identity.user.email,demoConfig.demoCredentials.email,'Normal sign-in did not select the requested identity.');assert.equal(identity.user.organization.role,'organization_admin');phase='authenticated demo refresh';await demoPage.reload({waitUntil:'domcontentloaded'});await expect(demoPage.locator('#workspace-title')).toHaveText('Overview');me=await demoPage.request.get(demo+'/api/auth/me');assert.equal(me.status(),200);assert.equal((await me.json()).user.id,identity.user.id,'Refresh changed the authenticated identity.');
 pass('normal backend demo sign-in opens the real Overview with organization-admin access and the same session survives browser refresh');
 phase='cross-runtime authentication denial';
 const cookies=await demoPage.context().cookies(demo);assert(cookies.some(cookie=>cookie.httpOnly),'The demo session must use an HttpOnly cookie.');for(const cookie of cookies)privateValues.push(cookie.value);const copied=cookies.map(cookie=>cookie.name+'='+cookie.value).join('; ');assert(copied.length>0);assertStatus(await read(live,'/api/auth/me',{headers:{Cookie:copied}}),401);assertStatus(await read(live,'/api/admin/overview',{headers:{Cookie:copied}}),401);
 const refused=await read(live,'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:live},body:JSON.stringify(demoConfig.demoCredentials)});assertStatus(refused,401);assert.equal(refused.headers.get('set-cookie'),null,'Denied live sign-in must not create a session.');assertStatus(await read(live,'/api/auth/me'),401);
 pass('copying the demo cookie to live gives no private access, and the prepared demo credentials cannot authenticate against live');
 phase='normal sign-out';
 const menu=demoPage.getByRole('button',{name:'Account menu',exact:true});await menu.click();await expect(demoPage.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();await demoPage.getByRole('button',{name:'Sign out',exact:true}).click();await expect(demoPage).toHaveURL(demo+'/admin/login');assert.equal((await demoPage.request.get(demo+'/api/auth/me')).status(),401);assert.equal((await demoPage.request.get(demo+'/api/admin/overview')).status(),401);
 pass('normal demo sign-out revokes access to the session and private Overview API');
 assert.equal(external,0,'An unexpected external browser request was blocked.');assert.equal(errors.length,0,'An unexpected browser exception occurred.');observations.externalRequestsBlocked=external;observations.browserExceptions=errors.length;observations.completedAt=new Date().toISOString();await writeFile('.local/live-demo-instances-observations.json',JSON.stringify(observations,null,2)+'\n');console.log('Live/demo instance checks passed '+groups+' focused groups. Credentials and cookies omitted.');
}catch(issue){let message=issue instanceof Error?issue.message:'Unknown check failure';for(const value of privateValues)message=message.replaceAll(value,'[redacted]');console.error('Live/demo instance check failed during '+phase+': '+message.slice(0,600)+'. Credentials and cookies omitted.');process.exitCode=1;}
finally{for(const c of contexts)await c.close();await browser?.close();}
