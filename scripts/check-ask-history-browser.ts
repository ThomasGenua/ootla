import assert from'node:assert/strict';
import {execFile}from'node:child_process';
import {promisify}from'node:util';
import {randomUUID}from'node:crypto';
import path from'node:path';
import {createServer}from'vite';
import {withRenewalsPilotFixture}from'./lib/renewals-pilot-fixture.js';
try{await withRenewalsPilotFixture(async f=>{
 const history=[];for(const[days,title]of[[0,'Today history'],[1,'Yesterday history'],[3,'<img src=x onerror=window.__historyInjected=1> Earlier history']]as const){const t=await f.json('/api/ask/threads','staff','POST',{requestKey:randomUUID(),context:{page:'/admin'}},201);await f.database.query("UPDATE ask_threads SET title=$2,updated_at=clock_timestamp()-($3*interval '1 day') WHERE id=$1",[t.thread.id,title,days]);history.push({id:t.thread.id,title,days});}
 const web=await createServer({configFile:false,root:path.join(f.root,'client'),publicDir:path.join(f.root,'public'),envDir:false,envPrefix:[],server:{host:'127.0.0.1',port:0,strictPort:true,proxy:{'/api':{target:f.apiBase,changeOrigin:false}}},logLevel:'error'});try{await web.listen();const address=web.httpServer?.address();assert(address&&typeof address!=='string');const base='http://127.0.0.1:'+address.port;Object.assign(f.config,{appUrl:base});const child=await promisify(execFile)(process.execPath,[path.join(f.root,'scripts/check-ask-history-browser.mjs')],{cwd:f.root,windowsHide:true,timeout:180000,maxBuffer:1048576,env:{...process.env,OOTLA_HISTORY_UI_RACE_ONLY:String(process.argv.includes('--race-only')),OOTLA_HISTORY_UI_URL:base,OOTLA_HISTORY_UI_DATABASE:f.config.databaseName!,OOTLA_HISTORY_UI_CONTEXT:JSON.stringify({email:f.config.demoAdminEmail,password:f.config.demoAdminPassword,history})}});process.stdout.write(child.stdout);if(child.stderr)process.stderr.write(child.stderr);assert.equal(f.outsideRequests(),0);}finally{await web.close();}
});}catch(e){const failure=e as{stdout?:string;stderr?:string;message?:string};if(failure.stdout)process.stdout.write(failure.stdout);if(failure.stderr)process.stderr.write(failure.stderr.slice(0,3500));console.error('Owned History UI failed. '+String(failure.message??e).slice(0,1800));process.exitCode=1;}
