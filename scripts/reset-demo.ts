import { assertOotlaDatabase, ConfigurationError, loadConfig } from '../server/config/env.js';
import { Database } from '../server/db/pool.js';
import { ApiError } from '../server/http/errors.js';
import { resetDemo } from '../server/services/demo-seed.js';
async function main() {
  const config=loadConfig();
  assertOotlaDatabase(config);
  const arguments_=process.argv.slice(2);
  if(arguments_.length!==1 || !arguments_[0]!.startsWith('--confirm-reset=')) throw new ConfigurationError('Reset requires exactly --confirm-reset=<exact demo database name>. No data was changed.');
  const database=new Database(config);
  try {
    await resetDemo(database,config,arguments_[0]!.slice('--confirm-reset='.length));
    console.info('Restored only the owned synthetic Ootla demo dataset and demo administrator credentials. Demo administrator sessions were revoked. Other records and audit history were preserved.');
  } finally { await database.close(); }
}
main().catch((error:unknown)=>{console.error(error instanceof ConfigurationError || error instanceof ApiError ? error.message : 'Demo reset failed. Check PostgreSQL setup and permissions. Credentials and raw database errors are omitted.');process.exitCode=1;});
