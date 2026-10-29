import '../server/config/environment.js';
import {loadConfig} from '../server/config/env.js';
import {Database} from '../server/db/pool.js';
import {prepareDemoCurrentPipeline} from '../server/services/demo-current-pipeline.js';
const config=loadConfig(),db=new Database(config);
try{console.log(JSON.stringify(await prepareDemoCurrentPipeline(db,config),null,2));}
catch{console.error('Current pipeline preparation stopped. Verify the isolated demo, existing showcase and staff availability. Existing records were preserved; credentials and database details are omitted.');process.exitCode=1;}
finally{await db.close();}
