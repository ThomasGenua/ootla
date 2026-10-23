import 'dotenv/config';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';
import { loadConfig } from '../dist/server/server/config/env.js';

// This opt-in check briefly restarts ONLY this repository's local demo cluster.
// It never invokes a migration, seed or reset, and never changes stored passwords.
// Run it after browser checks, with no other Ootla development checks in progress.
const root = path.resolve(import.meta.dirname, '..');
const config = loadConfig();
const url = new URL(config.databaseUrl);
assert(config.demoMode && !config.production && config.databaseName === 'ootla_demo',
  'Restart verification requires explicit non-production DEMO_MODE and the retained ootla_demo database.');
assert(url.hostname === '127.0.0.1' && url.port === '55439' && url.username === 'ootla' && url.pathname === '/ootla_demo' && !url.search && !url.hash,
  'Restart verification requires the documented project-owned local database connection.');
assert(existsSync(path.join(root, 'dist/server/server/index.js')), 'Run npm run build before restart verification.');
const ownerUrl = new URL(url);
ownerUrl.username = 'ootla_cluster_owner';
ownerUrl.pathname = '/postgres';
const normalize = (value) => path.resolve(value).replaceAll('\\', '/').toLowerCase();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ownedChildren = [];
let app;
let token;
let sessionUser;
let restorePostgres = false;
let phase = 'isolated local cluster verification';
let passed = 0;
const pass = (label) => { passed += 1; console.log(`PASS ${label}`); };

