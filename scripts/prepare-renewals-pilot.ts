import '../server/config/environment.js';
import {loadConfig} from '../server/config/env.js';
import {Database} from '../server/db/pool.js';
import {prepareRenewalsPilotDemo} from '../server/services/renewals-pilot-demo.js';
const config=loadConfig(),db=new Database(config);
try{const result=await prepareRenewalsPilotDemo(db,config);console.log(JSON.stringify(result,null,2));}
catch{console.error('Renewals pilot preparation stopped. Verify the isolated demo and its existing showcase; accounts, credentials and raw database errors are omitted.');process.exitCode=1;}
finally{await db.close();}