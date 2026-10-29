import {polishDemoTaskDescriptions} from '../server/services/demo-task-descriptions.js';
import {readInstanceDefaults} from '../server/config/instance-files.js';
import {assertOotlaDatabase,ConfigurationError,loadConfig} from '../server/config/env.js';
import {Database} from '../server/db/pool.js';
import {ApiError} from '../server/http/errors.js';
import {prepareDemoEnvironment} from '../server/services/demo-showcase-prepare.js';

async function main(){
 // Branch defaults are an additional operator safeguard; actual database and tenant isolation are also checked server-side.
 if(readInstanceDefaults()?.kind!=='demo')throw new ConfigurationError('Run demo:prepare from the dedicated ootla-v1-demo checkout. No database was opened or changed.');
 const config=loadConfig();assertOotlaDatabase(config);
 if(!config.demoMode||config.production||!/^ootla_demo(?:_[a-z0-9_]+)?$/.test(config.databaseName??''))throw new ConfigurationError('Demo preparation requires the separate non-production DEMO_MODE runtime and its isolated ootla_demo database. No database was opened or changed.');
 const db=new Database(config);
 try{
  const r=await prepareDemoEnvironment(db,config);
  await polishDemoTaskDescriptions(db,config);
  console.info(r.changedRecords?'Prepared representative synthetic demo records through the persistent application modules.':'The synthetic demo is already prepared. Existing records and staff edits were preserved.');
  console.info('Existing passwords, memberships and customer data were preserved. No emails, SMS, telephone calls, payments or real Google invitations were sent.');
  console.info('Open /admin/login and use Fill demo credentials, then Sign in. Applicant and resident walkthroughs remain separate authorized accounts.');
  console.info(r.imports.completed?'The standalone demo has four reconciled CSV imports, with one deliberate invalid row available for error review.':'A standalone example needs review; existing mappings, ambiguous matches and staff decisions were preserved. Open Imports in the standalone workspace.');
  console.info(r.capabilities.connector.initialSyncQueued?'The synthetic Yardi initial sync was queued through the durable connector. Keep the normal application running to process it.':'The existing connector configuration was preserved.');
 }finally{await db.close();}
}
main().catch((error:unknown)=>{console.error(error instanceof ConfigurationError||error instanceof ApiError?error.message:'Demo preparation failed. Existing data was not reset; check the isolated database and retry the same explicit command. Private configuration and raw database errors are omitted.');process.exitCode=1;});