async function withClient(connectionString, operation) {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 3_000, statement_timeout: 5_000 });
  // Database restart errors must not emit unsanitized asynchronous error output.
  client.on('error', () => undefined);
  try {
    await client.connect();
    return await operation(client);
  } finally { await client.end().catch(() => undefined); }
}
async function verifyLocalCluster() {
  await withClient(ownerUrl.toString(), async (client) => {
    const identity = await client.query('SHOW data_directory');
    assert(normalize(identity.rows[0]?.data_directory ?? '') === normalize(path.join(root, '.local/postgres/data')),
      'Refusing to stop any PostgreSQL instance outside this Ootla repository.');
    const database = await client.query('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1', ['ootla_demo']);
    assert(database.rowCount === 1 && database.rows[0]?.owner === 'ootla', 'The retained demo database must belong to the restricted Ootla application role.');
  });
  await withClient(config.databaseUrl, async (client) => {
    const identity = await client.query('SELECT current_database() AS name,rolsuper FROM pg_roles WHERE rolname=current_user');
    assert(identity.rows[0]?.name === 'ootla_demo' && !identity.rows[0]?.rolsuper, 'Application queries must use the isolated demo database and restricted role.');
    const live = await client.query("SELECT 1 FROM organizations WHERE environment<>'demo' LIMIT 1");
    assert(live.rowCount === 0, 'Never restart a demo database containing live customer organizations.');
  });
}
async function persistentSnapshot() {
  return withClient(config.databaseUrl, async (client) => {
    const user = await client.query(`SELECT u.id,u.password_hash,u.active,u.is_demo,m.id AS membership_id,m.role,m.active AS membership_active,o.id AS organization_id,o.environment
      FROM users u JOIN organization_memberships m ON m.user_id=u.id JOIN organizations o ON o.id=m.organization_id
      WHERE u.email=$1 AND o.slug='ootla-demo'`, [config.demoAdminEmail]);
    assert(user.rowCount === 1 && user.rows[0]?.is_demo && user.rows[0]?.active && user.rows[0]?.membership_active && user.rows[0]?.role === 'organization_admin' && user.rows[0]?.environment === 'demo',
      'An existing prepared database-backed demo administrator is required; this check will not seed one.');
    const organizationId = user.rows[0].organization_id;
    const manifest = await client.query('SELECT entity_type,seed_key,record_id FROM demo_seed_records WHERE organization_id=$1 ORDER BY entity_type,seed_key', [organizationId]);
    assert(manifest.rowCount === 20, 'An existing complete representative dataset is required; this check will not seed one.');
    const audit = await client.query("SELECT action,count(*)::integer AS count FROM audit_events WHERE organization_id=$1 AND action IN ('demo.seed','demo.reset') GROUP BY action ORDER BY action", [organizationId]);
    return { user: user.rows[0], manifest: manifest.rows, seedResetAudit: audit.rows };
  });
}
async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}
async function startOwnedApp() {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [path.join(root, 'dist/server/server/index.js')], {
    cwd: root, windowsHide: true, stdio: 'ignore',
    env: { ...process.env, NODE_ENV: 'test', PORT: String(port), APP_URL: origin, DEMO_MODE: 'true', DATABASE_URL: config.databaseUrl },
  });
  let ended = false;
  const exit = new Promise((resolve) => {
    child.once('exit', () => { ended = true; resolve(); });
    child.once('error', () => { ended = true; resolve(); });
  });
  const owned = {
    child, origin,
    request: (route, init = {}) => fetch(origin + route, { redirect: 'manual', signal: AbortSignal.timeout(3_000), ...init }),
    close: async () => {
      if (!ended) {
        // This is the direct Node child created above; never kill by port or process name.
        child.kill('SIGTERM');
        let deadline;
        const finished = await Promise.race([exit.then(() => true), new Promise((resolve) => { deadline = setTimeout(() => resolve(false), 12_000); })]);
        clearTimeout(deadline);
        if (!finished) { child.kill('SIGKILL'); await exit; }
      }
      await exit;
    },
  };
  ownedChildren.push(owned);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (ended) break;
    try {
      const response = await owned.request('/api/health');
      const state = await response.json();
      if (response.status === 200 && state.database === 'ready') return owned;
    } catch { /* Startup can briefly precede the listening socket. */ }
    await pause(150);
  }
  await owned.close();
  throw new Error('Owned development API child did not become healthy.');
}
async function signedInState(current) {
  const headers = { Cookie: token };
  const me = await current.request('/api/auth/me', { headers });
  assert(me.status === 200, 'A real persisted server session must remain valid across restarts.');
  const user = (await me.json()).user;
  assert(user.id === sessionUser.id && user.organization.id === sessionUser.organization.id && user.organization.role === 'organization_admin',
    'Restart must preserve the authenticated database-backed demo membership.');
  const response = await current.request('/api/demo/data', { headers });
  assert(response.status === 200, 'The persisted representative demo data must remain accessible.');
  const data = await response.json();
  assert(data.demo && data.integrationsMode === 'simulation' && data.outboundMode === 'simulation', 'Restart must retain simulated external integration and communication modes.');
  assert(data.leads.some((lead) => lead.name === 'Maya Chen') && data.leads.some((lead) => lead.name === 'Jordan Ellis') && data.leads.some((lead) => lead.name === 'Priya Shah'),
    'Restart must retain all requested representative leads.');
  return { user, data };
}
async function localDatabaseCommand(action) {
  assert(action === 'stop' || action === 'start', 'Unexpected local database operation.');
  // Existing helper restricts all service operations to .local/postgres/data.
  // Its captured output is intentionally never printed because it is not needed here.
  await promisify(execFile)(process.execPath, [path.join(root, 'scripts/local-db.mjs'), action], {
    cwd: root, windowsHide: true, timeout: 30_000,
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: config.databaseUrl, DEMO_MODE: 'true' },
  });
}
async function waitForReconnectedApp(current) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await current.request('/api/health');
      if (response.status === 200 && (await response.json()).database === 'ready') return;
    } catch { /* Allow the established pool to reconnect after PostgreSQL starts. */ }
    await pause(200);
  }
  throw new Error('The owned API did not reconnect to the restarted local database.');
}

