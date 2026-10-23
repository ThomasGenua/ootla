import { assertOotlaDatabase, loadConfig } from '../server/config/env.js';
import { Database } from '../server/db/pool.js';
import { processImportBatches } from '../server/services/imports.js';
const config = loadConfig();
assertOotlaDatabase(config);
const database = new Database(config);
try {
    await database.requireReady();
    console.info(JSON.stringify({ processedRows: await processImportBatches(database) }));
}
catch {
    console.error('Standalone import processing failed. Check the Ootla database configuration and migrations.');
    process.exitCode = 1;
}
finally {
    await database.close();
}
