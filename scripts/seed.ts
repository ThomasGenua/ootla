import { assertOotlaDatabase, ConfigurationError, loadConfig } from '../server/config/env.js';
import { Database } from '../server/db/pool.js';
import { ApiError } from '../server/http/errors.js';
import { seedDemo } from '../server/services/demo-seed.js';
async function main() {
  const config=loadConfig();
  assertOotlaDatabase(config);
  if(!config.demoMode || config.production || !/^ootla_demo(?:_[a-z0-9_]+)?$/.test(config.databaseName??'')) throw new ConfigurationError('Demo seeding requires DEMO_MODE=true outside production and a dedicated ootla_demo or ootla_demo_* database. No data was changed.');
  const database=new Database(config);
  try {
    const result=await seedDemo(database,config);
    console.info(result.changedRecords ? 'Prepared the isolated Ootla demo administrator and synthetic portfolio. Existing passwords, permissions and unrelated data were preserved.' : 'Ootla demo records already exist. Existing passwords, permissions and data were preserved.');
  } finally { await database.close(); }
}
main().catch((error:unknown)=>{console.error(error instanceof ConfigurationError || error instanceof ApiError ? error.message : 'Demo seed failed. Check PostgreSQL setup and permissions. Credentials and raw database errors are omitted.');process.exitCode=1;});
