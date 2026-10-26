import {assertOotlaDatabase,loadConfig} from '../server/config/env.js';
import {Database} from '../server/db/pool.js';
import {seedConversationDemo} from '../server/services/conversation-demo.js';
const config=loadConfig();assertOotlaDatabase(config);const db=new Database(config);
try{const result=await seedConversationDemo(db,config);console.info('Stage20 public conversation demo prepared: '+result.changedRecords+' new synthetic setup records. Existing records, passwords and staff edits preserved. Open /admin/conversations or the public chat button.');}
catch{console.error('Conversation demo setup requires the migrated isolated DEMO_MODE database and existing demo admin. No startup seed/reset is performed.');process.exitCode=1;}
finally{await db.close();}
