import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {createServer as createViteServer} from 'vite';
import path from 'node:path';
import {publicPagePaths} from '../shared/public-site.js';
import {publicAccessCta,rewritePublicAccess} from '../shared/public-access.js';
import {publicSeoPlugin} from './public-seo-plugin.js';

const pageRenderer=await createViteServer({configFile:false,root:path.join(process.cwd(),'client'),publicDir:false,appType:'custom',logLevel:'error',server:{middlewareMode:true,hmr:false,ws:false}});
try{
const {publicPage}=await pageRenderer.ssrLoadModule('/pages/public.ts') as {publicPage:(route:string,demoAccess?:boolean)=>string};
let groups=0;
const pass=(copy:string)=>{groups++;console.log('PASS '+copy);};
const hasDemo=(html:string)=>html.includes('href="/try"')&&html.includes('Explore demo');
for(const route of publicPagePaths){
 const live=publicPage(route),demo=publicPage(route,true);
 assert(!/href="\/try"|Explore demo|Try Ootla|Interactive preview with sample records/.test(live),route);
 assert(live.includes('href="/admin/login"')&&live.includes('data-public-access-label>Sign in'),route);
 assert(hasDemo(demo),route);
 assert.equal((live.match(/<h1\b/g)??[]).length,1,route);
 assert.equal((demo.match(/<h1\b/g)??[]).length,1,route);
 assert.equal(rewritePublicAccess(demo,false),live,route);
 assert.equal(rewritePublicAccess(demo,true),demo,route);
 assert.equal(rewritePublicAccess(live,false),live,route);
}
assert(!publicPage('/').includes('class="public-sign-in"'));
assert(publicPage('/',true).includes('class="public-sign-in"'));
assert(publicPage('/').includes('Example'));
assert(publicPage('/ai-workflows').includes('data-demo-next'));
pass('all eight public routes default to Sign in; isolated-demo presentation restores Explore demo without altering product examples or page structure');
const unmarked='<p>A staff note says Explore demo.</p><a href="/try">Quoted original link</a>';
assert.equal(rewritePublicAccess(unmarked,true),unmarked);
assert.equal(rewritePublicAccess(unmarked,false),unmarked);
assert.equal(rewritePublicAccess(publicAccessCta('button'),'true' as unknown as boolean),publicAccessCta('button'));
assert.equal(rewritePublicAccess(rewritePublicAccess(publicAccessCta('button','<svg></svg>'),true),false),publicAccessCta('button','<svg></svg>'));
pass('only explicit access markers change; repeated transforms, return-to-live, icons and non-boolean input are safe');

const {organizationNavigation}=await pageRenderer.ssrLoadModule('/pages/organization-navigation.ts') as {organizationNavigation:(selected:string,demoAccess?:boolean)=>string};
assert(!organizationNavigation('profile').includes('Preview access'));
assert(organizationNavigation('profile',true).includes('Preview access'));
const {organizationWorkspacePage}=await pageRenderer.ssrLoadModule('/pages/organization-admin.ts') as {organizationWorkspacePage:(data:unknown,q:URLSearchParams)=>string};
const ownedSettings={organization:{id:'example-organization',name:'Example organization',slug:'example',environment:'live'},profile:{website:'',contactEmail:'',phone:'',address:''},updatedAt:null,access:{canManage:true},demo:{isolated:false,resetAvailable:false,notice:'Protected preview state'},links:{personalSettings:'/admin/settings'}};
const ownerPage=organizationWorkspacePage({kind:'ready',tab:'demo',settings:ownedSettings},new URLSearchParams({tab:'demo'}));
assert(ownerPage.includes('Organization profile'));
assert(!/Preview access|Demo environment controls|Verified isolated demo/.test(ownerPage));
const previewOwner=organizationWorkspacePage({kind:'ready',tab:'demo',settings:{...ownedSettings,demo:{...ownedSettings.demo,isolated:true}}},new URLSearchParams({tab:'demo'}));
assert(previewOwner.includes('Preview access')&&previewOwner.includes('Demo environment controls'));
pass('owner preview navigation requires server-verified isolation; a live direct preview-tab URL renders the organization profile');

let mode:'demo'|'live'|'invalid'|'unavailable'|'slow'='demo',requests=0,outside=0;
const server=createServer((request,response)=>{
 assert.equal(request.url,'/api/public-access');requests++;
 if(mode==='slow'){setTimeout(()=>{if(!response.destroyed){response.setHeader('Content-Type','application/json');response.end('{"demoAccess":true}');}},1900);return;}
 response.statusCode=mode==='unavailable'?503:200;
 response.setHeader('Content-Type',mode==='invalid'?'text/html':'application/json');
 response.end(mode==='invalid'?'<p>Unavailable</p>':JSON.stringify({demoAccess:mode==='demo'}));
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();assert(address&&typeof address!=='string');const origin='http://127.0.0.1:'+address.port;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{const url=new URL(input instanceof Request?input.url:String(input));if(url.origin!==origin){outside++;throw Error('External network prevented.');}return originalFetch(input,init);};
const plugins:ReturnType<typeof publicSeoPlugin>[]=[];
const plugin=(command:'serve'|'build',target:string)=>{
 const result=publicSeoPlugin({},process.cwd());plugins.push(result);
 (result.configResolved as (config:unknown)=>void)({command,server:{proxy:{'/api':{target}}}});
 return result;
};
const template=readFileSync('client/index.html','utf8');
const render=async(p:ReturnType<typeof publicSeoPlugin>)=>(p.transformIndexHtml as {handler:(html:string,context:unknown)=>Promise<string>}).handler(template,{path:'/',originalUrl:'/'});
try{
 const dev=plugin('serve',origin);
 assert(hasDemo(await render(dev)));
 mode='live';assert(!hasDemo(await render(dev)));
 pass('development prerender resolves the current verified boolean from the configured loopback backend on each render');
 for(const failed of ['invalid','unavailable','slow'] as const){mode=failed;assert(!hasDemo(await render(dev)),failed);}
 pass('invalid responses, unavailable backend and bounded timeout all prerender ordinary Sign in');
 const before=requests;mode='demo';
 const built=await render(plugin('build',origin));assert(!hasDemo(built));assert.equal(requests,before);
 for(const target of ['https://outside.example.test','http://127.0.0.1/private','http://a:b@127.0.0.1','http://127.0.0.1?demo=true']){assert(!hasDemo(await render(plugin('serve',target))));}
 assert.equal(requests,before);assert.equal(outside,0);
 pass('build prerender stays live by default and invalid/non-loopback proxy targets cannot trigger a presentation fetch');
 console.log('Public access presentation checks passed '+groups+' focused groups; no database or external service used.');
}finally{
 for(const p of plugins)await (p.closeBundle as ()=>Promise<void>)();
 globalThis.fetch=originalFetch;
 server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
}

}finally{await pageRenderer.close();}
