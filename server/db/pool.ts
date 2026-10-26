import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import type { DatabaseState } from '../../shared/contracts.js';
import type { ServerConfig } from '../config/env.js';
import { ApiError, DatabaseUnavailableError } from '../http/errors.js';
import {migrationManifest,migrationHistoryMatches,MigrationManifestError,type AppliedMigration} from './migrations.js';

export class Database {
  readonly pool: Pool | null;
  private readonly databaseName:string|null;

  constructor(config: ServerConfig) {
    this.databaseName=config.databaseName;
    this.pool = config.databaseUrl ? new Pool({
      connectionString: config.databaseUrl,
      ssl:config.databaseTls.mode==='verify-full'?{rejectUnauthorized:true,minVersion:'TLSv1.2',...(config.databaseTls.ca?{ca:config.databaseTls.ca}:{})}:false,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 2_500,
      statement_timeout: 5_000,
      application_name: 'ootla',
    }) : null;
    this.pool?.on('error', () => console.error('Database idle connection failed. Check database availability.'));
  }

  async query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []): Promise<QueryResult<T>> {
    if (!this.pool) throw new DatabaseUnavailableError('PostgreSQL is not configured. Set DATABASE_URL, then run npm run db:migrate.');
    try {
      return await this.pool.query<T>(sql, values);
    } catch {
      throw new DatabaseUnavailableError();
    }
  }

  async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new DatabaseUnavailableError('PostgreSQL is not configured. Set DATABASE_URL, then run npm run db:migrate.');
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect();
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => undefined);
      if (error instanceof ApiError) throw error;
      throw new DatabaseUnavailableError();
    } finally {
      client?.release();
    }
  }

  async state(): Promise<DatabaseState> {
    if(!this.pool)return 'unconfigured';
    try {
      const manifest=await migrationManifest();
      const identity=(await this.query<{database:string;history:boolean}>("SELECT current_database() AS database,to_regclass('public.schema_migrations') IS NOT NULL AS history")).rows[0];
      if(identity?.database!==this.databaseName)return 'unavailable';
      if(!identity.history)return 'migration-required';
      const applied=(await this.query<AppliedMigration>('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;
      if(!migrationHistoryMatches(manifest,applied))return 'migration-required';
      const tables=[...new Set(manifest.flatMap(file=>file.tables))];
      if(!tables.length)return 'migration-required';
      const complete=(await this.query<{ready:boolean}>(
        "SELECT NOT EXISTS(SELECT 1 FROM unnest($1::text[]) AS required(name) WHERE to_regclass('public.'||quote_ident(required.name)) IS NULL) AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='profile_version') AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='is_demo') AS ready",[tables])).rows[0]?.ready;
      return complete?'ready':'migration-required';
    } catch(error) {
      return error instanceof MigrationManifestError?'migration-required':'unavailable';
    }
  }

  async requireReady(): Promise<void> {
    const state = await this.state();
    if (state === 'ready') return;
    if (state === 'migration-required') throw new ApiError(503, 'MIGRATION_REQUIRED', 'Ootla requires the complete matching migration release. Keep migrations/ with the application and run npm run db:migrate before startup. Existing data is preserved; startup never applies migrations or seeds.');
    throw new DatabaseUnavailableError(state === 'unconfigured' ? 'PostgreSQL is not configured. Set DATABASE_URL and run npm run db:migrate.' : undefined);
  }

  async close(): Promise<void> {
    await this.pool?.end();
  }
}

