import 'dotenv/config';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { createApp } from '../server/app.js';
import { loadConfig, type ServerConfig } from '../server/config/env.js';
import { Database } from '../server/db/pool.js';
import { hashPassword, verifyPassword } from '../server/services/passwords.js';
import type { AccountPreferences, AccountProfile, AccountSnapshot } from '../shared/account-contracts.js';
// Every write below targets one newly-created, uniquely owned scratch database.
// Retained demo/customer data is never migrated, seeded, reset or changed.
const root = path.resolve(import.meta.dirname, '..');
const source = loadConfig(), sourceUrl = new URL(source.databaseUrl);
assert(source.demoMode && !source.production && /^ootla_demo(?:_[a-z0-9_]+)?$/.test(source.databaseName ?? ''), 'Use the documented isolated non-production Ootla demo configuration.');
assert(sourceUrl.hostname === '127.0.0.1' && sourceUrl.port === '55439' && sourceUrl.username === 'ootla' && !sourceUrl.search && !sourceUrl.hash, 'Use only the project-owned local cluster and restricted application role.');
const scratchName = `ootla_demo_account_${randomUUID().replaceAll('-', '')}`;
const scratchUrl = new URL(sourceUrl);
scratchUrl.pathname = `/${scratchName}`;
const config: ServerConfig = { ...source, nodeEnv: 'test', production: false, appUrl: 'http://ootla.test', databaseUrl: scratchUrl.toString(), databaseName: scratchName };
const ownerUrl = new URL(sourceUrl);
ownerUrl.username = 'ootla_cluster_owner';
ownerUrl.pathname = '/postgres';
const owner = new Client({ connectionString: ownerUrl.toString(), connectionTimeoutMillis: 5000 }), database = new Database(config);
const organizationIds = [randomUUID(), randomUUID()];
const roles = ['organization_admin', 'property_manager', 'leasing_agent', 'read_only_analyst', 'organization_admin', 'staff', 'read_only', 'leasing_agent', 'leasing_agent'] as const;
const userIds: string[] = roles.map(() => randomUUID()), membershipIds = roles.map(() => randomUUID()), emails = userIds.map(id => `account-${id}@example.test`);
const password = `Account-${randomUUID()}!`, replacementPassword = `Updated-${randomUUID()}!`, otherMembership = randomUUID(), propertyId = randomUUID();
let ownerConnected = false, ownsScratch = false, groups = 0, phase = 'safe scratch setup';
const servers: Array<() => Promise<void>> = [];
const pass = (label: string) => { groups++; console.log(`PASS ${label}`); };
const normalize = (value: string) => path.resolve(value).replaceAll('\\', '/').toLowerCase();
async function verifiedCluster() { const identity = await owner.query<{
    data_directory: string;
}>('SHOW data_directory'); assert.equal(normalize(identity.rows[0]?.data_directory ?? ''), normalize(path.join(root, '.local/postgres/data')), 'Refusing to operate outside the Ootla-owned PostgreSQL data directory.'); }
async function createScratch() { await owner.connect(); ownerConnected = true; await verifiedCluster(); assert(/^ootla_demo_account_[a-f0-9]{32}$/.test(scratchName)); assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1', [scratchName])).rowCount, 0); const role = (await owner.query<{
    rolsuper: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
}>('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1', ['ootla'])).rows[0]; assert(role && !role.rolsuper && !role.rolcreatedb && !role.rolcreaterole); const quoted = (await owner.query<{
    name: string;
}>('SELECT quote_ident($1) AS name', [scratchName])).rows[0]!.name; await owner.query(`CREATE DATABASE ${quoted} OWNER ootla`); ownsScratch = true; assert.equal((await database.query<{
    name: string;
}>('SELECT current_database() AS name')).rows[0]?.name, scratchName); }
type Snapshot = Record<string, {
    columns: string[];
    count: number;
    hash: string;
}>;
async function snapshot(previous?: Snapshot): Promise<Snapshot> { const tables = previous ? Object.keys(previous) : (await database.query<{
    tablename: string;
}>("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename")).rows.map(r => r.tablename); const result: Snapshot = {}; for (const table of tables) {
    const columns = previous?.[table]?.columns ?? (await database.query<{
        column_name: string;
    }>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [table])).rows.map(r => r.column_name);
    assert(/^[a-z_][a-z0-9_]*$/.test(table) && columns.length && columns.every(c => /^[a-z_][a-z0-9_]*$/.test(c)));
    const rows = (await database.query(`SELECT ${columns.map(c => `"${c}"`).join(',')} FROM "${table}"`)).rows.map(r => JSON.stringify(r)).sort();
    result[table] = { columns, count: rows.length, hash: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
} return result; }
async function baseline() { await database.query('CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())'); for (const name of ['001_foundation.sql', '002_staff_roles_property_access.sql', '003_demo_dataset.sql', '004_property_contact_foundation.sql', '005_lead_pipeline.sql', '006_lead_workspace.sql', '007_tasks_reminders.sql', '008_standalone_imports.sql']) {
    const sql = await readFile(path.join(root, 'migrations', name), 'utf8');
    await database.transaction(async (client) => { await client.query(sql.replace(/^\uFEFF/, '')); await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name, createHash('sha256').update(sql).digest('hex')]); });
} const hash = await hashPassword(password); await database.transaction(async (client) => { for (const [i, id] of organizationIds.entries())
    await client.query("INSERT INTO organizations(id,name,slug,environment) VALUES($1,$2,$3,'demo')", [id, `Account isolated ${i}`, `account-${randomUUID()}`]); for (const [i, id] of userIds.entries()) {
    await client.query('INSERT INTO users(id,email,display_name,password_hash,is_demo) VALUES($1,$2,$3,$4,$5)', [id, emails[i], `Original account ${i}`, hash, i === 8]);
    await client.query('INSERT INTO organization_memberships(id,organization_id,user_id,role) VALUES($1,$2,$3,$4)', [membershipIds[i], organizationIds[i === 4 ? 1 : 0], id, roles[i]]);
} await client.query("INSERT INTO organization_memberships(id,organization_id,user_id,role,created_at) VALUES($1,$2,$3,'read_only_analyst',now()+interval '1 minute')", [otherMembership, organizationIds[1], userIds[2]]); await client.query("INSERT INTO properties(id,organization_id,name,address,city) VALUES($1,$2,'Untouched property','1 Existing Way','Lagos')", [propertyId, organizationIds[0]]); await client.query("INSERT INTO leads(organization_id,property_id,display_name,email,status,intent,notes) VALUES($1,$2,'Historical contact','history@example.test','new','leasing','Retained work must be preserved')", [organizationIds[0], propertyId]); await client.query("INSERT INTO tasks(organization_id,property_id,title,due_at,status) VALUES($1,$2,'Untouched task',now()+interval '1 day','open')", [organizationIds[0], propertyId]); }); }
async function utility(script: string) { try {
    await promisify(execFile)(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), path.join(root, script)], { cwd: root, windowsHide: true, timeout: 30000, env: { ...process.env, NODE_ENV: 'test', DEMO_MODE: 'true', DATABASE_URL: config.databaseUrl, APP_URL: config.appUrl } });
}
catch {
    assert.fail('Scoped scratch utility failed; raw credentials/process configuration are omitted.');
} }
const digest = (cookie: string) => createHmac('sha256', config.sessionSecret).update(cookie.slice(cookie.indexOf('=') + 1)).digest('hex');
async function start() { const db = new Database(config), app = createApp(config, db); const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); listener.once('error', reject); }); let closed = false; const close = async () => { if (closed)
    return; closed = true; server.closeIdleConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); await db.close(); }; servers.push(close); const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; const request = (route: string, cookie = '', method = 'GET', body?: unknown) => fetch(base + route, { method, redirect: 'manual', headers: { ...(cookie ? { Cookie: cookie } : {}), ...(method === 'GET' ? {} : { Origin: config.appUrl }), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); const login = async (index: number, secret = password) => { const response = await request('/api/auth/login', '', 'POST', { email: emails[index], password: secret }); assert.equal(response.status, 200, 'Normal hashed-password sign-in must work.'); const cookie = response.headers.get('set-cookie')?.split(';')[0]; assert(cookie && /HttpOnly/i.test(response.headers.get('set-cookie')!)); return cookie; }; return { request, login, close, base }; }
type Api = Awaited<ReturnType<typeof start>>;
async function json<T>(api: Api, route: string, cookie: string, method = 'GET', body?: unknown, expected = 200): Promise<T> { const response = await api.request(route, cookie, method, body); assert.equal(response.status, expected, `${method} ${route.split('?')[0]} must return ${expected}; received ${response.status}.`); return response.json() as Promise<T>; }
async function deny(api: Api, route: string, cookie: string, method = 'GET', body?: unknown, expected: number | number[] = [400, 403, 404, 409], code?: string) { const r = await api.request(route, cookie, method, body); assert((Array.isArray(expected) ? expected : [expected]).includes(r.status), `${method} ${route.split('?')[0]} must reject; received ${r.status}.`); if (code)
    assert.equal((await r.json() as {
        code: string;
    }).code, code); return r; }
const endpoint = '/api/account';
const current = (api: Api, cookie: string) => json<AccountSnapshot>(api, endpoint, cookie);
const profileBody = (p: AccountProfile, patch: Record<string, unknown> = {}) => ({ version: p.version, displayName: p.displayName, phone: p.phone, jobTitle: p.jobTitle, ...patch });
const preferenceBody = (p: AccountPreferences, patch: Record<string, unknown> = {}) => ({ version: p.version, defaultPage: p.defaultPage, leadView: p.leadView, motion: p.motion, ...patch });
const passwordBody = (currentPassword = password, newPassword = replacementPassword) => ({ currentPassword, newPassword, confirmPassword: newPassword });
async function userRow(i: number) { return (await database.query('SELECT * FROM users WHERE id=$1', [userIds[i]])).rows[0]!; }
async function main() {
    await createScratch();
    await baseline();
    const before = await snapshot();
    phase = 'additive migration preservation';
    await utility('scripts/migrate.ts');
    assert.deepEqual(await snapshot(before), before, 'Migration009 must preserve all old columns, hashes, users and timestamps.');
    await utility('scripts/migrate.ts');
    assert.deepEqual(await snapshot(before), before);
    const checksums = (await database.query<{
        name: string;
        checksum: string;
    }>('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;
    assert.equal(checksums.length, 9);
    for (const row of checksums)
        assert.equal(row.checksum, createHash('sha256').update(await readFile(path.join(root, 'migrations', row.name), 'utf8')).digest('hex'));
    assert.equal(await database.state(), 'ready');
    assert.equal((await database.query('SELECT 1 FROM staff_user_preferences')).rowCount, 0);
    assert.equal((await database.query('SELECT 1 FROM staff_password_attempt_limits')).rowCount, 0);
    pass('additive migration009 and repeat migration preserve every old column, identity, hash, timestamp and nine immutable migration checksums');
    await utility('scripts/seed.ts');
    await utility('scripts/seed-standalone-demo.ts');
    let api = await start();
    const cookies: string[] = [];
    for (let i = 0; i < roles.length; i++)
        cookies.push(await api.login(i));
    phase = 'real sessions and private read-only self-service';
    for (const route of [endpoint, endpoint + '/profile', endpoint + '/preferences', endpoint + '/password'])
        await deny(api, route, '', route.endsWith('password') ? 'POST' : route === endpoint ? 'GET' : 'PATCH', route === endpoint ? undefined : {}, 401);
    const reads = await snapshot();
    for (let i = 0; i < roles.length; i++) {
        const response = await api.request(endpoint, cookies[i]);
        assert.equal(response.status, 200);
        assert.match(response.headers.get('cache-control') ?? '', /no-store/);
        const record = await response.json() as AccountSnapshot;
        assert.equal(record.profile.id, userIds[i]);
        assert.equal(record.profile.membershipId, membershipIds[i]);
        assert.equal(record.profile.organization.id, organizationIds[i === 4 ? 1 : 0]);
        assert.equal(record.profile.organization.role, roles[i]);
        assert.equal(record.profile.email, emails[i]);
        assert.equal(record.profile.version, 1);
        assert.deepEqual(record.preferences, { defaultPage: '/admin', leadView: 'list', motion: 'system', version: 1, updatedAt: null });
        assert.equal(record.access.canChangePassword, i !== 8);
        const text = JSON.stringify(record);
        for (const secret of ['password_hash', 'token_digest', config.sessionSecret, password, cookies[i]])
            assert(!text.includes(secret), 'Account reads must not expose authentication material.');
    }
    assert.deepEqual(await snapshot(reads), reads, 'Account GET must never create preferences, audit or reminders.');
    pass('all current and legacy staff roles load only their own organization account through HttpOnly sessions; private account reads write no records');
    phase = 'strict self-service fields and tenant/CSRF isolation';
    let admin = await current(api, cookies[0]);
    const other = await userRow(4);
    for (const field of ['id', 'userId', 'organizationId', 'membershipId', 'email', 'role', 'active', 'is_demo', 'passwordHash']) {
        await deny(api, endpoint + '/profile', cookies[0], 'PATCH', profileBody(admin.profile, { [field]: userIds[4] }), 400, 'INVALID_INPUT');
        await deny(api, endpoint + '/preferences', cookies[0], 'PATCH', preferenceBody(admin.preferences, { [field]: organizationIds[1] }), 400, 'INVALID_INPUT');
    }
    await deny(api, `${endpoint}/${userIds[4]}`, cookies[0], 'GET', undefined, 404);
    for (const patch of [{ displayName: ' ' }, { phone: 'bad\nvalue' }, { jobTitle: 'x'.repeat(121) }])
        await deny(api, endpoint + '/profile', cookies[0], 'PATCH', profileBody(admin.profile, patch), 400);
    const origin = await fetch(api.base + endpoint + '/profile', { method: 'PATCH', headers: { Cookie: cookies[0], Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: JSON.stringify(profileBody(admin.profile)) });
    assert.equal(origin.status, 403);
    const plain = await fetch(api.base + endpoint + '/profile', { method: 'PATCH', headers: { Cookie: cookies[0], Origin: config.appUrl, 'Content-Type': 'text/plain' }, body: 'plain text' });
    assert.equal(plain.status, 415);
    assert.deepEqual(await userRow(4), other);
    pass('strict field allowlists reject email, role and organization changes; other-user routes, invalid fields, wrong content types and cross-origin writes are denied');
    phase = 'profile persistence, all-role edits and optimistic concurrency';
    for (const i of [0, 1, 2, 3, 4, 5, 6]) {
        const previous = await current(api, cookies[i]);
        const saved = await json<{
            profile: AccountProfile;
        }>(api, endpoint + '/profile', cookies[i], 'PATCH', profileBody(previous.profile, { displayName: `Updated own account ${i}`, phone: `+234 555 000 ${i}`, jobTitle: i === 3 ? 'Portfolio analyst' : 'Leasing colleague' }));
        assert.equal(saved.profile.version, previous.profile.version + 1);
        assert.equal(saved.profile.email, emails[i]);
        assert.equal(saved.profile.displayName, `Updated own account ${i}`);
        assert.equal((await current(api, cookies[i])).profile.phone, `+234 555 000 ${i}`);
        await deny(api, endpoint + '/profile', cookies[i], 'PATCH', profileBody(previous.profile, { displayName: 'Stale overwrite' }), 409, 'VERSION_CONFLICT');
    }
    const previousProfile = (await current(api, cookies[0])).profile;
    const competingProfiles = await Promise.all(['First edit', 'Second edit'].map(displayName => api.request(endpoint + '/profile', cookies[0], 'PATCH', profileBody(previousProfile, { displayName }))));
    assert.deepEqual(competingProfiles.map(r => r.status).sort(), [200, 409]);
    admin = await current(api, cookies[0]);
    assert.equal(admin.profile.version, previousProfile.version + 1);
    const normalized = await json<{
        profile: AccountProfile;
    }>(api, endpoint + '/profile', cookies[0], 'PATCH', profileBody(admin.profile, { displayName: '  Named staff member  ', phone: ' ', jobTitle: '' }));
    assert.equal(normalized.profile.displayName, 'Named staff member');
    assert.equal(normalized.profile.phone, null);
    assert.equal(normalized.profile.jobTitle, null);
    assert.equal((await json<{
        user: {
            name: string;
        };
    }>(api, '/api/auth/me', cookies[0])).user.name, 'Named staff member');
    pass('every staff role edits its persistent profile and refreshed current-user name; stale/concurrent writes return409 instead of overwriting staff work');
    phase = 'membership-scoped preferences and current-permission fallback';
    const initialSettings = (await current(api, cookies[2])).preferences;
    const savedSettings = await json<{
        preferences: AccountPreferences;
    }>(api, endpoint + '/preferences', cookies[2], 'PATCH', preferenceBody(initialSettings, { defaultPage: '/admin/tasks', leadView: 'board', motion: 'reduce' }));
    assert.equal(savedSettings.preferences.version, 2);
    assert.equal(savedSettings.preferences.defaultPage, '/admin/tasks');
    assert.equal(savedSettings.preferences.leadView, 'board');
    assert.equal(savedSettings.preferences.motion, 'reduce');
    await deny(api, endpoint + '/preferences', cookies[2], 'PATCH', preferenceBody(initialSettings), 409, 'VERSION_CONFLICT');
    const analystSettings = (await current(api, cookies[3])).preferences;
    await deny(api, endpoint + '/preferences', cookies[3], 'PATCH', preferenceBody(analystSettings, { defaultPage: '/admin/tasks' }), 403, 'PREFERENCE_DENIED');
    await json(api, endpoint + '/preferences', cookies[3], 'PATCH', preferenceBody(analystSettings, { defaultPage: '/admin/leads', leadView: 'board', motion: 'reduce' }));
    for (const patch of [{ defaultPage: 'https://attacker.example' }, { defaultPage: '/admin/imports' }, { leadView: 'invented' }, { motion: 'always' }])
        await deny(api, endpoint + '/preferences', cookies[2], 'PATCH', preferenceBody(savedSettings.preferences, patch), 400);
    const competingSettings = await Promise.all(['list', 'board'].map(leadView => api.request(endpoint + '/preferences', cookies[2], 'PATCH', preferenceBody(savedSettings.preferences, { leadView }))));
    assert.deepEqual(competingSettings.map(r => r.status).sort(), [200, 409]);
    await database.query("UPDATE organization_memberships SET created_at='1999-01-01T00:00:00Z' WHERE id=$1", [otherMembership]);
    const otherOrganizationCookie = await api.login(2);
    const otherContext = await current(api, otherOrganizationCookie);
    assert.equal(otherContext.profile.organization.id, organizationIds[1]);
    assert.equal(otherContext.profile.organization.role, 'read_only_analyst');
    assert.equal(otherContext.preferences.defaultPage, '/admin');
    assert.equal(otherContext.preferences.leadView, 'list');
    await json(api, endpoint + '/preferences', otherOrganizationCookie, 'PATCH', preferenceBody(otherContext.preferences, { defaultPage: '/admin/leads' }));
    await database.query("UPDATE organization_memberships SET created_at=now()+interval '1 minute' WHERE id=$1", [otherMembership]);
    assert.equal((await current(api, cookies[2])).preferences.defaultPage, '/admin/tasks');
    await database.query("UPDATE organization_memberships SET role='read_only_analyst' WHERE id=$1", [membershipIds[2]]);
    const fallbackBaseline = await snapshot();
    const fallback = await current(api, cookies[2]);
    assert.equal(fallback.preferences.defaultPage, '/admin');
    assert.equal(fallback.profile.organization.role, 'read_only_analyst');
    assert.deepEqual(await snapshot(fallbackBaseline), fallbackBaseline, 'Permission fallback must not rewrite stored settings.');
    await database.query("UPDATE organization_memberships SET role='leasing_agent' WHERE id=$1", [membershipIds[2]]);
    assert.equal((await current(api, cookies[2])).preferences.defaultPage, '/admin/tasks');
    pass('settings persist per exact membership, constrain destinations and resolve concurrent edits; current role changes safely fall back without rewriting preferences');
    phase = 'restart persistence and expired/revoked/portal sessions';
    const remembered = await current(api, cookies[2]);
    await api.close();
    api = await start();
    assert.deepEqual(await current(api, cookies[2]), remembered, 'New API/pool must retain profile and settings with the normal cookie.');
    await database.query("UPDATE sessions SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE token_digest=$1", [digest(cookies[7])]);
    await deny(api, endpoint, cookies[7], 'GET', undefined, 401);
    cookies[7] = await api.login(7);
    await database.query('UPDATE organization_memberships SET active=false WHERE id=$1', [membershipIds[7]]);
    await deny(api, endpoint, cookies[7], 'GET', undefined, 401);
    await deny(api, endpoint + '/profile', cookies[7], 'PATCH', profileBody((await current(api, cookies[0])).profile), 401);
    await database.query('UPDATE organization_memberships SET active=true WHERE id=$1', [membershipIds[7]]);
    for (const kind of ['applicant', 'resident']) {
        const email = `${kind}-${randomUUID()}@example.test`;
        await database.query('INSERT INTO users(email,display_name,password_hash,account_kind) VALUES($1,$2,$3,$4)', [email, 'Separate portal identity', (await userRow(0)).password_hash, kind]);
        await deny(api, '/api/auth/login', '', 'POST', { email, password }, 401);
    }
    pass('profiles, settings and sessions survive API/pool restart; expired sessions, revoked staff memberships and separate applicant/resident identities are denied');
    phase = 'shared demo credentials remain protected';
    for (const email of [config.demoAdminEmail, 'standalone@demo.ootla.test']) {
        const login = await api.request('/api/auth/login', '', 'POST', { email, password: config.demoAdminPassword });
        assert.equal(login.status, 200);
        const cookie = login.headers.get('set-cookie')?.split(';')[0];
        assert(cookie);
        const account = await current(api, cookie);
        assert.equal(account.access.canChangePassword, false);
        assert(account.access.passwordChangeNotice);
        const original = (await database.query('SELECT password_hash,updated_at FROM users WHERE id=$1', [account.profile.id])).rows[0];
        await deny(api, endpoint + '/password', cookie, 'POST', passwordBody(config.demoAdminPassword), 403, 'DEMO_PASSWORD_LOCKED');
        assert.deepEqual((await database.query('SELECT password_hash,updated_at FROM users WHERE id=$1', [account.profile.id])).rows[0], original);
        assert.equal((await database.query('SELECT 1 FROM staff_password_attempt_limits WHERE user_id=$1', [account.profile.id])).rowCount, 0);
        assert.equal((await api.request(endpoint, cookie)).status, 200);
    }
    pass('both shared demo accounts retain established passwords/sessions; password changes are denied without consuming attempts or changing credentials');
    phase = 'password validation and durable bounded attempts';
    const managerHash = (await userRow(1)).password_hash;
    const invalidPasswordInputs = [passwordBody(password, 'too-short'), { ...passwordBody(), confirmPassword: 'Mismatch-password' }, passwordBody(password, password), { ...passwordBody(), role: 'organization_admin' }, passwordBody(password, 'x'.repeat(129)), passwordBody(password, 'bad\nnew-password')];
    for (const body of invalidPasswordInputs)
        await deny(api, endpoint + '/password', cookies[1], 'POST', body, 400, 'INVALID_INPUT');
    assert.equal((await database.query('SELECT 1 FROM staff_password_attempt_limits WHERE user_id=$1', [userIds[1]])).rowCount, 0, 'Invalid input must not consume verification attempts.');
    for (let attempt = 1; attempt <= 5; attempt++) {
        await deny(api, endpoint + '/password', cookies[1], 'POST', passwordBody('Wrong-current-password'), 400, 'CURRENT_PASSWORD_INCORRECT');
        assert.equal((await database.query<{
            attempts: number;
        }>('SELECT attempts FROM staff_password_attempt_limits WHERE user_id=$1', [userIds[1]])).rows[0]?.attempts, attempt);
    }
    assert.equal((await userRow(1)).password_hash, managerHash);
    const limited = await deny(api, endpoint + '/password', cookies[1], 'POST', passwordBody(), 429, 'PASSWORD_LIMITED');
    assert(Number(limited.headers.get('retry-after')) > 0);
    await api.close();
    api = await start();
    const limitedAgain = await deny(api, endpoint + '/password', cookies[1], 'POST', passwordBody(), 429, 'PASSWORD_LIMITED');
    assert(Number(limitedAgain.headers.get('retry-after')) > 0);
    assert.equal((await database.query<{
        attempts: number;
    }>('SELECT attempts FROM staff_password_attempt_limits WHERE user_id=$1', [userIds[1]])).rows[0]?.attempts, 5);
    await database.query("UPDATE staff_password_attempt_limits SET window_started_at=now()-interval '16 minutes' WHERE user_id=$1", [userIds[1]]);
    await deny(api, endpoint + '/password', cookies[1], 'POST', passwordBody('Still-wrong-current'), 400, 'CURRENT_PASSWORD_INCORRECT');
    assert.equal((await database.query<{
        attempts: number;
    }>('SELECT attempts FROM staff_password_attempt_limits WHERE user_id=$1', [userIds[1]])).rows[0]?.attempts, 1);
    pass('password validation rejects weak/mismatched/unchanged inputs; five incorrect-current attempts persist across API restart, bound Retry-After and recover only after their 15-minute window');
    phase = 'Argon2 password change and all-session revocation';
    const secondAgentCookie = await api.login(2);
    const otherUser = await userRow(4);
    const otherSessionCount = (await database.query<{
        n: number;
    }>('SELECT count(*)::int AS n FROM sessions WHERE user_id<>$1', [userIds[2]])).rows[0]!.n;
    assert((await database.query<{
        n: number;
    }>('SELECT count(*)::int AS n FROM sessions WHERE user_id=$1', [userIds[2]])).rows[0]!.n >= 3, 'Include multiple browsers and both organization sessions.');
    const oldHash = (await userRow(2)).password_hash;
    const changed = await api.request(endpoint + '/password', cookies[2], 'POST', passwordBody());
    assert.equal(changed.status, 200);
    assert.deepEqual(await changed.json(), { signedOut: true });
    assert(/ootla\.sid=;/i.test(changed.headers.get('set-cookie') ?? '') && /HttpOnly/i.test(changed.headers.get('set-cookie') ?? ''), 'Clear current HttpOnly cookie.');
    const newHash = (await userRow(2)).password_hash;
    assert.notEqual(newHash, oldHash);
    assert.match(newHash, /^\$argon2id\$/);
    assert(await verifyPassword(newHash, replacementPassword));
    assert(!await verifyPassword(newHash, password));
    assert.equal((await database.query('SELECT 1 FROM sessions WHERE user_id=$1', [userIds[2]])).rowCount, 0);
    assert.equal((await database.query<{
        n: number;
    }>('SELECT count(*)::int AS n FROM sessions WHERE user_id<>$1', [userIds[2]])).rows[0]!.n, otherSessionCount);
    assert.deepEqual(await userRow(4), otherUser);
    for (const cookie of [cookies[2], secondAgentCookie, otherOrganizationCookie])
        await deny(api, endpoint, cookie, 'GET', undefined, 401);
    await deny(api, '/api/auth/login', '', 'POST', { email: emails[2], password }, 401);
    cookies[2] = await api.login(2, replacementPassword);
    assert.equal((await current(api, cookies[2])).profile.email, emails[2]);
    assert.equal((await current(api, cookies[2])).preferences.defaultPage, '/admin/tasks');
    assert.equal((await api.request(endpoint, cookies[4])).status, 200);
    pass('password changes store verified Argon2id hashes, clear the cookie and revoke every own session across organizations while preserving other users and saved preferences');
    phase = 'in-flight writes cannot outlive their exact session';
    assert(database.pool);
    const blocker = await database.pool.connect();
    let pending: Promise<Response> | undefined;
    try {
        await blocker.query('BEGIN');
        await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userIds[7]]);
        const race = (await database.query<{
            profile_version: number;
            display_name: string;
        }>('SELECT profile_version,display_name FROM users WHERE id=$1', [userIds[7]])).rows[0]!;
        pending = api.request(endpoint + '/profile', cookies[7], 'PATCH', { version: race.profile_version, displayName: 'Must not survive session revocation', phone: null, jobTitle: null });
        let waiting = false;
        for (let poll = 0; poll < 100; poll++) {
            const waits = await database.query<{
                n: number;
            }>("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%profile_version%' AND query NOT LIKE '%pg_stat_activity%'");
            if (waits.rows[0]!.n > 0) {
                waiting = true;
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert(waiting, 'Controlled in-flight write must wait on user lock before session revocation.');
        await blocker.query('DELETE FROM sessions WHERE token_digest=$1', [digest(cookies[7])]);
        await blocker.query('COMMIT');
        const response = await pending;
        assert([401, 403].includes(response.status), 'An in-flight request must fail before writing once its exact session is revoked.');
        assert.equal((await userRow(7)).display_name, race.display_name);
        assert.equal((await userRow(7)).profile_version, race.profile_version);
    }
    finally {
        await blocker.query('ROLLBACK').catch(() => undefined);
        blocker.release();
        if (pending)
            await pending.catch(() => undefined);
    }
    pass('serialized self-service writes revalidate their exact live session, preventing already-started requests from writing after logout/password-session revocation');
    phase = 'concurrent old-password login cannot create a surviving session';
    cookies[7] = await api.login(7);
    const serialization = await database.pool.connect();
    let passwordRequest: Promise<Response> | undefined, oldPasswordLogin: Promise<Response> | undefined;
    const racedPassword = 'Concurrent-' + randomUUID() + '!';
    try {
        await serialization.query('BEGIN');
        await serialization.query('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE', [userIds[7]]);
        passwordRequest = api.request(endpoint + '/password', cookies[7], 'POST', passwordBody(password, racedPassword));
        const waitForLocks = async (minimum: number) => { for (let poll = 0; poll < 100; poll++) {
            const waiting = await database.query<{
                n: number;
            }>("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%users u%' AND query NOT LIKE '%pg_stat_activity%'");
            if (waiting.rows[0]!.n >= minimum)
                return;
            await new Promise(resolve => setTimeout(resolve, 10));
        } assert.fail('Controlled password/login requests must reach their user-row locks.'); };
        await waitForLocks(1);
        oldPasswordLogin = api.request('/api/auth/login', '', 'POST', { email: emails[7], password });
        await waitForLocks(2);
        await serialization.query('COMMIT');
        assert.equal((await passwordRequest).status, 200);
        assert.equal((await oldPasswordLogin).status, 401, 'A login which verified the old hash before waiting must revalidate after the password changes.');
        assert.equal((await database.query('SELECT 1 FROM sessions WHERE user_id=$1', [userIds[7]])).rowCount, 0);
        assert(await verifyPassword((await userRow(7)).password_hash, racedPassword));
        cookies[7] = await api.login(7, racedPassword);
        const competingPasswords = await Promise.all(['Concurrent-A-' + randomUUID() + '!', 'Concurrent-B-' + randomUUID() + '!'].map(nextPassword => api.request(endpoint + '/password', cookies[7], 'POST', passwordBody(racedPassword, nextPassword))));
        assert.deepEqual(competingPasswords.map(response => response.status).sort(), [200, 401]);
        assert.equal((await database.query('SELECT 1 FROM sessions WHERE user_id=$1', [userIds[7]])).rowCount, 0);
    }
    finally {
        await serialization.query('ROLLBACK').catch(() => undefined);
        serialization.release();
        if (passwordRequest)
            await passwordRequest.catch(() => undefined);
        if (oldPasswordLogin)
            await oldPasswordLogin.catch(() => undefined);
    }
    pass('a concurrent old-password login cannot create a surviving session; competing password changes serialize and the stale requesting session is rejected');
    phase = 'audit privacy and unrelated CRM preservation';
    const audits = (await database.query<{
        organization_id: string;
        actor_user_id: string;
        action: string;
        metadata: {
            fields?: string[];
        };
    }>("SELECT organization_id,actor_user_id,action,metadata FROM audit_events WHERE action LIKE 'account.%' ORDER BY id")).rows;
    assert(audits.some(r => r.action === 'account.password_changed'));
    assert(audits.some(r => r.action === 'account.profile_updated'));
    assert(audits.some(r => r.action === 'account.preferences_updated'));
    for (const row of audits) {
        assert.deepEqual(Object.keys(row.metadata), ['fields']);
        assert(Array.isArray(row.metadata.fields));
        assert(row.metadata.fields.every(value => ['displayName', 'phone', 'jobTitle', 'defaultPage', 'leadView', 'motion'].includes(value)), 'Audit records field names without profile values.');
        const index = userIds.indexOf(row.actor_user_id);
        assert(index >= 0);
        assert(row.organization_id === organizationIds[index === 4 ? 1 : 0] || index === 2 && row.organization_id === organizationIds[1]);
        const metadata = JSON.stringify(row.metadata);
        for (const value of [password, replacementPassword, config.sessionSecret, '+234', '@example.test', 'Portfolio analyst'])
            assert(!metadata.includes(value));
    }
    assert.equal((await database.query("SELECT 1 FROM properties WHERE id=$1 AND name='Untouched property'", [propertyId])).rowCount, 1);
    assert.equal((await database.query("SELECT 1 FROM leads WHERE property_id=$1 AND notes='Retained work must be preserved'", [propertyId])).rowCount, 1);
    assert.equal((await database.query("SELECT 1 FROM tasks WHERE property_id=$1 AND title='Untouched task'", [propertyId])).rowCount, 1);
    pass('audits preserve actor, organization and changed-field names without profile values/passwords; unrelated properties, leads, tasks and customer history remain intact');
}
try {
    await main();
    console.log(`Account checks complete: ${groups} groups passed.`);
}
catch (error) {
    const detail = error instanceof assert.AssertionError ? error.message.split(/\r?\n/, 1)[0] : JSON.stringify({ name: error instanceof Error ? error.name : 'unknown', code: (error as {
            code?: string;
        })?.code, frame: error instanceof Error ? error.stack?.split(/\r?\n/).find(line => line.includes('check-account.ts'))?.trim() : undefined });
    console.error(`Account checks failed during ${phase}: ${detail}`);
    process.exitCode = 1;
}
finally {
    try {
        for (const close of servers.reverse())
            await close();
        await database.close();
        if (ownsScratch) {
            await verifiedCluster();
            assert(/^ootla_demo_account_[a-f0-9]{32}$/.test(scratchName));
            const target = await owner.query<{
                owner: string;
            }>('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1', [scratchName]);
            assert(target.rowCount === 1 && target.rows[0]?.owner === 'ootla', 'Scratch ownership changed; no deletion attempted.');
            const quoted = (await owner.query<{
                name: string;
            }>('SELECT quote_ident($1) AS name', [scratchName])).rows[0]!.name;
            await owner.query(`DROP DATABASE ${quoted}`);
            assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1', [scratchName])).rowCount, 0);
            console.log('PASS removed only the uniquely owned account scratch database; retained data was never modified');
        }
    }
    catch {
        console.error('Owned account scratch cleanup failed. No unrelated database deletion was attempted.');
        process.exitCode = 1;
    }
    finally {
        if (ownerConnected)
            await owner.end();
    }
}
