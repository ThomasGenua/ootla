import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {readInstanceDefaults,resolveRuntimeEnvironmentFile} from '../server/config/instance-files.js';
const root=fileURLToPath(new URL('..',import.meta.url));
try{
 const selection=resolveRuntimeEnvironmentFile(process.env,root),instance=readInstanceDefaults(root);
 if(!selection.path)throw new Error('Production setup requires an explicitly selected private OOTLA_ENV_FILE. No file was created.');
 const envPath=selection.path,live=(instance?.kind??(path.basename(envPath)==='.env.live'?'live':'demo'))==='live';
 if(existsSync(envPath))console.log('The selected environment already exists; preserved without changes.');
 else{
  const databasePassword=randomBytes(24).toString('hex'),sessionSecret=randomBytes(48).toString('hex');
  const values=[
   'NODE_ENV=development',
   'DATABASE_URL=postgresql://'+(live?'ootla_live':'ootla')+':'+databasePassword+'@127.0.0.1:55439/'+(live?'ootla_live':'ootla_demo'),
   'PORT='+(live?'3101':'3100'),
   'APP_URL='+(live?'http://localhost:7674':'http://127.0.0.1:7673'),
   'SESSION_SECRET='+sessionSecret,
   'SESSION_COOKIE_PREFIX='+(live?'ootla_live':'ootla'),
   'DEMO_MODE='+(live?'false':'true'),
   'AI_PROVIDER='+(live?'disabled':'simulated'),
   'GOOGLE_CALENDAR_ENABLED=false',
   'GOOGLE_ANALYTICS_ENABLED=false',
   'INTEGRATIONS_MODE=simulation',
   'OUTBOUND_MODE=simulation',
  ];
  if(!live)values.push('DEMO_ADMIN_EMAIL=admin@demo.ootla.test','DEMO_ADMIN_PASSWORD=OotlaDemo!2026');
  writeFileSync(envPath,values.join('\n')+'\n',{mode:0o600,flag:'wx'});
  console.log('Created the ignored '+(live?'live customer':'isolated demo')+' environment with random server-only secrets. No values printed.');
 }
}catch{console.error('Ootla environment setup could not finish. Check the instance marker and selected private file path. No existing file was overwritten; values are omitted.');process.exitCode=1;}
