import {assertRuntimeDatabaseIsolation} from '../server/runtime-isolation.js';
import { assertOotlaDatabase, loadConfig } from '../server/config/env.js';
import { Database } from '../server/db/pool.js';
import { processTaskReminders } from '../server/services/tasks.js';
const config = loadConfig();
assertOotlaDatabase(config);
const database = new Database(config);
try {
    await database.requireReady();await assertRuntimeDatabaseIsolation(database,config);
    console.info(JSON.stringify(await processTaskReminders(database)));
}
catch {
    console.error('In-app reminder processing failed. Check Ootla database configuration and migrations.');
    process.exitCode = 1;
}
finally {
    await database.close();
}
