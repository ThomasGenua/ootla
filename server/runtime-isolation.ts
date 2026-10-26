import type {Database} from './db/pool.js';
import {ConfigurationError,type ServerConfig} from './config/env.js';

const previewName=/^ootla_demo(?:_[a-z0-9_]+)?$/;
/** Call after migration readiness and before opening listeners or starting any worker. */
export async function assertRuntimeDatabaseIsolation(database:Database,config:ServerConfig):Promise<void>{
 if(!config.databaseUrl){
  if(config.production||config.serveCompiledClient)throw new ConfigurationError('A dedicated database is required before this runtime can start.');
  return; // Optional public-only local development has no private records or durable jobs.
 }
 if(!config.databaseName)throw new ConfigurationError('A dedicated database name is required.');
 if(config.demoMode&&(config.production||!previewName.test(config.databaseName)))throw new ConfigurationError('Interactive preview requires its separate preview runtime and dedicated database.');
 if(!config.demoMode&&previewName.test(config.databaseName))throw new ConfigurationError('Customer runtime cannot use a preview database. Preserve the separate preview configuration.');
 const row=(await database.query<{name:string;customer_organizations:boolean;preview_organizations:boolean;preview_users:boolean}>(`SELECT current_database() AS name,
  EXISTS(SELECT 1 FROM organizations WHERE environment<>'demo') AS customer_organizations,
  EXISTS(SELECT 1 FROM organizations WHERE environment='demo') AS preview_organizations,
  EXISTS(SELECT 1 FROM users WHERE is_demo) AS preview_users`)).rows[0];
 if(!row||row.name!==config.databaseName)throw new ConfigurationError('The connected database does not match this runtime configuration.');
 if(config.demoMode&&row.customer_organizations)throw new ConfigurationError('Interactive preview cannot start with customer organizations. No listener or worker was started.');
 if(!config.demoMode&&(row.preview_organizations||row.preview_users))throw new ConfigurationError('Customer runtime cannot start with preview organizations or identities. No listener or worker was started.');
}
