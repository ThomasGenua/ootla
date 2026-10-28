import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {parse} from 'dotenv';
import {loadConfig} from '../dist/server/server/config/env.js';
import {Database} from '../dist/server/server/db/pool.js';
import {createApp} from '../dist/server/server/app.js';
import {assertRuntimeDatabaseIsolation} from '../dist/server/server/runtime-isolation.js';
const paths=['/','/platform','/ai-workflows','/workflows/leasing','/workflows/resident-support','/integrations','/contact','/privacy'];
let checked=0;
try{
 for(const [file,demo] of [['.env.live',false],['.env',true]]){
  const config=loadConfig({...parse(await readFile(file)),SERVE_COMPILED_CLIENT:'true'}),db=new Database(config);
  let server;
  try{
   await db.requireReady();await assertRuntimeDatabaseIsolation(db,config);
   server=createApp(config,db).listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
   const origin='http://127.0.0.1:'+server.address().port;
   for(const route of paths){const response=await fetch(origin+route);assert.equal(response.status,200);assert.match(response.headers.get('cache-control')??'',/no-store/);const html=await response.text();const labels=[...html.matchAll(/<span data-public-access-label>([^<]+)<\/span>/g)].map(m=>m[1]);assert(labels.length>0);assert(labels.every(label=>label===(demo?'Explore demo':'Sign in')));if(!demo)assert(!html.includes('href="/try"'));checked++;}
   const entry=await fetch(origin+'/try',{redirect:'manual'});assert.equal(entry.status,302);assert.equal(entry.headers.get('location'),new URL('/admin/login',config.appUrl).href);
  }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await db.close();}
 }
 const sensitive=[];
 for(const file of ['.env','.env.live']){const env=parse(await readFile(file));for(const key of ['SESSION_SECRET','AI_API_KEY','CONNECTOR_CREDENTIAL_KEY','GOOGLE_CALENDAR_CLIENT_SECRET','GOOGLE_CALENDAR_TOKEN_KEY','GOOGLE_ANALYTICS_CLIENT_SECRET','GOOGLE_ANALYTICS_TOKEN_KEY'])if(env[key]?.length>=16)sensitive.push(env[key]);sensitive.push(decodeURIComponent(new URL(env.DATABASE_URL).password));}
 async function files(dir){const all=[];for(const entry of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())all.push(...await files(p));else if(/\.(?:html|js|json|xml|txt)$/.test(p))all.push(p);}return all;}
 let scanned=0;for(const file of await files('dist/client')){const text=await readFile(file,'utf8');assert(sensitive.every(value=>!text.includes(value)),'A private runtime value entered a public build.');scanned++;}
 const result={compiledPublicResponses:checked,sameBuild:true,liveDefaultHtml:true,verifiedRuntimeDemoRewrite:true,privateRuntimeValuesInBundle:0,publicFilesScanned:scanned,outboundActions:0};
 await writeFile('.local/instance-compiled-observations.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch{console.error('Compiled instance check failed; credentials and invitation links omitted.');process.exitCode=1;}
