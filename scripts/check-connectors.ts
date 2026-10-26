import '../server/config/environment.js';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { createApp } from '../server/app.js';
import { loadConfig, type ServerConfig } from '../server/config/env.js';
import { Database } from '../server/db/pool.js';
import { hashPassword } from '../server/services/passwords.js';
import type { ConnectorOverview, ConnectorConnection, ConnectorJob, ConnectorMapping, ConnectorEvent, ConnectorConflict, ConnectorJobs, ConnectorMappings, ConnectorEvents, ConnectorConflicts } from '../shared/connector-contracts.js';
import { processConnectorJobs } from '../server/services/connectors.js';
import { encryptConnectorCredential, decryptConnectorCredential } from '../server/connectors/vault.js';
import type { Paginated } from '../shared/property-contracts.js';
// Every mutation in this script targets a freshly-created, uniquely owned scratch
// database. The retained review/demo database is never migrated, seeded or reset.
const root = path.resolve(import.meta.dirname, '..');
const source = loadConfig();
const sourceUrl = new URL(source.databaseUrl);
assert(source.demoMode && !source.production && /^ootla_demo(?:_[a-z0-9_]+)?$/.test(source.databaseName ?? ''), 'Use the documented non-production isolated Ootla demo configuration.');
assert(sourceUrl.hostname === '127.0.0.1' && sourceUrl.port === '55439' && sourceUrl.username === 'ootla' && !sourceUrl.search && !sourceUrl.hash, 'Use only the verified project-owned cluster and restricted application role.');
const scratchName = `ootla_demo_connectors_${randomUUID().replaceAll('-', '')}`;
const scratchUrl = new URL(sourceUrl);
scratchUrl.pathname = `/${scratchName}`;
const config: ServerConfig = { ...source, nodeEnv: 'test', production: false, appUrl: 'http://ootla.test', connectorCredentialKey: randomBytes(32).toString('base64'), databaseUrl: scratchUrl.toString(), databaseName: scratchName };
const ownerUrl = new URL(sourceUrl);
ownerUrl.username = 'ootla_cluster_owner';
ownerUrl.pathname = '/postgres';
const owner = new Client({ connectionString: ownerUrl.toString(), connectionTimeoutMillis: 5000 });
const database = new Database(config);
const organizationIds = [randomUUID(), randomUUID()];
const roles = ['organization_admin', 'leasing_agent', 'property_manager', 'read_only_analyst', 'organization_admin'] as const;
const userIds = roles.map(() => randomUUID());
const membershipIds = roles.map(() => randomUUID());
const emails = userIds.map(id => `connectors-${id}@example.test`);
const password = `Stage11-${randomUUID()}!`;
const propertyId = randomUUID(), unitId = randomUUID(), leadId = randomUUID();
let ownerConnected = false, ownsScratch = false, groups = 0, phase = 'safe scratch setup';
const servers: Array<() => Promise<void>> = [];
const pass = (label: string) => { groups++; console.log(`PASS ${label}`); };
const normalize = (value: string) => path.resolve(value).replaceAll('\\', '/').toLowerCase();
async function verifiedCluster() { const r = await owner.query<{
    data_directory: string;
}>('SHOW data_directory'); assert.equal(normalize(r.rows[0]?.data_directory ?? ''), normalize(path.join(root, '.local/postgres/data')), 'Refusing to operate outside the Ootla-owned PostgreSQL data directory.'); }
async function createScratch() { await owner.connect(); ownerConnected = true; await verifiedCluster(); assert(/^ootla_demo_connectors_[a-f0-9]{32}$/.test(scratchName)); assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1', [scratchName])).rowCount, 0); const role = (await owner.query<{
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
    assert(/^[a-z_][a-z0-9_]*$/.test(table) && columns.every(c => /^[a-z_][a-z0-9_]*$/.test(c)));
    const rows = (await database.query(`SELECT ${columns.map(c => `"${c}"`).join(',')} FROM "${table}"`)).rows.map(r => JSON.stringify(r)).sort();
    result[table] = { columns, count: rows.length, hash: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
} return result; }
async function baseline() { await database.query('CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())'); for (const name of ['001_foundation.sql', '002_staff_roles_property_access.sql', '003_demo_dataset.sql', '004_property_contact_foundation.sql', '005_lead_pipeline.sql', '006_lead_workspace.sql', '007_tasks_reminders.sql', '008_standalone_imports.sql', '009_staff_account.sql']) {
    const sql = await readFile(path.join(root, 'migrations', name), 'utf8');
    await database.transaction(async (client) => { await client.query(sql.replace(/^\uFEFF/, '')); await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name, createHash('sha256').update(sql).digest('hex')]); });
} const hash = await hashPassword(password); await database.transaction(async (client) => { for (const [i, id] of organizationIds.entries()) {
    await client.query("INSERT INTO organizations(id,name,slug,environment) VALUES($1,$2,$3,'demo')", [id, `Stage 11 isolated ${i}`, `connectors-${randomUUID()}`]);
    await client.query('INSERT INTO organization_data_settings(organization_id,mode) VALUES($1,$2)', [id, i === 0 ? 'standalone' : 'yardi_connected']);
} for (const [i, id] of userIds.entries()) {
    await client.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)', [id, emails[i], `Stage 11 ${roles[i]}`, hash]);
    await client.query('INSERT INTO organization_memberships(id,organization_id,user_id,role) VALUES($1,$2,$3,$4)', [membershipIds[i], organizationIds[i === 4 ? 1 : 0], id, roles[i]]);
} await client.query("INSERT INTO properties(id,organization_id,name,address,city) VALUES($1,$2,'Legacy property','1 Retained Way','Lagos')", [propertyId, organizationIds[0]]); await client.query("INSERT INTO units(id,organization_id,property_id,label,bedrooms,status,monthly_rent) VALUES($1,$2,$3,'A1',2,'available',1500)", [unitId, organizationIds[0], propertyId]); await client.query("INSERT INTO leads(id,organization_id,property_id,unit_id,display_name,email,status,intent,notes) VALUES($1,$2,$3,$4,'Taylor Brooks','taylor.brooks@simulator.ootla.test','new','leasing','Untouched historical work')", [leadId, organizationIds[0], propertyId, unitId]); await client.query("INSERT INTO tasks(organization_id,property_id,lead_id,contact_id,title,due_at,status) SELECT organization_id,property_id,id,contact_id,'Legacy task',now()+interval '1 day','open' FROM leads WHERE id=$1", [leadId]); for (const i of [1, 2, 3])
    await client.query('INSERT INTO property_access_assignments(organization_id,membership_id,property_id) VALUES($1,$2,$3)', [organizationIds[0], membershipIds[i], propertyId]); }); }
