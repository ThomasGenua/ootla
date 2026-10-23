import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

// A project-owned opt-in development cluster, never a system service or shared database.
const root = resolve(import.meta.dirname, '..');
const local = resolve(root, '.local', 'postgres');
const data = resolve(local, 'data');
const command = process.argv[2] ?? 'start';
const binary = (name) => process.platform === 'win32' ? `${name}.exe` : name;
function run(name, args, options = {}) {
  const result = spawnSync(binary(name), args, { encoding: 'utf8', windowsHide: true, stdio: name === 'pg_ctl' ? 'ignore' : 'pipe', ...options });
  if (result.error) throw new Error(`Cannot run ${name}. Install PostgreSQL and add its bin directory to PATH.`);
  return result;
}
function required(name, args) {
  const result = run(name, args);
  if (result.status !== 0) throw new Error(`${name} failed. Inspect .local/postgres/server.log or run the documented setup steps.`);
  return result;
}
try {
  if (!['start', 'stop'].includes(command)) throw new Error('Usage: npm run db:local, or npm run db:local:stop.');
  if (process.env.NODE_ENV === 'production') throw new Error('Local demo cluster tools are disabled in production.');
  if (command === 'stop') {
    if (!existsSync(resolve(data, 'PG_VERSION'))) console.log('No project-owned PostgreSQL cluster exists.');
    else if (run('pg_ctl', ['-D', data, 'status']).status !== 0) console.log('Project-owned PostgreSQL is already stopped.');
    else { required('pg_ctl', ['-D', data, 'stop', '-m', 'fast', '-w']); console.log('Stopped only the project-owned Ootla PostgreSQL cluster.'); }
    process.exit(0);
  }
  if (!process.env.DATABASE_URL) throw new Error('Run npm run env:setup first, or configure DATABASE_URL in .env.');
  const url = new URL(process.env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.search || url.hash || url.hostname !== '127.0.0.1' || url.port !== '55439' || url.pathname !== '/ootla_demo' || url.username !== 'ootla') {
    throw new Error('Local cluster setup requires postgresql://ootla:<password>@127.0.0.1:55439/ootla_demo. Use db:migrate for other dedicated database configurations.');
  }
  const password = decodeURIComponent(url.password);
  if (password.length < 24 || password.startsWith('REPLACE_')) throw new Error('Set a random database password first (npm run env:setup).');
  mkdirSync(local, { recursive: true });
  const initialized = existsSync(resolve(data, 'PG_VERSION'));
  if (!initialized) {
    // Refuse a partial/unrecognized directory rather than deleting or overwriting it.
    if (existsSync(data)) throw new Error('The cluster data directory exists without PG_VERSION. Inspect it manually; no files were removed.');
    const pwPath = resolve(local, 'init-password');
    writeFileSync(pwPath, password + '\n', { mode: 0o600, flag: 'wx' });
    try {
      required('initdb', ['-D', data, '-U', 'ootla_cluster_owner', '--pwfile', pwPath, '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', '--encoding=UTF8', '--no-locale']);
    } finally { unlinkSync(pwPath); }
    writeFileSync(resolve(data, 'postgresql.conf'), '\nlisten_addresses = \'127.0.0.1\'\nport = 55439\n', { flag: 'a' });
    console.log('Initialized project-owned PostgreSQL on loopback port 55439.');
  }
  // Validate recorded configuration before operating on a retained cluster.
  const config = readFileSync(resolve(data, 'postgresql.conf'), 'utf8');
  if (!config.includes('port = 55439') || !config.includes("listen_addresses = '127.0.0.1'")) {
    throw new Error('Retained cluster configuration differs from the Ootla local setup; inspect it manually.');
  }
  if (run('pg_ctl', ['-D', data, 'status']).status !== 0) {
    required('pg_ctl', ['-D', data, '-l', resolve(local, 'server.log'), 'start', '-w']);
  }
  const ownerUrl = new URL(url);
  ownerUrl.username = 'ootla_cluster_owner';
  ownerUrl.pathname = '/postgres';
  const client = new pg.Client({ connectionString: ownerUrl.toString(), connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const clusterIdentity = await client.query('SHOW data_directory');
    const normalize = (value) => resolve(value).replaceAll('\\', '/').toLowerCase();
    if (normalize(clusterIdentity.rows[0].data_directory) !== normalize(data)) {
      throw new Error('The PostgreSQL listener is not the project-owned Ootla cluster. No roles or databases were changed.');
    }
    const role = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', ['ootla']);
    if (!role.rowCount) {
      // Identifiers and SQL structure are fixed; the value is escaped by PostgreSQL itself.
      const quoted = await client.query('SELECT quote_literal($1) AS value', [password]);
      await client.query(`CREATE ROLE ootla LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${quoted.rows[0].value}`);
    }
    const db = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', ['ootla_demo']);
    if (!db.rowCount) await client.query('CREATE DATABASE ootla_demo OWNER ootla');
  } finally { await client.end(); }
  const check = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
  try {
    await check.connect();
    await check.query('SELECT 1');
    console.log('Ootla demo database query succeeded as the restricted ootla application role. No unrelated database was modified.');
  } finally { await check.end(); }
} catch (error) {
  // Never print child-process output or URLs, which may contain configuration values.
  console.error(error instanceof Error && !('code' in error) ? error.message : 'Local database setup failed. Check PostgreSQL tools and .local/postgres/server.log.');
  process.exitCode = 1;
}
