import type { QueryResult, QueryResultRow } from 'pg';
import type { ServerConfig } from '../config/env.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { verifyPassword } from './passwords.js';

interface Queryable { query<T extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<T>> }
/** Check the connected database, not just the name in an environment variable. */
export async function isIsolatedDemo(config: ServerConfig, database: Queryable): Promise<boolean> {
  if (!config.demoMode || config.production || !config.databaseName || !/^ootla_demo(?:_[a-z0-9_]+)?$/.test(config.databaseName)) return false;
  const url = new URL(config.databaseUrl);
  if (url.search || url.hash) return false;
  const result = await database.query<{ database_name: string; live_organizations: boolean; mixed_demo_user: boolean }>(`
    SELECT current_database() AS database_name,
      EXISTS(SELECT 1 FROM organizations WHERE environment <> 'demo') AS live_organizations,
      EXISTS(SELECT 1 FROM users u JOIN organization_memberships m ON m.user_id=u.id
             JOIN organizations o ON o.id=m.organization_id WHERE (u.is_demo OR u.email=$1 OR u.email='admin@demo.ootla.test')
             AND o.environment<>'demo') AS mixed_demo_user
  `, [config.demoAdminEmail]);
  const row = result.rows[0];
  return Boolean(row && row.database_name === config.databaseName && !row.live_organizations && !row.mixed_demo_user);
}
export async function requireIsolatedDemo(config: ServerConfig, database: Queryable): Promise<void> {
  if (!await isIsolatedDemo(config, database)) throw new ApiError(403, 'DEMO_ENVIRONMENT_REQUIRED', 'Demo access requires DEMO_MODE=true and a verified isolated demo database without live organizations. No data was changed.');
}
export async function preparedDemoAccount(config: ServerConfig, database: Database): Promise<boolean> {
  if (!await isIsolatedDemo(config, database)) return false;
  const result = await database.query<{ password_hash: string }>(`
    SELECT u.password_hash FROM users u
    JOIN organization_memberships m ON m.user_id=u.id AND m.active=TRUE AND m.role='organization_admin'
    JOIN organizations o ON o.id=m.organization_id AND o.slug='ootla-demo' AND o.environment='demo'
    WHERE u.email=$1 AND u.active=TRUE AND u.account_kind='staff' AND u.is_demo=TRUE
  `, [config.demoAdminEmail]);
  return Boolean(result.rows[0] && await verifyPassword(result.rows[0].password_hash, config.demoAdminPassword));
}
