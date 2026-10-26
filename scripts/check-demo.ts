import '../server/config/environment.js';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { createApp } from '../server/app.js';
import { loadConfig, type ServerConfig } from '../server/config/env.js';
import { Database } from '../server/db/pool.js';
import { hashPassword, verifyPassword } from '../server/services/passwords.js';
import type { AuthUser, DemoData, PublicConfig } from '../shared/contracts.js';

// Destructive reset checks run ONLY in a newly-created, uniquely named database
// on the verified project-owned local cluster. The retained demo DB is never seeded
// or reset here; application credentials remain in memory and never enter output.
const root = path.resolve(import.meta.dirname, '..');
const source = loadConfig();
const runId = randomUUID().replaceAll('-', '');
const scratchName = `ootla_demo_stage03_${runId}`;
const sourceUrl = new URL(source.databaseUrl);
assert(source.demoMode && !source.production, 'Demo checks require explicit non-production DEMO_MODE=true.');
assert(/^ootla_demo(?:_[a-z0-9_]+)?$/.test(source.databaseName ?? ''), 'Use an isolated Ootla demo database.');
assert(sourceUrl.hostname === '127.0.0.1' && sourceUrl.port === '55439' && sourceUrl.username === 'ootla' && !sourceUrl.search && !sourceUrl.hash,
  'Reset verification requires the documented project-owned local PostgreSQL cluster.');
const scratchUrl = new URL(sourceUrl);
scratchUrl.pathname = `/${scratchName}`;
const config: ServerConfig = { ...source, nodeEnv: 'test', production: false, appUrl: 'http://ootla.test', databaseUrl: scratchUrl.toString(), databaseName: scratchName };
const ownerUrl = new URL(sourceUrl);
ownerUrl.username = 'ootla_cluster_owner';
ownerUrl.pathname = '/postgres';
const owner = new Client({ connectionString: ownerUrl.toString(), connectionTimeoutMillis: 5_000 });
const database = new Database(config);
let ownsScratch = false;
let ownerConnected = false;
let groups = 0;
let phase = 'project-owned scratch database setup';
const servers: Array<() => Promise<void>> = [];
const pass = (label: string) => { groups += 1; console.log(`PASS ${label}`); };
const normalize = (value: string) => path.resolve(value).replaceAll('\\', '/').toLowerCase();

