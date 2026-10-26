import {assertOotlaDatabase,loadConfig} from '../server/config/env.js';
import {Database} from '../server/db/pool.js';
import {seedResidentDemo} from '../server/services/resident-demo.js';
const config=loadConfig();assertOotlaDatabase(config);const db=new Database(config);
try{const r=await seedResidentDemo(db,config);console.info('Resident demo prepared: '+r.changedRecords+' new setup records. Existing passwords, grants and staff work preserved. Open /resident/login or sign in as the separate resident demo staff account.');}catch{console.error('Resident demo setup requires the migrated isolated DEMO_MODE database. No startup seeding or reset is performed.');process.exitCode=1;}finally{await db.close();}
