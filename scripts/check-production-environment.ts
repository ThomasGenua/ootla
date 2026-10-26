import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import {mkdir,mkdtemp,writeFile,readFile,unlink,rmdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {rootCertificates} from 'node:tls';
import {loadConfig,ConfigurationError} from '../server/config/env.js';
import {Database} from '../server/db/pool.js';

const run=promisify(execFile),root=path.resolve(import.meta.dirname,'..');
let phase='typed environment requirements',groups=0;
const pass=(label:string)=>{groups++;console.log('PASS '+label);};
const normalize=(value:string)=>path.resolve(value).replaceAll('\\','/').toLowerCase();
const preview={NODE_ENV:'test',DEMO_MODE:'true',APP_URL:'http://127.0.0.1:7673',DATABASE_URL:'postgresql://ootla:synthetic@127.0.0.1:55439/ootla_demo_environment_check',SESSION_SECRET:'synthetic-environment-check-with-more-than-32-characters',AI_PROVIDER:'simulated'};
const customer={NODE_ENV:'production',DEMO_MODE:'false',APP_URL:'https://ootla.example.test',DATABASE_URL:'postgresql://ootla:synthetic@127.0.0.1:55439/ootla_customer_environment_check',SESSION_SECRET:preview.SESSION_SECRET,AI_PROVIDER:'disabled',DATABASE_TLS_MODE:'disable'};
const reject=(patch:NodeJS.ProcessEnv,base:NodeJS.ProcessEnv=customer)=>assert.throws(()=>loadConfig({...base,...patch}),ConfigurationError);
let ownedDirectory:string|null=null;
const ownedFiles:string[]=[];
try{
 const live=loadConfig(customer),demo=loadConfig(preview);
 assert.equal(live.production,true);assert.equal(live.demoMode,false);assert.equal(live.ai.provider,'disabled');assert.equal(demo.ai.provider,'simulated');
 for(const patch of [{SESSION_SECRET:''},{SESSION_SECRET:'REPLACE_WITH_A_RANDOM_SECRET_AT_LEAST_32_CHARACTERS'},{APP_URL:'http://ootla.example.test'},{APP_URL:'https://user:password@ootla.example.test'},{APP_URL:'https://ootla.example.test/subpath'},{DATABASE_URL:''},{DEMO_MODE:'true'},{AI_PROVIDER:'simulated'},{SESSION_COOKIE_PREFIX:'bad.prefix'},{PORT:'0'}])reject(patch);
 pass('production core uses explicit disabled AI, requires typed secure application/database/session settings and rejects simulation, placeholder secrets and invalid cookie names');

 phase='hosted preview settings';
 const hosted={...preview,NODE_ENV:'development',APP_URL:'https://preview.example.test',SERVE_COMPILED_CLIENT:'true',COOKIE_SECURE:'true'};
 assert.equal(loadConfig(hosted).secureCookies,true);
 reject({COOKIE_SECURE:'false'},hosted);reject({APP_URL:'http://preview.example.test'},hosted);reject({DEMO_MODE:'false'},hosted);
 reject({GOOGLE_CALENDAR_ENABLED:'true'},preview);reject({GOOGLE_ANALYTICS_ENABLED:'true'},preview);reject({AI_PROVIDER:'openai'},preview);
 pass('hosted interactive preview requires HTTPS and secure cookies and cannot enable live Google or OpenAI execution');

 phase='strict remote database TLS';
 reject({DATABASE_URL:'postgresql://ootla:synthetic@database.example.test/ootla_customer_environment_check',DATABASE_TLS_MODE:'disable'});
 const remote=loadConfig({...customer,DATABASE_URL:'postgresql://ootla:synthetic@database.example.test/ootla_customer_environment_check',DATABASE_TLS_MODE:'verify-full'});
 const database=new Database(remote);
 try{const ssl=database.pool?.options.ssl;assert(ssl&&typeof ssl==='object');assert.equal(ssl.rejectUnauthorized,true);assert.equal(ssl.minVersion,'TLSv1.2');}finally{await database.close();}
 for(const key of ['sslmode','sslcert','sslkey','sslrootcert','sslpassword','ssl','uselibpqcompat'])reject({DATABASE_URL:'postgresql://ootla:synthetic@database.example.test/ootla_customer_environment_check?'+key+'=require',DATABASE_TLS_MODE:'verify-full'});
 reject({DATABASE_URL:'postgresql://ootla:synthetic@database.example.test/ootla_customer_environment_check#fragment',DATABASE_TLS_MODE:'verify-full'});
 reject({DATABASE_TLS_MODE:'require'});reject({DATABASE_TLS_MODE:'verify-full',DATABASE_TLS_CA_FILE:'relative-ca.pem'});
 pass('remote production PostgreSQL requires verify-full, certificate verification and TLS1.2; URL TLS overrides, insecure modes and relative CA paths are rejected without network I/O');

 phase='owned environment loader fixture';
 const local=await realpath(path.join(root,'.local'));assert(normalize(local).startsWith(normalize(await realpath(root))+'/'));
 const parent=path.join(local,'environment-verification');await mkdir(parent,{recursive:true,mode:0o700});assert(normalize(await realpath(parent)).startsWith(normalize(local)+'/'));
 ownedDirectory=await mkdtemp(path.join(parent,'owned-'));assert(normalize(ownedDirectory).startsWith(normalize(parent)+'/'));
 const privateFile=async(name:string,content:string)=>{assert(ownedDirectory);const file=path.join(ownedDirectory,name);assert.equal(path.dirname(file),ownedDirectory);await writeFile(file,content,{mode:0o600,flag:'wx'});ownedFiles.push(file);return file;};
 const canary=randomBytes(32).toString('hex'),implicit=await privateFile('.env','OOTLA_ENV_CANARY='+canary+'\nSESSION_SECRET='+canary+'\n');
 const explicitCanary=randomBytes(32).toString('hex'),explicit=await privateFile('selected.env','OOTLA_ENV_CANARY='+explicitCanary+'\nSESSION_SECRET='+explicitCanary+'\n');
 const loader=pathToFileURL(path.join(root,'server/config/environment.js')).href;
 const childCode="await import(process.env.OOTLA_TEST_LOADER_URL);process.stdout.write(JSON.stringify({canaryMatches:process.env.OOTLA_ENV_CANARY===process.env.OOTLA_TEST_EXPECTED,hasCanary:Object.hasOwn(process.env,'OOTLA_ENV_CANARY'),preloadedMatches:process.env.SESSION_SECRET===process.env.OOTLA_TEST_PRELOADED}));";
 const baseEnv:NodeJS.ProcessEnv={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,TEMP:process.env.TEMP,TMP:process.env.TMP,USERPROFILE:process.env.USERPROFILE,OOTLA_TEST_LOADER_URL:loader};
 const child=async(patch:NodeJS.ProcessEnv,shouldSucceed=true)=>{
  let stdout='',stderr='',succeeded=false;
  try{const result=await run(process.execPath,['--input-type=module','-e',childCode],{cwd:ownedDirectory!,windowsHide:true,timeout:10000,maxBuffer:65536,env:{...baseEnv,...patch}});stdout=result.stdout;stderr=result.stderr;succeeded=true;}catch(issue){const output=issue as {stdout?:string;stderr?:string};stdout=output.stdout??'';stderr=output.stderr??'';}
  assert.equal(succeeded,shouldSucceed,'Environment loader child outcome must match the selected-file policy.');
  for(const value of [canary,explicitCanary,patch.SESSION_SECRET].filter(Boolean) as string[]){assert(!stdout.includes(value));assert(!stderr.includes(value));}
  return succeeded?JSON.parse(stdout) as {canaryMatches:boolean;hasCanary:boolean;preloadedMatches:boolean}:null;
 };
 assert.equal((await child({NODE_ENV:'development',OOTLA_TEST_EXPECTED:canary}))?.canaryMatches,true);
 assert.equal((await child({OOTLA_TEST_EXPECTED:canary}))?.canaryMatches,true);
 assert.equal((await child({NODE_ENV:'test',OOTLA_TEST_EXPECTED:canary}))?.canaryMatches,true);
 const external=randomBytes(32).toString('hex');
 assert.equal((await child({NODE_ENV:'development',SESSION_SECRET:external,OOTLA_TEST_PRELOADED:external,OOTLA_TEST_EXPECTED:canary}))?.preloadedMatches,true);
 assert.equal((await child({NODE_ENV:'production'}))?.hasCanary,false);
 assert.equal((await child({NODE_ENV:'production',SESSION_SECRET:external,OOTLA_TEST_PRELOADED:external}))?.preloadedMatches,true);
 assert.equal((await child({NODE_ENV:'production',OOTLA_ENV_FILE:explicit,OOTLA_TEST_EXPECTED:explicitCanary}))?.canaryMatches,true);
 assert.equal((await child({NODE_ENV:'development',OOTLA_ENV_FILE:explicit,OOTLA_TEST_EXPECTED:explicitCanary}))?.canaryMatches,true);
 pass('loader reads implicit local file only outside production; preloaded values remain intact and an explicit selected file loads without fallback to .env');
 await child({NODE_ENV:'production',OOTLA_ENV_FILE:path.join(ownedDirectory,'missing.env')},false);
 await child({NODE_ENV:'development',OOTLA_ENV_FILE:path.join(ownedDirectory,'missing.env')},false);
 await child({NODE_ENV:'production',OOTLA_ENV_FILE:ownedDirectory},false);
 assert.equal((await readFile(implicit,'utf8')).includes(canary),true);assert.equal((await readFile(explicit,'utf8')).includes(explicitCanary),true);
 pass('missing or non-file explicit configuration fails closed in both modes without revealing canary secrets or changing either configuration file');

 phase='explicit CA file';
 const ca=await privateFile('trusted-ca.pem',rootCertificates[0]!);
 const caConfig=loadConfig({...customer,DATABASE_URL:'postgresql://ootla:synthetic@database.example.test/ootla_customer_environment_check',DATABASE_TLS_MODE:'verify-full',DATABASE_TLS_CA_FILE:ca});
 const caDatabase=new Database(caConfig);
 try{const ssl=caDatabase.pool?.options.ssl;assert(ssl&&typeof ssl==='object');assert.equal(ssl.rejectUnauthorized,true);assert.equal(ssl.ca,rootCertificates[0]);}finally{await caDatabase.close();}
 reject({DATABASE_TLS_MODE:'verify-full',DATABASE_TLS_CA_FILE:path.join(ownedDirectory,'missing-ca.pem')});
 const invalidCa=await privateFile('invalid-ca.pem','This is not PEM trust material.'),oversizedCa=await privateFile('oversized-ca.pem','-----BEGIN CERTIFICATE-----\n'+'A'.repeat(1048576)+'\n-----END CERTIFICATE-----');
 reject({DATABASE_TLS_MODE:'verify-full',DATABASE_TLS_CA_FILE:invalidCa});reject({DATABASE_TLS_MODE:'verify-full',DATABASE_TLS_CA_FILE:oversizedCa});
 pass('absolute readable PEM trust material reaches the verified TLS pool configuration; missing, invalid or oversized CA files fail safely without connecting');
 console.log('Production environment verification passed ('+groups+' focused groups; no network).');
}catch(issue){console.error('Production environment verification failed during '+phase+'.');console.error('Failure type: '+(issue instanceof Error?issue.name:'Unknown')+'. Configuration and secret values are intentionally omitted.');process.exitCode=1;}
finally{
 for(const file of ownedFiles.reverse()){assert(ownedDirectory&&normalize(path.dirname(file))===normalize(ownedDirectory));await unlink(file);}
 if(ownedDirectory){assert(path.basename(ownedDirectory).startsWith('owned-'));await rmdir(ownedDirectory);}
}

if(!process.exitCode)await writeFile(path.join(root,'.local/production-environment-observations.json'),JSON.stringify({verifiedAt:new Date().toISOString(),passed:true,groups,explicitLoaderIsolationVerified:true,productionIgnoresDefaultEnvironment:true,preloadedValuesPreserved:true,typedRuntimeAndAiValidation:true,strictRemoteDatabaseTlsOptionsVerified:true,urlTlsOverridesDenied:true,privateCanaryFilesCleaned:true,retainedEnvironmentChanged:false,outsideNetworkRequests:0,limitations:['No real remote database TLS handshake or VPS startup was performed. Native TLS validates actual server certificates on connection.','Frontend bundle secret-canary verification is deferred to the final required build gate.']},null,2)+'\n');
