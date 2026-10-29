import assert from'node:assert/strict';
import{execFile}from'node:child_process';
import{promisify}from'node:util';
import path from'node:path';
import{createServer}from'vite';
import{withRenewalsPilotFixture}from'./lib/renewals-pilot-fixture.js';
import{prepareRenewalsPilotDemo}from'../server/services/renewals-pilot-demo.js';
try{await withRenewalsPilotFixture(async f=>{
 const seed=await prepareRenewalsPilotDemo(f.database,f.config),property=seed.cases.find(r=>r.key==='preparing')!.propertyId;
 const request=(await f.json('/api/maintenance?pageSize=25')).items[0];assert(request);
 await f.json('/api/maintenance/'+request.id+'/assignment','staff','PUT',{requestKey:crypto.randomUUID(),version:request.version,ownerMembershipId:f.staff.membershipId,dueAt:new Date(Date.now()+86400000).toISOString()});
 for(let i=0;i<26;i++)await f.json('/api/resident/requests/'+request.id+'/messages','resident','POST',{requestKey:crypto.randomUUID(),body:'Earlier owned resident update '+i+': please contact me before confirming access.',visibility:'resident'});
 await f.database.query("INSERT INTO properties(organization_id,name,address,city,source_system) SELECT $1,'Jump Check Property '||n,'Owned fixture address','Owned city','demo' FROM generate_series(1,14)n",[f.staff.organization.id]);
 const web=await createServer({configFile:false,root:path.join(f.root,'client'),publicDir:path.join(f.root,'public'),envDir:false,envPrefix:[],server:{host:'127.0.0.1',port:0,strictPort:true,proxy:{'/api':{target:f.apiBase,changeOrigin:false}}},logLevel:'error'});
 try{await web.listen();const address=web.httpServer?.address();assert(address&&typeof address!=='string');const base='http://127.0.0.1:'+address.port;Object.assign(f.config,{appUrl:base});const child=await promisify(execFile)(process.execPath,[path.join(f.root,'scripts/check-page-jumps-browser.mjs'),...process.argv.slice(2)],{cwd:f.root,windowsHide:true,timeout:300000,maxBuffer:1048576,env:{...process.env,OOTLA_JUMPS_URL:base,OOTLA_JUMPS_DATABASE:f.config.databaseName!,OOTLA_JUMPS_CONTEXT:JSON.stringify({requestId:request.id,relationshipId:seed.cases.find(r=>r.key==='preparing')!.relationshipId,propertyId:property,membershipId:f.staff.membershipId,email:f.config.demoAdminEmail,password:f.config.demoAdminPassword})}});process.stdout.write(child.stdout);if(child.stderr)process.stderr.write(child.stderr);assert.equal(f.outsideRequests(),0);}finally{await web.close();}
});}catch(issue){const child=issue as{stdout?:string;stderr?:string;message?:string};if(child.stdout)process.stdout.write(child.stdout);if(child.stderr)process.stderr.write(child.stderr.slice(0,3500));console.error('Page jump owned browser failed. '+String(child.message??issue).slice(0,1600));process.exitCode=1;}
