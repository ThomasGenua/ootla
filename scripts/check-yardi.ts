import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { Client } from 'pg';
import { createApp } from '../server/app.js';
import { loadConfig, type ServerConfig } from '../server/config/env.js';
import { Database } from '../server/db/pool.js';
import { hashPassword } from '../server/services/passwords.js';
import { yardiRecordKinds, yardiConfigDraftSchema, type YardiReadiness, type YardiReadinessDimensions, type YardiConfigValidation } from '../shared/yardi-contracts.js';
import { getYardiReadiness } from '../server/connectors/yardi/readiness.js';
import { validateYardiConfiguration } from '../server/connectors/yardi/configuration.js';
import { configuredYardiMappingProfiles, validateYardiMappingProfile, projectYardiContractFixture } from '../server/connectors/yardi/mapping.js';
import { yardiCanonicalFields } from '../server/connectors/yardi/ownership.js';
import { UnconfiguredYardiTransport, rejectYardiWrite } from '../server/connectors/yardi/transport.js';
import { getConnectorAdapter } from '../server/connectors/registry.js';
import { encryptConnectorCredential } from '../server/connectors/vault.js';
// Every mutation in this script targets a freshly-created, uniquely owned scratch
// database. The retained review/demo database is never migrated, seeded or reset.
const root = path.resolve(import.meta.dirname, '..');
const source = loadConfig();
const sourceUrl = new URL(source.databaseUrl);
assert(source.demoMode && !source.production && /^ootla_demo(?:_[a-z0-9_]+)?$/.test(source.databaseName ?? ''), 'Use the documented non-production isolated Ootla demo configuration.');
assert(sourceUrl.hostname === '127.0.0.1' && sourceUrl.port === '55439' && sourceUrl.username === 'ootla' && !sourceUrl.search && !sourceUrl.hash, 'Use only the verified project-owned cluster and restricted application role.');
const scratchName = `ootla_demo_yardi_${randomUUID().replaceAll('-', '')}`;
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
const emails = userIds.map(id => `yardi-${id}@example.test`);
const password = `Stage12-${randomUUID()}!`;
const propertyId = randomUUID(), unitId = randomUUID(), leadId = randomUUID();
let ownerConnected = false, ownsScratch = false, groups = 0, phase = 'safe scratch setup';
const servers: Array<() => Promise<void>> = [];
const pass = (label: string) => { groups++; console.log(`PASS ${label}`); };
const normalize = (value: string) => path.resolve(value).replaceAll('\\', '/').toLowerCase();
async function verifiedCluster() {
    const r = await owner.query<{
        data_directory: string;
    }>('SHOW data_directory');
    assert.equal(normalize(r.rows[0]?.data_directory ?? ''), normalize(path.join(root, '.local/postgres/data')), 'Refusing to operate outside the Ootla-owned PostgreSQL data directory.');
}
async function createScratch() {
    await owner.connect();
    ownerConnected = true;
    await verifiedCluster();
    assert(/^ootla_demo_yardi_[a-f0-9]{32}$/.test(scratchName));
    assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1', [scratchName])).rowCount, 0);
    const role = (await owner.query<{
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
    }>('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1', ['ootla'])).rows[0];
    assert(role && !role.rolsuper && !role.rolcreatedb && !role.rolcreaterole);
    const quoted = (await owner.query<{
        name: string;
    }>('SELECT quote_ident($1) AS name', [scratchName])).rows[0]!.name;
    await owner.query(`CREATE DATABASE ${quoted} OWNER ootla`);
    ownsScratch = true;
    assert.equal((await database.query<{
        name: string;
    }>('SELECT current_database() AS name')).rows[0]?.name, scratchName);
}
type Snapshot = Record<string, {
    columns: string[];
    count: number;
    hash: string;
}>;
async function snapshot(previous?: Snapshot): Promise<Snapshot> {
    const tables = previous ? Object.keys(previous) : (await database.query<{
        tablename: string;
    }>("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename")).rows.map(r => r.tablename);
    const result: Snapshot = {};
    for (const table of tables) {
        const columns = previous?.[table]?.columns ?? (await database.query<{
            column_name: string;
        }>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [table])).rows.map(r => r.column_name);
        assert(/^[a-z_][a-z0-9_]*$/.test(table) && columns.every(c => /^[a-z_][a-z0-9_]*$/.test(c)));
        const rows = (await database.query(`SELECT ${columns.map(c => `"${c}"`).join(',')} FROM "${table}"`)).rows.map(r => JSON.stringify(r)).sort();
        result[table] = { columns, count: rows.length, hash: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
    }
    return result;
}
async function baseline() {
    await database.query('CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
    for (const name of ['001_foundation.sql', '002_staff_roles_property_access.sql', '003_demo_dataset.sql', '004_property_contact_foundation.sql', '005_lead_pipeline.sql', '006_lead_workspace.sql', '007_tasks_reminders.sql', '008_standalone_imports.sql', '009_staff_account.sql', '010_connectors.sql']) {
        const sql = await readFile(path.join(root, 'migrations', name), 'utf8');
        await database.transaction(async (client) => { await client.query(sql.replace(/^\uFEFF/, '')); await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name, createHash('sha256').update(sql).digest('hex')]); });
    }
    const hash = await hashPassword(password);
    await database.transaction(async (client) => {
        for (const [i, id] of organizationIds.entries()) {
            await client.query("INSERT INTO organizations(id,name,slug,environment) VALUES($1,$2,$3,'demo')", [id, `Stage 12 isolated ${i}`, `yardi-${randomUUID()}`]);
            await client.query('INSERT INTO organization_data_settings(organization_id,mode) VALUES($1,$2)', [id, i === 0 ? 'standalone' : 'yardi_connected']);
        }
        for (const [i, id] of userIds.entries()) {
            await client.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)', [id, emails[i], `Stage 12 ${roles[i]}`, hash]);
            await client.query('INSERT INTO organization_memberships(id,organization_id,user_id,role) VALUES($1,$2,$3,$4)', [membershipIds[i], organizationIds[i === 4 ? 1 : 0], id, roles[i]]);
        }
        await client.query("INSERT INTO properties(id,organization_id,name,address,city) VALUES($1,$2,'Legacy property','1 Retained Way','Lagos')", [propertyId, organizationIds[0]]);
        await client.query("INSERT INTO units(id,organization_id,property_id,label,bedrooms,status,monthly_rent) VALUES($1,$2,$3,'A1',2,'available',1500)", [unitId, organizationIds[0], propertyId]);
        await client.query("INSERT INTO leads(id,organization_id,property_id,unit_id,display_name,email,status,intent,notes) VALUES($1,$2,$3,$4,'Taylor Brooks','taylor.brooks@simulator.ootla.test','new','leasing','Untouched historical work')", [leadId, organizationIds[0], propertyId, unitId]);
        await client.query("INSERT INTO tasks(organization_id,property_id,lead_id,contact_id,title,due_at,status) SELECT organization_id,property_id,id,contact_id,'Legacy task',now()+interval '1 day','open' FROM leads WHERE id=$1", [leadId]);
        for (const i of [1, 2, 3])
            await client.query('INSERT INTO property_access_assignments(organization_id,membership_id,property_id) VALUES($1,$2,$3)', [organizationIds[0], membershipIds[i], propertyId]);
    });
}
async function start(localConfig: ServerConfig = config) {
    const db = new Database(localConfig), app = createApp(localConfig, db);
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); listener.once('error', reject); });
    let closed = false;
    const close = async () => {
        if (closed)
            return;
        closed = true;
        server.closeIdleConnections();
        await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
        await db.close();
    };
    servers.push(close);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const request = (route: string, cookie = '', method = 'GET', body?: unknown) => fetch(base + route, { method, redirect: 'manual', headers: { ...(cookie ? { Cookie: cookie } : {}), ...(method === 'GET' ? {} : { Origin: localConfig.appUrl }), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { close, request, base, login: async (index: number) => { const response = await request('/api/auth/login', '', 'POST', { email: emails[index], password }); assert.equal(response.status, 200, 'Normal hashed-password sign-in must work.'); const cookie = response.headers.get('set-cookie')?.split(';')[0]; assert(cookie && /HttpOnly/i.test(response.headers.get('set-cookie')!)); return cookie; } };
}
type Api = Awaited<ReturnType<typeof start>>;
async function json<T>(api: Api, route: string, cookie: string, method = 'GET', body?: unknown, expected: number | number[] = [200, 201, 202]): Promise<T> { const r = await api.request(route, cookie, method, body); assert((Array.isArray(expected) ? expected : [expected]).includes(r.status), `${method} ${route.split('?')[0]} must return ${expected}; received ${r.status}.`); return r.json() as Promise<T>; }
async function deny(api: Api, route: string, cookie: string, method = 'GET', body?: unknown, expected: number | number[] = [400, 403, 404, 409]) { const r = await api.request(route, cookie, method, body); assert((Array.isArray(expected) ? expected : [expected]).includes(r.status), `${method} ${route.split('?')[0]} must reject; received ${r.status}.`); return r; }
const endpoint = '/api/connectors/yardi';
const dimensions: YardiReadinessDimensions = { scaffoldingImplemented: true, mappingTested: false, credentialsConfigured: false, liveBehaviorVerified: false };
const configDraft = { documentationReference: 'Unverified client documentation draft', interfaceId: 'Unverified licensed-interface draft', clientEnvironment: 'Unverified test-environment draft', propertyExternalIds: ['NEUTRAL-P1', 'NEUTRAL-P2'], requestedCapabilities: ['property', 'unit'] };
const readiness = (api: Api, cookie: string) => json<YardiReadiness>(api, endpoint + '/readiness', cookie);
const validate = (api: Api, cookie: string, body: unknown) => json<YardiConfigValidation>(api, endpoint + '/validate-config', cookie, 'POST', body);
function flags(value: {
    dimensions: YardiReadinessDimensions;
}) { assert.deepEqual(value.dimensions, dimensions, 'Scaffolding, mappings, credentials and live verification are separate evidence dimensions.'); }
function blockedConfig(value: unknown) { assert.throws(() => validateYardiConfiguration(value), (error: unknown) => Boolean(error && typeof error === 'object' && (error as {
    code?: string;
}).code === 'INVALID_YARDI_CONFIG')); }
async function main() {
    phase = 'truthful readiness without authorized client evidence';
    const initial = getYardiReadiness();
    assert.equal(initial.provider, 'yardi');
    assert.equal(initial.status, 'not_configured');
    assert.equal(initial.code, 'YARDI_CLIENT_DOCUMENTATION_REQUIRED');
    flags(initial);
    assert.equal(initial.transport.networkEnabled, false);
    assert.equal(initial.transport.liveAdapterRegistered, false);
    assert.equal(initial.transport.status, 'not_configured');
    assert(Object.values(initial.evidence).every(value => value === false));
    assert.equal(initial.requiredInputs.length, 8);
    assert(initial.requiredInputs.every(item => item.available === false));
    assert(initial.requiredInputs.some(item => item.key === 'webhook_verification' && item.required === 'if_applicable'));
    assert.equal(initial.credentialStorageAvailable, false);
    const vaultReady = getYardiReadiness(true);
    assert.equal(vaultReady.credentialStorageAvailable, true);
    flags(vaultReady);
    assert.equal(getConnectorAdapter('yardi'), null);
    assert(getConnectorAdapter('yardi_demo'));
    assert.equal(configuredYardiMappingProfiles.length, 0);
    pass('four readiness dimensions remain true/false/false/false; missing documentation, interface, authentication, scope, samples and optional callback requirements are explicit and no live adapter/profile is registered');
    phase = 'seven ownership domains retain source authority and staff decisions';
    assert.deepEqual(initial.domains.map(domain => domain.entity).sort(), [...yardiRecordKinds].sort());
    assert.equal(initial.domains.length, 7);
    for (const domain of initial.domains) {
        assert(domain.staffRetains.some(item => /review|decision/i.test(item)));
        assert(domain.staffRetains.some(item => /notes/i.test(item)));
        assert(domain.staffRetains.some(item => /assignments|tasks/i.test(item)));
        assert.deepEqual(domain.canonicalFields, [...yardiCanonicalFields[domain.entity]]);
        if (domain.entity === 'resident' || domain.entity === 'payment_status') {
            assert.equal(domain.status, 'unsupported');
            assert.equal(domain.canonicalSupport, 'unsupported');
            assert.equal(domain.canonicalFields.length, 0);
        }
        else {
            assert.equal(domain.status, 'not_configured');
            assert.equal(domain.canonicalSupport, 'existing_foundation');
            assert.equal(domain.authority, 'configured_yardi');
        }
    }
    const accounting = initial.domains.find(domain => domain.entity === 'payment_status')!;
    assert.match(accounting.fieldOwnership, /Yardi/i);
    assert.match(accounting.fieldOwnership, /accounting/i);
    assert.match(accounting.fieldOwnership, /payment/i);
    assert.match(accounting.fieldOwnership, /no.*payment.*operation|read.only/i);
    assert.equal(initial.domains.find(domain => domain.entity === 'property')?.canonicalFields.includes('label'), false);
    assert(initial.domains.find(domain => domain.entity === 'unit')?.canonicalFields.includes('label'));
    pass('all seven canonical domains declare current support, distinct property/unit fields, configured source ownership and retained staff work; Yardi accounting authority and external payment status remain read-only');
    phase = 'pure draft validation is never configuration or provider verification';
    for (const draft of [{}, configDraft, { ...configDraft, requestedCapabilities: [...yardiRecordKinds] }]) {
        const result = validateYardiConfiguration(draft);
        assert.equal(result.syntaxValid, true);
        assert.equal(result.readyForLive, false);
        assert.equal(result.persisted, false);
        assert.equal(result.networkUsed, false);
        flags(result);
        assert(result.issues.some(issue => issue.code === 'AUTHORIZED_PAYLOAD_REQUIRED'));
        assert(result.issues.some(issue => issue.code === 'YARDI_TRANSPORT_NOT_CONFIGURED'));
        assert(result.issues.some(issue => issue.code === 'AUTHENTICATION_REQUIREMENTS_REQUIRED'));
        assert(!JSON.stringify(result).includes('NEUTRAL-P1'));
    }
    const unsupported = validateYardiConfiguration({ requestedCapabilities: ['resident', 'payment_status'] });
    assert.equal(unsupported.status, 'unsupported');
    assert.equal(unsupported.issues.filter(issue => issue.code === 'YARDI_RECORD_UNSUPPORTED').length, 2);
    assert.equal(validateYardiConfiguration(configDraft).summary.propertyCount, 2);
    flags(getYardiReadiness(true));
    pass('empty and complete-looking neutral drafts validate only syntax; unsupported resident/payment requests stay unsupported, no draft changes readiness, and returned summaries contain counts rather than input values');
    phase = 'strict configuration boundaries reject secrets, guessed APIs and malformed scope';
    for (const extra of ['secret', 'password', 'token', 'apiKey', 'username', 'endpoint', 'baseUrl', 'auth', 'headers', 'samplePayload', 'mappingProfile', 'organizationId', 'credentialsConfigured', 'mappingTested', 'liveBehaviorVerified'])
        blockedConfig({ ...configDraft, [extra]: 'SCRATCH_PRIVATE_VALUE' });
    for (const input of [{ propertyExternalIds: ['P1', 'P1'] }, { propertyExternalIds: ['P1', ' P1 '] }, { propertyExternalIds: Array.from({ length: 501 }, (_, i) => 'P' + i) }, { requestedCapabilities: ['property', 'property'] }, { requestedCapabilities: ['accounting'] }, { interfaceId: 'bad\nreference' }, { documentationReference: 'x'.repeat(501) }, { propertyExternalIds: [''] }, [], 'not-an-object', null])
        blockedConfig(input);
    assert(yardiConfigDraftSchema.safeParse({ propertyExternalIds: Array.from({ length: 500 }, (_, i) => 'P' + i) }).success);
    pass('configuration drafts strictly reject credentials, endpoint fields, arbitrary authentication/payload fields, authority flags, invalid text, duplicate scopes/capabilities and unbounded arrays');
    phase = 'neutral mapping shape validation cannot claim tested client mappings';
    const propertyProfile = { documentationReference: 'Synthetic contract fixture only', interfaceId: 'No authorized client interface', entity: 'property', recordIdSourcePath: ['examples', 0, 'stableKey'], fields: [{ canonicalField: 'name', sourcePath: ['examples', 0, 'label'] }, { canonicalField: 'city', sourcePath: ['examples', 0, 'cityText'] }] };
    const fixture = { examples: [{ stableKey: 'SYNTHETIC-CONTRACT-P1', label: 'Neutral example property', cityText: 'Lagos' }] };
    const profileResult = validateYardiMappingProfile(propertyProfile);
    assert.equal(profileResult.status, 'not_configured');
    assert.equal(profileResult.mappingTested, false);
    assert(profileResult.issues.some(issue => issue.code === 'AUTHORIZED_PAYLOAD_REQUIRED'));
    const contract = projectYardiContractFixture(propertyProfile, fixture);
    assert.equal(contract.status, 'contract_tested');
    assert.equal(contract.mappingTested, false);
    assert.equal(contract.sourceRecordId, 'SYNTHETIC-CONTRACT-P1');
    assert.deepEqual(contract.values, { name: 'Neutral example property', city: 'Lagos' });
    assert.equal(configuredYardiMappingProfiles.length, 0);
    flags(getYardiReadiness());
    const missingId = projectYardiContractFixture(propertyProfile, { examples: [{ label: 'Same name alone is not an identity', cityText: 'Lagos' }] });
    assert.equal(missingId.status, 'not_configured');
    assert(missingId.issues.some(issue => issue.code === 'SOURCE_ID_REQUIRED'));
    for (const entity of ['resident', 'payment_status']) {
        assert.equal(validateYardiMappingProfile({ ...propertyProfile, entity }).status, 'unsupported');
        assert.equal(projectYardiContractFixture({ ...propertyProfile, entity }, fixture).status, 'unsupported');
    }
    pass('literal neutral profiles and synthetic projections exercise only an internal contract; missing stable identity fails, unsupported domains stay blocked and no real client selector/profile is marked tested');
    phase = 'bounded literal source paths prevent unsafe selectors and preserve canonical types';
    for (const sourcePath of [['__proto__'], ['constructor', 'prototype'], ['examples', '0', 'label'], Array(17).fill('nested'), [10001], []]) {
        const invalid = projectYardiContractFixture({ ...propertyProfile, fields: [{ canonicalField: 'name', sourcePath }] }, fixture);
        assert.notEqual(invalid.status, 'contract_tested');
        assert.equal(invalid.mappingTested, false);
    }
    const inherited = Object.create({ examples: [{ stableKey: 'INHERITED-ID', label: 'Inherited data', cityText: 'Lagos' }] });
    assert.equal(projectYardiContractFixture(propertyProfile, inherited).status, 'not_configured');
    assert.equal(validateYardiMappingProfile({ ...propertyProfile, fields: [...propertyProfile.fields, propertyProfile.fields[0]] }).status, 'not_configured');
    for (const canonicalField of ['notes', 'ownerMembershipId', 'pipelineStage', 'staffDecision', 'charge', 'refund', 'verifiedLeaseMilestone'])
        assert.equal(validateYardiMappingProfile({ ...propertyProfile, fields: [{ canonicalField, sourcePath: ['examples', 0, 'label'] }] }).status, 'not_configured');
    const unitProfile = { ...propertyProfile, entity: 'unit', recordIdSourcePath: ['key'], fields: [{ canonicalField: 'bedrooms', sourcePath: ['beds'] }, { canonicalField: 'monthlyRent', sourcePath: ['rent'] }, { canonicalField: 'status', sourcePath: ['state'] }] };
    assert.equal(projectYardiContractFixture(unitProfile, { key: 'SYNTHETIC-U1', beds: 2, rent: 1850, state: 'available' }).status, 'contract_tested');
    for (const patch of [{ beds: '2' }, { beds: -1 }, { rent: -1 }, { state: 'approved' }])
        assert.equal(projectYardiContractFixture(unitProfile, { key: 'SYNTHETIC-U1', beds: 2, rent: 1850, state: 'available', ...patch }).status, 'not_configured');
    pass('mapping paths are bounded literal segments with no prototype/inherited traversal or expression execution; numeric/status types are validated and staff notes, decisions, assignments and payment actions cannot be source-mapped');
    phase = 'unconfigured transport cannot perform provider reads or universal writes';
    const originalFetch = globalThis.fetch;
    let attemptedNetwork = 0;
    globalThis.fetch = (async () => { attemptedNetwork++; throw Error('No provider network is authorized in these checks.'); }) as typeof fetch;
    try {
        const transport = new UnconfiguredYardiTransport();
        assert.equal(transport.interfaceId, null);
        for (const entity of yardiRecordKinds) {
            const result = await transport.read({ entity, propertyExternalIds: ['NEUTRAL-P1'], cursor: 'synthetic-cursor' });
            assert.equal(result.networkUsed, false);
            assert.equal(result.status, entity === 'resident' || entity === 'payment_status' ? 'unsupported' : 'not_configured');
            assert.equal(result.code, entity === 'resident' || entity === 'payment_status' ? 'YARDI_RECORD_UNSUPPORTED' : 'YARDI_TRANSPORT_NOT_CONFIGURED');
        }
        for (const operation of ['write', 'authorize', 'capture', 'charge', 'refund'])
            assert.equal(operation in transport, false);
        const write = rejectYardiWrite();
        assert.equal(write.status, 'unsupported');
        assert.equal(write.code, 'YARDI_WRITE_UNSUPPORTED');
        assert.equal(write.networkUsed, false);
        assert.equal(attemptedNetwork, 0);
    }
    finally {
        globalThis.fetch = originalFetch;
    }
    pass('all transport reads fail closed without network calls, and no universal write or payment authorization/capture/charge/refund operation exists');
    phase = 'owned API fixture and absence of Stage12 migrations';
    await createScratch();
    await baseline();
    assert.equal(await database.state(), 'ready');
    const established = (await database.query<{
        name: string;
        checksum: string;
    }>('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;
    assert.equal(established.length, 10);
    for (const row of established)
        assert.equal(row.checksum, createHash('sha256').update(await readFile(path.join(root, 'migrations', row.name), 'utf8')).digest('hex'));
    const api = await start();
    let admin = await api.login(0);
    const agent = await api.login(1), manager = await api.login(2), analyst = await api.login(3), other = await api.login(4);
    phase = 'current organization administration and normal server sessions';
    const untouched = await snapshot();
    await deny(api, endpoint + '/readiness', '', 'GET', undefined, 401);
    await deny(api, endpoint + '/validate-config', '', 'POST', {}, 401);
    for (const cookie of [agent, manager, analyst]) {
        await deny(api, endpoint + '/readiness', cookie, 'GET', undefined, 403);
        await deny(api, endpoint + '/validate-config', cookie, 'POST', configDraft, 403);
    }
    const privateRead = await api.request(endpoint + '/readiness', admin);
    assert.equal(privateRead.status, 200);
    assert.match(privateRead.headers.get('cache-control') ?? '', /no-store/);
    flags(await privateRead.json() as YardiReadiness);
    flags(await readiness(api, other));
    await deny(api, endpoint + '/validate-config', admin, 'POST', { ...configDraft, organizationId: organizationIds[1] }, 400);
    await deny(api, '/api/connectors/' + organizationIds[1] + '/yardi/readiness', admin, 'GET', undefined, 404);
    assert.deepEqual(await snapshot(untouched), untouched, 'Authorization/readiness validation must not create connector, job, audit, task or CRM rows.');
    pass('real HttpOnly sessions restrict readiness and validation to the current organization administrator; other roles, anonymous callers and browser-supplied target organizations cannot gain access');
    phase = 'safe POST dry runs and repeated reads never persist or call a provider';
    const baselineReads = await snapshot();
    for (let repeat = 0; repeat < 3; repeat++) {
        flags(await readiness(api, admin));
        for (const draft of [{}, configDraft, { requestedCapabilities: ['resident', 'payment_status'] }]) {
            const result = await validate(api, admin, draft);
            flags(result);
            assert.equal(result.persisted, false);
            assert.equal(result.networkUsed, false);
            assert.equal(result.readyForLive, false);
        }
    }
    for (const field of ['secret', 'endpoint', 'authentication', 'payload', 'mappingProfile', 'credentialsConfigured', 'liveBehaviorVerified']) {
        const result = await deny(api, endpoint + '/validate-config', admin, 'POST', { ...configDraft, [field]: 'SCRATCH_PRIVATE_INPUT_MUST_NOT_ECHO' }, 400);
        assert(!(await result.text()).includes('SCRATCH_PRIVATE_INPUT_MUST_NOT_ECHO'));
    }
    const originCases:Record<string,string>[]=[{Origin:'https://untrusted.invalid'},{},{Origin:config.appUrl,'Sec-Fetch-Site':'cross-site'}];
    for (const headers of originCases) {
        const result = await fetch(api.base + endpoint + '/validate-config', { method: 'POST', headers: { Cookie: admin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(configDraft) });
        assert.equal(result.status, 403);
    }
    const wrongContent = await fetch(api.base + endpoint + '/validate-config', { method: 'POST', headers: { Cookie: admin, Origin: config.appUrl, 'Content-Type': 'text/plain' }, body: 'not-json' });
    assert.equal(wrongContent.status, 415);
    await deny(api, endpoint + '/mapping/validate', admin, 'POST', { samplePayload: { private: 'not collected' } }, 404);
    assert.deepEqual(await snapshot(baselineReads), baselineReads, 'Readiness and valid/invalid draft requests must save nothing, including audits and attempt counters.');
    pass('normal same-origin dry runs and refreshes save nothing; strict body/origin/content-type checks reject unsafe inputs, errors omit supplied values and no sample/profile upload endpoint exists');
    phase = 'simulator vault credentials never count as configured live Yardi credentials';
    const syntheticSecret = 'synthetic-simulator-only-' + randomUUID(), connectionId = randomUUID();
    const envelope = encryptConnectorCredential(syntheticSecret, config.connectorCredentialKey, organizationIds[0] + ':' + connectionId + ':yardi_demo');
    await database.query("INSERT INTO connector_connections(id,organization_id,provider,state,credential_envelope,created_by_user_id,created_by_membership_id) VALUES($1,$2,'yardi_demo','demo',$3::jsonb,$4,$5)", [connectionId, organizationIds[0], JSON.stringify(envelope), userIds[0], membershipIds[0]]);
    const vaultBaseline = await snapshot();
    const withSimulator = await readiness(api, admin);
    flags(withSimulator);
    assert.equal(withSimulator.credentialStorageAvailable, true);
    assert.equal(withSimulator.dimensions.credentialsConfigured, false);
    const ordinaryConnector = await json<{
        connection: {
            credentialConfigured: boolean;
        };
    }>(api, '/api/connectors', admin);
    assert.equal(ordinaryConnector.connection.credentialConfigured, true);
    const submitted = await validate(api, admin, configDraft);
    flags(submitted);
    assert.equal(submitted.readyForLive, false);
    for (const body of [withSimulator, submitted]) {
        const text = JSON.stringify(body);
        for (const secret of [syntheticSecret, config.connectorCredentialKey!, envelope.ciphertext, envelope.iv, envelope.tag])
            assert(!text.includes(secret), 'Readiness must never return credentials or the encrypted envelope.');
    }
    assert.deepEqual(await snapshot(vaultBaseline), vaultBaseline);
    const unkeyed = await start({ ...config, connectorCredentialKey: null });
    const withoutVault = await readiness(unkeyed, admin);
    assert.equal(withoutVault.credentialStorageAvailable, false);
    flags(withoutVault);
    await unkeyed.close();
    flags(await readiness(api, other));
    assert.equal(getConnectorAdapter('yardi'), null);
    pass('an encrypted simulator secret and an available vault key never imply live credentials, authenticated Yardi access or tested mappings; secret material stays absent and a missing key does not block readiness/startup');
    phase = 'expired sessions, revoked roles/memberships, portals and logout';
    await database.query("UPDATE organization_memberships SET role='read_only_analyst' WHERE id=$1", [membershipIds[0]]);
    await deny(api, endpoint + '/readiness', admin, 'GET', undefined, 403);
    await deny(api, endpoint + '/validate-config', admin, 'POST', {}, 403);
    await database.query("UPDATE organization_memberships SET role='organization_admin' WHERE id=$1", [membershipIds[0]]);
    await database.query('UPDATE organization_memberships SET active=false WHERE id=$1', [membershipIds[1]]);
    await deny(api, endpoint + '/readiness', agent, 'GET', undefined, 401);
    await database.query('UPDATE organization_memberships SET active=true WHERE id=$1', [membershipIds[1]]);
    await database.query("UPDATE sessions SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE user_id=$1", [userIds[2]]);
    await deny(api, endpoint + '/readiness', manager, 'GET', undefined, 401);
    for (const kind of ['applicant', 'resident']) {
        const portalEmail = kind + '-' + randomUUID() + '@example.test';
        await database.query('INSERT INTO users(email,display_name,password_hash,account_kind) SELECT $1,$2,password_hash,$3 FROM users WHERE id=$4', [portalEmail, 'Separate portal identity', kind, userIds[0]]);
        await deny(api, '/api/auth/login', '', 'POST', { email: portalEmail, password }, 401);
    }
    assert.equal((await api.request('/api/auth/logout', admin, 'POST', {})).status, 204);
    await deny(api, endpoint + '/readiness', admin, 'GET', undefined, 401);
    admin = await api.login(0);
    flags(await readiness(api, admin));
    for (const row of established)
        assert.equal(row.checksum, createHash('sha256').update(await readFile(path.join(root, 'migrations', row.name), 'utf8')).digest('hex'));
    pass('current role/membership changes, session expiry, separate applicant/resident identities and logout are enforced server-side; normal sign-in remains intact and all ten established migrations remain unchanged');
}
try {
    await main();
    console.log('Stage 12 Yardi readiness checks complete: ' + groups + ' groups passed.');
}
catch (error) {
    const detail = error instanceof assert.AssertionError ? error.message.split(/\r?\n/, 1)[0] : JSON.stringify({ name: error instanceof Error ? error.name : 'unknown', code: (error as {
            code?: string;
        })?.code });
    console.error('Stage 12 checks failed during ' + phase + ': ' + detail);
    console.error('Check location: ' + (error instanceof Error ? error.stack?.split(/\r?\n/).find(line => line.includes('check-yardi.ts'))?.trim() : 'unknown'));
    process.exitCode = 1;
}
finally {
    try {
        for (const close of servers.reverse())
            await close();
        await database.close();
        if (ownsScratch) {
            await verifiedCluster();
            assert(/^ootla_demo_yardi_[a-f0-9]{32}$/.test(scratchName));
            const target = await owner.query<{
                owner: string;
            }>('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1', [scratchName]);
            assert(target.rowCount === 1 && target.rows[0]?.owner === 'ootla', 'Scratch ownership changed; no deletion attempted.');
            const quoted = (await owner.query<{
                name: string;
            }>('SELECT quote_ident($1) AS name', [scratchName])).rows[0]!.name;
            await owner.query('DROP DATABASE ' + quoted);
            assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1', [scratchName])).rowCount, 0);
            console.log('PASS removed only the uniquely owned Stage 12 scratch database; retained data was never modified');
        }
    }
    catch {
        console.error('Stage 12 owned scratch cleanup failed. No unrelated database deletion was attempted.');
        process.exitCode = 1;
    }
    finally {
        if (ownerConnected)
            await owner.end();
    }
}
