import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { assertOotlaDatabase, ConfigurationError, loadConfig } from '../server/config/env.js';
import { Database } from '../server/db/pool.js';

class MigrationError extends Error {}

async function main() {
  const config = loadConfig();
  assertOotlaDatabase(config);
  const database = new Database(config);
  const pool = database.pool;
  if (!pool) throw new ConfigurationError('DATABASE_URL is required for migrations. No database was changed.');
  let client;
  let locked = false;
  try {
    client = await pool.connect();
    const identity = await client.query<{ database: string }>('SELECT current_database() AS database');
    if (identity.rows[0]?.database !== config.databaseName) throw new MigrationError('Database identity did not match DATABASE_URL. No schema was changed.');
    const directory = path.resolve(process.cwd(), 'migrations');
    const sqlFiles = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
    if (!sqlFiles.length || sqlFiles.some((name) => !/^\d{3}_[a-z0-9_]+\.sql$/.test(name))) {
      throw new MigrationError('Migration names must follow 001_description.sql. No migration was applied.');
    }
    await client.query('SELECT pg_advisory_lock($1)', [6_856_201]);
    locked = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const previous = await client.query<{ name: string; checksum: string }>('SELECT name, checksum FROM schema_migrations ORDER BY name');
    const applied = new Map(previous.rows.map((row) => [row.name, row.checksum]));
    if (previous.rows.some((row) => !sqlFiles.includes(row.name))) {
      throw new MigrationError('An applied migration is missing from migrations/. Restore it before continuing.');
    }
    const migrations = await Promise.all(sqlFiles.map(async (name) => {
      const sql = await readFile(path.join(directory, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      if (applied.has(name) && applied.get(name) !== checksum) throw new MigrationError(`Applied migration ${name} was changed. Restore it and add a new migration instead.`);
      return { name, sql: sql.replace(/^\uFEFF/, ''), checksum };
    }));
    let count = 0;
    for (const migration of migrations) {
      if (applied.has(migration.name)) continue;
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [migration.name, migration.checksum]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
      console.info(`Applied ${migration.name}`);
      count += 1;
    }
    console.info(count ? `Applied ${count} Ootla migration(s).` : 'Ootla migrations are already up to date.');
  } finally {
    if (client) {
      if (locked) await client.query('SELECT pg_advisory_unlock($1)', [6_856_201]).catch(() => undefined);
      client.release();
    }
    await database.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigurationError || error instanceof MigrationError ? error.message : 'Migration failed. Check PostgreSQL availability, DATABASE_URL and database permissions. Credentials and raw database errors are omitted.');
  process.exitCode = 1;
});
