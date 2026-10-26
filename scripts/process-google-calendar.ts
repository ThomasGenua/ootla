import {assertRuntimeDatabaseIsolation} from '../server/runtime-isolation.js';
import { loadConfig } from '../server/config/env.js';
import { Database } from '../server/db/pool.js';
import { processGoogleCalendarJobs } from '../server/services/google-calendar.js';
const config=loadConfig(),database=new Database(config);
try{await database.requireReady();await assertRuntimeDatabaseIsolation(database,config);const result=await processGoogleCalendarJobs(config,database);console.log('Google Calendar bounded pass processed '+result.processed+' jobs. Demo and disabled connections perform no external requests.');}
catch{console.error('Google Calendar pass failed. Review server configuration and connection status; local bookings remain saved.');process.exitCode=1;}
finally{await database.close();}
