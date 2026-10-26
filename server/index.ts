import {assertRuntimeDatabaseIsolation} from './runtime-isolation.js';
import {startOperationalRetentionWorker} from './services/operational-retention-worker.js';
import {startVoiceRetentionWorker} from './services/voice-retention-worker.js';
import {startAutomationWorker} from './services/automation-worker.js';
import type { Server } from 'node:http';
import { createApp } from './app.js';
import { ConfigurationError, loadConfig } from './config/env.js';
import { Database } from './db/pool.js';
import {ApiError} from './http/errors.js';
import { startTaskReminderWorker } from './services/tasks.js';
import { startImportWorker } from './services/imports.js';
import { startGoogleCalendarWorker } from './services/google-calendar-worker.js';
import { startConnectorWorker } from './services/connectors.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const database = new Database(config);
  // Compiled releases must be ready before any socket or background worker starts.
  if(config.databaseUrl||config.serveCompiledClient){try{await database.requireReady();await assertRuntimeDatabaseIsolation(database,config);}catch(error){await database.close();throw error;}}
  const app = createApp(config, database);
  let server: Server;
  let stopReminders: (() => Promise<void>) | undefined;
  let stopImports: (() => Promise<void>) | undefined;
  let stopGoogleCalendar: (() => Promise<void>) | undefined;
  let stopOperationalRetention:(()=>Promise<void>)|undefined;
  let stopVoiceRetention:(()=>Promise<void>)|undefined;
  let stopAutomations: (() => Promise<void>) | undefined;
  let stopConnectors: (() => Promise<void>) | undefined;
  try {
    server = app.listen(config.port, config.bindHost, () => {
      stopOperationalRetention = startOperationalRetentionWorker(database);
      stopVoiceRetention = startVoiceRetentionWorker(database,config);
      stopAutomations = startAutomationWorker(database,config);
      stopReminders = startTaskReminderWorker(database);
      stopImports = startImportWorker(database);
      stopConnectors = startConnectorWorker(database, config);
      stopGoogleCalendar = startGoogleCalendarWorker(database,config);
      console.info(`Ootla API listening on http://${config.bindHost.includes(':')?'['+config.bindHost+']':config.bindHost}:${config.port}`);
      if (!config.databaseUrl) console.info('PostgreSQL is not configured. Public pages remain available; staff login requires database setup.');
    });
  } catch {
    await database.close();
    throw new Error('SERVER_START_FAILED');
  }
  server.on('error', () => {
    console.error('Ootla could not listen on PORT. Check that the port is available.');
    void Promise.all([stopReminders?.(),stopImports?.(),stopConnectors?.(),stopGoogleCalendar?.(),stopAutomations?.(),stopVoiceRetention?.(),stopOperationalRetention?.()]).finally(() => database.close()).finally(() => { process.exitCode = 1; });
  });
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    console.info('Stopping Ootla and closing database connections.');
    const deadline = setTimeout(() => {
      server.closeAllConnections();
      process.exit(1);
    }, 10_000);
    deadline.unref();
    server.close(() => {
      void Promise.all([stopReminders?.(),stopImports?.(),stopConnectors?.(),stopGoogleCalendar?.(),stopAutomations?.(),stopVoiceRetention?.(),stopOperationalRetention?.()]).then(() => database.close()).then(() => {
        clearTimeout(deadline);
        process.exitCode = 0;
      }).catch(() => {
        clearTimeout(deadline);
        process.exitCode = 1;
      });
    });
    server.closeIdleConnections();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigurationError || error instanceof ApiError ? error.message : 'Ootla could not start. Check server configuration and installed dependencies.');
  process.exitCode = 1;
});

