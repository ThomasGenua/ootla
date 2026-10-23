import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.js';
import { loadConfig, type ServerConfig } from '../server/config/env.js';
import { Database } from '../server/db/pool.js';
import { hashPassword } from '../server/services/passwords.js';
import type { AuthUser } from '../shared/contracts.js';

// Every mutation below targets unique, synthetic fixtures in the existing isolated demo DB.
// The established demo identity is inspected for preservation, never signed in or reseeded.
const config = loadConfig();
assert(config.demoMode && /^ootla_demo(?:_[a-z0-9_]+)?$/.test(config.databaseName ?? ''),
  'Run authentication checks only against a configured isolated Ootla demo database.');
const database = new Database(config);
const resources: Array<() => Promise<void>> = [];
const runId = randomUUID();
const password = `Stage02-${randomUUID()}!`;
const org = { a: randomUUID(), b: randomUUID() };
const ids = {
  admin: randomUUID(), agent: randomUUID(), manager: randomUUID(), analyst: randomUUID(),
  legacyStaff: randomUUID(), legacyRead: randomUUID(), otherAdmin: randomUUID(),
  applicant: randomUUID(), resident: randomUUID(),
};
const userIds = Object.values(ids);
const orgIds = Object.values(org);
const propertyIds: string[] = [];
const emails = Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, `stage02-${id}@demo.ootla.test`])) as Record<keyof typeof ids, string>;
let groups = 0;
const pass = (label: string) => { groups += 1; console.log(`PASS ${label}`); };

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
    request: (route: string, token = '', method = 'GET', body?: unknown, headers: Record<string, string> = {}) => fetch(base + route, {
      method, redirect: 'manual',
      headers: { ...(token ? { Cookie: token } : {}), ...(method !== 'GET' ? { Origin: current.appUrl } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    login: (email: string, suppliedPassword = password, previous = '') => fetch(base + '/api/auth/login', {
      method: 'POST', redirect: 'manual',
      headers: { 'Content-Type': 'application/json', Origin: current.appUrl, ...(previous ? { Cookie: previous } : {}) },
      body: JSON.stringify({ email, password: suppliedPassword }),
    }),
  };
}
type Api = Awaited<ReturnType<typeof start>>;
function cookie(response: Response): string {
  const value = response.headers.get('set-cookie');
  assert(value, 'Expected a server-managed session cookie.');
  return value.split(';')[0]!;
}
async function signIn(api: Api, key: keyof typeof ids) {
  const response = await api.login(emails[key]);
  assert.equal(response.status, 200, `Login failed for synthetic ${key} fixture.`);
  const value = await response.json() as { user: AuthUser };
  assert.equal(value.user.id, ids[key]);
  assert.equal(value.user.organization.id, key === 'otherAdmin' ? org.b : org.a);
  return { token: cookie(response), user: value.user, cookieHeader: response.headers.get('set-cookie')! };
}
async function errorStatus(response: Response, expected: number) {
  assert.equal(response.status, expected);
  const value = await response.json() as { code: string; error: string };
  assert.equal(typeof value.code, 'string');
  assert.equal(typeof value.error, 'string');
  return value;
}
function digest(token: string) {
  return createHmac('sha256', config.sessionSecret).update(token.slice(token.indexOf('=') + 1)).digest('hex');
}

type Property = { id: string; organizationId: string; name: string };
type Membership = { id: string; userId: string; organizationId: string; role: string; active: boolean };
let demoBefore: unknown[] | undefined;
try {
  assert.equal(await database.state(), 'ready', 'Apply the Stage 02 migration before running check:auth.');
  const migration = await database.query('SELECT name FROM schema_migrations WHERE name=$1', ['002_staff_roles_property_access.sql']);
  assert.equal(migration.rowCount, 1, 'The additive Stage 02 migration must be applied first.');
  demoBefore = (await database.query('SELECT id,password_hash,active FROM users WHERE email=$1', [config.demoAdminEmail])).rows;
  const passwordHash = await hashPassword(password);
  assert.match(passwordHash, /^\$argon2id\$/);
  const roles: Partial<Record<keyof typeof ids, string>> = {
    admin: 'organization_admin', agent: 'leasing_agent', manager: 'property_manager', analyst: 'read_only_analyst',
    legacyStaff: 'staff', legacyRead: 'read_only', otherAdmin: 'organization_admin',
  };
  await database.transaction(async (client) => {
    for (const [key, organizationId] of Object.entries(org)) {
      await client.query('INSERT INTO organizations(id,name,slug,environment) VALUES($1,$2,$3,$4)',
        [organizationId, `Stage 02 check ${key}`, `stage02-${runId}-${key}`, 'demo']);
    }
    for (const key of Object.keys(ids) as Array<keyof typeof ids>) {
      await client.query('INSERT INTO users(id,email,display_name,password_hash,account_kind) VALUES($1,$2,$3,$4,$5)',
        [ids[key], emails[key], `Synthetic ${key}`, passwordHash, key === 'applicant' || key === 'resident' ? key : 'staff']);
      if (roles[key]) await client.query('INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,$3)',
        [key === 'otherAdmin' ? org.b : org.a, ids[key], roles[key]]);
    }
  });
  pass('real PostgreSQL fixtures use Argon2id hashes and preserve the established demo identity');

  const api = await start();
  for (const route of ['/api/auth/me', '/api/admin/overview', '/api/roles', '/api/properties', '/api/audit-events', `/api/organizations/${org.a}/memberships`]) {
    await errorStatus(await api.request(route), 401);
  }
  const wrongPassword = await errorStatus(await api.login(emails.admin, 'incorrect-password'), 401);
  const unknownUser = await errorStatus(await api.login(`unknown-${runId}@demo.ootla.test`), 401);
  assert.deepEqual(unknownUser, wrongPassword, 'Sign-in must not disclose whether an account exists.');
  await errorStatus(await api.request('/api/auth/login', '', 'POST', { email: emails.admin, password }, { Origin: 'https://foreign.test' }), 403);
  await errorStatus(await api.request('/api/auth/login', '', 'POST', { email: "' OR 1=1 --", password }), 400);
  pass('unauthenticated access, invalid credentials, injected email and cross-origin sign-in fail safely');

  const admin = await signIn(api, 'admin');
  assert.match(admin.cookieHeader, /HttpOnly/i);
  assert.match(admin.cookieHeader, /SameSite=Lax/i);
  assert.match(admin.cookieHeader, /Max-Age=28800/i);
  assert(!/; Secure/i.test(admin.cookieHeader), 'Local HTTP session cookie must remain usable.');
  assert.equal(admin.user.organization.role, 'organization_admin');
  assert(admin.user.permissions.includes('memberships.manage'));
  assert(admin.user.permissions.includes('property_access.manage'));
  assert(admin.user.permissions.every((permission) => !/platform|superadmin/i.test(permission)));
  const serializedUser = JSON.stringify(admin.user);
  assert(!/password|token|secret/i.test(serializedUser));
  const session = await database.query<{ token_digest: string; hours: number }>(
    'SELECT token_digest,EXTRACT(EPOCH FROM(expires_at-created_at))/3600 AS hours FROM sessions WHERE user_id=$1', [ids.admin]);
  assert.equal(session.rowCount, 1);
  assert.equal(session.rows[0]!.token_digest, digest(admin.token));
  assert.notEqual(session.rows[0]!.token_digest, admin.token.split('=')[1]);
  assert(Math.abs(Number(session.rows[0]!.hours) - 8) < 0.01);
  assert.equal((await api.request('/api/auth/me', admin.token)).status, 200);
  const tampered = admin.token.slice(0, -1) + (admin.token.endsWith('a') ? 'b' : 'a');
  await errorStatus(await api.request('/api/auth/me', tampered), 401);
  pass('normal sign-in and current-user loading use expiring HttpOnly cookies and digested server-side sessions');

  const catalogResponse = await api.request('/api/roles', admin.token);
  assert.equal(catalogResponse.status, 200);
  const catalog = await catalogResponse.json() as { roles: Array<{ key: string; legacy: boolean; permissions: string[] }> };
  assert.deepEqual(catalog.roles.filter((role) => !role.legacy).map((role) => role.key).sort(),
    ['organization_admin', 'leasing_agent', 'property_manager', 'read_only_analyst'].sort());
  assert.deepEqual(catalog.roles.filter((role) => role.legacy).map((role) => role.key).sort(), ['read_only', 'staff']);
  assert(!catalog.roles.some((role) => /platform|superadmin/.test(role.key)));
  const membershipResponse = await api.request(`/api/organizations/${org.a}/memberships`, admin.token);
  assert.equal(membershipResponse.status, 200);
  const memberships = (await membershipResponse.json() as { memberships: Membership[] }).memberships;
  assert.equal(memberships.length, 6);
  assert(memberships.every((membership) => membership.organizationId === org.a));
  const membershipByUser = new Map(memberships.map((membership) => [membership.userId, membership.id]));
  const createProperty = async (token: string, name: string) => {
    const response = await api.request('/api/properties', token, 'POST', { name });
    assert.equal(response.status, 201);
    const property = (await response.json() as { property: Property }).property;
    propertyIds.push(property.id);
    return property;
  };
  const otherAdmin = await signIn(api, 'otherAdmin');
  const p1 = await createProperty(admin.token, `Stage 02 assigned ${runId}`);
  const p2 = await createProperty(admin.token, `Stage 02 unassigned ${runId}`);
  const otherProperty = await createProperty(otherAdmin.token, `Stage 02 other organization ${runId}`);
  assert.equal(p1.organizationId, org.a);
  assert.equal(otherProperty.organizationId, org.b);
  const listIds = async (token: string) => {
    const response = await api.request('/api/properties', token);
    assert.equal(response.status, 200);
    return (await response.json() as { properties: Property[] }).properties.map((property) => property.id).sort();
  };
  assert.deepEqual(await listIds(admin.token), [p1.id, p2.id].sort());
  assert.deepEqual(await listIds(otherAdmin.token), [otherProperty.id]);
  await errorStatus(await api.request(`/api/organizations/${org.b}/memberships`, admin.token), 403);
  await errorStatus(await api.request(`/api/organizations/${org.b}/overview`, admin.token), 403);
  await errorStatus(await api.request(`/api/properties/${otherProperty.id}`, admin.token), 404);
  await errorStatus(await api.request(`/api/properties/${otherProperty.id}`, admin.token, 'PATCH', { name: 'Forbidden change' }), 404);
  await errorStatus(await api.request(`/api/organizations/${org.b}/memberships/${ids.otherAdmin}`, admin.token, 'PATCH', { role: 'read_only_analyst' }), 403);
  pass('organization admin manages only its organization; property records and memberships never cross tenants');

  const roleSessions: Record<string, Awaited<ReturnType<typeof signIn>>> = {};
  const scopedKeys = ['agent', 'manager', 'analyst', 'legacyStaff', 'legacyRead'] as const;
  for (const key of scopedKeys) {
    const signedIn = await signIn(api, key);
    roleSessions[key] = signedIn;
    assert.equal(signedIn.user.organization.role, roles[key]);
    assert.deepEqual([...signedIn.user.permissions].sort(), [...catalog.roles.find((role) => role.key === roles[key])!.permissions].sort());
    assert.deepEqual(await listIds(signedIn.token), []);
    await errorStatus(await api.request(`/api/properties/${p1.id}`, signedIn.token), 404);
    const grant = await api.request(`/api/properties/${p1.id}/access/${ids[key]}`, admin.token, 'PUT');
    assert.equal(grant.status, 200);
    const assignment = (await grant.json() as { assignment: { organizationId: string; membershipId: string; propertyId: string } }).assignment;
    assert.deepEqual({ organizationId: assignment.organizationId, membershipId: assignment.membershipId, propertyId: assignment.propertyId },
      { organizationId: org.a, membershipId: membershipByUser.get(ids[key]), propertyId: p1.id });
    assert.deepEqual(await listIds(signedIn.token), [p1.id]);
    assert.equal((await api.request(`/api/properties/${p1.id}`, signedIn.token)).status, 200);
    await errorStatus(await api.request(`/api/properties/${p2.id}`, signedIn.token), 404);
    await errorStatus(await api.request(`/api/properties/${otherProperty.id}`, signedIn.token), 404);
    await errorStatus(await api.request(`/api/organizations/${org.a}/memberships`, signedIn.token), 403);
    await errorStatus(await api.request(`/api/organizations/${org.a}/memberships/${ids.admin}`, signedIn.token, 'PATCH', { role: 'leasing_agent' }), 403);
    await errorStatus(await api.request(`/api/properties/${p1.id}/access/${ids.analyst}`, signedIn.token, 'PUT'), 403);
    await errorStatus(await api.request('/api/audit-events', signedIn.token), 403);
  }
  assert(roleSessions.agent!.user.permissions.includes('leasing.manage'));
  assert(!roleSessions.agent!.user.permissions.includes('properties.manage'));
  assert(roleSessions.manager!.user.permissions.includes('properties.manage'));
  assert(roleSessions.analyst!.user.permissions.includes('analytics.read'));
  assert(!roleSessions.analyst!.user.permissions.includes('leasing.manage'));
  pass('all four canonical roles and both retained legacy roles load real permissions and assigned-property scopes');

  for (const key of ['agent', 'analyst', 'legacyStaff', 'legacyRead']) {
    await errorStatus(await api.request('/api/properties', roleSessions[key]!.token, 'POST', { name: 'Forbidden creation' }), 403);
    await errorStatus(await api.request(`/api/properties/${p1.id}`, roleSessions[key]!.token, 'PATCH', { name: 'Forbidden update' }), 403);
    await errorStatus(await api.request(`/api/properties/${p1.id}/access/${ids.manager}`, roleSessions[key]!.token, 'DELETE'), 403);
  }
  const update = await api.request(`/api/properties/${p1.id}`, roleSessions.manager!.token, 'PATCH', { name: `Stage 02 manager update ${runId}` });
  assert.equal(update.status, 200);
  assert.equal((await update.json() as { property: Property }).property.name, `Stage 02 manager update ${runId}`);
  await errorStatus(await api.request(`/api/properties/${p2.id}`, roleSessions.manager!.token, 'PATCH', { name: 'Unassigned change' }), 404);
  await errorStatus(await api.request(`/api/properties/${otherProperty.id}`, roleSessions.manager!.token, 'PATCH', { name: 'Foreign change' }), 404);
  await errorStatus(await api.request(`/api/properties/${p1.id}/access/${ids.otherAdmin}`, admin.token, 'PUT'), 404);
  await errorStatus(await api.request(`/api/properties/${otherProperty.id}/access/${ids.agent}`, admin.token, 'PUT'), 404);
  await errorStatus(await api.request(`/api/properties/${p1.id}/access/${ids.analyst}`, admin.token, 'PUT', undefined, { Origin: 'https://foreign.test' }), 403);
  pass('property managers update only assigned properties; leasing and analyst identities cannot write or grant access');

  assert.equal((await api.request(`/api/organizations/${org.a}/memberships/${ids.manager}`, admin.token, 'PATCH', { role: 'read_only_analyst' })).status, 200);
  let changed = (await (await api.request('/api/auth/me', roleSessions.manager!.token)).json() as { user: AuthUser }).user;
  assert.equal(changed.organization.role, 'read_only_analyst');
  assert(!changed.permissions.includes('properties.manage'));
  await errorStatus(await api.request(`/api/properties/${p1.id}`, roleSessions.manager!.token, 'PATCH', { name: 'Demoted write' }), 403);
  assert.equal((await api.request(`/api/organizations/${org.a}/memberships/${ids.manager}`, admin.token, 'PATCH', { role: 'property_manager' })).status, 200);
  changed = (await (await api.request('/api/auth/me', roleSessions.manager!.token)).json() as { user: AuthUser }).user;
  assert(changed.permissions.includes('properties.manage'));
  assert.equal((await api.request(`/api/organizations/${org.a}/memberships/${ids.agent}`, admin.token, 'PATCH', { active: false })).status, 200);
  await errorStatus(await api.request('/api/auth/me', roleSessions.agent!.token), 401);
  await errorStatus(await api.request(`/api/properties/${p1.id}`, roleSessions.agent!.token), 401);
  await errorStatus(await api.request(`/api/properties/${p1.id}/access/${ids.agent}`, admin.token, 'PUT'), 404);
  assert.equal((await api.request(`/api/properties/${p1.id}/access/${ids.agent}`, admin.token, 'DELETE')).status, 204);
  assert.equal((await database.query('SELECT property_id FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=$3',
    [org.a, membershipByUser.get(ids.agent), p1.id])).rowCount, 0);
  assert.equal((await database.query<{ active: boolean }>('SELECT active FROM organization_memberships WHERE user_id=$1 AND organization_id=$2',
    [ids.agent, org.a])).rows[0]!.active, false);
  assert.equal((await api.request(`/api/properties/${p1.id}/access/${ids.analyst}`, admin.token, 'DELETE')).status, 204);
  assert.deepEqual(await listIds(roleSessions.analyst!.token), []);
  await errorStatus(await api.request(`/api/properties/${p1.id}`, roleSessions.analyst!.token), 404);
  await database.query('UPDATE users SET active=false WHERE id=$1', [ids.legacyStaff]);
  await errorStatus(await api.request('/api/auth/me', roleSessions.legacyStaff!.token), 401);
  await errorStatus(await api.request(`/api/properties/${p1.id}/access/${ids.legacyStaff}`, admin.token, 'PUT'), 404);
  assert.equal((await api.request(`/api/properties/${p1.id}/access/${ids.legacyStaff}`, admin.token, 'DELETE')).status, 204);
  assert.equal((await database.query('SELECT property_id FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=$3',
    [org.a, membershipByUser.get(ids.legacyStaff), p1.id])).rowCount, 0);
  assert.equal((await database.query<{ active: boolean }>('SELECT active FROM users WHERE id=$1', [ids.legacyStaff])).rows[0]!.active, false);
  pass('authorization changes apply immediately; admins revoke inactive targets without reactivation while grants remain denied');

  for (const body of [{ active: false }, { role: 'leasing_agent' }]) {
    const result = await errorStatus(await api.request(`/api/organizations/${org.a}/memberships/${ids.admin}`, admin.token, 'PATCH', body), 409);
    assert.equal(result.code, 'LAST_ORGANIZATION_ADMIN');
  }
  for (const body of [{ role: 'platform_superadmin' }, { role: 'staff' }, {}, { role: 'leasing_agent', organizationId: org.b }]) {
    await errorStatus(await api.request(`/api/organizations/${org.a}/memberships/${ids.manager}`, admin.token, 'PATCH', body), 400);
  }
  await errorStatus(await api.request('/api/properties/not-a-uuid', admin.token), 400);
  await errorStatus(await api.request('/api/properties/%27%20OR%201%3D1--', admin.token), 400);
  await errorStatus(await api.request('/api/properties', admin.token, 'POST', { name: 'Injected organization', organizationId: org.b }), 400);
  await errorStatus(await api.request('/api/properties?limit=999999999', admin.token), 400);
  await errorStatus(await api.request('/api/audit-events', admin.token, 'POST', { action: 'forged.audit' }), 404);
  pass('last organization admin is protected; malformed IDs, role escalation and extra organization input are rejected');

  assert(database.pool);
  const otherMembership = (await database.query<{ id: string }>('SELECT id FROM organization_memberships WHERE user_id=$1 AND organization_id=$2', [ids.otherAdmin, org.b])).rows[0]!.id;
  for (const values of [[org.a, membershipByUser.get(ids.manager), otherProperty.id], [org.a, otherMembership, p1.id]]) {
    await assert.rejects(database.pool.query('INSERT INTO property_access_assignments(organization_id,membership_id,property_id) VALUES($1,$2,$3)', values),
      (error: unknown) => (error as { code?: string }).code === '23503');
  }
  for (const key of ['applicant', 'resident'] as const) {
    await assert.rejects(database.pool.query('INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,$3)', [org.a, ids[key], 'leasing_agent']),
      (error: unknown) => (error as { code?: string }).code === '23503');
  }
  await assert.rejects(database.pool.query('INSERT INTO roles(key,name) VALUES($1,$2)', ['platform_superadmin', 'Forbidden role']),
    (error: unknown) => (error as { code?: string }).code === '23514');
  const portalApi = await start();
  for (const key of ['applicant', 'resident'] as const) {
    const failure = await errorStatus(await portalApi.login(emails[key]), 401);
    assert.deepEqual(failure, wrongPassword);
    assert.equal((await database.query('SELECT id FROM sessions WHERE user_id=$1', [ids[key]])).rowCount, 0);
  }
  pass('composite database foreign keys block cross-organization assignments and portal users cannot obtain staff memberships or sessions');

  const rotated = await api.login(emails.admin, password, admin.token);
  assert.equal(rotated.status, 200);
  const previous = admin.token;
  admin.token = cookie(rotated);
  assert.notEqual(admin.token, previous);
  await errorStatus(await api.request('/api/auth/me', previous), 401);
  await errorStatus(await api.request('/api/auth/logout', admin.token, 'POST', undefined, { Origin: 'https://foreign.test' }), 403);
  assert.equal((await api.request('/api/auth/me', admin.token)).status, 200);
  const logout = await api.request('/api/auth/logout', roleSessions.manager!.token, 'POST');
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie')!, /Expires=Thu, 01 Jan 1970/i);
  assert.equal((await database.query('SELECT id FROM sessions WHERE token_digest=$1', [digest(roleSessions.manager!.token)])).rowCount, 0);
  await errorStatus(await api.request('/api/auth/me', roleSessions.manager!.token), 401);
  await database.query("UPDATE sessions SET created_at=NOW()-INTERVAL '10 hours',expires_at=NOW()-INTERVAL '1 hour' WHERE token_digest=$1 AND user_id=$2", [digest(roleSessions.legacyRead!.token), ids.legacyRead]);
  await errorStatus(await api.request('/api/auth/me', roleSessions.legacyRead!.token), 401);
  await errorStatus(await api.request('/api/admin/overview', roleSessions.legacyRead!.token), 401);
  const expiredLogout = await api.request('/api/auth/logout', roleSessions.legacyRead!.token, 'POST');
  assert.equal(expiredLogout.status, 204);
  assert.match(expiredLogout.headers.get('set-cookie')!, /Expires=Thu, 01 Jan 1970/i);
  assert.equal((await database.query('SELECT id FROM sessions WHERE token_digest=$1', [digest(roleSessions.legacyRead!.token)])).rowCount, 0);
  pass('session rotation, logout revocation and expired-session denial are verified against persistent records');

  const production = await start({ production: true, nodeEnv: 'production', demoMode: false, appUrl: 'https://ootla.test' });
  const privatePage = await production.request('/admin');
  assert.equal(privatePage.status, 302);
  assert.equal(privatePage.headers.get('location'), '/admin/login');
  assert.equal((await production.request('/admin/login')).status, 200, 'Run npm run build before the compiled route check.');
  await database.query("UPDATE organizations SET environment='live' WHERE id=$1", [org.a]);
  const secureAdmin = await signIn(production, 'admin');
  assert.match(secureAdmin.cookieHeader, /; Secure/i);
  assert.equal((await production.request('/admin', secureAdmin.token)).status, 200);
  await database.query("UPDATE sessions SET created_at=NOW()-INTERVAL '10 hours',expires_at=NOW()-INTERVAL '1 hour' WHERE token_digest=$1 AND user_id=$2", [digest(secureAdmin.token), ids.admin]);
  const expiredPage = await production.request('/admin', secureAdmin.token);
  assert.equal(expiredPage.status, 302);
  assert.equal(expiredPage.headers.get('location'), '/admin/login');
  assert.equal((await production.request('/api/auth/logout', secureAdmin.token, 'POST')).status, 204);
  await database.query("UPDATE organizations SET environment='demo' WHERE id=$1", [org.a]);
  pass('the compiled /admin route is server-protected for live staff and expired cookies redirect to login');

  const auditResponse = await api.request('/api/audit-events?limit=200', admin.token);
  assert.equal(auditResponse.status, 200);
  const audit = await auditResponse.json() as { events: Array<{ action: string; actorUserId: string | null; metadata: Record<string, unknown> }> };
  for (const action of ['auth.login', 'auth.logout', 'membership.updated', 'property.created', 'property.updated', 'property_access.granted', 'property_access.revoked']) {
    assert(audit.events.some((event) => event.action === action), `Expected persistent audit action ${action}.`);
  }
  assert(audit.events.every((event) => event.actorUserId !== ids.otherAdmin));
  const otherAudit = await (await api.request('/api/audit-events?limit=200', otherAdmin.token)).json() as typeof audit;
  assert(otherAudit.events.every((event) => event.actorUserId === ids.otherAdmin));
  const auditText = JSON.stringify(audit);
  for (const secret of [password, passwordHash, config.sessionSecret, admin.token.split('=')[1]!, otherAdmin.token.split('=')[1]!]) {
    assert(!auditText.includes(secret), 'Audit responses must never include passwords, session tokens or server secrets.');
  }
  assert(!/password_hash|token_digest/i.test(auditText));
  pass('organization-scoped audit records capture auth, role and property-access changes without credentials');
  console.log(`Stage 02 authentication checks complete: ${groups} groups passed.`);
} finally {
  const cleanupErrors: unknown[] = [];
  for (const close of resources.reverse()) {
    try { await close(); } catch (error) { cleanupErrors.push(error); }
  }
  try {
    // Never delete unrelated audit history, users, organizations, properties or sessions.
    await database.transaction(async (client) => {
      await client.query('DELETE FROM audit_events WHERE organization_id=ANY($1::uuid[]) OR actor_user_id=ANY($2::uuid[])', [orgIds, userIds]);
      await client.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [userIds]);
      await client.query('DELETE FROM organizations WHERE id=ANY($1::uuid[])', [orgIds]);
    });
    assert.equal((await database.query('SELECT id FROM users WHERE id=ANY($1::uuid[])', [userIds])).rowCount, 0);
    assert.equal((await database.query('SELECT id FROM organizations WHERE id=ANY($1::uuid[])', [orgIds])).rowCount, 0);
    assert.equal((await database.query('SELECT id FROM properties WHERE id=ANY($1::uuid[])', [propertyIds])).rowCount, 0);
    if (demoBefore) assert.deepEqual((await database.query('SELECT id,password_hash,active FROM users WHERE email=$1', [config.demoAdminEmail])).rows, demoBefore,
      'The established demo user and password must remain unchanged.');
    console.log('PASS temporary fixture cleanup and established demo identity preservation');
  } catch (error) { cleanupErrors.push(error); }
  finally { await database.close(); }
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Stage 02 check cleanup failed.');
}
