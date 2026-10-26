import {assertRuntimeDatabaseIsolation} from '../server/runtime-isolation.js';
import { assertOotlaDatabase,loadConfig } from '../server/config/env.js';
import { Database } from '../server/db/pool.js';
import { processConnectorJobs } from '../server/services/connectors.js';
const config=loadConfig();assertOotlaDatabase(config);const database=new Database(config);
try{await database.requireReady();await assertRuntimeDatabaseIsolation(database,config);console.info(JSON.stringify({processedEvents:await processConnectorJobs(database,config)}));}
catch{console.error('Connector processing failed. Check the isolated Ootla configuration, migrations and job diagnostics.');process.exitCode=1;}
finally{await database.close();}