try {
  await verifyLocalCluster();
  const before = await persistentSnapshot();
  pass('retained demo database and project-owned local cluster are verified without seeding or resetting');

  phase = 'normal login baseline';
  app = await startOwnedApp();
  const login = await app.request('/api/auth/login', {
    method: 'POST', headers: { Origin: app.origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: config.demoAdminEmail, password: config.demoAdminPassword }),
  });
  assert(login.status === 200, 'Normal password sign-in must succeed; restart verification never bypasses authentication.');
  const setCookie = login.headers.get('set-cookie');
  assert(setCookie && /HttpOnly/i.test(setCookie), 'Normal sign-in must produce the established server-managed cookie.');
  token = setCookie.split(';')[0];
  sessionUser = (await login.json()).user;
  const baseline = await signedInState(app);

  const originalProcessId = app.child.pid;
  const postgresStartedBefore = await withClient(config.databaseUrl, async (client) => (await client.query('SELECT pg_postmaster_start_time()::text AS started')).rows[0].started);

  phase = 'actual owned Node server restart';
  await app.close();
  app = await startOwnedApp();
  assert(app.child.pid && app.child.pid !== originalProcessId, 'Node restart must create a new owned server process.');
  const afterNodeRestart = await signedInState(app);
  assert(JSON.stringify(afterNodeRestart) === JSON.stringify(baseline), 'Actual Node process restart must preserve the same session identity, expiry and persisted dataset.');
  assert(JSON.stringify(await persistentSnapshot()) === JSON.stringify(before), 'Node restart must preserve stored password, membership, fixture identities and seed/reset audit counts.');
  pass('actual owned Node server process restart preserves the same database session and representative records');

  phase = 'actual project-owned PostgreSQL restart';
  await verifyLocalCluster();
  // Mark restoration before stopping so a timeout or partial command still triggers recovery.
  restorePostgres = true;
  await localDatabaseCommand('stop');
  await localDatabaseCommand('start');
  await verifyLocalCluster();
  await waitForReconnectedApp(app);
  restorePostgres = false;
  const postgresStartedAfter = await withClient(config.databaseUrl, async (client) => (await client.query('SELECT pg_postmaster_start_time()::text AS started')).rows[0].started);
  assert(postgresStartedAfter !== postgresStartedBefore, 'The project-owned PostgreSQL postmaster must have actually restarted.');
  const afterDatabaseRestart = await signedInState(app);
  assert(JSON.stringify(afterDatabaseRestart) === JSON.stringify(baseline), 'Actual PostgreSQL restart must preserve the original session and all representative data.');
  pass('actual project-owned PostgreSQL restart preserves the session and data while the owned API reconnects');

  phase = 'restart preservation verification';
  assert(JSON.stringify(await persistentSnapshot()) === JSON.stringify(before), 'Restarts must never reset passwords, membership, fixture identities or demo seed/reset history.');
  pass('existing password hash, membership, fixture manifest and demo seed/reset audit counts are unchanged');
  console.log(`Stage 03 actual restart checks complete: ${passed} groups passed.`);
} catch {
  console.error(`Stage 03 actual restart checks failed during ${phase}. Credentials and raw process/database errors are omitted.`);
  process.exitCode = 1;
} finally {
  if (restorePostgres) {
    try {
      await localDatabaseCommand('start');
      await verifyLocalCluster();
      restorePostgres = false;
    } catch {
      console.error('Could not restore the project-owned demo cluster. Run npm run db:local before using Ootla again.');
      process.exitCode = 1;
    }
  }
  // Revoke only this check's own session; other users' sessions remain intact.
  if (token && sessionUser && !restorePostgres) {
    try {
      const digest = createHmac('sha256', config.sessionSecret).update(token.split('=')[1]).digest('hex');
      await withClient(config.databaseUrl, (client) => client.query('DELETE FROM sessions WHERE token_digest=$1 AND user_id=$2 AND organization_id=$3', [digest, sessionUser.id, sessionUser.organization.id]));
    } catch {
      console.error('Could not revoke the restart check session; it will follow the normal session expiry.');
      process.exitCode = 1;
    }
  }
  for (const owned of ownedChildren.reverse()) {
    try { await owned.close(); }
    catch { console.error('Could not stop an owned restart-check API child.'); process.exitCode = 1; }
  }
  if (!restorePostgres) console.log('PASS owned API children are stopped and the project-owned demo PostgreSQL cluster remains running');
}

