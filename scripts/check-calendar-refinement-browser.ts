import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {createServer} from 'vite';
import {withRenewalsPilotFixture} from './lib/renewals-pilot-fixture.js';
import {demoShowcaseId} from '../server/services/demo-showcase.js';
import {addLocalDays,localDate} from '../server/services/calendar-time.js';
try{await withRenewalsPilotFixture(async f=>{
 const org=f.staff.organization.id,property=demoShowcaseId(org,'property.grove'),lead=demoShowcaseId(org,'lead.leila'),unit=demoShowcaseId(org,'unit.grove1A'),date=addLocalDays(localDate(new Date(),'America/New_York'),7),options=await f.json('/api/calendar/options?propertyId='+property+'&leadId='+lead);
 await f.json('/api/calendar/properties/'+property+'/settings','staff','PUT',{version:options.settings.version,enabled:true,timeZone:'America/New_York',durationMinutes:30,bufferBeforeMinutes:10,bufferAfterMinutes:10,location:'Owned browser reception',publicBookingEnabled:true});
 const web=await createServer({configFile:false,root:path.join(f.root,'client'),publicDir:path.join(f.root,'public'),envDir:false,envPrefix:[],server:{host:'127.0.0.1',port:0,strictPort:true,proxy:{'/api':{target:f.apiBase,changeOrigin:false}}},logLevel:'error'});
 try{await web.listen();const address=web.httpServer?.address();assert(address&&typeof address!=='string');const base='http://127.0.0.1:'+address.port;Object.assign(f.config,{appUrl:base});const child=await promisify(execFile)(process.execPath,[path.join(f.root,'scripts/check-calendar-refinement-browser.mjs')],{cwd:f.root,windowsHide:true,timeout:240000,maxBuffer:1048576,env:{...process.env,OOTLA_CALENDAR_URL:base,OOTLA_CALENDAR_DATABASE:f.config.databaseName!,OOTLA_CALENDAR_MEMBERSHIP:f.staff.membershipId,OOTLA_CALENDAR_PROPERTY:property,OOTLA_CALENDAR_LEAD:lead,OOTLA_CALENDAR_UNIT:unit,OOTLA_CALENDAR_DATE:date,OOTLA_CALENDAR_EMAIL:f.config.demoAdminEmail,OOTLA_CALENDAR_PASSWORD:f.config.demoAdminPassword}});process.stdout.write(child.stdout);if(child.stderr)process.stderr.write(child.stderr);assert.equal(f.outsideRequests(),0);}finally{await web.close();}
});}catch(issue){const child=issue as{stdout?:string;stderr?:string;message?:string};if(child.stdout)process.stdout.write(child.stdout);if(child.stderr)process.stderr.write(child.stderr.slice(0,2400));console.error('Calendar owned browser failed. '+String(child.message??issue).slice(0,1400));process.exitCode=1;}
