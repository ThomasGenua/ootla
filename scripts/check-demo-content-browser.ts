import '../server/config/environment.js';
import assert from'node:assert/strict';
import{execFile}from'node:child_process';
import{promisify}from'node:util';
import path from'node:path';
import{loadConfig}from'../server/config/env.js';
import{Database}from'../server/db/pool.js';
import{requireIsolatedDemo}from'../server/services/demo-environment.js';
const config=loadConfig(),db=new Database(config);assert(config.demoMode&&!config.production&&config.databaseName==='ootla_demo');
try{await db.requireReady();await requireIsolatedDemo(config,db);const row=(await db.query("SELECT a.metadata->'result' AS result FROM audit_events a JOIN organizations o ON o.id=a.organization_id WHERE o.slug='ootla-demo' AND o.environment='demo' AND a.action='demo.current-pipeline.prepared' AND a.metadata->>'dataset'='demo.current-pipeline.v1' ORDER BY a.created_at DESC LIMIT 1")).rows[0];assert(row?.result?.cases?.length===3,'The additive current demo fixture must be prepared before this read-only check.');const child=await promisify(execFile)(process.execPath,[path.join(process.cwd(),'scripts/check-demo-content-browser.mjs')],{cwd:process.cwd(),windowsHide:true,timeout:240000,maxBuffer:1048576,env:{...process.env,OOTLA_DEMO_CONTENT_CASES:JSON.stringify(row.result.cases)}});process.stdout.write(child.stdout);if(child.stderr)process.stderr.write(child.stderr);}catch(issue){const child=issue as{stdout?:string;stderr?:string;message?:string};if(child.stdout)process.stdout.write(child.stdout);if(child.stderr)process.stderr.write(child.stderr.slice(0,3500));console.error('Demo content read-only check failed. '+String(child.message??issue).slice(0,1600));process.exitCode=1;}finally{await db.close();}
