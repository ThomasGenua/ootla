import '../server/config/environment.js';
import {loadConfig} from '../server/config/env.js';
import {readInstanceDefaults} from '../server/config/instance-files.js';
import {Database} from '../server/db/pool.js';
import {polishDemoTaskDescriptions} from '../server/services/demo-task-descriptions.js';
if(readInstanceDefaults()?.kind!=='demo')throw new Error('Run this command only from the dedicated demo checkout.');
const config=loadConfig(),db=new Database(config);
try{const result=await polishDemoTaskDescriptions(db,config);console.log(JSON.stringify({...result,scope:'shipped task descriptions only',externalActions:0}));}finally{await db.close();}
