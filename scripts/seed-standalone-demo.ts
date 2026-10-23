import { loadConfig, assertOotlaDatabase } from '../server/config/env.js';
import { Database } from '../server/db/pool.js';
import { seedStandaloneDemo } from '../server/services/standalone-demo.js';
const config=loadConfig();assertOotlaDatabase(config);const database=new Database(config);
try {const result=await seedStandaloneDemo(database,config);console.info('Standalone demo organization prepared; '+result.changedRecords+' new setup records. Existing data and passwords preserved.');}
catch {console.error('Standalone demo setup requires an isolated, migrated DEMO_MODE environment. Existing identities are preserved.');process.exitCode=1;}
finally {await database.close();}
