import '../server/config/environment.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.js';
import { loadConfig, type ServerConfig } from '../server/config/env.js';
import { Database } from '../server/db/pool.js';
import { hashPassword } from '../server/services/passwords.js';
import type { PublicConfig, AuthUser, AdminOverview } from '../shared/contracts.js';

const config = loadConfig();
assert(config.demoMode && /^ootla_demo(?:_[a-z0-9_]+)?$/.test(config.databaseName ?? ''), 'Run foundation checks only against an isolated demo database.');
const database = new Database(config);
const resources: Array<() => Promise<void>> = [];
let checks = 0;
function pass(label: string) { checks += 1; console.log(`PASS ${label}`); }
async function start(overrides: Partial<ServerConfig> = {}) {
  const current = { ...config, nodeEnv: 'test' as const, production: false, appUrl: 'http://ootla.test', ...overrides };
  const db = new Database(current);
  const app = createApp(current, db);
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  resources.push(async () => {
    server.closeIdleConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await db.close();
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    request: (route: string, init: RequestInit = {}) => fetch(base + route, { redirect: 'manual', ...init }),
    login: (email: string, password: string, cookie = '') => fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: current.appUrl, ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify({ email, password }),
    }),
    origin: current.appUrl,
  };
}
function cookie(response: Response) {
  const value = response.headers.get('set-cookie');
  assert(value, 'Expected a session cookie.');
  return value.split(';')[0]!;
}
const fixtureId = randomUUID();
const fixtureOrg = randomUUID();
const fixtureEmail = `foundation-${fixtureId}@demo.ootla.test`;
const fixturePassword = randomUUID() + '!';
try {
  assert.equal(await database.state(), 'ready');
  const identity = await database.query<{ name: string; superuser: boolean }>('SELECT current_database() AS name, rolsuper AS superuser FROM pg_roles WHERE rolname = current_user');
  assert.equal(identity.rows[0]?.name, config.databaseName);
  assert.equal(identity.rows[0]?.superuser, false);
  pass('real PostgreSQL query succeeds with a non-superuser application role');

  const migrationSql = await readFile(new URL('../migrations/001_foundation.sql', import.meta.url));
  const migration = await database.query('SELECT checksum FROM schema_migrations WHERE name = $1', ['001_foundation.sql']);
  assert.equal(migration.rows[0]?.checksum, createHash('sha256').update(migrationSql).digest('hex'));
  const before = await database.query('SELECT id, password_hash FROM users WHERE email = $1', [config.demoAdminEmail]);
  assert.equal(before.rowCount, 1);
  await promisify(execFile)(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/seed.ts'], { cwd: process.cwd(), windowsHide: true });
  const after = await database.query('SELECT id, password_hash FROM users WHERE email = $1', [config.demoAdminEmail]);
  assert.deepEqual(after.rows, before.rows);
  pass('applied migration checksum matches and repeated demo seed preserves identity/password');

  const api = await start();
  const publicConfig = await (await api.request('/api/config')).json() as PublicConfig;
  assert.equal(publicConfig.databaseReady, true);
  assert.equal(publicConfig.demoEnabled, true);
  assert.equal(publicConfig.demoCredentials!.email, config.demoAdminEmail);
  assert.equal((await api.request('/api/auth/me')).status, 401);
  assert.equal((await api.request('/api/admin/overview')).status, 401);
  pass('demo availability is database-backed and unauthenticated APIs deny access');

  for (const origin of ['', 'https://foreign.test']) {
    const response = await api.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify({ email: config.demoAdminEmail, password: config.demoAdminPassword }) });
    assert.equal(response.status, 403);
  }
  assert.equal((await api.login(config.demoAdminEmail, 'incorrect-password')).status, 401);
  assert.equal((await api.login("' OR 1=1 --", 'anything')).status, 400);
  const malformed = await api.request('/api/auth/login', { method: 'POST', headers: { Origin: api.origin, 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal(malformed.status, 400);
  pass('origin checks, invalid credentials, malicious input and malformed JSON are rejected');

  const login = await api.login(config.demoAdminEmail, config.demoAdminPassword);
  assert.equal(login.status, 200);
  const firstCookie = cookie(login);
  assert.match(login.headers.get('set-cookie')!, /HttpOnly/i);
  assert.match(login.headers.get('set-cookie')!, /SameSite=Lax/i);
  assert(!/; Secure/i.test(login.headers.get('set-cookie')!));
  const user = (await login.json() as { user: AuthUser }).user;
  assert.equal(user.organization.role, 'organization_admin');
  assert(!JSON.stringify(user).includes('password'));
  const authHeaders = { Cookie: firstCookie };
  const me = await api.request('/api/auth/me', { headers: authHeaders });
  assert.equal(me.status, 200);
  const token = firstCookie.split('=')[1]!;
  const stored = await database.query('SELECT token_digest FROM sessions WHERE user_id = $1', [user.id]);
  assert(stored.rows.every((row) => row.token_digest !== token));
  const tampered = firstCookie.slice(0, -1) + (firstCookie.endsWith('a') ? 'b' : 'a');
  assert.equal((await api.request('/api/auth/me', { headers: { Cookie: tampered } })).status, 401);
  pass('normal login creates an HttpOnly session; stored tokens are digested and tampering fails');

  const overview = await (await api.request('/api/admin/overview', { headers: { ...authHeaders, 'X-Organization-Id': randomUUID() } })).json() as AdminOverview;
  assert.equal(overview.organization.id, user.organization.id);
  assert.equal(overview.modulesReady, false);
  assert(Object.values(overview.counts).every((value) => Number.isInteger(value) && value >= 0));
  assert.equal((await api.request(`/api/organizations/${randomUUID()}/overview`, { headers: authHeaders })).status, 403);
  assert.equal((await api.request(`/api/organizations/${user.organization.id}/overview`, { headers: authHeaders })).status, 200);
  pass('organization is server-derived; forged headers and cross-organization access cannot select another tenant');

  const again = await api.login(config.demoAdminEmail, config.demoAdminPassword, firstCookie);
  assert.equal(again.status, 200);
  const secondCookie = cookie(again);
  assert.notEqual(secondCookie, firstCookie);
  assert.equal((await api.request('/api/auth/me', { headers: authHeaders })).status, 401);
  assert.equal((await api.request('/api/auth/logout', { method: 'POST', headers: { Cookie: secondCookie, Origin: 'https://foreign.test' } })).status, 403);
  assert.equal((await api.request('/api/auth/logout', { method: 'POST', headers: { Cookie: secondCookie, Origin: api.origin } })).status, 204);
  assert.equal((await api.request('/api/auth/me', { headers: { Cookie: secondCookie } })).status, 401);
  pass('login rotates existing sessions and logout revokes them server-side');

  const passwordHash = await hashPassword(fixturePassword);
  await database.transaction(async (client) => {
    await client.query('INSERT INTO organizations (id,name,slug,environment) VALUES ($1,$2,$3,$4)', [fixtureOrg, 'Foundation check', `check-${fixtureId}`, 'demo']);
    await client.query('INSERT INTO users (id,email,display_name,password_hash) VALUES ($1,$2,$3,$4)', [fixtureId, fixtureEmail, 'Foundation check', passwordHash]);
    await client.query('INSERT INTO organization_memberships (organization_id,user_id,role) VALUES ($1,$2,$3)', [fixtureOrg, fixtureId, 'staff']);
  });
  const fixtureLogin = await api.login(fixtureEmail, fixturePassword);
  assert.equal(fixtureLogin.status, 200);
  const fixtureHeaders = { Cookie: cookie(fixtureLogin) };
  await database.query('UPDATE organization_memberships SET role=$1 WHERE user_id=$2 AND organization_id=$3', ['read_only', fixtureId, fixtureOrg]);
  assert.equal((await (await api.request('/api/auth/me', { headers: fixtureHeaders })).json() as { user: AuthUser }).user.organization.role, 'read_only');
  await database.query('UPDATE organization_memberships SET active=false WHERE user_id=$1 AND organization_id=$2', [fixtureId, fixtureOrg]);
  assert.equal((await api.request('/api/admin/overview', { headers: fixtureHeaders })).status, 401);
  pass('role changes and membership revocation take effect on existing sessions immediately');

  const setup = await start({ databaseUrl: '', databaseName: null });
  const setupConfig = await (await setup.request('/api/config')).json() as PublicConfig;
  assert.equal(setupConfig.demoEnabled, false);
  assert.equal(setupConfig.databaseReady, false);
  assert(!setupConfig.demoCredentials);
  assert.equal((await setup.login(config.demoAdminEmail, config.demoAdminPassword)).status, 503);
  const unavailableUrl = new URL(config.databaseUrl);
  unavailableUrl.port = '1';
  const unavailable = await start({ databaseUrl: unavailableUrl.toString() });
  assert.equal((await unavailable.request('/api/health')).status, 503);
  const unavailableConfig = await (await unavailable.request('/api/config')).json() as PublicConfig;
  assert.equal(unavailableConfig.demoEnabled, false);
  assert.equal((await unavailable.login(config.demoAdminEmail, config.demoAdminPassword)).status, 503);
  pass('missing and unreachable databases show setup errors and never simulate login');

  const prod = await start({ production: true, nodeEnv: 'production', demoMode: false, appUrl: 'https://ootla.test' });
  const prodConfig = await (await prod.request('/api/config')).json() as PublicConfig;
  assert.equal(prodConfig.demoEnabled, false);
  assert(!prodConfig.demoCredentials);
  for (const route of ['/', '/platform', '/ai-workflows', '/integrations', '/admin/login']) {
    const response = await prod.request(route);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get('content-type')!, /text\/html/);
  }
  for (const route of ['/admin', '/admin/leads', '/admin/properties', '/admin/applications', '/admin/calendar', '/admin/tasks', '/admin/analytics', '/admin/ai', '/admin/integrations']) {
    const response = await prod.request(route);
    assert.equal(response.status, 302, route);
    assert.equal(response.headers.get('location'), '/admin/login');
  }
  assert.equal((await prod.login(config.demoAdminEmail, config.demoAdminPassword)).status, 401, 'Demo identities must not sign into production.');
  // Only this owned synthetic fixture becomes a normal live staff identity for
  // production-cookie coverage; the established demo account remains isolated.
  await database.query('UPDATE organization_memberships SET active=true WHERE user_id=$1 AND organization_id=$2', [fixtureId, fixtureOrg]);
  await database.query("UPDATE organizations SET environment='live' WHERE id=$1", [fixtureOrg]);
  const productionLogin = await prod.login(fixtureEmail, fixturePassword);
  assert.equal(productionLogin.status, 200);
  const productionCookie = cookie(productionLogin);
  assert.match(productionLogin.headers.get('set-cookie')!, /; Secure/i);
  for (const route of ['/admin', '/admin/leads', '/admin/properties', '/admin/applications', '/admin/calendar', '/admin/tasks', '/admin/analytics', '/admin/ai', '/admin/integrations']) {
    assert.equal((await prod.request(route, { headers: { Cookie: productionCookie } })).status, 200, route);
  }
  await prod.request('/api/auth/logout', { method: 'POST', headers: { Cookie: productionCookie, Origin: prod.origin } });
  await database.query("UPDATE organizations SET environment='demo' WHERE id=$1", [fixtureOrg]);
  pass('production denies demo identities, serves protected routes for real live staff and sets Secure cookies');
  for (const route of ['/api/unknown', '/api/unknown.css']) {
    const response = await prod.request(route, { headers: { Accept: 'text/html' } });
    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type')!, /application\/json/);
  }
  for (const route of ['/assets/missing.js', '/missing.css', '/missing.png', '/unknown-page', '/.env']) {
    const response = await prod.request(route);
    assert.equal(response.status, 404, route);
    assert(!/text\/html/.test(response.headers.get('content-type')!));
  }
  pass('unknown APIs return JSON404, missing assets and unknown routes never receive SPA HTML');

  for (const override of [
    { SESSION_SECRET: 'short-secret-must-never-print' },
    { SESSION_SECRET: 'REPLACE_WITH_A_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS' },
    { DEMO_MODE: 'true', NODE_ENV: 'production', APP_URL: 'https://ootla.test' },
    { DATABASE_URL: 'postgresql://user:secret@127.0.0.1/unrelated_database' },
    { APP_URL: 'javascript:alert(1)' },
    { PORT: 'not-a-number' },
  ]) {
    assert.throws(() => loadConfig({ ...process.env, ...override }));
  }
  pass('invalid configuration, placeholder secrets and unsafe demo configurations fail closed');
  console.log(`Foundation checks complete: ${checks} groups passed.`);
} finally {
  for (const close of resources.reverse()) await close();
  await database.query('DELETE FROM audit_events WHERE actor_user_id=$1 OR organization_id=$2', [fixtureId, fixtureOrg]);
  await database.query('DELETE FROM users WHERE id=$1', [fixtureId]);
  await database.query('DELETE FROM organizations WHERE id=$1', [fixtureOrg]);
  await database.close();
}
