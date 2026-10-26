import '../server/config/environment.js';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { createApp } from '../server/app.js';
import { loadConfig, type ServerConfig } from '../server/config/env.js';
import { Database } from '../server/db/pool.js';
import { hashPassword } from '../server/services/passwords.js';
import { leasingStages, type LeadRecord, type LeadDetail, type LeadDirectory, type LeadOptions, type DuplicateSuggestions } from '../shared/lead-contracts.js';
import type { ApplicationRecord, ContactDetail, ContactRecord, LeaseRecord, Paginated } from '../shared/property-contracts.js';
// All test writes target one uniquely-created, owned scratch database. This check
// never migrates, seeds, resets, or changes the retained review database.
const root = path.resolve(import.meta.dirname, '..');
const source = loadConfig();
const sourceUrl = new URL(source.databaseUrl);
assert(source.demoMode && !source.production && /^ootla_demo(?:_[a-z0-9_]+)?$/.test(source.databaseName ?? ''), 'Stage 07 checks require the documented non-production isolated Ootla demo configuration.');
assert(sourceUrl.hostname === '127.0.0.1' && sourceUrl.port === '55439' && sourceUrl.username === 'ootla' && !sourceUrl.search && !sourceUrl.hash, 'Use the project-owned local PostgreSQL cluster and established restricted application role.');
const scratchName = `ootla_demo_stage07_${randomUUID().replaceAll('-', '')}`;
const scratchUrl = new URL(sourceUrl);
scratchUrl.pathname = `/${scratchName}`;
const config: ServerConfig = { ...source, nodeEnv: 'test', production: false, appUrl: 'http://ootla.test', databaseUrl: scratchUrl.toString(), databaseName: scratchName };
const ownerUrl = new URL(sourceUrl);
ownerUrl.username = 'ootla_cluster_owner';
ownerUrl.pathname = '/postgres';
const owner = new Client({ connectionString: ownerUrl.toString(), connectionTimeoutMillis: 5000 });
const database = new Database(config);
const prefix = '/api/leads';
const foundation = '/api/property-foundation';
const organizations = [randomUUID(), randomUUID()];
const roles = ['organization_admin', 'property_manager', 'leasing_agent', 'read_only_analyst', 'organization_admin', 'leasing_agent', 'leasing_agent'] as const;
const userIds = roles.map(() => randomUUID());
const membershipIds: string[] = roles.map(() => randomUUID());
const emails = userIds.map(id => `stage07-${id}@example.test`);
const password = `Stage07-${randomUUID()}!`;
const properties = [randomUUID(), randomUUID(), randomUUID()];
const units = properties.map(() => randomUUID());
const legacyLeads = Array.from({ length: 8 }, () => randomUUID());
const servers: Array<() => Promise<void>> = [];
let ownerConnected = false;
let ownsScratch = false;
let groups = 0;
let phase = 'safe scratch setup';
const pass = (label: string) => { groups += 1; console.log(`PASS ${label}`); };
const normalize = (value: string) => path.resolve(value).replaceAll('\\', '/').toLowerCase();
const tables = ['organizations', 'users', 'organization_memberships', 'properties', 'property_access_assignments', 'units', 'leads', 'tasks', 'viewings', 'lead_activities', 'contacts', 'contact_property_links', 'households', 'household_property_links', 'household_members', 'applications', 'leases', 'external_record_mappings', 'demo_seed_records'];
type Snapshot = Record<string, {
    columns: string[];
    hash: string;
    count: number;
}>;
async function snapshot(previous?: Snapshot): Promise<Snapshot> {
    const result: Snapshot = {};
    for (const table of tables) {
        const columns = previous?.[table]?.columns ?? (await database.query<{
            column_name: string;
        }>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [table])).rows.map(row => row.column_name);
        assert(columns.length && columns.every(column => /^[a-z_]+$/.test(column)) && /^[a-z_]+$/.test(table));
        const rows = (await database.query(`SELECT ${columns.map(column => `"${column}"`).join(',')} FROM "${table}"`)).rows.map(row => JSON.stringify(row)).sort();
        result[table] = { columns, count: rows.length, hash: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
    }
    return result;
}
async function verifiedCluster() {
    const identity = await owner.query<{
        data_directory: string;
    }>('SHOW data_directory');
    assert.equal(normalize(identity.rows[0]?.data_directory ?? ''), normalize(path.join(root, '.local/postgres/data')), 'Refusing to operate outside the project-owned PostgreSQL data directory.');
}
async function createScratch() {
    await owner.connect();
    ownerConnected = true;
    await verifiedCluster();
    assert(/^ootla_demo_stage07_[a-f0-9]{32}$/.test(scratchName));
    assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1', [scratchName])).rowCount, 0, 'The unique scratch name already exists; nothing was changed.');
    const role = (await owner.query<{
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
    }>('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1', ['ootla'])).rows[0];
    assert(role && !role.rolsuper && !role.rolcreatedb && !role.rolcreaterole, 'The application role must remain restricted.');
    const quoted = (await owner.query<{
        name: string;
    }>('SELECT quote_ident($1) AS name', [scratchName])).rows[0]!.name;
    await owner.query(`CREATE DATABASE ${quoted} OWNER ootla`);
    ownsScratch = true;
    assert.equal((await database.query<{
        name: string;
    }>('SELECT current_database() AS name')).rows[0]?.name, scratchName);
}
async function installBaseline() {
    await database.query('CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
    for (const name of ['001_foundation.sql', '002_staff_roles_property_access.sql', '003_demo_dataset.sql', '004_property_contact_foundation.sql']) {
        const sql = await readFile(path.join(root, 'migrations', name), 'utf8');
        await database.transaction(async (client) => {
            await client.query(sql.replace(/^\uFEFF/, ''));
            await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name, createHash('sha256').update(sql).digest('hex')]);
        });
    }
    const passwordHash = await hashPassword(password);
    await database.transaction(async (client) => {
        for (const [index, id] of organizations.entries()) {
            await client.query("INSERT INTO organizations(id,name,slug,environment) VALUES($1,$2,$3,'demo')", [id, `Stage 07 scratch ${index}`, `stage07-${randomUUID()}`]);
        }
        for (const [index, id] of userIds.entries()) {
            await client.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)', [id, emails[index], `Stage 07 ${roles[index]} ${index}`, passwordHash]);
            await client.query('INSERT INTO organization_memberships(id,organization_id,user_id,role,active) VALUES($1,$2,$3,$4,$5)', [membershipIds[index], organizations[index === 4 ? 1 : 0], id, roles[index], index !== 5]);
        }
        for (const [index, id] of properties.entries()) {
            const organizationId = organizations[index === 2 ? 1 : 0];
            await client.query('INSERT INTO properties(id,organization_id,name,address,city,property_type) VALUES($1,$2,$3,$4,$5,$6)', [id, organizationId, `Property ${index}`, `${index} Example Street`, index === 0 ? 'Lagos' : 'Abuja', 'residential']);
            await client.query("INSERT INTO units(id,organization_id,property_id,label,bedrooms,status,monthly_rent) VALUES($1,$2,$3,'A1',2,'available',1200)", [units[index], organizationId, id]);
        }
        for (const [index, id] of legacyLeads.entries()) {
            const propertyIndex = index === 7 ? 2 : index > 3 ? 1 : 0;
            const status = ['new', 'contacted', 'viewing_scheduled', 'qualified'][index % 4];
            await client.query('INSERT INTO leads(id,organization_id,property_id,unit_id,display_name,email,status,intent,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, organizations[index === 7 ? 1 : 0], properties[propertyIndex], units[propertyIndex], `Legacy person ${index}`, `legacy-${index}@example.test`, status, index >= 4 && index !== 7 ? 'sales' : 'leasing', 'Original Stage 06 history']);
        }
        for (const index of [1, 2, 3]) {
            await client.query('INSERT INTO property_access_assignments(organization_id,membership_id,property_id) VALUES($1,$2,$3)', [organizations[0], membershipIds[index], properties[0]]);
        }
        for (const [status, stamp] of [['draft', '2020-01-01T00:00:00Z'], ['submitted', '2021-01-01T00:00:00Z']]) {
            await client.query('INSERT INTO applications(organization_id,contact_id,property_id,unit_id,lead_id,status,created_at,updated_at) SELECT organization_id,contact_id,property_id,unit_id,id,$2,$3,$3 FROM leads WHERE id=$1', [legacyLeads[0], status, stamp]);
        }
    });
}
async function utility(script = 'scripts/migrate.ts', args: string[] = []) {
    try {
        await promisify(execFile)(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), path.join(root, script), ...args], {
            cwd: root, windowsHide: true, timeout: 30000,
            env: { ...process.env, NODE_ENV: 'test', DEMO_MODE: 'true', DATABASE_URL: config.databaseUrl, APP_URL: config.appUrl },
        });
    }
    catch {
        if (script === 'scripts/migrate.ts' && database.pool) {
            const client = await database.pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(await readFile(path.join(root, 'migrations/005_lead_pipeline.sql'), 'utf8'));
            }
            catch (error) {
                const failure = error as {
                    code?: string;
                    position?: string;
                    constraint?: string;
                    routine?: string;
                };
                console.error('Scratch migration diagnostic ' + JSON.stringify({ code: failure.code, position: failure.position, constraint: failure.constraint, routine: failure.routine }));
            }
            finally {
                await client.query('ROLLBACK');
                client.release();
            }
        }
        assert.fail('The scoped scratch utility failed; raw credentials/process output are omitted.');
    }
}
async function start() {
    const db = new Database(config);
    const app = createApp(config, db);
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
        listener.once('error', reject);
    });
    let closed = false;
    const close = async () => {
        if (closed)
            return;
        closed = true;
        server.closeIdleConnections();
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        await db.close();
    };
    servers.push(close);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const request = (route: string, cookie = '', method = 'GET', body?: unknown) => fetch(base + route, {
        method, redirect: 'manual', headers: { ...(cookie ? { Cookie: cookie } : {}), ...(method === 'GET' ? {} : { Origin: config.appUrl }),
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { close, request, login: async (index: number) => {
            const response = await request('/api/auth/login', '', 'POST', { email: emails[index], password });
            assert.equal(response.status, 200, 'The real password hash/session authentication path must succeed.');
            const cookie = response.headers.get('set-cookie')?.split(';')[0];
            assert(cookie && /HttpOnly/i.test(response.headers.get('set-cookie')!), 'Use a normal HttpOnly server session.');
            return cookie;
        } };
}
type Api = Awaited<ReturnType<typeof start>>;
async function json<T>(api: Api, route: string, cookie: string, method = 'GET', body?: unknown, expected = 200): Promise<T> {
    const response = await api.request(route, cookie, method, body);
    assert.equal(response.status, expected, `${method} ${route.split('?')[0]} must return ${expected}; received ${response.status}.`);
    return response.json() as Promise<T>;
}
async function deny(api: Api, route: string, cookie: string, method = 'GET', body?: unknown, expected: number | number[] = [403, 404], code?: string) {
    const response = await api.request(route, cookie, method, body);
    assert((Array.isArray(expected) ? expected : [expected]).includes(response.status), `${method} ${route.split('?')[0]} must reject this request; received ${response.status}.`);
    if (code)
        assert.equal((await response.json() as {
            code: string;
        }).code, code);
}
async function rejectsSql(sql: string, values: unknown[], code: string, label: string) {
    assert(database.pool);
    let rejected = false;
    try {
        await database.pool.query(sql, values);
    }
    catch (error) {
        rejected = true;
        assert.equal((error as {
            code?: string;
        }).code, code, label);
    }
    assert(rejected, label);
}
// Scenario tests are deliberately kept in this one stage-specific check.
async function main() {
    await createScratch();
    await installBaseline();
    const before = await snapshot();
    phase = 'additive migration 005';
    await utility();
    assert.equal(await database.state(), 'ready');
    assert.deepEqual(await snapshot(before), before, 'Stage 07 migration must preserve every prior column, identity, timestamp and password hash.');
    const backfilled = (await database.query<{
        application_summary_status: string;
    }>('SELECT application_summary_status FROM leads WHERE id=$1', [legacyLeads[0]])).rows[0]!;
    assert.equal(backfilled.application_summary_status, 'submitted', 'Existing linked application summaries use the newest authoritative record.');
    await utility();
    const migrations = (await database.query<{
        name: string;
        checksum: string;
    }>('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;
    assert.equal(migrations.length, 5);
    for (const migration of migrations)
        assert.equal(migration.checksum, createHash('sha256').update(await readFile(path.join(root, 'migrations', migration.name), 'utf8')).digest('hex'));
    pass('additive migration preserves all prior records/columns and all five immutable migration checksums');
    phase = 'normal seed idempotence after stage migration';
    await utility('scripts/seed.ts');
    const seededLeads = (await database.query<{
        id: string;
        pipeline_stage: string;
    }>("SELECT id,pipeline_stage FROM leads WHERE seed_key LIKE 'stage03.%' ORDER BY seed_key")).rows;
    assert.equal(seededLeads.length, 3);
    const seededActions = (await database.query<{
        next_action: string;
        next_action_at: Date | null;
    }>("SELECT next_action,next_action_at FROM leads WHERE seed_key LIKE 'stage03.%'")).rows;
    assert(seededActions.length === 3 && seededActions.every(item => item.next_action.length > 0 && item.next_action_at), 'Fresh demo seed must retain representative next actions without needing a reset or later migration.');
    assert.equal((await database.query<{
        n: number;
    }>("SELECT count(*)::integer AS n FROM leads WHERE seed_key LIKE 'stage03.%' AND source='demo'")).rows[0]!.n, 3, 'Fresh explicit seed labels its pipeline source as demo.');
    const mayaId = (await database.query<{
        id: string;
    }>("SELECT id FROM leads WHERE seed_key='stage03.lead.maya'")).rows[0]!.id;
    await database.query("UPDATE leads SET pipeline_stage='contacted',source='referral',next_action='Preserve staff edit',version=version+1 WHERE id=$1", [mayaId]);
    const afterEdit = await snapshot();
    const eventCount = (await database.query<{
        n: number;
    }>('SELECT count(*)::integer AS n FROM lead_events')).rows[0]!.n;
    await utility('scripts/seed.ts');
    assert.deepEqual(await snapshot(afterEdit), afterEdit, 'Ordinary demo reseeding must preserve explicit pipeline edits, contact IDs, timestamps, passwords and counts.');
    assert.equal((await database.query<{
        n: number;
    }>('SELECT count(*)::integer AS n FROM lead_events')).rows[0]!.n, eventCount);
    const legacy = (await database.query<{
        id: string;
        intent: string;
        status: string;
        pipeline_stage: string;
    }>('SELECT id,intent,status,pipeline_stage FROM leads WHERE id=ANY($1::uuid[])', [legacyLeads])).rows;
    assert.equal(legacy.length, 8);
    for (const lead of legacy)
        assert.equal(lead.pipeline_stage, lead.status === 'viewing_scheduled' ? (lead.intent === 'sales' ? 'viewing_scheduled' : 'tour_scheduled') : lead.status === 'new' ? 'new_inquiry' : 'contacted');
    pass('legacy stage mapping preserves original status and repeatable ordinary seed preserves staff edits and canonical contacts');
    phase = 'persistent lead creation and editable fields';
    const api = await start();
    const [admin, manager, agent, analyst, otherAdmin] = await Promise.all([0, 1, 2, 3, 4].map(index => api.login(index)));
    await deny(api, prefix, '', 'GET', undefined, 401);
    const make = async (name: string, intent: 'leasing' | 'sales' = 'leasing', overrides: Record<string, unknown> = {}) => (await json<{
        lead: LeadRecord;
    }>(api, prefix, admin!, 'POST', {
        propertyId: properties[0], unitId: units[0], newContact: { displayName: name, email: `${randomUUID()}@example.test`, phone: '+234 100 0100' }, intent, ...overrides,
    }, 201)).lead;
    const detail = async (leadId: string, token = admin!) => json<LeadDetail>(api, `${prefix}/${leadId}`, token);
    const edit = async (lead: LeadRecord, input: Record<string, unknown>, token = admin!) => (await json<{
        lead: LeadRecord;
    }>(api, `${prefix}/${lead.id}`, token, 'PATCH', { version: lead.version, ...input })).lead;
    const transition = async (lead: LeadRecord, stage: string, token = admin!, reason = 'Focused Stage 07 staff action') => (await json<{
        lead: LeadRecord;
    }>(api, `${prefix}/${lead.id}/stage`, token, 'PATCH', { version: lead.version, stage, reason })).lead;
    let lead = await make('Canonical Stage 07 prospect');
    assert.equal(lead.stage, 'new_inquiry');
    assert.equal(lead.source, 'manual');
    assert.equal(lead.intent, 'leasing');
    assert.equal(lead.propertyId, properties[0]);
    assert.equal(lead.unitId, units[0]);
    assert(lead.contactId);
    assert.equal(lead.owner, null);
    assert(lead.interestPropertyIds.includes(properties[0]!));
    const canonicalId = lead.contactId;
    const beforeContacts = (await database.query<{
        n: number;
    }>('SELECT count(*)::integer AS n FROM contacts')).rows[0]!.n;
    let repeatedIdentity = await make('Unused create payload', 'leasing', { newContact: null, contactId: canonicalId });
    assert.equal(repeatedIdentity.contactId, canonicalId);
    assert.equal((await database.query<{
        n: number;
    }>('SELECT count(*)::integer AS n FROM contacts')).rows[0]!.n, beforeContacts, 'Explicit canonical contact reuse must not copy identity.');
    const nextActionAt = new Date(Date.now() + 86400000).toISOString();
    const preferences = { bedrooms: 2, budgetMin: 1200, budgetMax: 2200, moveInOn: '2027-02-01', locations: ['Lagos', 'Near transit'], requirements: 'Step-free entry\nNear bus route' };
    lead = await edit(lead, { ownerMembershipId: membershipIds[2], source: 'referral', preferences, nextActionAt, nextAction: 'Discuss move-in date', notes: 'Persistent staff notes\nSecond staff note' });
    assert.equal(lead.owner?.membershipId, membershipIds[2]);
    assert.equal(lead.source, 'referral');
    assert.deepEqual(lead.preferences, preferences);
    assert.equal(lead.nextActionAt, nextActionAt);
    assert.equal(lead.nextAction, 'Discuss move-in date');
    assert.equal(lead.notes, 'Persistent staff notes\nSecond staff note');
    const refreshed = await detail(lead.id);
    assert.deepEqual(refreshed.lead, lead);
    assert(refreshed.events.items.some(event => event.kind === 'created' && event.actor.id === userIds[0] && Number.isFinite(Date.parse(event.occurredAt))));
    assert(refreshed.events.items.some(event => event.kind === 'updated' && event.actor.id === userIds[0]));
    const priorVersion = lead.version;
    lead = await edit(lead, { notes: 'Only notes changed' });
    assert.equal(lead.version, priorVersion + 1);
    assert.equal(lead.source, 'referral');
    assert.deepEqual(lead.preferences, preferences);
    assert.equal(lead.owner?.membershipId, membershipIds[2]);
    await deny(api, `${prefix}/${lead.id}`, admin!, 'PATCH', { version: priorVersion, notes: 'Stale overwrite' }, 409);
    await deny(api, `${prefix}/${lead.id}`, admin!, 'PATCH', { version: lead.version, preferences: { budgetMin: 2000, budgetMax: 1000 } }, 400);
    await deny(api, prefix, admin!, 'POST', { propertyId: properties[0], newContact: { displayName: 'Both' }, contactId: canonicalId }, 400);
    await deny(api, prefix, admin!, 'POST', { propertyId: properties[0] }, 400);
    await deny(api, `${prefix}/${lead.id}`, admin!, 'PATCH', { version: lead.version, stage: 'leased' }, 400);
    await deny(api, `${prefix}/${lead.id}`, admin!, 'PATCH', { version: lead.version, applicationSummary: { status: 'staff_review' } }, 400);
    pass('create/edit persists owner, source, canonical identity, preferences and next-action dates; refresh and optimistic stale-write validation work');
    phase = 'organization, property, related records and ownership access';
    const initial = await json<LeadDirectory>(api, prefix, admin!);
    assert(initial.items.every(item => item.id !== legacyLeads[7]));
    for (const token of [manager!, agent!, analyst!]) {
        const scoped = await json<LeadDirectory>(api, prefix, token);
        assert(scoped.items.every(item => item.propertyId === properties[0]));
        await deny(api, `${prefix}/${legacyLeads[4]}`, token);
        await deny(api, `${prefix}/${legacyLeads[7]}`, token);
    }
    await deny(api, `${prefix}/${lead.id}`, otherAdmin!);
    await deny(api, prefix, analyst!, 'POST', { propertyId: properties[0], newContact: { displayName: 'Denied analyst' } }, 403);
    await deny(api, `${prefix}/${lead.id}`, analyst!, 'PATCH', { version: lead.version, notes: 'Denied analyst' }, 403);
    await deny(api, `${prefix}/${lead.id}/stage`, analyst!, 'PATCH', { version: lead.version, stage: 'contacted' }, 403);
    await deny(api, prefix, agent!, 'POST', { propertyId: properties[1], newContact: { displayName: 'Outside property' } });
    await deny(api, prefix, admin!, 'POST', { propertyId: properties[2], newContact: { displayName: 'Other organization' } });
    await deny(api, prefix, admin!, 'POST', { propertyId: properties[0], unitId: units[1], newContact: { displayName: 'Mismatched unit' } }, [400, 404]);
    for (const invalidOwner of [membershipIds[4], membershipIds[5], membershipIds[6], membershipIds[3]]) {
        await deny(api, `${prefix}/${lead.id}`, admin!, 'PATCH', { version: lead.version, ownerMembershipId: invalidOwner }, [400, 403, 404]);
    }
    const otherContact = (await database.query<{
        contact_id: string;
    }>('SELECT contact_id FROM leads WHERE id=$1', [legacyLeads[7]])).rows[0]!.contact_id;
    await deny(api, prefix, admin!, 'POST', { propertyId: properties[0], contactId: otherContact }, [400, 404]);
    await deny(api, prefix, agent!, 'POST', { propertyId: properties[0], interestPropertyIds: [properties[1]], newContact: { displayName: 'Hidden interest' } });
    await deny(api, `${prefix}/${lead.id}`, admin!, 'PATCH', { version: lead.version, interestPropertyIds: [properties[0], properties[1]], ownerMembershipId: membershipIds[2] }, [400, 403, 404]);
    const options = await json<LeadOptions>(api, `${prefix}/options?propertyId=${properties[0]}`, admin!);
    assert(options.owners.some(owner => owner.membershipId === membershipIds[2]));
    assert(options.owners.every(owner => ![membershipIds[4], membershipIds[5], membershipIds[6], membershipIds[3]].includes(owner.membershipId)));
    assert(options.properties.length <= 100 && options.units.length <= 100 && options.owners.length <= 100);
    const shared = await make('Shared scoped prospect', 'leasing', { interestPropertyIds: [properties[0], properties[1]], ownerMembershipId: membershipIds[0] });
    const sharedResponse = await api.request(`${prefix}/${shared.id}`, agent!);
    if (sharedResponse.status === 200) {
        const scoped = await sharedResponse.json() as LeadDetail;
        assert(scoped.lead.interestPropertyIds.every(id => id === properties[0]), 'Additional property interests must not reveal inaccessible IDs.');
    }
    else
        assert([403, 404].includes(sharedResponse.status));
    await deny(api, `${prefix}/${shared.id}`, agent!, 'PATCH', { version: shared.version, notes: 'Partial scope cannot change shared work' });
    pass('backend role, tenant, property/contact/unit/interest and active eligible owner boundaries hold; shared interests and choices are scoped');
    phase = 'validated leasing transitions and actor history';
    assert.deepEqual(leasingStages.map(stage => stage.label), ['New inquiry', 'Contacted', 'Tour scheduled', 'Application started', 'Application submitted', 'Staff review', 'Lease pending', 'Leased', 'Lost/Closed']);
    await deny(api, `${prefix}/${lead.id}/stage`, admin!, 'PATCH', { version: lead.version, stage: 'leased' }, 409);
    await deny(api, `${prefix}/${lead.id}/stage`, admin!, 'PATCH', { version: lead.version, stage: 'won' }, [400, 409]);
    lead = await transition(lead, 'contacted', agent!);
    let staged = await detail(lead.id);
    const contactedEvent = staged.events.items.find(event => event.kind === 'stage_changed' && event.stage === 'contacted');
    assert(contactedEvent && contactedEvent.previousStage === 'new_inquiry' && contactedEvent.actor.id === userIds[2]);
    assert(Number.isFinite(Date.parse(contactedEvent.occurredAt)));
    assert((await database.query<{
        n: number;
    }>("SELECT count(*)::integer AS n FROM audit_events WHERE organization_id=$1 AND actor_user_id=$2 AND action LIKE 'lead.%'", [organizations[0], userIds[2]])).rows[0]!.n > 0);
    lead = await transition(lead, 'tour_scheduled');
    assert.equal((await detail(lead.id)).lead.stage, 'tour_scheduled');
    await deny(api, `${prefix}/${lead.id}/stage`, admin!, 'PATCH', { version: lead.version, stage: 'application_started' }, 409);
    const currentStageVersion = lead.version;
    await deny(api, `${prefix}/${lead.id}/stage`, admin!, 'PATCH', { version: currentStageVersion - 1, stage: 'contacted' }, 409);
    lead = await transition(lead, 'lost_closed', admin!, 'Prospect withdrew');
    assert.equal(lead.stage, 'lost_closed');
    lead = await transition(lead, 'new_inquiry', admin!, 'Explicit staff reopening');
    assert.equal((await detail(lead.id)).lead.stage, 'new_inquiry');
    pass('exact leasing stages enforce backend adjacency, real actor/time/audit history, prerequisites and stale stage-write rejection');
    phase = 'independent sales opportunity pipeline';
    let sale = await make('Sales opportunity example', 'sales', { source: 'phone' });
    assert.equal(sale.intent, 'sales');
    assert(sale.allowedStages.every(stage => !['tour_scheduled', 'application_started', 'application_submitted', 'staff_review', 'lease_pending', 'leased'].includes(stage.key)));
    await deny(api, `${prefix}/${sale.id}/stage`, admin!, 'PATCH', { version: sale.version, stage: 'application_started' }, [400, 409]);
    sale = await transition(sale, 'contacted');
    sale = await transition(sale, 'negotiation');
    sale = await transition(sale, 'offer_pending');
    sale = await transition(sale, 'won');
    assert.equal(sale.stage, 'won');
    assert.equal(sale.applicationSummary, null);
    assert.equal(sale.verifiedLeaseMilestone, null);
    assert.equal((await detail(sale.id)).lead.stage, 'won');
    await deny(api, `${prefix}/${sale.id}/stage`, admin!, 'PATCH', { version: sale.version, stage: 'new_inquiry' }, 409);
    pass('sales opportunities persist their own independent negotiation/offer/won stages without rental applications or lease milestones');
    phase = 'application status authority and synchronized summary';
    let rental = await make('Application-to-lease example');
    rental = await transition(rental, 'contacted');
    rental = await transition(rental, 'tour_scheduled');
    const application = (await json<{
        application: ApplicationRecord;
    }>(api, `${foundation}/applications`, admin!, 'POST', {
        contactId: rental.contactId, propertyId: rental.propertyId, unitId: rental.unitId, leadId: rental.id, status: 'draft',
    }, 201)).application;
    rental = (await detail(rental.id)).lead;
    assert.deepEqual(rental.applicationSummary, { id: application.id, status: 'draft' });
    assert.equal(rental.stage, 'tour_scheduled', 'Application status synchronization must not silently drag a pipeline card.');
    rental = await transition(rental, 'application_started');
    await deny(api, `${prefix}/${rental.id}/stage`, admin!, 'PATCH', { version: rental.version, stage: 'application_submitted' }, 409);
    await json(api, `${foundation}/applications/${application.id}`, admin!, 'PATCH', { status: 'submitted' });
    rental = (await detail(rental.id)).lead;
    assert.deepEqual(rental.applicationSummary, { id: application.id, status: 'submitted' });
    assert.equal(rental.stage, 'application_started');
    rental = await transition(rental, 'application_submitted');
    await json(api, `${foundation}/applications/${application.id}`, admin!, 'PATCH', { status: 'staff_review' });
    rental = (await detail(rental.id)).lead;
    assert.equal(rental.applicationSummary?.status, 'staff_review');
    rental = await transition(rental, 'staff_review');
    rental = await transition(rental, 'lease_pending');
    assert.equal((await database.query<{
        status: string;
    }>('SELECT status FROM applications WHERE id=$1', [application.id])).rows[0]!.status, 'staff_review');
    staged = await detail(rental.id);
    assert(staged.events.items.some(event => event.kind === 'application_summary' && event.actor.id === userIds[0]));
    const sharedHistory = await json<ContactDetail>(api, `${foundation}/contacts/${rental.contactId}?pageSize=100`, admin!);
    assert(sharedHistory.history.items.some(item => item.kind === 'application' && item.id === application.id));
    let directSubmitted = await make('Directly submitted application prospect');
    directSubmitted = await transition(directSubmitted, 'contacted');
    const directApplication = (await json<{
        application: ApplicationRecord;
    }>(api, `${foundation}/applications`, admin!, 'POST', {
        contactId: directSubmitted.contactId, propertyId: directSubmitted.propertyId, leadId: directSubmitted.id, status: 'submitted',
    }, 201)).application;
    directSubmitted = (await detail(directSubmitted.id)).lead;
    directSubmitted = await transition(directSubmitted, 'application_started');
    assert.equal(directSubmitted.applicationSummary?.status, 'submitted', 'A forward pipeline step must not downgrade an application already submitted.');
    directSubmitted = await transition(directSubmitted, 'application_submitted');
    assert.equal((await database.query<{
        status: string;
    }>('SELECT status FROM applications WHERE id=$1', [directApplication.id])).rows[0]!.status, 'submitted');
    const reassigned = await make('Explicit same identity inquiry', 'leasing', { newContact: null, contactId: directSubmitted.contactId });
    await json(api, `${foundation}/applications/${directApplication.id}`, admin!, 'PATCH', { leadId: reassigned.id });
    const previousSummary = (await detail(directSubmitted.id)).lead;
    const reassignedSummary = (await detail(reassigned.id)).lead;
    assert.equal(previousSummary.applicationSummary, null, 'Application reassignment must clear the former lead summary in the same transaction.');
    assert.deepEqual(reassignedSummary.applicationSummary, { id: directApplication.id, status: 'submitted' });
    assert.equal(previousSummary.stage, 'application_submitted', 'Application reassignment does not silently move a pipeline stage.');
    assert.equal(reassignedSummary.stage, 'new_inquiry');
    pass('application status remains authoritative on its own record and updates a versioned, audited lead summary without silently changing pipeline stage');
    phase = 'explicit verified lease milestone gate';
    await deny(api, `${prefix}/${rental.id}/stage`, admin!, 'PATCH', { version: rental.version, stage: 'leased' }, 409);
    const lease = (await json<{
        lease: LeaseRecord;
    }>(api, `${foundation}/leases`, admin!, 'POST', {
        contactId: rental.contactId, propertyId: rental.propertyId, unitId: rental.unitId, leadId: rental.id, applicationId: application.id, status: 'active', startsOn: '2027-01-01', endsOn: '2027-12-31',
    }, 201)).lease;
    rental = (await detail(rental.id)).lead;
    assert.equal(rental.verifiedLeaseMilestone, null, 'An active flag alone is not a verified milestone.');
    await deny(api, `${prefix}/${rental.id}/stage`, admin!, 'PATCH', { version: rental.version, stage: 'leased' }, 409);
    await deny(api, `${prefix}/${rental.id}/lease-verification`, agent!, 'POST', { version: rental.version, leaseId: lease.id, evidenceReference: 'Staff evidence example', confirmVerified: true }, 403);
    await deny(api, `${prefix}/${rental.id}/lease-verification`, admin!, 'POST', { version: rental.version, leaseId: lease.id, evidenceReference: 'Staff evidence example', confirmVerified: false }, 400);
    const wrongLease = (await json<{
        lease: LeaseRecord;
    }>(api, `${foundation}/leases`, admin!, 'POST', { contactId: lead.contactId, propertyId: lead.propertyId, leadId: lead.id, status: 'active' }, 201)).lease;
    await deny(api, `${prefix}/${rental.id}/lease-verification`, admin!, 'POST', { version: rental.version, leaseId: wrongLease.id, evidenceReference: 'Wrong contact evidence', confirmVerified: true }, [400, 404, 409]);
    const alternateUnit = (await json<{
        unit: {
            id: string;
        };
    }>(api, `${foundation}/properties/${properties[0]}/units`, admin!, 'POST', {
        label: 'Stage07 A2', bedrooms: 2, status: 'available', monthlyRent: 1250,
    }, 201)).unit;
    await json(api, `${foundation}/leases/${lease.id}`, admin!, 'PATCH', { unitId: null });
    await deny(api, `${prefix}/${rental.id}/lease-verification`, admin!, 'POST', { version: rental.version, leaseId: lease.id, evidenceReference: 'Unit mismatch must be rejected', confirmVerified: true }, [400, 409]);
    await deny(api, `${foundation}/leases/${lease.id}`, admin!, 'PATCH', { unitId: alternateUnit.id }, 400);
    // Existing foundation guards reject this mismatch through normal writes.
    // Simulate changed trusted/imported data only inside this owned scratch DB
    // to prove that the independent milestone guard also rejects it.
    await database.query('UPDATE leases SET unit_id=$2,updated_at=now() WHERE id=$1', [lease.id, alternateUnit.id]);
    await deny(api, `${prefix}/${rental.id}/lease-verification`, admin!, 'POST', { version: rental.version, leaseId: lease.id, evidenceReference: 'Unit mismatch must be rejected', confirmVerified: true }, [400, 409]);
    await json(api, `${foundation}/leases/${lease.id}`, admin!, 'PATCH', { unitId: rental.unitId });
    await database.query("UPDATE leases SET source_system='yardi' WHERE id=$1", [lease.id]);
    await deny(api, `${prefix}/${rental.id}/lease-verification`, admin!, 'POST', { version: rental.version, leaseId: lease.id, evidenceReference: 'Cannot manufacture provider verification', confirmVerified: true }, [403, 409]);
    await database.query("UPDATE leases SET source_system='local' WHERE id=$1", [lease.id]);
    await json(api, `${foundation}/external-mappings`, admin!, 'POST', { entityType: 'lease', entityId: lease.id, provider: 'yardi', externalId: 'EXAMPLE-LEASE-07' }, 201);
    await deny(api, `${prefix}/${rental.id}/lease-verification`, admin!, 'POST', { version: rental.version, leaseId: lease.id, evidenceReference: 'Mapping is not evidence', confirmVerified: true }, [403, 409]);
    await database.query('DELETE FROM external_record_mappings WHERE lease_id=$1', [lease.id]);
    rental = (await json<{
        lead: LeadRecord;
    }>(api, `${prefix}/${rental.id}/lease-verification`, manager!, 'POST', { version: rental.version, leaseId: lease.id, evidenceReference: 'Staff reviewed signed local lease EXAMPLE-07', confirmVerified: true })).lead;
    assert.equal(rental.stage, 'lease_pending', 'Verification itself does not change the lead stage.');
    assert.equal(rental.verifiedLeaseMilestone?.leaseId, lease.id);
    assert.equal(rental.verifiedLeaseMilestone?.verifiedByName, `Stage 07 ${roles[1]} 1`);
    assert(Number.isFinite(Date.parse(rental.verifiedLeaseMilestone!.verifiedAt)));
    const initialProof = (await database.query('SELECT id,evidence_reference,verified_by_user_id,lease_updated_at::text,verified_at::text FROM lease_verified_milestones WHERE lease_id=$1 ORDER BY verified_at,id', [lease.id])).rows[0]!;
    assert(initialProof);
    assert.equal((await database.query<{
        matches: boolean;
    }>('SELECT vm.lease_updated_at=l.updated_at AS matches FROM lease_verified_milestones vm JOIN leases l ON l.id=vm.lease_id WHERE vm.id=$1', [initialProof.id])).rows[0]!.matches, true, 'The verified snapshot must preserve the exact database timestamp, including microseconds.');
    await deny(api, `${prefix}/${rental.id}/lease-verification`, manager!, 'POST', { version: rental.version, leaseId: lease.id, evidenceReference: 'Duplicate current snapshot', confirmVerified: true }, 409);
    await deny(api, `${prefix}/${rental.id}`, admin!, 'PATCH', { version: rental.version, unitId: alternateUnit.id }, 409);
    await database.query('UPDATE leads SET unit_id=$2,version=version+1,updated_at=now() WHERE id=$1', [rental.id, alternateUnit.id]);
    rental = (await detail(rental.id)).lead;
    assert.equal(rental.verifiedLeaseMilestone, null, 'Changing the lead unit must not reuse verification for a different leased unit.');
    await deny(api, `${prefix}/${rental.id}/stage`, manager!, 'PATCH', { version: rental.version, stage: 'leased' }, 409);
    await deny(api, `${prefix}/${rental.id}/lease-verification`, manager!, 'POST', { version: rental.version, leaseId: lease.id, evidenceReference: 'Changed lead unit is not the lease unit', confirmVerified: true }, [400, 409]);
    await database.query('UPDATE leads SET unit_id=$2,version=version+1,updated_at=now() WHERE id=$1', [rental.id, units[0]]);
    rental = (await detail(rental.id)).lead;
    assert.equal(rental.verifiedLeaseMilestone?.leaseId, lease.id);
    await json(api, `${foundation}/leases/${lease.id}`, admin!, 'PATCH', { endsOn: '2028-12-31' });
    rental = (await detail(rental.id)).lead;
    assert.equal(rental.verifiedLeaseMilestone, null, 'A date edit must invalidate evidence for the previous lease version.');
    await deny(api, `${prefix}/${rental.id}/stage`, manager!, 'PATCH', { version: rental.version, stage: 'leased' }, 409);
    rental = (await json<{
        lead: LeadRecord;
    }>(api, `${prefix}/${rental.id}/lease-verification`, manager!, 'POST', { version: rental.version, leaseId: lease.id, evidenceReference: 'Staff re-reviewed the revised local dates EXAMPLE-07', confirmVerified: true })).lead;
    assert.equal(rental.verifiedLeaseMilestone?.leaseId, lease.id);
    await deny(api, `${foundation}/leases/${lease.id}`, admin!, 'PATCH', { unitId: alternateUnit.id }, 400);
    await database.query('UPDATE leases SET unit_id=$2,updated_at=now() WHERE id=$1', [lease.id, alternateUnit.id]);
    rental = (await detail(rental.id)).lead;
    assert.equal(rental.verifiedLeaseMilestone, null, 'A lease unit edit must invalidate the previous verified milestone.');
    await deny(api, `${prefix}/${rental.id}/stage`, manager!, 'PATCH', { version: rental.version, stage: 'leased' }, 409);
    await deny(api, `${prefix}/${rental.id}/lease-verification`, manager!, 'POST', { version: rental.version, leaseId: lease.id, evidenceReference: 'Different lease unit is not verified', confirmVerified: true }, [400, 409]);
    await json(api, `${foundation}/leases/${lease.id}`, admin!, 'PATCH', { unitId: units[0] });
    await json(api, `${foundation}/leases/${lease.id}`, admin!, 'PATCH', { status: 'ended' });
    rental = (await detail(rental.id)).lead;
    await deny(api, `${prefix}/${rental.id}/stage`, manager!, 'PATCH', { version: rental.version, stage: 'leased' }, 409);
    await json(api, `${foundation}/leases/${lease.id}`, admin!, 'PATCH', { status: 'active' });
    await database.query("UPDATE leases SET source_system='yardi',updated_at=now() WHERE id=$1", [lease.id]);
    rental = (await detail(rental.id)).lead;
    await deny(api, `${prefix}/${rental.id}/stage`, manager!, 'PATCH', { version: rental.version, stage: 'leased' }, 409);
    await database.query("UPDATE leases SET source_system='local',updated_at=now() WHERE id=$1", [lease.id]);
    rental = (await detail(rental.id)).lead;
    assert.equal(rental.verifiedLeaseMilestone, null, 'Restoring an edited lease still requires an explicit review of its current version.');
    await deny(api, `${prefix}/${rental.id}/stage`, manager!, 'PATCH', { version: rental.version, stage: 'leased' }, 409);
    rental = (await json<{
        lead: LeadRecord;
    }>(api, `${prefix}/${rental.id}/lease-verification`, manager!, 'POST', { version: rental.version, leaseId: lease.id, evidenceReference: 'Staff re-reviewed the current matching local lease EXAMPLE-07', confirmVerified: true })).lead;
    const proofs = (await database.query('SELECT id,evidence_reference,verified_by_user_id,lease_updated_at::text,verified_at::text FROM lease_verified_milestones WHERE lease_id=$1 ORDER BY verified_at,id', [lease.id])).rows;
    assert.equal(proofs.length, 3, 'Explicit re-verification must append immutable milestones for three reviewed lease versions.');
    assert.deepEqual(proofs.find(proof => proof.id === initialProof.id), initialProof, 'The first proof actor, evidence, exact version and timestamp must remain immutable.');
    rental = await transition(rental, 'leased', manager!, 'Verified current local lease reviewed');
    assert.equal(rental.stage, 'leased');
    assert.equal((await detail(rental.id)).lead.stage, 'leased');
    assert.equal((await database.query<{
        status: string;
    }>('SELECT status FROM leases WHERE id=$1', [lease.id])).rows[0]!.status, 'active');
    assert((await detail(rental.id)).events.items.some(event => event.kind === 'lease_verified' && event.actor.id === userIds[1]));
    pass('leased requires privileged exact-version evidence for the matching unit; dates/unit/status/source edits invalidate old proof and explicit re-verification preserves immutable actor/history');
    phase = 'duplicate suggestions without silent identity merge';
    const first = await make('Same Name Example', 'leasing', { newContact: { displayName: 'Same Name Example', email: 'shared-stage07@example.test', phone: '+234 555 0707' } });
    const second = await make('Same Name Example', 'leasing', { newContact: { displayName: 'Same Name Example', email: 'shared-stage07@example.test', phone: '+234 555 0707' } });
    assert.notEqual(first.contactId, second.contactId, 'Even equal names and email addresses must not silently merge canonical people.');
    const suggestions = await json<DuplicateSuggestions>(api, `${prefix}/duplicate-suggestions?name=Same%20Name%20Example&email=shared-stage07%40example.test&phone=%2B234%20555%200707`, admin!);
    assert(suggestions.items.length <= 10);
    assert(suggestions.notice.length > 0);
    assert(suggestions.items.some(item => item.contactId === first.contactId));
    assert(suggestions.items.some(item => item.contactId === second.contactId));
    assert(suggestions.items.every(item => item.reasons.length > 0));
    const nameOnly = await json<DuplicateSuggestions>(api, `${prefix}/duplicate-suggestions?name=Same%20Name%20Example`, admin!);
    assert(nameOnly.items.some(item => item.contactId === first.contactId));
    const inaccessible = await json<DuplicateSuggestions>(api, `${prefix}/duplicate-suggestions?name=Legacy%20person%204`, agent!);
    assert(!inaccessible.items.some(item => item.contactId === (legacy.find(item => item.id === legacyLeads[4])?.id)));
    assert(!inaccessible.items.some(item => item.name === 'Legacy person 4'));
    const contact = await json<ContactDetail>(api, `${foundation}/contacts/${canonicalId}?pageSize=100`, admin!);
    assert(contact.history.items.some(item => item.kind === 'lead' && item.id === lead.id));
    assert(contact.history.items.some(item => item.kind === 'lead' && item.id === repeatedIdentity.id));
    pass('bounded property-scoped duplicate suggestions explain matches; equal names/emails remain distinct unless staff explicitly reuse an existing canonical contact');
    await json(api, `${foundation}/contacts/${second.contactId}/properties`, admin!, 'POST', { propertyId: properties[1] });
    await rejectsSql('INSERT INTO lead_property_interests(organization_id,lead_id,contact_id,property_id) VALUES($1,$2,$3,$4)', [organizations[0], first.id, second.contactId, properties[1]], '23503', 'An interest cannot substitute another canonical contact on the same organization.');
    await rejectsSql('UPDATE leads SET owner_membership_id=$1 WHERE id=$2', [membershipIds[4], first.id], '23503', 'An owner cannot cross the lead organization at the database boundary.');
    await rejectsSql("UPDATE leads SET pipeline_stage='leased' WHERE id=$1", [sale.id], '23514', 'A sales lead cannot store a rental-only stage.');
    await rejectsSql('UPDATE leads SET application_summary_id=$1,application_summary_status=$2 WHERE id=$3', [application.id, 'staff_review', first.id], '23503', 'A lead summary cannot reference another lead application.');
    pass('database constraints reject cross-tenant owners, mismatched interest identities, sales/rental stages and another lead application summary');
    phase = 'server search/filter/sort/list and board pagination';
    const bulkContact = (await json<{
        contact: ContactRecord;
    }>(api, `${foundation}/contacts`, admin!, 'POST', { displayName: 'Bulk shared canonical contact', propertyIds: [properties[0]] }, 201)).contact;
    await database.query(`INSERT INTO leads(organization_id,property_id,contact_id,display_name,email,status,intent,pipeline_stage,source,next_action,next_action_at)
    SELECT $1,$2,$3,'Bulk shared canonical contact','','new','leasing',CASE WHEN n%2=0 THEN 'contacted' ELSE 'new_inquiry' END,'import','Bulk follow up',CASE WHEN n%3=0 THEN now()-interval '1 day' WHEN n%3=1 THEN now()+interval '1 day' ELSE NULL END
    FROM generate_series(1,251) AS series(n)`, [organizations[0], properties[0], bulkContact.id]);
    const expected = (await database.query<{
        id: string;
    }>('SELECT id FROM leads WHERE contact_id=$1 ORDER BY created_at DESC,id', [bulkContact.id])).rows.map(row => row.id);
    const seen: string[] = [];
    for (let page = 1; page <= 3; page++) {
        const response = await api.request(`${prefix}?q=Bulk%20shared&source=import&intent=leasing&page=${page}&pageSize=100&sort=created_desc&view=board`, admin!);
        assert.equal(response.status, 200);
        const text = await response.text();
        const directory = JSON.parse(text) as LeadDirectory;
        assert.equal(directory.total, 251);
        assert.equal(directory.totalPages, 3);
        assert.equal(directory.items.length, page === 3 ? 51 : 100);
        assert(directory.stageCounts.every(item => item.intent === 'leasing' && leasingStages.some(stage => stage.key === item.stage)), 'Board totals must use only the selected pipeline stages.');
        assert.equal(directory.stageCounts.reduce((sum, item) => sum + item.total, 0), 251);
        assert(text.length < 500000, 'Board/list records must stay bounded to one server page.');
        seen.push(...directory.items.map(item => item.id));
    }
    assert.equal(new Set(seen).size, 251);
    assert.deepEqual(seen, expected);
    const list = await json<LeadDirectory>(api, `${prefix}?q=Bulk%20shared&source=import&intent=leasing&pageSize=100&sort=created_desc&view=list`, admin!);
    assert.deepEqual(list.items.map(item => item.id), expected.slice(0, 100));
    for (const nextAction of ['overdue', 'upcoming', 'none']) {
        const filtered = await json<LeadDirectory>(api, `${prefix}?q=Bulk%20shared&source=import&nextAction=${nextAction}&pageSize=100`, admin!);
        assert(filtered.total > 0);
        assert(filtered.items.length <= 100);
        assert(filtered.items.every(item => nextAction === 'none' ? item.nextActionAt === null : nextAction === 'overdue' ? Date.parse(item.nextActionAt!) < Date.now() : Date.parse(item.nextActionAt!) > Date.now()));
    }
    const filtered = await json<LeadDirectory>(api, `${prefix}?intent=leasing&stage=contacted&propertyId=${properties[0]}&ownerMembershipId=${membershipIds[2]}&source=referral`, admin!);
    assert(filtered.items.every(item => item.stage === 'contacted' && item.owner?.membershipId === membershipIds[2] && item.source === 'referral'));
    const unassigned = await json<LeadDirectory>(api, `${prefix}?q=Bulk%20shared&ownerMembershipId=unassigned&pageSize=100`, admin!);
    assert.equal(unassigned.total, 251);
    assert(unassigned.items.every(item => item.owner === null));
    const outOfRange = await json<LeadDirectory>(api, `${prefix}?q=Bulk%20shared&page=4&pageSize=100`, admin!);
    assert.equal(outOfRange.items.length, 0);
    assert.equal(outOfRange.total, 251);
    for (const query of ['pageSize=101', 'page=0', 'intent=leasing&stage=won', 'source=invented', 'sort=unsafe', 'unknown=value'])
        await deny(api, `${prefix}?${query}`, admin!, 'GET', undefined, 400);
    const eventPage = await json<LeadDetail>(api, `${prefix}/${rental.id}?page=1&pageSize=2`, admin!);
    assert.equal(eventPage.events.items.length, 2);
    assert(eventPage.events.total > 2);
    pass('list/board search, filters, stable sorting, stage totals and 251-lead pagination stay on the server with 100-record caps and separately paged history');
    phase = 'fresh backend persistence and live grant revocation';
    const retained = await detail(lead.id);
    const retainedRental = await detail(rental.id);
    const retainedSale = await detail(sale.id);
    await api.close();
    const restarted = await start();
    assert.equal((await restarted.request('/api/auth/me', admin!)).status, 200, 'Normal persistent sessions survive a new backend instance.');
    assert.deepEqual((await json<LeadDetail>(restarted, `${prefix}/${lead.id}`, admin!)).lead, retained.lead);
    assert.deepEqual((await json<LeadDetail>(restarted, `${prefix}/${rental.id}`, admin!)).lead, retainedRental.lead);
    assert.deepEqual((await json<LeadDetail>(restarted, `${prefix}/${sale.id}`, admin!)).lead, retainedSale.lead);
    assert.equal((await json<LeadDetail>(restarted, `${prefix}/${lead.id}`, admin!)).events.total, retained.events.total);
    assert.equal((await restarted.request(`/api/properties/${properties[0]}/access/${userIds[2]}`, admin!, 'DELETE')).status, 204);
    await deny(restarted, `${prefix}/${lead.id}`, agent!);
    await deny(restarted, `${prefix}/${lead.id}`, agent!, 'PATCH', { version: lead.version, notes: 'Stale cookie cannot bypass grant revocation' });
    const revoked = await json<LeadDirectory>(restarted, prefix, agent!);
    assert.equal(revoked.total, 0);
    assert.equal((await json<DuplicateSuggestions>(restarted, `${prefix}/duplicate-suggestions?name=Same%20Name%20Example`, agent!)).items.length, 0);
    pass('lead edits, owners, stage/application/milestone/history and server sessions persist across a new backend instance; live property revocation immediately denies old cookies');
}
try {
    await main();
    console.log(`Stage 07 lead checks complete: ${groups} groups passed.`);
}
catch (error) {
    const detail = error instanceof assert.AssertionError ? error.message.split(/\r?\n/, 1)[0] : 'Raw database/process details intentionally omitted.';
    console.error(`Stage 07 lead checks failed during ${phase}: ${detail}`);
    process.exitCode = 1;
}
finally {
    try {
        for (const close of servers.reverse())
            await close();
        await database.close();
        if (ownsScratch) {
            await verifiedCluster();
            assert(/^ootla_demo_stage07_[a-f0-9]{32}$/.test(scratchName), 'Unexpected cleanup target.');
            const target = await owner.query<{
                owner: string;
            }>('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1', [scratchName]);
            assert(target.rowCount === 1 && target.rows[0]?.owner === 'ootla', 'Scratch ownership changed; refusing deletion.');
            const quoted = (await owner.query<{
                name: string;
            }>('SELECT quote_ident($1) AS name', [scratchName])).rows[0]!.name;
            await owner.query(`DROP DATABASE ${quoted}`);
            assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1', [scratchName])).rowCount, 0);
            console.log('PASS removed only the owned Stage 07 scratch database; retained demo data was never modified');
        }
    }
    catch {
        console.error('Stage 07 scratch cleanup failed. No unrelated database deletion was attempted.');
        process.exitCode = 1;
    }
    finally {
        if (ownerConnected)
            await owner.end();
    }
}