async function verifiedCluster() {
  const identity = await owner.query<{ data_directory: string }>('SHOW data_directory');
  assert(normalize(identity.rows[0]?.data_directory ?? '') === normalize(path.join(root, '.local/postgres/data')),
    'Refusing to operate on a PostgreSQL cluster outside this Ootla project.');
}
async function createScratch() {
  await owner.connect();
  ownerConnected = true;
  await verifiedCluster();
  assert(/^ootla_demo_stage03_[a-f0-9]{32}$/.test(scratchName), 'Unexpected scratch database identifier.');
  const existing = await owner.query('SELECT 1 FROM pg_database WHERE datname=$1', [scratchName]);
  assert(existing.rowCount === 0, 'The unique scratch database already exists; no database was changed.');
  const restricted = await owner.query<{ rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean }>(
    'SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1', ['ootla']);
  assert(restricted.rowCount === 1 && !restricted.rows[0]?.rolsuper && !restricted.rows[0]?.rolcreatedb && !restricted.rows[0]?.rolcreaterole,
    'Tests must use the established restricted Ootla application role.');
  const quoted = await owner.query<{ name: string }>('SELECT quote_ident($1) AS name', [scratchName]);
  await owner.query(`CREATE DATABASE ${quoted.rows[0]!.name} OWNER ootla`);
  ownsScratch = true;
  assert((await database.query<{ name: string }>('SELECT current_database() AS name')).rows[0]?.name === scratchName,
    'Scratch database connection identity did not match the newly created database.');
}
async function utility(script: string, args: string[] = [], overrides: NodeJS.ProcessEnv = {}, shouldSucceed = true) {
  let succeeded = true;
  try {
    await promisify(execFile)(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), path.join(root, script), ...args], {
      cwd: root, windowsHide: true, timeout: 30_000,
      env: { ...process.env, NODE_ENV: 'test', DEMO_MODE: 'true', DATABASE_URL: config.databaseUrl, APP_URL: config.appUrl, ...overrides },
    });
  } catch { succeeded = false; }
  assert(succeeded === shouldSucceed, shouldSucceed ? 'The isolated database command failed; raw process output is omitted.' : 'An unsafe database command unexpectedly succeeded.');
}
async function start(overrides: Partial<ServerConfig> = {}) {
  const current = { ...config, ...overrides };
  const db = new Database(current);
  const app = createApp(current, db);
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    server.closeIdleConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await db.close();
  };
  servers.push(close);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    close,
    request: (route: string, token = '', method = 'GET', body?: unknown) => fetch(base + route, {
      method, redirect: 'manual', headers: {
        ...(token ? { Cookie: token } : {}), ...(method !== 'GET' ? { Origin: current.appUrl } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    login: (email = config.demoAdminEmail, password = config.demoAdminPassword) => fetch(base + '/api/auth/login', {
      method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/json', Origin: current.appUrl }, body: JSON.stringify({ email, password }),
    }),
  };
}
function cookie(response: Response) {
  const value = response.headers.get('set-cookie');
  assert(value, 'Normal sign-in must create a server-managed session cookie.');
  return value.split(';')[0]!;
}
async function publicConfig(api: Awaited<ReturnType<typeof start>>) {
  const response = await api.request('/api/config');
  assert(response.status === 200, 'Public setup configuration should remain available.');
  return await response.json() as PublicConfig;
}
async function ensureDemoHidden(api: Awaited<ReturnType<typeof start>>, existingToken: string) {
  const visible = await publicConfig(api);
  assert(!visible.demoEnabled && !visible.demoCredentials, 'Unsafe demo configurations must never expose autofill credentials.');
  assert((await api.login()).status === 401, 'Unsafe demo environments must reject the real demo account.');
  assert((await api.request('/api/auth/me', existingToken)).status === 401, 'Existing demo cookies must not bypass the environment gate.');
  assert((await api.request('/api/admin/overview', existingToken)).status === 401, 'Unsafe demo environments must reject protected demo APIs.');
}

async function main() {
  await createScratch();
  await utility('scripts/migrate.ts');
  assert(await database.state() === 'ready', 'All additive migrations must prepare the scratch database.');
  pass('isolated scratch database and additive migrations use the restricted application role');

  phase = 'demo account seeding and idempotence';
  await utility('scripts/seed.ts');
  const seeded = await database.query<{ id: string; password_hash: string; organization_id: string; membership_id: string; role: string; environment: string }>(`
    SELECT u.id,u.password_hash,o.id AS organization_id,m.id AS membership_id,m.role,o.environment
    FROM users u JOIN organization_memberships m ON m.user_id=u.id JOIN organizations o ON o.id=m.organization_id
    WHERE u.email=$1
  `, [config.demoAdminEmail]);
  assert(seeded.rowCount === 1, 'Exactly one database-backed demo identity must exist.');
  const admin = seeded.rows[0]!;
  assert(admin.role === 'organization_admin' && admin.environment === 'demo', 'The demo administrator must be limited to its demo organization.');
  assert(admin.password_hash.startsWith('$argon2id$') && await verifyPassword(admin.password_hash, config.demoAdminPassword),
    'The documented demo password must be stored as a verifiable Argon2id hash.');
  await utility('scripts/seed.ts');
  const repeated = await database.query<{ id: string; password_hash: string }>('SELECT id,password_hash FROM users WHERE email=$1', [config.demoAdminEmail]);
  assert(repeated.rowCount === 1 && repeated.rows[0]?.id === admin.id && repeated.rows[0]?.password_hash === admin.password_hash,
    'Repeated seeding must preserve the established demo identity and password hash.');
  pass('real hashed organization-admin identity and repeatable seed preserve existing credentials');

  phase = 'normal login and session persistence';
  const api = await start();
  const visible = await publicConfig(api);
  assert(visible.databaseReady && visible.demoEnabled && visible.demoCredentials?.email === config.demoAdminEmail && visible.demoCredentials.password === config.demoAdminPassword,
    'Autofill credentials require verified database-backed demo readiness.');
  assert((await api.request('/api/auth/me')).status === 401, 'Autofill availability must not create a login session.');
  assert((await api.login(config.demoAdminEmail, 'invalid-demo-password')).status === 401, 'Invalid credentials must be rejected.');
  const login = await api.login();
  assert(login.status === 200, 'Normal sign-in must accept the seeded demo identity.');
  const token = cookie(login);
  assert(/HttpOnly/i.test(login.headers.get('set-cookie')!) && /SameSite=Lax/i.test(login.headers.get('set-cookie')!), 'Session cookies must retain established security attributes.');
  const authenticated = (await login.json() as { user: AuthUser }).user;
  assert(authenticated.id === admin.id && authenticated.organization.id === admin.organization_id && authenticated.organization.role === 'organization_admin',
    'Authentication must resolve the real demo membership.');
  assert(!authenticated.permissions.some((value) => /platform|superadmin/.test(value)), 'A demo organization administrator must not receive platform privileges.');
  assert((await api.request('/api/auth/me', token)).status === 200, 'Current-user loading must survive refresh.');
  const sessionDigest = createHmac('sha256', config.sessionSecret).update(token.split('=')[1]!).digest('hex');
  assert((await database.query('SELECT 1 FROM sessions WHERE user_id=$1 AND token_digest=$2', [admin.id, sessionDigest])).rowCount === 1,
    'The real session must persist as a digest in PostgreSQL.');
  await api.close();
  const restarted = await start();
  assert((await restarted.request('/api/auth/me', token)).status === 200, 'A new backend instance must accept the database-backed session.');
  pass('normal login, refreshed current-user loading and fresh backend instance preserve database sessions');

  phase = 'representative persisted portfolio and simulation';
  const expectedCounts = { properties: 3, units: 6, leads: 3, tasks: 3, viewings: 2, lead_activities: 3 } as const;
  for (const [table, expected] of Object.entries(expectedCounts)) {
    // Table names come solely from the fixed allowlist above, never request input.
    const result = await database.query<{ id: string }>(`SELECT id FROM ${table} WHERE organization_id=$1 AND seed_key LIKE 'stage03.%'`, [admin.organization_id]);
    assert(result.rowCount === expected, `Unexpected representative record count in ${table}.`);
  }
  const names = (await database.query<{ display_name: string }>('SELECT display_name FROM leads WHERE organization_id=$1 ORDER BY display_name', [admin.organization_id])).rows.map((row) => row.display_name);
  assert(names.join('|') === 'Jordan Ellis|Maya Chen|Priya Shah', 'The requested named representative leads must be persisted.');
  assert((await restarted.request('/api/demo/data')).status === 401, 'Synthetic portfolio data still requires normal staff authentication.');
  const datasetResponse = await restarted.request('/api/demo/data', token);
  assert(datasetResponse.status === 200, 'The authenticated demo dataset must be readable.');
  const dataset = await datasetResponse.json() as DemoData;
  assert(dataset.demo && dataset.integrationsMode === 'simulation' && dataset.outboundMode === 'simulation', 'Demo integrations and communication must be labeled simulation.');
  assert(dataset.properties.length === 3 && dataset.units.length === 6 && dataset.leads.length === 3 && dataset.tasks.length === 3 && dataset.viewings.length === 2 && dataset.activities.length === 3,
    'The API must expose actual representative records, without invented extra records.');
  assert(dataset.activities.every((record) => record.simulated), 'All seeded communication/activity records must be simulated.');
  for (const lead of dataset.leads) {
    assert(dataset.properties.some((property) => property.id === lead.propertyId), 'Every representative lead must link to a real property.');
    assert(!lead.unitId || dataset.units.some((unit) => unit.id === lead.unitId && unit.propertyId === lead.propertyId), 'Units must remain distinct from, and correctly linked to, properties.');
    assert(dataset.tasks.some((task) => task.leadId === lead.id && task.propertyId === lead.propertyId), 'Every representative lead needs a related persisted task.');
    assert(dataset.activities.some((activity) => activity.leadId === lead.id && activity.propertyId === lead.propertyId), 'Every representative lead needs related simulated activity.');
  }
  const secondDataset = await (await restarted.request('/api/demo/data', token)).json();
  assert(JSON.stringify(secondDataset) === JSON.stringify(dataset), 'Refresh must preserve the same persisted demo data.');
  await restarted.close();
  const afterRestart = await start();
  assert((await afterRestart.request('/api/auth/me', token)).status === 200, 'A subsequent backend instance must retain the session.');
  const thirdDataset = await (await afterRestart.request('/api/demo/data', token)).json();
  assert(JSON.stringify(thirdDataset) === JSON.stringify(dataset), 'A subsequent backend instance must retain the same persisted demo records.');
  const overview = await (await afterRestart.request('/api/admin/overview', token)).json() as { counts: Record<string, number>; modulesReady: boolean };
  assert(overview.counts.properties === 3 && overview.counts.leads === 3 && overview.counts.tasks === 3 && overview.counts.applications === 0 && overview.modulesReady === false,
    'The minimal overview must show real scoped counts while leaving full CRM workflows labeled incomplete.');
  pass('properties, separate units, named leads and related simulated records persist across refresh and new backend instances');

  phase = 'seed idempotence and preservation of staff edits';
  const sampleLead = dataset.leads[0]!;
  const seedManifest = (await database.query('SELECT entity_type,seed_key,record_id FROM demo_seed_records WHERE organization_id=$1 ORDER BY entity_type,seed_key', [admin.organization_id])).rows;
  assert(seedManifest.length === 20, 'All representative fixtures need a reset ownership manifest.');
  const changedPassword = `Stage03-${randomUUID()}!`;
  const changedHash = await hashPassword(changedPassword);
  await database.query('UPDATE users SET password_hash=$1,active=false WHERE id=$2', [changedHash, admin.id]);
  await database.query("UPDATE organization_memberships SET role='read_only_analyst' WHERE id=$1", [admin.membership_id]);
  await database.query('UPDATE leads SET notes=$1 WHERE id=$2', ['Staff edit retained by repeat seed', sampleLead.id]);
  await utility('scripts/seed.ts');
  const retained = (await database.query<{ password_hash: string; active: boolean; role: string }>(
    'SELECT u.password_hash,u.active,m.role FROM users u JOIN organization_memberships m ON m.user_id=u.id WHERE m.id=$1', [admin.membership_id])).rows[0];
  assert(retained?.password_hash === changedHash && !retained.active && retained.role === 'read_only_analyst', 'Routine seed must preserve changed passwords, disabled flags and existing membership roles.');
  assert((await database.query<{ notes: string }>('SELECT notes FROM leads WHERE id=$1', [sampleLead.id])).rows[0]?.notes === 'Staff edit retained by repeat seed',
    'Routine seed must preserve existing representative record edits.');
  assert(!(await publicConfig(afterRestart)).demoEnabled, 'Autofill must be hidden for an unprepared or changed demo administrator.');
  const repeatedManifest = (await database.query('SELECT entity_type,seed_key,record_id FROM demo_seed_records WHERE organization_id=$1 ORDER BY entity_type,seed_key', [admin.organization_id])).rows;
  assert(JSON.stringify(repeatedManifest) === JSON.stringify(seedManifest), 'Repeated seed must not duplicate or replace representative fixture identities.');
  pass('repeat seed preserves password changes, active flags, membership changes, record edits and fixture identities');

  phase = 'deliberate reset and preservation of unrelated records';
  const custom = { property: randomUUID(), lead: randomUUID(), user: randomUUID(), audit: '', password: `Custom-${randomUUID()}!` };
  const customHash = await hashPassword(custom.password);
  await database.transaction(async (client) => {
    await client.query('INSERT INTO properties(id,organization_id,name) VALUES($1,$2,$3)', [custom.property, admin.organization_id, 'User-created property preserved by reset']);
    await client.query(`INSERT INTO leads(id,organization_id,property_id,unit_id,display_name,email,status,intent,notes,seed_key)
      SELECT $1,organization_id,property_id,unit_id,$2,$3,status,intent,$4,$5 FROM leads WHERE id=$6`,
      [custom.lead, 'User-created lead', `custom-${runId}@demo.ootla.test`, 'Preserve this related record', 'stage03.unowned-record', sampleLead.id]);
    await client.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)',
      [custom.user, `custom-staff-${runId}@demo.ootla.test`, 'Custom staff preserved by reset', customHash]);
    await client.query("INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,'read_only_analyst')", [admin.organization_id, custom.user]);
    const audit = await client.query<{ id: string }>('INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,$3,$4) RETURNING id',
      [admin.organization_id, custom.user, 'stage03.check.custom_preserved', { synthetic: true }]);
    custom.audit = audit.rows[0]!.id;
  });
  await utility('scripts/reset-demo.ts', [], {}, false);
  await utility('scripts/reset-demo.ts', ['--confirm-reset=ootla_demo'], {}, false);
  assert((await database.query<{ notes: string }>('SELECT notes FROM leads WHERE id=$1', [sampleLead.id])).rows[0]?.notes === 'Staff edit retained by repeat seed',
    'Missing or incorrect reset confirmation must leave records unchanged.');
  await utility('scripts/reset-demo.ts', [`--confirm-reset=${scratchName}`]);
  const restoredAdmin = (await database.query<{ id: string; password_hash: string; active: boolean; role: string }>(
    'SELECT u.id,u.password_hash,u.active,m.role FROM users u JOIN organization_memberships m ON m.user_id=u.id WHERE m.id=$1', [admin.membership_id])).rows[0];
  assert(restoredAdmin?.id === admin.id && restoredAdmin.active && restoredAdmin.role === 'organization_admin' && await verifyPassword(restoredAdmin.password_hash, config.demoAdminPassword),
    'An explicitly confirmed reset must restore the demo account while preserving its existing identity.');
  assert((await database.query<{ notes: string }>('SELECT notes FROM leads WHERE id=$1', [sampleLead.id])).rows[0]?.notes === sampleLead.notes,
    'An explicitly confirmed reset must restore only its owned representative fixture values.');
  assert((await afterRestart.request('/api/auth/me', token)).status === 401, 'A deliberate demo reset must revoke existing demo sessions.');
  assert((await database.query('SELECT id FROM properties WHERE id=$1', [custom.property])).rowCount === 1, 'Reset must preserve user-created properties.');
  assert((await database.query<{ notes: string }>('SELECT notes FROM leads WHERE id=$1', [custom.lead])).rows[0]?.notes === 'Preserve this related record',
    'Reset must preserve custom records even when they reference a seeded property/unit or use an unowned stage03-prefixed key.');
  assert((await database.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id=$1', [custom.user])).rows[0]?.password_hash === customHash,
    'Reset must preserve unrelated users and their exact password hashes.');
  assert((await database.query('SELECT id FROM audit_events WHERE id=$1', [custom.audit])).rowCount === 1, 'Reset must preserve organization audit history.');
  const afterResetManifest = (await database.query('SELECT entity_type,seed_key,record_id FROM demo_seed_records WHERE organization_id=$1 ORDER BY entity_type,seed_key', [admin.organization_id])).rows;
  assert(JSON.stringify(afterResetManifest) === JSON.stringify(seedManifest), 'Reset must preserve fixture identities instead of replacing rows.');
  const restoredLogin = await afterRestart.login();
  assert(restoredLogin.status === 200, 'Normal demo sign-in must work again after a deliberate reset.');
  const protectedToken = cookie(restoredLogin);
  pass('reset requires the exact isolated database confirmation and restores only owned records while preserving custom data and audit history');

  phase = 'disabled demo access and ordinary live staff';
  const disabled = await start({ demoMode: false });
  await ensureDemoHidden(disabled, protectedToken);
  const production = await start({ demoMode: false, production: true, nodeEnv: 'production', appUrl: 'https://ootla.test' });
  await ensureDemoHidden(production, protectedToken);
  assert((await disabled.request('/api/demo/data', protectedToken)).status === 401, 'Disabled demo mode must also protect the demo dataset endpoint.');
  await utility('scripts/seed.ts', [], { DEMO_MODE: 'false' }, false);
  await utility('scripts/reset-demo.ts', [`--confirm-reset=${scratchName}`], { DEMO_MODE: 'false' }, false);
  pass('DEMO_MODE=false and production reject demo passwords and existing demo cookies without exposing credentials');

  phase = 'mixed live data fail-closed guard and tenant isolation';
  const live = { organization: randomUUID(), user: randomUUID(), password: `Live-${randomUUID()}!`, property: randomUUID() };
  const liveHash = await hashPassword(live.password);
  const liveEmail = `live-staff-${runId}@ootla.test`;
  await database.transaction(async (client) => {
    await client.query("INSERT INTO organizations(id,name,slug,environment) VALUES($1,$2,$3,'live')", [live.organization, 'Synthetic live organization', `stage03-live-${runId}`]);
    await client.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)', [live.user, liveEmail, 'Synthetic live staff', liveHash]);
    await client.query("INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,'organization_admin')", [live.organization, live.user]);
    await client.query('INSERT INTO properties(id,organization_id,name) VALUES($1,$2,$3)', [live.property, live.organization, 'Synthetic live property']);
  });
  await ensureDemoHidden(afterRestart, protectedToken);
  await utility('scripts/seed.ts', [], {}, false);
  await utility('scripts/reset-demo.ts', [`--confirm-reset=${scratchName}`], {}, false);
  const liveLogin = await disabled.login(liveEmail, live.password);
  assert(liveLogin.status === 200, 'Normal non-demo staff sign-in must continue working when demo mode is disabled.');
  const liveToken = cookie(liveLogin);
  assert((await disabled.request('/api/auth/me', liveToken)).status === 200, 'Normal live sessions must remain usable.');
  const livePropertiesResponse = await disabled.request('/api/properties', liveToken);
  assert(livePropertiesResponse.status === 200, 'Normal live staff should be able to use existing property APIs.');
  const liveProperties = await livePropertiesResponse.json() as { properties: Array<{ id: string; organizationId: string }> };
  assert(liveProperties.properties.length === 1 && liveProperties.properties[0]?.id === live.property && liveProperties.properties[0].organizationId === live.organization,
    'An organization administrator must see only its own organization records.');
  assert((await disabled.request(`/api/organizations/${admin.organization_id}/overview`, liveToken)).status === 403, 'Live staff cannot access another organization overview.');
  assert((await disabled.request(`/api/properties/${custom.property}`, liveToken)).status === 404, 'Live staff cannot read another organization property.');
  assert((await disabled.request('/api/demo/data', liveToken)).status === 403, 'Live staff cannot open the isolated demo dataset.');
  assert((await database.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id=$1', [live.user])).rows[0]?.password_hash === liveHash,
    'Refused demo commands must preserve live identities.');
  await disabled.request('/api/auth/logout', liveToken, 'POST');
  await database.query('DELETE FROM properties WHERE id=$1', [live.property]);
  await database.query('DELETE FROM audit_events WHERE organization_id=$1 OR actor_user_id=$2', [live.organization, live.user]);
  await database.query('DELETE FROM users WHERE id=$1', [live.user]);
  await database.query('DELETE FROM organizations WHERE id=$1', [live.organization]);
  pass('mixed live organizations disable demo access/seeding/reset while normal live staff remain isolated and usable');

  phase = 'connected database identity and configuration guards';
  const mismatched = await start({ databaseName: 'ootla_demo_stage03_identity_mismatch' });
  await ensureDemoHidden(mismatched, protectedToken);
  for (const overrides of [
    { NODE_ENV: 'production', APP_URL: 'https://ootla.test', DEMO_MODE: 'true' },
    { DATABASE_URL: config.databaseUrl.replace(`/${scratchName}`, '/ootla_live') },
    { DATABASE_URL: config.databaseUrl + '?host=foreign.test' },
    { DATABASE_URL: config.databaseUrl + '?port=5432' },
    { INTEGRATIONS_MODE: 'live' },
    { OUTBOUND_MODE: 'live' },
  ]) {
    assert.throws(() => loadConfig({ ...process.env, DATABASE_URL: config.databaseUrl, DEMO_MODE: 'true', ...overrides }),
      'Unsafe demo deployment, connection overrides and live external modes must fail configuration validation.');
  }
  assert((await afterRestart.request('/api/auth/me', protectedToken)).status === 200, 'Refused configurations and commands must not revoke a valid retained demo session.');
  const expiryLogin = await afterRestart.login();
  assert(expiryLogin.status === 200, 'Expiry fixture must sign in normally.');
  const expiryToken = cookie(expiryLogin);
  const expiryDigest = createHmac('sha256', config.sessionSecret).update(expiryToken.split('=')[1]!).digest('hex');
  await database.query("UPDATE sessions SET created_at=NOW()-INTERVAL '10 hours',expires_at=NOW()-INTERVAL '1 hour' WHERE token_digest=$1", [expiryDigest]);
  assert((await afterRestart.request('/api/auth/me', expiryToken)).status === 401, 'Expired sessions must require normal authentication again.');
  assert((await afterRestart.request('/api/auth/logout', protectedToken, 'POST')).status === 204, 'Normal logout must remain available.');
  assert((await afterRestart.request('/api/auth/me', protectedToken)).status === 401, 'Normal logout must revoke the server session.');
  pass('database identity, production, URL overrides, live external modes, expiry and logout all fail or revoke safely');
}

try {
  await main();
  console.log(`Stage 03 demo checks complete: ${groups} groups passed.`);
} catch {
  console.error(`Stage 03 demo checks failed during ${phase}. Credentials and raw database/process errors are omitted.`);
  process.exitCode = 1;
} finally {
  try {
    for (const close of servers.reverse()) await close();
    await database.close();
    if (ownsScratch) {
      await verifiedCluster();
      assert(/^ootla_demo_stage03_[a-f0-9]{32}$/.test(scratchName), 'Refusing unexpected scratch database cleanup target.');
      const target = await owner.query<{ owner: string }>(
        'SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1', [scratchName]);
      assert(target.rowCount === 1 && target.rows[0]?.owner === 'ootla', 'Scratch ownership changed; refusing database deletion.');
      const quoted = await owner.query<{ name: string }>('SELECT quote_ident($1) AS name', [scratchName]);
      await owner.query(`DROP DATABASE ${quoted.rows[0]!.name}`);
      assert((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1', [scratchName])).rowCount === 0, 'Scratch database cleanup did not complete.');
      console.log('PASS removed only the owned Stage 03 scratch database; retained demo data was never reset');
    }
  } catch {
    console.error('Stage 03 scratch database cleanup failed. No unrelated database deletion was attempted.');
    process.exitCode = 1;
  } finally {
    if (ownerConnected) await owner.end();
  }
}

