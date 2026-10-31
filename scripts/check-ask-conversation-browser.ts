import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {createServer} from 'vite';
import {withRenewalsPilotFixture} from './lib/renewals-pilot-fixture.js';
import {prepareRenewalsPilotDemo} from '../server/services/renewals-pilot-demo.js';
try {
 await withRenewalsPilotFixture(async f=>{
  await prepareRenewalsPilotDemo(f.database,f.config);
  await f.database.query("INSERT INTO properties(organization_id,name,address,city,source_system)VALUES($1,'Kestrel Ambiguous North','71 Test Road','Owned city','local'),($1,'Kestrel Ambiguous South','83 Test Road','Owned city','local')",[f.staff.organization.id]);
  const web=await createServer({configFile:false,root:path.join(f.root,'client'),publicDir:path.join(f.root,'public'),envDir:false,envPrefix:[],server:{host:'127.0.0.1',port:0,strictPort:true,proxy:{'/api':{target:f.apiBase,changeOrigin:false}}},logLevel:'error'});
  try {
   await web.listen();const address=web.httpServer?.address();assert(address&&typeof address!=='string');const base='http://127.0.0.1:'+address.port;Object.assign(f.config,{appUrl:base});
   const child=await promisify(execFile)(process.execPath,[path.join(f.root,'scripts/check-ask-conversation-browser.mjs')],{cwd:f.root,windowsHide:true,timeout:240000,maxBuffer:1048576,env:{...process.env,OOTLA_CONVERSATION_UI_URL:base,OOTLA_CONVERSATION_UI_DATABASE:f.config.databaseName!,OOTLA_CONVERSATION_UI_CONTEXT:JSON.stringify({propertyId:f.showcase.propertyIds[0],email:f.config.demoAdminEmail,password:f.config.demoAdminPassword})}});process.stdout.write(child.stdout);if(child.stderr)process.stderr.write(child.stderr);assert.equal(f.outsideRequests(),0);
  }finally{await web.close();}
 });
}catch(issue){const child=issue as {stdout?:string;stderr?:string;message?:string};if(child.stdout)process.stdout.write(child.stdout);if(child.stderr)process.stderr.write(child.stderr.slice(0,3000));console.error('Owned conversation UI failed. '+String(child.message??issue).slice(0,2000));process.exitCode=1;}
