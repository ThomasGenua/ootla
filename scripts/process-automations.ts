import {assertRuntimeDatabaseIsolation} from '../server/runtime-isolation.js';
import {assertOotlaDatabase,loadConfig} from '../server/config/env.js';
import {Database} from '../server/db/pool.js';
import {processAutomationJobs} from '../server/services/automations.js';
const config=loadConfig();assertOotlaDatabase(config);const database=new Database(config);
try{await database.requireReady();await assertRuntimeDatabaseIsolation(database,config);const result=await processAutomationJobs(database,config,{limit:20});console.info('Completed one bounded automation discovery/execution pass.');console.info(JSON.stringify(Object.fromEntries(Object.entries(result).filter(([key,value])=>['scanned','queued','completed','cancelled','failed','deferred'].includes(key)&&typeof value==='number'))));}
catch{console.error('Automation processing did not complete. Check migrations and rule configuration; raw record details and credentials are omitted.');process.exitCode=1;}
finally{await database.close();}