async function migrate() { try {
    await promisify(execFile)(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), path.join(root, 'scripts/migrate.ts')], { cwd: root, windowsHide: true, timeout: 30000, env: { ...process.env, NODE_ENV: 'test', DEMO_MODE: 'true', DATABASE_URL: config.databaseUrl, APP_URL: config.appUrl } });
}
catch (error) {
    const failure=error as {code?:string|number;signal?:string;killed?:boolean;stdout?:string};
    console.error('Scoped migration diagnostic '+JSON.stringify({code:failure.code,signal:failure.signal,killed:failure.killed,applied:failure.stdout?.split(/\r?\n/).filter(line=>/^Applied [0-9]{3}_[a-z0-9_]+\.sql$/.test(line))}));
    assert.fail('Scoped scratch migration failed; raw process configuration and credentials are intentionally omitted.');
} }
async function start(localConfig: ServerConfig = config) { const db = new Database(localConfig), app = createApp(localConfig, db); const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); listener.once('error', reject); }); let closed = false; const close = async () => { if (closed)
    return; closed = true; server.closeIdleConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); await db.close(); }; servers.push(close); const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; const request = (route: string, cookie = '', method = 'GET', body?: unknown) => fetch(base + route, { method, redirect: 'manual', headers: { ...(cookie ? { Cookie: cookie } : {}), ...(method === 'GET' ? {} : { Origin: localConfig.appUrl }), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { close, request, base, login: async (index: number) => { const response = await request('/api/auth/login', '', 'POST', { email: emails[index], password }); assert.equal(response.status, 200, 'Normal hashed-password sign-in must work.'); const cookie = response.headers.get('set-cookie')?.split(';')[0]; assert(cookie && /HttpOnly/i.test(response.headers.get('set-cookie')!)); return cookie; } }; }
type Api = Awaited<ReturnType<typeof start>>;
async function json<T>(api: Api, route: string, cookie: string, method = 'GET', body?: unknown, expected: number | number[] = [200, 201, 202]): Promise<T> { const r = await api.request(route, cookie, method, body); assert((Array.isArray(expected) ? expected : [expected]).includes(r.status), `${method} ${route.split('?')[0]} must return ${expected}; received ${r.status}.`); return r.json() as Promise<T>; }
async function deny(api: Api, route: string, cookie: string, method = 'GET', body?: unknown, expected: number | number[] = [400, 403, 404, 409]) { const r = await api.request(route, cookie, method, body); assert((Array.isArray(expected) ? expected : [expected]).includes(r.status), `${method} ${route.split('?')[0]} must reject; received ${r.status}.`); return r; }
const endpoint = '/api/connectors';
const overview = (api: Api, cookie: string) => json<ConnectorOverview>(api, endpoint, cookie);
const sync = (api: Api, cookie: string, id: string, mode: 'incremental' | 'replay' = 'incremental', requestKey = randomUUID()) => json<{
    job: ConnectorJob;
}>(api, endpoint + '/' + id + '/sync', cookie, 'POST', { requestKey, mode });
const action = (api: Api, cookie: string, id: string, action: string, extra: Record<string, unknown> = {}) => json<{
    queuedEvents: number;
}>(api, endpoint + '/' + id + '/demo-actions', cookie, 'POST', { requestKey: randomUUID(), action, ...extra });
const jobs = (api: Api, cookie: string, id: string, pageSize = 100) => json<ConnectorJobs>(api, endpoint + '/' + id + '/jobs?pageSize=' + pageSize, cookie);
const mappings = (api: Api, cookie: string, id: string) => json<ConnectorMappings>(api, endpoint + '/' + id + '/mappings?pageSize=100', cookie);
const events = (api: Api, cookie: string, id: string) => json<ConnectorEvents>(api, endpoint + '/' + id + '/events?pageSize=100', cookie);
const conflicts = (api: Api, cookie: string, id: string) => json<ConnectorConflicts>(api, endpoint + '/' + id + '/conflicts?pageSize=100', cookie);
const resolve = (api: Api, cookie: string, id: string, conflictId: string, resolution: 'use_provider' | 'keep_ootla', requestKey = randomUUID()) => json<{
    conflict: ConnectorConflict;
}>(api, endpoint + '/' + id + '/conflicts/' + conflictId + '/resolve', cookie, 'POST', { requestKey, resolution });
async function job(api: Api, cookie: string, id: string, jobId: string) { const record = (await jobs(api, cookie, id)).items.find(row => row.id === jobId); assert(record, 'Persisted job must appear in its organization queue.'); return record; }
async function drain(api: Api, cookie: string, id: string, jobId: string) { for (let tick = 0; tick < 30; tick++) {
    const row = await job(api, cookie, id, jobId);
    if (['completed', 'failed', 'cancelled'].includes(row.status))
        return row;
    await processConnectorJobs(database, config, { batchSize: 2 });
} assert.fail('Bounded connector drain did not reach a terminal state.'); }
async function legacyRecords() { return (await database.query("SELECT jsonb_build_object('property',(SELECT to_jsonb(p) FROM properties p WHERE id=$1),'unit',(SELECT to_jsonb(u) FROM units u WHERE id=$2),'lead',(SELECT to_jsonb(l) FROM leads l WHERE id=$3),'contact',(SELECT to_jsonb(c) FROM contacts c JOIN leads l ON l.contact_id=c.id WHERE l.id=$3),'tasks',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM tasks t WHERE lead_id=$3),'users',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM users u WHERE id=ANY($4::uuid[])),'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM organization_memberships m WHERE id=ANY($5::uuid[])),'propertyAccess',(SELECT jsonb_agg(to_jsonb(a) ORDER BY membership_id) FROM property_access_assignments a WHERE property_id=$1)) AS records", [propertyId, unitId, leadId, userIds, membershipIds])).rows[0]!.records; }
async function main() {
    await createScratch();
    await baseline();
    const legacy = await legacyRecords();
    const before = await snapshot();
    phase = 'additive migration010 preservation';
    await migrate();
    assert.deepEqual(await snapshot(before), before, 'Migration010 must preserve every prior column, customer record, password hash and timestamp.');
    await migrate();
    assert.deepEqual(await snapshot(before), before);
    const checksums = (await database.query<{
        name: string;
        checksum: string;
    }>('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;
    assert.equal(checksums.length, 10);
    for (const row of checksums)
        assert.equal(row.checksum, createHash('sha256').update(await readFile(path.join(root, 'migrations', row.name), 'utf8')).digest('hex'));
    assert.equal(await database.state(), 'ready');
    pass('additive migration010 and repeat migration preserve all prior records, hashes, timestamps and ten immutable migration checksums');
    const api = await start();
    const admin = await api.login(0), agent = await api.login(1), manager = await api.login(2), analyst = await api.login(3), other = await api.login(4);
    phase = 'current staff administration, tenant scope and read-only overview';
    await deny(api, endpoint, '', 'GET', undefined, 401);
    for (const cookie of [agent, manager, analyst]) {
        await deny(api, endpoint, cookie, 'GET', undefined, 403);
        await deny(api, endpoint + '/demo', cookie, 'POST', { requestKey: randomUUID() }, 403);
    }
    const emptyBefore = await snapshot(), empty = await overview(api, admin);
    assert.equal(empty.connection, null);
    assert(empty.access.canManage && empty.access.demoAvailable);
    assert.equal(empty.access.liveAvailable, false);
    assert.equal(empty.adapter.key, 'yardi_demo');
    assert.match(empty.adapter.label, /demo|simulat|synthetic/i);
    assert.equal(empty.adapter.capabilities.outbound, false);
    assert.equal(empty.adapter.capabilities.accounting, false);
    assert.equal(empty.adapter.capabilities.leases, false);
    assert.equal(empty.adapter.capabilities.residents, false);
    assert.deepEqual(await snapshot(emptyBefore), emptyBefore, 'GET overview must not provision connections, source fixtures, jobs or CRM records.');
    const wrongOrigin = await fetch(api.base + endpoint + '/demo', { method: 'POST', headers: { Cookie: admin, Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ requestKey: randomUUID() }) });
    assert.equal(wrongOrigin.status, 403);
    await deny(api, endpoint + '/demo', admin, 'POST', { requestKey: randomUUID(), organizationId: organizationIds[1] }, 400);
    await deny(api, endpoint + '/demo', admin, 'POST', { requestKey: 'invalid' }, 400);
    pass('only current organization administrators can manage simulated connectors; overview is read-only, authority fields and cross-origin writes are rejected, and live/outbound capabilities remain unavailable');
    phase = 'explicit simulator setup, request idempotence and worker-only ingestion';
    const initialKey = randomUUID(), created = await json<{
        connection: ConnectorConnection;
        job: ConnectorJob;
    }>(api, endpoint + '/demo', admin, 'POST', { requestKey: initialKey });
    const connectionId = created.connection.id;
    assert.equal(created.connection.provider, 'yardi_demo');
    assert.notEqual(created.connection.state, 'live');
    assert.equal(created.job.status, 'queued');
    const repeated = await json<{
        connection: ConnectorConnection;
        job: ConnectorJob;
    }>(api, endpoint + '/demo', admin, 'POST', { requestKey: initialKey });
    assert.equal(repeated.connection.id, connectionId);
    assert.equal(repeated.job.id, created.job.id);
    assert.equal((await mappings(api, admin, connectionId)).total, 0, 'Configuration queues ingestion; it must not create canonical records synchronously.');
    assert.equal((await database.query<{
        n: number;
    }>('SELECT count(*)::int AS n FROM properties WHERE organization_id=$1', [organizationIds[0]])).rows[0]?.n, 1);
    assert.equal((await database.query<{
        mode: string;
    }>('SELECT mode FROM organization_data_settings WHERE organization_id=$1', [organizationIds[0]])).rows[0]?.mode, 'standalone', 'A demonstration must not silently change real organization onboarding/source mode.');
    await deny(api, endpoint + '/' + connectionId + '/jobs', other);
    await deny(api, endpoint + '/' + connectionId + '/mappings', other);
    await deny(api, endpoint + '/' + connectionId + '/events', other);
    await deny(api, endpoint + '/' + connectionId + '/conflicts', other);
    await deny(api, endpoint + '/' + connectionId + '/sync', other, 'POST', { requestKey: randomUUID(), mode: 'incremental' });
    assert.equal((await overview(api, other)).connection, null);
    const beforeDrain = await snapshot();
    await overview(api, admin);
    await overview(api, admin);
    assert.deepEqual(await snapshot(beforeDrain), beforeDrain, 'Dashboard/integration refresh cannot create more source data or import tasks.');
    await Promise.all([processConnectorJobs(database, config, { batchSize: 2 }), processConnectorJobs(database, config, { batchSize: 2 })]);
    const completed = await drain(api, admin, connectionId, created.job.id);
    assert.equal(completed.status, 'completed');
    const mapped = await mappings(api, admin, connectionId);
    assert.equal(mapped.total, 4);
    assert.deepEqual(mapped.items.map(row => row.entityType).sort(), ['contact', 'lead', 'property', 'unit']);
    assert.equal(new Set(mapped.items.map(row => row.recordId)).size, 4);
    const byEntity = (kind: ConnectorMapping['entityType']) => { const found = mapped.items.find(row => row.entityType === kind); assert(found); return found; };
    const property = byEntity('property'), unit = byEntity('unit'), contact = byEntity('contact'), lead = byEntity('lead');
    const p = (await database.query('SELECT * FROM properties WHERE id=$1', [property.recordId])).rows[0]!, u = (await database.query('SELECT * FROM units WHERE id=$1', [unit.recordId])).rows[0]!, c = (await database.query('SELECT * FROM contacts WHERE id=$1', [contact.recordId])).rows[0]!, l = (await database.query('SELECT * FROM leads WHERE id=$1', [lead.recordId])).rows[0]!;
    assert.equal(p.organization_id, organizationIds[0]);
    assert.equal(u.organization_id, organizationIds[0]);
    assert.equal(u.property_id, p.id);
    assert.equal(l.property_id, p.id);
    assert.equal(l.unit_id, u.id);
    assert.equal(l.contact_id, c.id);
    assert.equal(c.organization_id, organizationIds[0]);
    assert.notEqual(c.id, (await database.query('SELECT contact_id FROM leads WHERE id=$1', [leadId])).rows[0]?.contact_id, 'A provider identity must not silently merge even when a local name/email matches.');
    assert.equal(p.source_system, 'demo');
    assert.equal(u.source_system, 'demo');
    assert.equal(c.source_system, 'demo');
    assert.equal(u.availability_source, 'demo');
    assert.equal(u.availability_verified_at, null);
    assert.equal(l.pipeline_stage, 'new_inquiry');
    assert.equal(l.owner_membership_id, null);
    assert.equal((await database.query('SELECT 1 FROM contact_property_links WHERE organization_id=$1 AND property_id=$2 AND contact_id=$3', [organizationIds[0], p.id, c.id])).rowCount, 1);
    assert.equal((await database.query('SELECT 1 FROM lease_verified_milestones WHERE organization_id=$1', [organizationIds[0]])).rowCount, 0);
    assert.equal((await database.query('SELECT 1 FROM provider_verified_updates WHERE organization_id=$1', [organizationIds[0]])).rowCount, 0, 'Simulator receipts must not become verified live-provider updates.');
    for (const mapping of mapped.items) {
        assert(Array.isArray(mapping.sourceOwnedFields));
        if (mapping.entityType !== 'lead')
            assert(mapping.sourceOwnedFields.length > 0);
        assert(mapping.relatedUrl.startsWith('/admin/'));
        assert(mapping.lastProviderVersion >= 1);
        assert(mapping.lastSyncedAt);
    }
    const afterSync = await overview(api, admin);
    assert.equal(afterSync.summary.mappings, 4);
    assert(afterSync.connection?.lastSuccessAt);
    assert.notEqual(afterSync.connection?.state, 'live');
    pass('deliberate idempotent setup queues a durable worker; concurrent processing creates exactly four typed mappings and canonical linked property, separate unit, contact and lead with clearly simulated unverified availability');
    phase = 'canonical CRM compatibility, source ownership and bounded directory pagination';
    const foundation = '/api/property-foundation';
    const directory = await json<Paginated<{
        id: string;
    }>>(api, foundation + '/properties?pageSize=1', admin);
    assert.equal(directory.pageSize, 1);
    assert.equal(directory.items.length, 1);
    assert.equal(directory.total, 2);
    const propertyDetail = await json<{
        property: {
            id: string;
            readOnlyFields: string[];
        };
        units: Paginated<{
            id: string;
        }>;
    }>(api, foundation + '/properties/' + p.id, admin);
    assert.equal(propertyDetail.property.id, p.id);
    assert(propertyDetail.property.readOnlyFields.includes('name'));
    assert.equal(propertyDetail.units.items[0]?.id, u.id);
    const contactDetail = await json<{
        contact: {
            id: string;
        };
        history: Paginated<unknown>;
    }>(api, foundation + '/contacts/' + c.id, admin);
    assert.equal(contactDetail.contact.id, c.id);
    assert(contactDetail.history.total > 0);
    const leadDetail = await json<{
        lead: {
            id: string;
            contactId: string;
        };
    }>(api, '/api/leads/' + l.id, admin);
    assert.equal(leadDetail.lead.id, l.id);
    assert.equal(leadDetail.lead.contactId, c.id);
    await deny(api, foundation + '/properties/' + p.id, admin, 'PATCH', { name: 'Forbidden local override' }, 409);
    await deny(api, foundation + '/properties/' + p.id + '/units/' + u.id, admin, 'PATCH', { status: 'occupied' }, 409);
    await deny(api, foundation + '/contacts/' + c.id, admin, 'PATCH', { phone: 'Staff cannot replace source identity' }, 409);
    for (const cookie of [agent, manager, analyst, other]) {
        await deny(api, foundation + '/properties/' + p.id, cookie, 'GET');
        await deny(api, foundation + '/contacts/' + c.id, cookie, 'GET');
        await deny(api, '/api/leads/' + l.id, cookie, 'GET');
    }
    const page1 = await json<ConnectorMappings>(api, endpoint + '/' + connectionId + '/mappings?page=1&pageSize=2', admin), page2 = await json<ConnectorMappings>(api, endpoint + '/' + connectionId + '/mappings?page=2&pageSize=2', admin);
    assert.equal(page1.total, 4);
    assert.equal(page1.items.length, 2);
    assert.equal(page2.items.length, 2);
    assert(!page1.items.some(row => page2.items.some(otherRow => row.id === otherRow.id)));
    await deny(api, endpoint + '/' + connectionId + '/mappings?pageSize=101', admin, 'GET', undefined, 400);
    await deny(api, endpoint + '/' + connectionId + '/events?page=0', admin, 'GET', undefined, 400);
    pass('ingested records open in the existing paginated CRM with unified identities; configured source-owned property/unit/contact edits and unassigned-property/other-organization access are denied');
    phase = 'idempotent jobs, event replay, duplicate receipts and restart persistence';
    const syncKey = randomUUID(), syncA = await sync(api, admin, connectionId, 'incremental', syncKey), syncB = await sync(api, admin, connectionId, 'incremental', syncKey);
    assert.equal(syncA.job.id, syncB.job.id);
    await deny(api, endpoint + '/' + connectionId + '/sync', admin, 'POST', { requestKey: syncKey, mode: 'replay' }, 409);
    assert.equal((await drain(api, admin, connectionId, syncA.job.id)).status, 'completed');
    const countsBefore = (await database.query('SELECT (SELECT count(*) FROM properties WHERE organization_id=$1)::int AS properties,(SELECT count(*) FROM units WHERE organization_id=$1)::int AS units,(SELECT count(*) FROM contacts WHERE organization_id=$1)::int AS contacts,(SELECT count(*) FROM leads WHERE organization_id=$1)::int AS leads', [organizationIds[0]])).rows[0];
    await action(api, admin, connectionId, 'duplicate_event');
    const replay = await sync(api, admin, connectionId, 'replay');
    await Promise.all([processConnectorJobs(database, config, { batchSize: 2 }), processConnectorJobs(database, config, { batchSize: 2 })]);
    const restartDatabase = new Database(config);
    try {
        await processConnectorJobs(restartDatabase, config, { batchSize: 2 });
    }
    finally {
        await restartDatabase.close();
    }
    assert.equal((await drain(api, admin, connectionId, replay.job.id)).status, 'completed');
    assert.equal((await mappings(api, admin, connectionId)).total, 4);
    assert.deepEqual((await database.query('SELECT (SELECT count(*) FROM properties WHERE organization_id=$1)::int AS properties,(SELECT count(*) FROM units WHERE organization_id=$1)::int AS units,(SELECT count(*) FROM contacts WHERE organization_id=$1)::int AS contacts,(SELECT count(*) FROM leads WHERE organization_id=$1)::int AS leads', [organizationIds[0]])).rows[0], countsBefore);
    const duplicateEvents = await events(api, admin, connectionId);
    assert(duplicateEvents.items.some(row => row.status === 'duplicate'));
    assert.equal((await database.query('SELECT 1 FROM connector_event_receipts WHERE connection_id=$1', [connectionId])).rowCount, 4, 'Repeated delivery of the same provider event must keep one receipt.');
    assert.equal((await database.query('SELECT 1 FROM connector_event_logs WHERE connection_id=$1', [connectionId])).rowCount, 5);
    pass('durable request keys, cursors, unique event receipts and concurrent/new-pool workers prevent duplicate canonical records during repeated jobs, replay and duplicate provider events');

    phase='duplicate provider event IDs with conflicting identity or content fail closed';
    const originalEvent=(await database.query("SELECT * FROM connector_demo_events WHERE connection_id=$1 AND entity_type='contact' ORDER BY sequence LIMIT 1",[connectionId])).rows[0]!;
    const originalUnitEvent=(await database.query("SELECT * FROM connector_demo_events WHERE connection_id=$1 AND entity_type='unit' ORDER BY sequence LIMIT 1",[connectionId])).rows[0]!;
    const collisionCursor=(await overview(api,admin)).connection!.cursor,collisionSequences:string[]=[];
    const collisionVariants=[
      {entityType:'contact',externalId:originalEvent.external_id,version:originalEvent.provider_version,payload:{...originalEvent.payload,phone:'Collision content must never apply'}},
      {entityType:'unit',externalId:originalUnitEvent.external_id,version:originalUnitEvent.provider_version,payload:originalUnitEvent.payload},
      {entityType:'contact',externalId:'COLLISION-UNMAPPED-IDENTITY',version:originalEvent.provider_version,payload:originalEvent.payload},
      {entityType:'contact',externalId:originalEvent.external_id,version:originalEvent.provider_version+99,payload:originalEvent.payload},
    ];
    for(const collision of collisionVariants){const event=(await database.query('INSERT INTO connector_demo_events(connection_id,organization_id,provider_event_id,entity_type,external_id,provider_version,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING sequence::text',[connectionId,organizationIds[0],originalEvent.provider_event_id,collision.entityType,collision.externalId,collision.version,JSON.stringify(collision.payload)])).rows[0]!;collisionSequences.push(event.sequence);}
    await action(api,admin,connectionId,'contact_update');const collisionJob=await sync(api,admin,connectionId);await processConnectorJobs(database,config,{batchSize:100});const collisionResult=await job(api,admin,connectionId,collisionJob.job.id);assert.equal(collisionResult.status,'queued');assert.equal(collisionResult.attempts,1);assert(collisionResult.error);const cursorAfterCollision=(await overview(api,admin)).connection?.cursor;assert.equal(cursorAfterCollision,collisionCursor,'Collision cursor must preserve its successful prefix: expected '+collisionCursor+', received '+cursorAfterCollision);assert.equal((await database.query('SELECT 1 FROM connector_event_logs WHERE connection_id=$1 AND sequence=ANY($2::bigint[])',[connectionId,collisionSequences])).rowCount,0,'Colliding IDs must not receive successful or duplicate delivery logs.');assert.equal((await database.query('SELECT 1 FROM connector_event_receipts WHERE connection_id=$1 AND provider_event_id=$2',[connectionId,originalEvent.provider_event_id])).rowCount,1);
    const safeContact=(await database.query('SELECT * FROM contacts WHERE id=$1',[c.id])).rows[0]!;assert.notEqual(safeContact.phone,'Collision content must never apply');assert.notEqual(safeContact.phone,c.phone,'A valid record later in the same bounded chunk still applies.');assert.equal((await mappings(api,admin,connectionId)).total,4);
    // Only injected malicious source fixtures are removed. They have no receipt
    // or log; legitimate provider records/history and the valid receipt remain.
    await database.query('DELETE FROM connector_demo_events WHERE connection_id=$1 AND sequence=ANY($2::bigint[])',[connectionId,collisionSequences]);await database.query('UPDATE connector_jobs SET next_attempt_at=now() WHERE id=$1',[collisionJob.job.id]);assert.equal((await drain(api,admin,connectionId,collisionJob.job.id)).status,'completed');assert.deepEqual((await database.query('SELECT * FROM contacts WHERE id=$1',[c.id])).rows[0],safeContact);
    pass('reused provider event IDs with changed entity, external ID, version or payload fail closed; good records survive, the cursor blocks and recovery reuses receipts safely');
    phase = 'source updates preserve Ootla-owned lead work and staff history';
    await database.query('INSERT INTO property_access_assignments(organization_id,membership_id,property_id) VALUES($1,$2,$3)', [organizationIds[0], membershipIds[1], p.id]);
    const recordVersion = (await json<{
        lead: {
            version: number;
        };
    }>(api, '/api/leads/' + l.id, admin)).lead.version;
    await json(api, '/api/leads/' + l.id, admin, 'PATCH', { version: recordVersion, ownerMembershipId: membershipIds[1], nextAction: 'Call after lunch', nextActionAt: new Date(Date.now() + 86400000).toISOString(), notes: 'Staff-owned private history' });
    await json(api, '/api/lead-workspaces/' + l.id + '/notes', admin, 'POST', { body: 'This internal note must survive every provider sync.' });
    const ownedLead = (await database.query('SELECT * FROM leads WHERE id=$1', [l.id])).rows[0], ownedHistory = (await database.query('SELECT * FROM lead_workspace_events WHERE lead_id=$1 ORDER BY id', [l.id])).rows;
    await action(api, admin, connectionId, 'availability_update', { status: 'reserved' });
    await action(api, admin, connectionId, 'contact_update');
    const update = await sync(api, admin, connectionId);
    assert.equal((await drain(api, admin, connectionId, update.job.id)).status, 'completed');
    assert.equal((await database.query('SELECT status FROM units WHERE id=$1', [u.id])).rows[0]?.status, 'reserved');
    assert.notEqual((await database.query('SELECT phone FROM contacts WHERE id=$1', [c.id])).rows[0]?.phone, c.phone);
    assert.deepEqual((await database.query('SELECT * FROM leads WHERE id=$1', [l.id])).rows[0], ownedLead);
    assert.deepEqual((await database.query('SELECT * FROM lead_workspace_events WHERE lead_id=$1 ORDER BY id', [l.id])).rows, ownedHistory);
    assert.equal((await database.query('SELECT availability_verified_at FROM units WHERE id=$1', [u.id])).rows[0]?.availability_verified_at, null);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM tasks WHERE organization_id=$1', [organizationIds[0]])).rows[0]?.n, 1, 'Syncing provider records must not fabricate follow-up tasks on refresh.');
    pass('source availability/contact changes update canonical CRM fields while preserving assigned staff, next actions, private notes, lead versions and activity history; simulated availability stays unverified');
    phase = 'explicit conflict review and source snapshots';
    await database.query("UPDATE contacts SET phone='Staff drifted phone',updated_at=now() WHERE id=$1", [c.id]);
    await action(api, admin, connectionId, 'contact_update');
    const driftJob = await sync(api, admin, connectionId);
    assert.equal((await drain(api, admin, connectionId, driftJob.job.id)).status, 'completed');
    let allConflicts = await conflicts(api, admin, connectionId);
    const drift = allConflicts.items.find(row => row.reason === 'local_change' && row.status === 'open');
    assert(drift && drift.canUseProvider && drift.fields.includes('phone'));
    assert.equal((await database.query('SELECT phone FROM contacts WHERE id=$1', [c.id])).rows[0]?.phone, 'Staff drifted phone');
    await deny(api, endpoint + '/' + connectionId + '/conflicts/' + drift.id + '/resolve', other, 'POST', { requestKey: randomUUID(), resolution: 'use_provider' });
    const acceptedKey = randomUUID(), accepted = await resolve(api, admin, connectionId, drift.id, 'use_provider', acceptedKey);
    assert.equal(accepted.conflict.status, 'resolved');
    assert.equal(accepted.conflict.resolution, 'use_provider');
    assert.equal((await database.query('SELECT phone FROM contacts WHERE id=$1', [c.id])).rows[0]?.phone, drift.providerValues.phone);
    assert.equal((await resolve(api, admin, connectionId, drift.id, 'use_provider', acceptedKey)).conflict.id, drift.id);
    await database.query("UPDATE contacts SET phone='Reviewed staff correction',updated_at=now() WHERE id=$1", [c.id]);
    await action(api, admin, connectionId, 'contact_update');
    const retainedJob = await sync(api, admin, connectionId);
    await drain(api, admin, connectionId, retainedJob.job.id);
    allConflicts = await conflicts(api, admin, connectionId);
    const kept = allConflicts.items.find(row => row.reason === 'local_change' && row.status === 'open');
    assert(kept);
    await resolve(api, admin, connectionId, kept.id, 'keep_ootla');
    const noOverwriteReplay = await sync(api, admin, connectionId, 'replay');
    await drain(api, admin, connectionId, noOverwriteReplay.job.id);
    assert.equal((await database.query('SELECT phone FROM contacts WHERE id=$1', [c.id])).rows[0]?.phone, 'Reviewed staff correction');
    assert.deepEqual((await database.query('SELECT * FROM leads WHERE id=$1', [l.id])).rows[0], ownedLead);
    assert.equal((await conflicts(api, admin, connectionId)).items.filter(row => row.status === 'open').length, 0);
    pass('canonical source-field drift becomes an explicit conflict; authorized use-provider/keep-Ootla decisions persist and replay cannot silently undo the review or staff history');
    phase = 'stale events cannot roll back provider state';
    const currentUnit = (await database.query('SELECT * FROM units WHERE id=$1', [u.id])).rows[0];
    await action(api, admin, connectionId, 'stale_event');
    const staleJob = await sync(api, admin, connectionId);
    await drain(api, admin, connectionId, staleJob.job.id);
    const stale = (await conflicts(api, admin, connectionId)).items.find(row => row.reason === 'stale_event' && row.status === 'open');
    assert(stale);
    assert.equal(stale.canUseProvider, false);
    await deny(api, endpoint + '/' + connectionId + '/conflicts/' + stale.id + '/resolve', admin, 'POST', { requestKey: randomUUID(), resolution: 'use_provider' }, 409);
    assert.deepEqual((await database.query('SELECT * FROM units WHERE id=$1', [u.id])).rows[0], currentUnit);
    await resolve(api, admin, connectionId, stale.id, 'keep_ootla');
    pass('out-of-order stale provider events remain visible for review and cannot be applied over a newer source version');
    phase = 'durable provider failures, bounded retry/backoff and deliberate recovery';
    await action(api, admin, connectionId, 'contact_update');
    for (let i = 0; i < 3; i++)
        await action(api, admin, connectionId, 'fail_next');
    const failing = await sync(api, admin, connectionId);
    for (let attempt = 1; attempt <= 3; attempt++) {
        if (attempt > 1)
            await database.query('UPDATE connector_jobs SET next_attempt_at=now() WHERE id=$1', [failing.job.id]);
        const runner = new Database(config);
        try {
            await processConnectorJobs(runner, config, { batchSize: 100 });
        }
        finally {
            await runner.close();
        }
        const failed = await job(api, admin, connectionId, failing.job.id);
        assert.equal(failed.attempts, attempt);
        assert.equal(failed.status, attempt === 3 ? 'failed' : 'queued');
        assert(failed.error);
        if (attempt < 3) {
            assert(new Date(failed.nextAttemptAt).getTime() > Date.now());
            assert.equal(await processConnectorJobs(database, config, { batchSize: 100 }), 0, 'Backoff must be observed rather than repeatedly retrying on refresh.');
        }
    }
    assert.equal((await overview(api, admin)).connection?.state, 'degraded');
    const recovered = await sync(api, admin, connectionId);
    assert.equal((await drain(api, admin, connectionId, recovered.job.id)).status, 'completed');
    assert.equal((await overview(api, admin)).connection?.state, 'demo');
    pass('provider failures persist across new worker pools with bounded 30/60-second backoff and a terminal third failure; a deliberate new sync safely recovers');
    phase = 'record savepoints preserve good receipts without skipping a failed cursor';
    const cursorBeforeFault = (await overview(api, admin)).connection!.cursor, phoneBeforeFault = (await database.query('SELECT phone FROM contacts WHERE id=$1', [c.id])).rows[0]!.phone;
    await database.query("CREATE FUNCTION stage11_fail_unit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'MUST_NOT_LEAK_PROVIDER_RAW_ERROR'; END; $$");
    await database.query('CREATE TRIGGER stage11_unit_fault BEFORE UPDATE ON units FOR EACH ROW EXECUTE FUNCTION stage11_fail_unit()');
    await action(api, admin, connectionId, 'availability_update', { status: 'occupied' });
    await action(api, admin, connectionId, 'contact_update');
    const recordFault = await sync(api, admin, connectionId);
    await processConnectorJobs(database, config, { batchSize: 100 });
    const partial = await job(api, admin, connectionId, recordFault.job.id);
    assert.equal(partial.status, 'queued');
    assert.equal(partial.attempts, 1);
    assert(partial.error);
    assert(!partial.error.includes('MUST_NOT_LEAK_PROVIDER_RAW_ERROR'));
    assert.equal((await database.query('SELECT status FROM units WHERE id=$1', [u.id])).rows[0]?.status, 'reserved');
    const appliedContact = (await database.query('SELECT * FROM contacts WHERE id=$1', [c.id])).rows[0];
    assert.notEqual(appliedContact.phone, phoneBeforeFault, 'A valid later record must apply despite another record failure.');
    assert.equal((await overview(api, admin)).connection?.cursor, cursorBeforeFault, 'The durable contiguous cursor must not skip the failed event.');
    await database.query('DROP TRIGGER stage11_unit_fault ON units');
    await database.query('DROP FUNCTION stage11_fail_unit()');
    await database.query('UPDATE connector_jobs SET next_attempt_at=now() WHERE id=$1', [recordFault.job.id]);
    const recoveredRecordJob=await drain(api,admin,connectionId,recordFault.job.id);assert.equal(recoveredRecordJob.status,'completed');assert.equal(recoveredRecordJob.attempts,2,'Recovery is a second actual attempt; ordinary continuation chunks do not consume extra attempts.');
    assert.equal((await database.query('SELECT status FROM units WHERE id=$1', [u.id])).rows[0]?.status, 'occupied');
    assert.deepEqual((await database.query('SELECT * FROM contacts WHERE id=$1', [c.id])).rows[0], appliedContact, 'Retry must reuse the successful receipt instead of reapplying its record.');
    assert.equal((await mappings(api, admin, connectionId)).total, 4);
    pass('per-record savepoints preserve a valid contact receipt while a unit fails; the cursor stops before the fault, safe diagnostics omit raw errors and retry resumes without duplicate writes');
    phase = 'disconnect cancellation, reconnection and current-role worker checks';
    await action(api, admin, connectionId, 'availability_update', { status: 'available' });
    const pending = await sync(api, admin, connectionId);
    const disconnectKey = randomUUID();
    await json(api, endpoint + '/' + connectionId + '/disconnect', admin, 'POST', { requestKey: disconnectKey });
    await json(api, endpoint + '/' + connectionId + '/disconnect', admin, 'POST', { requestKey: disconnectKey });
    assert.equal((await overview(api, admin)).connection?.state, 'disconnected');
    assert.equal((await job(api, admin, connectionId, pending.job.id)).status, 'cancelled');
    assert.equal(await processConnectorJobs(database, config, { batchSize: 100 }), 0);
    assert.equal((await database.query('SELECT status FROM units WHERE id=$1', [u.id])).rows[0]?.status, 'occupied');
    await deny(api, endpoint + '/' + connectionId + '/sync', admin, 'POST', { requestKey: randomUUID(), mode: 'incremental' }, 409);
    await json(api, endpoint + '/' + connectionId + '/reconnect', admin, 'POST', { requestKey: randomUUID() });
    const resumed = await sync(api, admin, connectionId);
    assert.equal((await drain(api, admin, connectionId, resumed.job.id)).status, 'completed');
    assert.equal((await database.query('SELECT status FROM units WHERE id=$1', [u.id])).rows[0]?.status, 'available');
    assert.equal((await mappings(api, admin, connectionId)).total, 4);
    await action(api, admin, connectionId, 'availability_update', { status: 'reserved' });
    const revoked = await sync(api, admin, connectionId);
    await database.query("UPDATE organization_memberships SET role='read_only_analyst' WHERE id=$1", [membershipIds[0]]);
    await processConnectorJobs(database, config, { batchSize: 100 });
    assert.equal((await database.query('SELECT status FROM units WHERE id=$1', [u.id])).rows[0]?.status, 'available');
    await deny(api, endpoint, admin, 'GET', undefined, 403);
    const cancelled = (await database.query('SELECT status FROM connector_jobs WHERE id=$1', [revoked.job.id])).rows[0]?.status;
    assert(['cancelled', 'failed'].includes(cancelled), 'Worker must stop work when the requesting admin loses authority.');
    await database.query("UPDATE organization_memberships SET role='organization_admin' WHERE id=$1", [membershipIds[0]]);
    const reauthorized = await sync(api, admin, connectionId);
    await drain(api, admin, connectionId, reauthorized.job.id);
    assert.equal((await database.query('SELECT status FROM units WHERE id=$1', [u.id])).rows[0]?.status, 'reserved');
    pass('disconnect cancels queued work and preserves records; reconnection resumes stable mappings, and background work rechecks current administrative authority before applying records');
    phase = 'encrypted synthetic credentials and private diagnostics';
    const syntheticSecret = 'scratch-only-' + randomUUID(), context = 'scratch-tenant:connection';
    assert(config.connectorCredentialKey);
    const sealed = encryptConnectorCredential(syntheticSecret, config.connectorCredentialKey, context), sealedAgain = encryptConnectorCredential(syntheticSecret, config.connectorCredentialKey, context);
    assert.notEqual(sealed.iv, sealedAgain.iv);
    assert.notEqual(sealed.ciphertext, sealedAgain.ciphertext);
    assert.equal(decryptConnectorCredential(sealed, config.connectorCredentialKey, context), syntheticSecret);
    for (const attempt of [() => decryptConnectorCredential(sealed, randomBytes(32).toString('base64'), context), () => decryptConnectorCredential(sealed, config.connectorCredentialKey, 'other-tenant:connection'), () => decryptConnectorCredential({ ...sealed, ciphertext: Buffer.from('tampered').toString('base64') }, config.connectorCredentialKey, context)])
        assert.throws(attempt);
    assert.throws(() => encryptConnectorCredential(syntheticSecret, null, context));
    const stored = await json<{
        configured: boolean;
    }>(api, endpoint + '/' + connectionId + '/credentials', admin, 'PUT', { secret: syntheticSecret });
    assert.equal(stored.configured, true);
    const envelope = (await database.query('SELECT credential_envelope FROM connector_connections WHERE id=$1', [connectionId])).rows[0]?.credential_envelope;
    assert(envelope && envelope.ciphertext && envelope.iv && envelope.tag);
    const envelopeText = JSON.stringify(envelope);
    assert(!envelopeText.includes(syntheticSecret));
    assert(!envelopeText.includes(Buffer.from(syntheticSecret).toString('base64')));
    assert.equal((await overview(api, admin)).connection?.credentialConfigured, true);
    for (const response of [await overview(api, admin), await jobs(api, admin, connectionId), await events(api, admin, connectionId), await conflicts(api, admin, connectionId), await json(api, '/api/config', '')]) {
        const text = JSON.stringify(response);
        for (const value of [syntheticSecret, config.connectorCredentialKey, envelope.ciphertext, envelope.iv, envelope.tag])
            assert(!text.includes(value), 'Public/private API responses must not expose server credentials or encrypted envelopes.');
    }
    const missingKeyApi = await start({ ...config, connectorCredentialKey: null });
    assert.equal((await overview(missingKeyApi, admin)).access.credentialStorageAvailable, false);
    await deny(missingKeyApi, endpoint + '/' + connectionId + '/credentials', admin, 'PUT', { secret: 'unconfigured-key-attempt' }, 503);
    assert.deepEqual((await database.query('SELECT credential_envelope FROM connector_connections WHERE id=$1', [connectionId])).rows[0]?.credential_envelope, envelope);
    await missingKeyApi.close();
    await deny(api, endpoint + '/' + connectionId + '/credentials', other, 'PUT', { secret: 'foreign-attempt' });
    await deny(api, endpoint + '/' + connectionId + '/credentials', admin, 'PUT', { secret: syntheticSecret, userId: userIds[4] }, 400);
    const audit = (await database.query("SELECT metadata FROM audit_events WHERE action LIKE 'connector.%'")).rows;
    assert(audit.length);
    for (const row of audit) {
        const text = JSON.stringify(row.metadata);
        for (const value of [syntheticSecret, config.connectorCredentialKey, 'taylor.brooks@simulator.ootla.test', 'Taylor Brooks', 'MUST_NOT_LEAK_PROVIDER_RAW_ERROR'])
            assert(!text.includes(value), 'Connector audit metadata must omit credentials, raw provider errors and customer values.');
    }
    pass('server-only AES256GCM uses random nonces and authenticated tenant context; tampered/wrong-key ciphertext is rejected, missing-key writes fail safely, and credentials never appear in APIs or audit metadata');
    phase = 'organization isolation, reserved mappings and no platform authority';
    await deny(api, '/api/property-foundation/external-mappings', admin, 'POST', { entityType: 'property', entityId: p.id, provider: 'yardi_demo', externalId: 'forged-manual-map' }, 403);
    const foreign = await json<{
        connection: ConnectorConnection;
        job: ConnectorJob;
    }>(api, endpoint + '/demo', other, 'POST', { requestKey: randomUUID() });
    await drain(api, other, foreign.connection.id, foreign.job.id);
    assert.equal((await mappings(api, other, foreign.connection.id)).total, 4);
    assert.equal((await mappings(api, admin, connectionId)).total, 4);
    await deny(api, endpoint + '/' + foreign.connection.id + '/mappings', admin);
    await deny(api, endpoint + '/' + connectionId + '/mappings', other);
    await deny(api, endpoint + '/' + foreign.connection.id + '/disconnect', admin, 'POST', { requestKey: randomUUID() });
    assert.equal((await database.query<{
        mode: string;
    }>('SELECT mode FROM organization_data_settings WHERE organization_id=$1', [organizationIds[1]])).rows[0]?.mode, 'yardi_connected');
    assert(database.pool);
    let rejected = false;
    try {
        await database.pool.query("INSERT INTO external_record_mappings(organization_id,entity_type,property_id,provider,external_id,connection_id) VALUES($1,'property',$2,'yardi_demo','cross-tenant-fixture',$3)", [organizationIds[0], propertyId, foreign.connection.id]);
    }
    catch (error) {
        rejected = true;
        assert.equal((error as {
            code?: string;
        }).code, '23503');
    }
    assert(rejected, 'Typed mapping foreign keys must reject cross-organization connections.');
    pass('the same external IDs stay isolated across two organizations, source modes stay unchanged, manual simulator mapping forgery is denied and composite database keys enforce tenant ownership');

    phase='unregistered adapters remain disabled behind the registry boundary';
    const future=(await database.query("INSERT INTO connector_connections(organization_id,provider,state,created_by_user_id,created_by_membership_id) VALUES($1,'future_readonly_adapter','connecting',$2,$3) RETURNING id",[organizationIds[0],userIds[0],membershipIds[0]])).rows[0]!.id;
    const futureJob=(await database.query("INSERT INTO connector_jobs(organization_id,connection_id,request_key,mode,upper_sequence,scan_cursor,requested_by_user_id,requested_by_membership_id) VALUES($1,$2,$3,'incremental',0,0,$4,$5) RETURNING id",[organizationIds[0],future,randomUUID(),userIds[0],membershipIds[0]])).rows[0]!.id;
    await deny(api,endpoint+'/'+future+'/jobs',admin,'GET',undefined,404);
    await deny(api,endpoint+'/'+future+'/sync',admin,'POST',{requestKey:randomUUID(),mode:'incremental'},404);
    await deny(api,endpoint+'/'+future+'/credentials',admin,'PUT',{secret:'not-a-configured-adapter'},404);
    assert.equal(await processConnectorJobs(database,config,{batchSize:100}),0);
    assert.equal((await database.query('SELECT status FROM connector_jobs WHERE id=$1',[futureJob])).rows[0]?.status,'queued','An unregistered adapter must never be polled or given invented provider behavior.');
    await database.query('DELETE FROM connector_jobs WHERE id=$1',[futureJob]);await database.query('DELETE FROM connector_connections WHERE id=$1',[future]);
    pass('the provider registry fails closed for unregistered adapters; generic connection/job storage cannot activate an invented integration or credential endpoint');
    phase = 'DEMO_MODE, non-production and verified isolated-database gates';
    const beforeDisabled = await snapshot();
    for (const unsafe of [{ ...config, demoMode: false }, { ...config, production: true }]) {
        assert.equal(await processConnectorJobs(database, unsafe, { batchSize: 100 }), 0);
        const blocked = await start(unsafe);
        await deny(blocked, endpoint, admin, 'GET', undefined, [401, 403]);
        await deny(blocked, endpoint + '/demo', admin, 'POST', { requestKey: randomUUID() }, [401, 403]);
        await blocked.close();
    }
    assert.deepEqual(await snapshot(beforeDisabled), beforeDisabled, 'Disabled/production simulations must not mutate connector/customer records.');
    const liveOrganization = randomUUID();
    await database.query("INSERT INTO organizations(id,name,slug,environment) VALUES($1,'Scratch gate live organization',$2,'live')", [liveOrganization, 'stage11-live-' + randomUUID()]);
    const mixedBefore = await snapshot();
    assert.equal(await processConnectorJobs(database, config, { batchSize: 100 }), 0);
    await deny(api, endpoint, admin, 'GET', undefined, [401, 403]);
    assert.deepEqual(await snapshot(mixedBefore), mixedBefore, 'A DEMO_MODE setting alone must never enable ingestion against a mixed/customer database.');
    await database.query('DELETE FROM organizations WHERE id=$1', [liveOrganization]);
    const portalEmail = 'portal-' + randomUUID() + '@example.test';
    await database.query("INSERT INTO users(email,display_name,password_hash,account_kind) SELECT $1,'Separate portal identity',password_hash,'resident' FROM users WHERE id=$2", [portalEmail, userIds[0]]);
    await deny(api, '/api/auth/login', '', 'POST', { email: portalEmail, password }, 401);
    assert.deepEqual(await legacyRecords(), legacy, 'All prior customer records, staff roles/grants, hashes, timestamps and historical work must survive connector activity.');
    for(const row of checksums)assert.equal(row.checksum,createHash('sha256').update(await readFile(path.join(root,'migrations',row.name),'utf8')).digest('hex'),'Migration source changed during the focused run; rerun against its final frozen version.');
    pass('simulation requires DEMO_MODE, non-production and a verified wholly isolated demo database; portal identities are denied, and every preexisting canonical record and staff authority remains preserved');
}
try {
    await main();
    console.log('Stage 11 connector checks complete: ' + groups + ' groups passed.');
}
catch (error) {
    const detail = error instanceof assert.AssertionError ? error.message.split(/\r?\n/, 1)[0] : JSON.stringify({ name: error instanceof Error ? error.name : 'unknown', code: (error as {
            code?: string;
        })?.code, frame: error instanceof Error ? error.stack?.split(/\r?\n/).find(line => line.includes('check-connectors.ts'))?.trim() : undefined });
    console.error('Stage 11 checks failed during ' + phase + ': ' + detail);
    console.error('Check location: '+(error instanceof Error?error.stack?.split(/\r?\n/).find(line=>line.includes('check-connectors.ts'))?.trim():'unknown'));
    process.exitCode = 1;
}
finally {
    try {
        for (const close of servers.reverse())
            await close();
        await database.close();
        if (ownsScratch) {
            await verifiedCluster();
            assert(/^ootla_demo_connectors_[a-f0-9]{32}$/.test(scratchName));
            const target = await owner.query<{
                owner: string;
            }>('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1', [scratchName]);
            assert(target.rowCount === 1 && target.rows[0]?.owner === 'ootla', 'Scratch ownership changed; no deletion attempted.');
            const quoted = (await owner.query<{
                name: string;
            }>('SELECT quote_ident($1) AS name', [scratchName])).rows[0]!.name;
            await owner.query('DROP DATABASE ' + quoted);
            assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1', [scratchName])).rowCount, 0);
            console.log('PASS removed only the uniquely owned Stage 11 scratch database; retained data was never modified');
        }
    }
    catch {
        console.error('Stage 11 owned scratch cleanup failed. No unrelated database deletion was attempted.');
        process.exitCode = 1;
    }
    finally {
        if (ownerConnected)
            await owner.end();
    }
}
