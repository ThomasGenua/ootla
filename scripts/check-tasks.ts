import 'dotenv/config';
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
import type { LeadRecord } from '../shared/lead-contracts.js';
import type { WorkspaceTask } from '../shared/lead-workspace-contracts.js';
import type { TaskDetail, TaskDirectory, TaskOptions, TaskRecord, TaskReminder, TaskTeam } from '../shared/task-contracts.js';
import { processTaskReminders } from '../server/services/tasks.js';
import type { ApplicationRecord, Paginated } from '../shared/property-contracts.js';
// All test writes target one uniquely-created, owned scratch database. This check
// never migrates, seeds, resets, or changes the retained review database.
const root = path.resolve(import.meta.dirname, '..');
const source = loadConfig();
const sourceUrl = new URL(source.databaseUrl);
assert(source.demoMode && !source.production && /^ootla_demo(?:_[a-z0-9_]+)?$/.test(source.databaseName ?? ''), 'Stage 09 checks require the documented non-production isolated Ootla demo configuration.');
assert(sourceUrl.hostname === '127.0.0.1' && sourceUrl.port === '55439' && sourceUrl.username === 'ootla' && !sourceUrl.search && !sourceUrl.hash, 'Use the project-owned local PostgreSQL cluster and established restricted application role.');
const scratchName = `ootla_demo_stage09_${randomUUID().replaceAll('-', '')}`;
const scratchUrl = new URL(sourceUrl);
scratchUrl.pathname = `/${scratchName}`;
const config: ServerConfig = { ...source, nodeEnv: 'test', production: false, appUrl: 'http://ootla.test', databaseUrl: scratchUrl.toString(), databaseName: scratchName };
const ownerUrl = new URL(sourceUrl);
ownerUrl.username = 'ootla_cluster_owner';
ownerUrl.pathname = '/postgres';
const owner = new Client({ connectionString: ownerUrl.toString(), connectionTimeoutMillis: 5000 });
const database = new Database(config);
const prefix = '/api/leads';
const tasks = '/api/tasks';
const workspace = '/api/lead-workspaces';
const foundation = '/api/property-foundation';
const organizations = [randomUUID(), randomUUID()];
const roles = ['organization_admin', 'property_manager', 'leasing_agent', 'read_only_analyst', 'organization_admin', 'leasing_agent', 'leasing_agent'] as const;
const userIds = roles.map(() => randomUUID());
const membershipIds: string[] = roles.map(() => randomUUID());
const emails = userIds.map(id => `stage09-${id}@example.test`);
const password = `Stage09-${randomUUID()}!`;
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
const tables = ['organizations', 'users', 'organization_memberships', 'properties', 'property_access_assignments', 'units', 'leads', 'tasks', 'viewings', 'lead_activities', 'contacts', 'contact_property_links', 'households', 'household_property_links', 'household_members', 'applications', 'leases', 'external_record_mappings', 'demo_seed_records', 'lead_property_interests', 'lead_events', 'lease_verified_milestones', 'organization_data_settings', 'sessions', 'lead_workspace_events', 'lead_documents', 'provider_verified_updates'];
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
        assert(columns.length && columns.every(column => /^[a-z_][a-z0-9_]*$/.test(column)) && /^[a-z_]+$/.test(table), 'Snapshot table ' + table + ' must expose safe existing column names.');
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
    assert(/^ootla_demo_stage09_[a-f0-9]{32}$/.test(scratchName));
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
    for (const name of ['001_foundation.sql', '002_staff_roles_property_access.sql', '003_demo_dataset.sql', '004_property_contact_foundation.sql', '005_lead_pipeline.sql', '006_lead_workspace.sql']) {
        const sql = await readFile(path.join(root, 'migrations', name), 'utf8');
        await database.transaction(async (client) => {
            await client.query(sql.replace(/^\uFEFF/, ''));
            await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name, createHash('sha256').update(sql).digest('hex')]);
        });
    }
    const passwordHash = await hashPassword(password);
    await database.transaction(async (client) => {
        for (const [index, id] of organizations.entries()) {
            await client.query("INSERT INTO organizations(id,name,slug,environment) VALUES($1,$2,$3,'demo')", [id, `Stage 09 scratch ${index}`, `stage09-${randomUUID()}`]);
        }
        for (const [index, id] of userIds.entries()) {
            await client.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)', [id, emails[index], `Stage 09 ${roles[index]} ${index}`, passwordHash]);
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
                await client.query(await readFile(path.join(root, 'migrations/007_tasks_reminders.sql'), 'utf8'));
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
    return { close, request, base, login: async (index: number) => {
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
const marker = 'Stage09 focused';
const oldTask = randomUUID(), oldViewing = randomUUID();
const due = (minutes: number) => new Date(Date.now() + minutes * 60000).toISOString();
const taskRow = async (id: string) => (await database.query('SELECT * FROM tasks WHERE id=$1', [id])).rows[0]!;
const reminders = async (id: string) => (await database.query('SELECT * FROM task_reminders WHERE task_id=$1 ORDER BY created_at,id', [id])).rows;
const notifications = async (id: string) => (await database.query('SELECT n.* FROM task_notifications n JOIN task_reminders r ON r.id=n.reminder_id WHERE r.task_id=$1', [id])).rows;
async function historic() {
    await database.query("INSERT INTO tasks(id,organization_id,property_id,lead_id,title,due_at,status,seed_key) VALUES($1,$2,$3,$4,'Original follow up','2025-01-01T10:00:00Z','open','stage03.task.stage09-check')", [oldTask, organizations[0], properties[0], legacyLeads[0]]);
    await database.query("INSERT INTO viewings(id,organization_id,property_id,lead_id,unit_id,starts_at,status) VALUES($1,$2,$3,$4,$5,'2025-03-01T10:00:00Z','scheduled')", [oldViewing, organizations[0], properties[0], legacyLeads[0], units[0]]);
}
async function main() {
    await createScratch();
    phase = 'baseline 001 through 006';
    await installBaseline();
    phase = 'old task and tour fixtures';
    await historic();
    phase = 'pre-migration old-column snapshot';
    const before = await snapshot();
    phase = 'additive migration 007 preservation';
    await utility();
    assert.equal(await database.state(), 'ready');
    assert.deepEqual(await snapshot(before), before, 'All old column values including task timestamps, hashes and identities must be preserved.');
    await utility();
    const migrations = (await database.query<{
        name: string;
        checksum: string;
    }>('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;
    assert.equal(migrations.length, 7);
    for (const row of migrations)
        assert.equal(row.checksum, createHash('sha256').update(await readFile(path.join(root, 'migrations', row.name), 'utf8')).digest('hex'));
    assert.equal((await database.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conname='tasks_tour_tenant_fkey'")).rows[0]?.n, 1, 'Task tours need a real composite tenant/property foreign key.');
    assert.equal((await taskRow(oldTask)).origin, 'demo');
    assert.equal((await reminders(oldTask)).length, 0, 'Migration must not fabricate due notifications or tasks.');
    pass('additive migration preserves every prior column, record, password and timestamp; seven immutable migration checksums and typed tour FK are verified');
    phase = 'ordinary explicit seed compatibility';
    await utility('scripts/seed.ts');
    const seeded = await snapshot();
    await utility('scripts/seed.ts');
    assert.deepEqual(await snapshot(seeded), seeded);
    assert.equal((await database.query("SELECT count(*)::int AS n FROM tasks WHERE seed_key LIKE 'stage03.%' AND origin<>'demo'")).rows[0]!.n, 0, 'Fresh explicit demo seeds must retain demo origin.');
    pass('explicit demo seeding remains repeatable without duplicated tasks, overwritten records or fabricated reminders');
    const api = await start();
    const [admin, manager, agent, analyst, otherAdmin, unassigned] = await Promise.all([0, 1, 2, 3, 4, 6].map(i => api.login(i)));
    assert(admin && manager && agent && analyst && otherAdmin && unassigned);
    const create = async (input: Record<string, unknown>, cookie = admin) => (await json<{
        task: TaskRecord;
    }>(api, tasks, cookie, 'POST', { propertyId: properties[0], title: marker, dueAt: due(-60), ...input }, 201)).task;
    const detail = (id: string, cookie = admin) => json<TaskDetail>(api, `${tasks}/${id}`, cookie);
    const update = async (task: TaskRecord, input: Record<string, unknown>, cookie = admin) => (await json<{
        task: TaskRecord;
    }>(api, `${tasks}/${task.id}`, cookie, 'PATCH', { version: task.version, ...input })).task;
    const directory = (query = '', cookie = admin) => json<TaskDirectory>(api, `${tasks}?view=team${query ? '&' + query : ''}`, cookie);
    phase = 'real-cookie staff task authorization';
    for (const route of [tasks, `${tasks}/options`, `${tasks}/reminders`, `${tasks}/follow-ups`])
        await deny(api, route, '', 'GET', undefined, 401);
    await deny(api, tasks, analyst);
    await deny(api, tasks, unassigned, 'POST', { propertyId: properties[0], title: 'No grant', dueAt: due(60) });
    const portal = randomUUID(), portalEmail = `portal-${randomUUID()}@example.test`;
    await database.query("INSERT INTO users(id,email,display_name,password_hash,account_kind) SELECT $1,$2,'Portal identity',password_hash,'applicant' FROM users WHERE id=$3", [portal, portalEmail, userIds[0]]);
    await deny(api, '/api/auth/login', '', 'POST', { email: portalEmail, password }, 401);
    await deny(api, '/api/auth/login', '', 'POST', { email: emails[5], password }, 401);
    const foreign = (await json<{
        task: TaskRecord;
    }>(api, tasks, otherAdmin, 'POST', { propertyId: properties[2], title: 'Other organization private task', dueAt: due(-60), ownerMembershipId: membershipIds[4] }, 201)).task;
    await deny(api, `${tasks}/${foreign.id}`, admin);
    await deny(api, `${tasks}/${oldTask}`, otherAdmin);
    await deny(api, `${tasks}/${oldTask}`, unassigned);
    await deny(api, `${tasks}/${oldTask}`, analyst);
    const badOrigin = await fetch(`${api.base}${tasks}`, { method: 'POST', headers: { Cookie: admin, Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: properties[0], title: 'Invalid origin', dueAt: due(60) }) });
    assert.equal(badOrigin.status, 403);
    pass('normal hashed-password sessions enforce staff-only organization/property scope on queues and details; invalid/inactive identities and cross-origin mutations are rejected');
    phase = 'typed canonical task links and persistence';
    const contactId = (await database.query<{
        contact_id: string;
    }>('SELECT contact_id FROM leads WHERE id=$1', [legacyLeads[0]])).rows[0]!.contact_id;
    const appId = (await database.query<{
        id: string;
    }>('SELECT id FROM applications WHERE lead_id=$1 ORDER BY created_at LIMIT 1', [legacyLeads[0]])).rows[0]!.id;
    let manual = await create({ title: marker + ' manual owner', leadId: legacyLeads[0], ownerMembershipId: membershipIds[2], priority: 'high', details: 'Private staff follow-up' });
    assert.equal(manual.leadId, legacyLeads[0]);
    assert.equal(manual.contactId, contactId);
    assert.equal(manual.owner?.membershipId, membershipIds[2]);
    assert.equal(manual.status, 'open');
    assert.equal(manual.priority, 'high');
    assert.equal(manual.origin, 'manual');
    assert(manual.overdue);
    assert(manual.relatedUrl.includes(legacyLeads[0]));
    const propertyTask = await create({ title: marker + ' property', leadId: null, contactId: null });
    assert.equal(propertyTask.leadId, null);
    assert.equal(propertyTask.contactId, null);
    const contactTask = await create({ title: marker + ' contact', contactId });
    assert.equal(contactTask.contactId, contactId);
    assert.equal(contactTask.leadId, null);
    const appTask = await create({ title: marker + ' application', applicationId: appId });
    assert.equal(appTask.applicationId, appId);
    assert.equal(appTask.leadId, legacyLeads[0]);
    assert.equal(appTask.contactId, contactId);
    const tourTask = await create({ title: marker + ' tour', tourId: oldViewing });
    assert.equal(tourTask.tourId, oldViewing);
    assert.equal(tourTask.leadId, legacyLeads[0]);
    assert.equal(tourTask.contactId, contactId);
    assert.deepEqual(appTask.linkedRecord, {kind:'application',id:appId,status:'draft',startsAt:null,available:true});
    assert.deepEqual(tourTask.linkedRecord, {kind:'tour',id:oldViewing,status:'scheduled',startsAt:'2025-03-01T10:00:00.000Z',available:true});
    assert.equal(appTask.relatedUrl, '/admin/leads?lead='+legacyLeads[0]);
    assert.equal(appTask.relatedLabel, 'Open lead context for application');
    assert.equal(tourTask.relatedLabel, 'Open lead context for tour');
    assert.equal(manual.unitDescription, '2-bedroom unit');
    for (const [propertyType, noun] of [['house','house'],['townhomes','townhome'],['apartment','apartment'],['residential','unit']]) {
        await database.query('UPDATE properties SET property_type=$2 WHERE id=$1',[properties[0],propertyType]);
        assert.equal((await detail(manual.id)).task.unitDescription,'2-bedroom '+noun);
    }
    const linkedApp=await update(appTask,{ownerMembershipId:membershipIds[2]});
    const linkedTour=await update(tourTask,{ownerMembershipId:membershipIds[2]});
    await processTaskReminders(database,{batchSize:100});
    assert.equal((await notifications(linkedApp.id)).length,1);
    assert.equal((await notifications(linkedTour.id)).length,1);
    await database.query('UPDATE applications SET lead_id=NULL WHERE id=$1',[appId]);
    await database.query('UPDATE viewings SET lead_id=$2 WHERE id=$1',[oldViewing,legacyLeads[1]]);
    const staleApp=(await detail(linkedApp.id)).task,staleTour=(await detail(linkedTour.id)).task;
    assert.deepEqual(staleApp.linkedRecord,{kind:'application',id:appId,status:null,startsAt:null,available:false});
    assert.deepEqual(staleTour.linkedRecord,{kind:'tour',id:oldViewing,status:null,startsAt:null,available:false});
    assert.equal(staleApp.actionable,false);assert.equal(staleTour.actionable,false);
    const staleInbox=await json<Paginated<TaskReminder>>(api,`${tasks}/reminders?pageSize=100`,agent);
    assert(!staleInbox.items.some(r=>r.taskId===linkedApp.id||r.taskId===linkedTour.id),'Changed application/tour context must be concealed before worker reconciliation.');
    await processTaskReminders(database,{batchSize:100});
    assert((await reminders(linkedApp.id)).every(r=>r.status==='cancelled'));
    assert((await reminders(linkedTour.id)).every(r=>r.status==='cancelled'));
    await database.query('UPDATE applications SET lead_id=$2 WHERE id=$1',[appId,legacyLeads[0]]);
    await database.query('UPDATE viewings SET lead_id=$2 WHERE id=$1',[oldViewing,legacyLeads[0]]);
    assert.equal((await detail(manual.id, agent)).task.id, manual.id);
    assert((await detail(manual.id)).history.items.some(event => event.kind === 'created' && event.actor?.id === userIds[0]));
    for (const input of [{ leadId: legacyLeads[4] }, { applicationId: appId, leadId: legacyLeads[1] }, { tourId: oldViewing, leadId: legacyLeads[1] }, { contactId: (await taskRow(foreign.id)).contact_id, propertyId: properties[2] }, { leadId: legacyLeads[0], contactId: (await database.query('SELECT contact_id FROM leads WHERE id=$1', [legacyLeads[1]])).rows[0]!.contact_id }])
        await deny(api, tasks, agent, 'POST', { propertyId: properties[0], title: 'Wrong task relationship', dueAt: due(60), ...input }, [400, 403, 404]);
    for (const extra of [{ origin: 'system' }, { origin: 'ai_simulation' }, { createdByUserId: userIds[4] }, { status: 'completed' }, { completedAt: new Date().toISOString() }, { dueAt: 'tomorrow' }, { priority: 'critical' }, { surprise: 'unknown' }])
        await deny(api, tasks, admin, 'POST', { propertyId: properties[0], title: 'Invalid or forged task metadata', dueAt: due(60), ...extra }, 400);
    await rejectsSql("INSERT INTO tasks(organization_id,property_id,lead_id,contact_id,title,due_at,application_id) VALUES($1,$2,$3,$4,'Mismatch context',now(),$5)", [organizations[0], properties[0], legacyLeads[1], contactId, appId], '23514', 'Application context cannot be grafted to another lead.');
    await rejectsSql("INSERT INTO tasks(organization_id,property_id,title,due_at,tour_id) VALUES($1,$2,'Missing tour',now(),$3)", [organizations[0], properties[0], randomUUID()], '23514', 'Nonexistent tours must not persist.');
    pass('property/contact/lead/application/tour tasks preserve canonical links and truthful typed context; changed relationships conceal metadata and cancel reminders, property nouns remain accurate, and constraints reject forged origin or mismatches');
    phase = 'manual assignment eligibility and versioned completion history';
    for (const ownerMembershipId of [membershipIds[3], membershipIds[4], membershipIds[5], membershipIds[6]])
        await deny(api, tasks, admin, 'POST', { propertyId: properties[0], leadId: legacyLeads[0], title: 'Ineligible owner', dueAt: due(60), ownerMembershipId }, [400, 403, 404]);
    const oldVersion = manual.version, oldDue = manual.dueAt;
    manual = await update(manual, { title: marker + ' edited', ownerMembershipId: membershipIds[1] }, agent);
    assert.equal(manual.dueAt, oldDue);
    assert.equal(manual.priority, 'high');
    assert.equal(manual.owner?.membershipId, membershipIds[1]);
    assert.equal(manual.version, oldVersion + 1);
    await deny(api, `${tasks}/${manual.id}`, agent, 'PATCH', { version: oldVersion, status: 'completed' }, 409);
    manual = await update(manual, { status: 'completed' }, manager);
    assert.equal(manual.status, 'completed');
    assert.equal(manual.completedBy?.id, userIds[1]);
    assert(manual.completedAt && Math.abs(Date.parse(manual.completedAt) - Date.now()) < 60000);
    manual = await update(manual, { status: 'open' }, manager);
    assert.equal(manual.completedAt, null);
    assert.equal(manual.completedBy, null);
    const history = (await detail(manual.id)).history.items;
    assert(history.some(e => e.kind === 'completed' && e.actor?.id === userIds[1]));
    assert(history.some(e => e.kind === 'reopened' && e.actor?.id === userIds[1]));
    for (let i = 1; i < history.length; i++)
        assert(Date.parse(history[i - 1]!.occurredAt) >= Date.parse(history[i]!.occurredAt));
    pass('manual owners must be active authorized staff; optimistic edits preserve omitted fields and completion/reopening retains the server actor, timestamp and ordered history');
    phase = 'server-side My and Team queues, overdue and stable pagination';
    for (let i = 0; i < 17; i++)
        await create({ title: marker + ` pagination ${String(i).padStart(2, '0')}`, ownerMembershipId: i % 2 ? membershipIds[0] : membershipIds[2], dueAt: i % 2 ? '2027-04-10T12:00:00+02:00' : '2020-04-10T12:00:00-05:00', priority: i % 3 ? 'normal' : 'urgent' });
    const all = await directory('q=' + encodeURIComponent(marker) + '&pageSize=100');
    assert(all.total >= 22);
    assert(all.items.length <= 100);
    assert(all.items.every(t => t.propertyId === properties[0]));
    const seen: string[] = [];
    for (let p = 1; p <= Math.ceil(all.total / 3); p++) {
        const page = await directory(`q=${encodeURIComponent(marker)}&pageSize=3&page=${p}`);
        assert.equal(page.total, all.total);
        assert(page.items.length <= 3);
        seen.push(...page.items.map(t => t.id));
    }
    assert.deepEqual(seen, all.items.map(t => t.id));
    assert.equal(new Set(seen).size, all.total);
    const mine = await json<TaskDirectory>(api, `${tasks}?view=my&q=${encodeURIComponent(marker)}&pageSize=100`, agent);
    assert(mine.total > 0 && mine.items.every(t => t.owner?.membershipId === membershipIds[2]));
    const overdue = await directory(`q=${encodeURIComponent(marker)}&overdue=true&pageSize=100`);
    assert(overdue.total > 0 && overdue.items.every(t => t.overdue && Date.parse(t.dueAt) < Date.now()));
    assert((await directory(`q=${encodeURIComponent(marker)}&priority=urgent&pageSize=100`)).items.every(t => t.priority === 'urgent'));
    assert((await directory(`ownerMembershipId=${membershipIds[1]}&pageSize=100`)).items.every(t => t.owner?.membershipId === membershipIds[1]));
    for (const query of ['pageSize=101', 'page=0', 'view=platform', 'sort=sql', 'unknown=true'])
        await deny(api, `${tasks}?${query}`, admin, 'GET', undefined, 400);
    pass('My/Team queues use server-side text/property/owner/priority/overdue filters and stable bounded pages; explicit timezone offsets represent real instants');
    phase = 'property/team routing and unassigned fallback';
    const team = (await json<{
        team: TaskTeam;
    }>(api, `${tasks}/teams`, admin, 'POST', { name: 'Stage 09 eligible team', membershipIds: [membershipIds[1], membershipIds[2]] }, 201)).team;
    await deny(api, `${tasks}/teams`, agent, 'POST', { name: 'Not administrator', membershipIds: [membershipIds[2]] });
    await deny(api, `${tasks}/teams`, admin, 'POST', { name: 'Wrong organization member', membershipIds: [membershipIds[4]] }, [400, 403, 404]);
    await json(api, `${tasks}/routing-rules`, admin, 'POST', { propertyId: properties[0], teamId: team.id, enabled: true });
    const routed = await Promise.all(Array.from({ length: 12 }, (_, i) => create({ title: marker + ' routed ' + i, assignment: 'routing' })));
    assert(routed.every(t => t.assignment === 'routing' && t.team?.id === team.id && [membershipIds[1], membershipIds[2]].includes(t.owner?.membershipId ?? '')));
    assert(routed.some(t => t.owner?.membershipId === membershipIds[1]) && routed.some(t => t.owner?.membershipId === membershipIds[2]), 'Serialized least-open routing should use both eligible staff.');
    await json(api, `${tasks}/routing-rules`, admin, 'POST', { propertyId: properties[1], teamId: team.id, enabled: true });
    const fallback = await create({ propertyId: properties[1], title: marker + ' no eligible routing', assignment: 'routing' });
    assert.equal(fallback.owner, null);
    assert(fallback.assignmentNotice);
    await deny(api, `${tasks}/${fallback.id}`, agent);
    assert.equal((await database.query('SELECT 1 FROM property_access_assignments WHERE membership_id=$1 AND property_id=$2', [membershipIds[2], properties[1]])).rowCount, 0, 'A team never grants property access.');
    const unowned = await json<TaskDirectory>(api, `${tasks}?view=unassigned&pageSize=100`, admin);
    assert(unowned.items.some(t => t.id === fallback.id));
    const options = await json<TaskOptions>(api, `${tasks}/options?propertyId=${properties[0]}&leadId=${legacyLeads[0]}`, admin);
    assert(options.owners.every(o => ![membershipIds[3], membershipIds[4], membershipIds[5], membershipIds[6]].includes(o.membershipId)));
    assert.equal(options.reminderPolicy.channel, 'in_app');
    assert.equal(options.reminderPolicy.maximumAttempts, 3);
    pass('configurable property/team routing selects eligible staff under concurrent creation and leaves work visibly unassigned when none qualify; team membership grants no property access');
    phase = 'pure bounded overview follow-ups and full-interest protection';
    const countBefore = (await database.query('SELECT count(*)::int AS n FROM tasks')).rows[0]!.n;
    const firstFollow = await json<{
        items: TaskRecord[];
        limit: number;
    }>(api, `${tasks}/follow-ups`, admin);
    assert(firstFollow.items.length <= 3);
    assert.equal(firstFollow.limit, 3);
    assert(firstFollow.items.every(t => t.status === 'open' && t.actionable));
    for (let i = 0; i < 4; i++)
        await json(api, `${tasks}/follow-ups`, admin);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM tasks')).rows[0]!.n, countBefore, 'Refreshing queues cannot create tasks.');
    const multi = (await json<{
        lead: LeadRecord;
    }>(api, prefix, admin, 'POST', { propertyId: properties[0], newContact: { displayName: 'Multi-interest Stage 09', email: `multi-${randomUUID()}@example.test` }, ownerMembershipId: membershipIds[0] }, 201)).lead;
    await json(api, `${foundation}/contacts/${multi.contactId}/properties`, admin, 'POST', { propertyId: properties[1] });
    await json(api, `${prefix}/${multi.id}`, admin, 'PATCH', { version: multi.version, interestPropertyIds: [properties[0], properties[1]] });
    const privateTask = await create({ leadId: multi.id, title: 'STAGE09_HIDDEN_MULTIPROPERTY_TASK', ownerMembershipId: membershipIds[0] });
    await deny(api, `${tasks}/${privateTask.id}`, agent);
    const agentQueue = await directory('pageSize=100', agent);
    assert(!agentQueue.items.some(t => t.id === privateTask.id));
    await deny(api, `${tasks}/${privateTask.id}`, agent, 'PATCH', { version: privateTask.version, status: 'completed' });
    await deny(api, tasks, admin, 'POST', { propertyId: properties[0], leadId: multi.id, title: 'Owner misses other interest', dueAt: due(60), ownerMembershipId: membershipIds[2] }, [400, 403, 404]);
    pass('overview returns at most three real actionable records through pure reads; longer queues stay paginated and partial access to any lead interest denies private tasks and assignment');
    phase = 'durable in-app reminder deduplication and concurrency';
    let reminded = await create({ title: marker + ' reminder dedupe', ownerMembershipId: membershipIds[2], dueAt: due(-30) });
    assert.equal((await reminders(reminded.id)).length, 1, 'Task creation schedules one durable reminder.');
    const notificationBefore = await notifications(reminded.id);
    assert.equal(notificationBefore.length, 0);
    await Promise.all(Array.from({ length: 4 }, () => processTaskReminders(database, { batchSize: 100 })));
    let reminderRows = await reminders(reminded.id);
    assert.equal(reminderRows.length, 1);
    assert.equal(reminderRows[0]!.status, 'delivered');
    assert.equal(reminderRows[0]!.attempts, 1);
    assert.equal((await notifications(reminded.id)).length, 1);
    for (let i = 0; i < 3; i++)
        await processTaskReminders(database, { batchSize: 100 });
    assert.equal((await notifications(reminded.id)).length, 1, 'Repeated polling/worker processing cannot duplicate an inbox item.');
    const inbox = await json<Paginated<TaskReminder>>(api, `${tasks}/reminders?pageSize=100`, agent);
    let ownReminder = inbox.items.find(r => r.taskId === reminded.id);
    assert(ownReminder);
    assert.equal(ownReminder.status, 'delivered');
    assert(ownReminder.deliveredAt);
    assert(ownReminder.canSnooze);
    assert(!(await json<Paginated<TaskReminder>>(api, `${tasks}/reminders?pageSize=100`, manager)).items.some(r => r.taskId === reminded.id));
    assert(!(await json<Paginated<TaskReminder>>(api, `${tasks}/reminders?pageSize=100`, otherAdmin)).items.some(r => r.taskId === reminded.id));
    pass('durable unique task-generation-recipient reminders and concurrent processors produce exactly one in-app notification; repeated processing, refresh and other inboxes cannot duplicate or reveal it');
    phase = 'recipient-only snooze policy with bounded redisplay';
    await deny(api, `${tasks}/reminders/${ownReminder.id}/snooze`, manager, 'POST', { minutes: 15 });
    for (const minutes of [0, 1, 14, 30, 61, 1441, 10080])
        await deny(api, `${tasks}/reminders/${ownReminder.id}/snooze`, agent, 'POST', { minutes }, 400);
    for (let count = 1; count <= 3; count++) {
        const snoozed: TaskReminder = (await json<{
            reminder: TaskReminder;
        }>(api, `${tasks}/reminders/${ownReminder.id}/snooze`, agent, 'POST', { minutes: count === 1 ? 15 : count === 2 ? 60 : 1440 })).reminder;
        assert.equal(snoozed.status, 'snoozed');
        assert.equal(snoozed.snoozeCount, count);
        assert(snoozed.snoozedUntil && Date.parse(snoozed.snoozedUntil) > Date.now());
        assert(Date.parse(snoozed.snoozedUntil!) <= Date.now() + 7 * 86400000);
        assert.equal((await notifications(reminded.id)).length, 1);
        await processTaskReminders(database, { batchSize: 100 });
        assert.equal((await notifications(reminded.id)).length, 1);
        await database.query("UPDATE task_reminders SET next_attempt_at=now()-interval '1 second',snoozed_until=now()-interval '1 second' WHERE task_id=$1 AND status<>'cancelled'", [reminded.id]);
        await processTaskReminders(database, { batchSize: 100 });
        const next = (await json<Paginated<TaskReminder>>(api, `${tasks}/reminders?pageSize=100`, agent)).items.find(r => r.taskId === reminded.id);
        assert(next);
        assert.equal(next.status, 'delivered');
        ownReminder = next;
    }
    await deny(api, `${tasks}/reminders/${ownReminder.id}/snooze`, agent, 'POST', { minutes: 15 }, [400, 409]);
    assert.equal((await notifications(reminded.id)).length, 1);
    assert.equal((await reminders(reminded.id))[0]!.snooze_count, 3);
    const deadlineTask = await create({ title: marker + ' snooze deadline', ownerMembershipId: membershipIds[2], dueAt: due(-10) });
    await processTaskReminders(database, { batchSize: 100 });
    await database.query("UPDATE task_notifications n SET created_at=now()-interval '7 days' FROM task_reminders r WHERE n.reminder_id=r.id AND r.task_id=$1", [deadlineTask.id]);
    const expiredDeadline = (await json<Paginated<TaskReminder>>(api, `${tasks}/reminders?pageSize=100`, agent)).items.find(r => r.taskId === deadlineTask.id);
    assert(expiredDeadline);
    assert.equal(expiredDeadline.canSnooze, false);
    await deny(api, `${tasks}/reminders/${expiredDeadline.id}/snooze`, agent, 'POST', { minutes: 15 }, 409);
    pass('only the current recipient can snooze at 15 minutes, 1 hour or 1 day, at most three times and within seven days of first delivery; redisplay preserves notification identity and expired/invalid policy requests reject');
    phase = 'actual delivery faults, savepoint rollback and bounded retries';
    const poison = await create({ title: 'STAGE09_RETRY_POISON', ownerMembershipId: membershipIds[2], dueAt: due(-15) });
    await database.query("CREATE FUNCTION stage09_poison_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM task_reminders r JOIN tasks t ON t.id=r.task_id WHERE r.id=NEW.reminder_id AND t.title='STAGE09_RETRY_POISON') THEN RAISE EXCEPTION 'owned scratch delivery fault'; END IF; RETURN NEW; END; $$");
    await database.query('CREATE TRIGGER stage09_notification_fault BEFORE INSERT ON task_notifications FOR EACH ROW EXECUTE FUNCTION stage09_poison_notification()');
    await processTaskReminders(database, { batchSize: 100 });
    let poisoned = (await reminders(poison.id))[0]!;
    assert.equal(poisoned.attempts, 1);
    assert.equal(poisoned.status, 'retry');
    assert(new Date(poisoned.next_attempt_at).getTime() > Date.now() + 20000, 'A real failed insert must persist a bounded future backoff after savepoint rollback.');
    assert.equal((await notifications(poison.id)).length, 0);
    await processTaskReminders(database, { batchSize: 100 });
    assert.equal((await reminders(poison.id))[0]!.attempts, 1, 'Retry must not spin before backoff expires.');
    for (let attempt = 2; attempt <= 3; attempt++) {
        await database.query("UPDATE task_reminders SET next_attempt_at=now()-interval '1 second' WHERE task_id=$1", [poison.id]);
        await processTaskReminders(database, { batchSize: 100 });
        poisoned = (await reminders(poison.id))[0]!;
        assert.equal(poisoned.attempts, attempt);
        assert.equal(poisoned.status, attempt === 3 ? 'failed' : 'retry');
    }
    const recover = await create({ title: 'STAGE09_RETRY_POISON', ownerMembershipId: membershipIds[2], dueAt: due(-15) });
    await processTaskReminders(database, { batchSize: 100 });
    assert.equal((await reminders(recover.id))[0]!.status, 'retry');
    await database.query('DROP TRIGGER stage09_notification_fault ON task_notifications');
    await database.query('DROP FUNCTION stage09_poison_notification()');
    await database.query("UPDATE task_reminders SET next_attempt_at=now()-interval '1 second' WHERE task_id=$1", [recover.id]);
    await processTaskReminders(database, { batchSize: 100 });
    assert.equal((await reminders(recover.id))[0]!.status, 'delivered');
    assert.equal((await reminders(recover.id))[0]!.attempts, 2);
    assert.equal((await notifications(recover.id)).length, 1);
    for (let i = 0; i < 3; i++)
        await processTaskReminders(database, { batchSize: 100 });
    assert.equal((await reminders(poison.id))[0]!.status, 'failed');
    assert.equal((await reminders(poison.id))[0]!.attempts, 3);
    assert.equal((await notifications(poison.id)).length, 0);
    pass('real database delivery failures roll back safely while persisting attempt/backoff state; three failed attempts are terminal and later workers do not retry forever');
    phase = 'completion, cancellation, reassignment and irrelevance cancellation';
    phase = 'completion cancellation';
    reminded = await update(reminded, { status: 'completed' }, agent);
    assert((await reminders(reminded.id)).every(r => r.status === 'cancelled'));
    assert(!(await json<Paginated<TaskReminder>>(api, `${tasks}/reminders?pageSize=100`, agent)).items.some(r => r.taskId === reminded.id));
    await deny(api, `${tasks}/reminders/${ownReminder.id}/snooze`, agent, 'POST', { minutes: 15 }, [400, 404, 409]);
    phase = 'explicit task cancellation';
    let cancelled = await create({ title: marker + ' cancel reminder', ownerMembershipId: membershipIds[2], dueAt: due(-20) });
    cancelled = await update(cancelled, { status: 'cancelled' });
    await processTaskReminders(database, { batchSize: 100 });
    assert((await reminders(cancelled.id)).every(r => r.status === 'cancelled'));
    assert.equal((await notifications(cancelled.id)).length, 0);
    phase = 'owner reassignment cancellation';
    let reassigned = await create({ title: marker + ' reassign reminder', ownerMembershipId: membershipIds[2], dueAt: due(-20) });
    await processTaskReminders(database, { batchSize: 100 });
    const oldRecipient = (await reminders(reassigned.id))[0]!.id;
    reassigned = await update(reassigned, { ownerMembershipId: membershipIds[1] });
    assert.equal((await database.query('SELECT status FROM task_reminders WHERE id=$1', [oldRecipient])).rows[0]!.status, 'cancelled');
    await processTaskReminders(database, { batchSize: 100 });
    assert(!(await json<Paginated<TaskReminder>>(api, `${tasks}/reminders?pageSize=100`, agent)).items.some(r => r.taskId === reassigned.id));
    assert((await json<Paginated<TaskReminder>>(api, `${tasks}/reminders?pageSize=100`, manager)).items.some(r => r.taskId === reassigned.id));
    phase = 'closed-lead cancellation';
    const irrelevant = await create({ title: marker + ' closed lead', leadId: legacyLeads[2], ownerMembershipId: membershipIds[2], dueAt: due(-20) });
    await processTaskReminders(database, { batchSize: 100 });
    await database.query("UPDATE leads SET pipeline_stage='lost_closed' WHERE id=$1", [legacyLeads[2]]);
    assert((await reminders(irrelevant.id)).every(r => r.status === 'cancelled'));
    assert.equal((await detail(irrelevant.id)).task.actionable, false);
    phase = 'cancelled-tour cancellation';
    const cancelledTour = await create({ title: marker + ' cancelled tour', tourId: oldViewing, ownerMembershipId: membershipIds[2], dueAt: due(-20) });
    await database.query("UPDATE viewings SET status='cancelled' WHERE id=$1", [oldViewing]);
    assert((await reminders(cancelledTour.id)).every(r => r.status === 'cancelled'));
    await processTaskReminders(database, { batchSize: 100 });
    assert(!(await json<Paginated<TaskReminder>>(api, `${tasks}/reminders?pageSize=100`, agent)).items.some(r => r.taskId === cancelledTour.id));
    assert.equal((await reminders(fallback.id)).length, 0, 'Unassigned work must not send reminders to an invented recipient.');
    phase = 'concurrent completion/delivery cancellation';
    const race = await create({ title: marker + ' completion race', ownerMembershipId: membershipIds[2], dueAt: due(-10000) });
    await Promise.all([processTaskReminders(database, { batchSize: 1 }), update(race, { status: 'completed' }, agent)]);
    await processTaskReminders(database, { batchSize: 100 });
    assert.equal((await detail(race.id)).task.status, 'completed');
    assert((await reminders(race.id)).every(r => r.status === 'cancelled'));
    assert(!(await json<Paginated<TaskReminder>>(api, `${tasks}/reminders?pageSize=100`, agent)).items.some(r => r.taskId === race.id));
    pass('completed/cancelled tasks, closed leads, cancelled tours and changed recipients cancel reminders; concurrent completion/delivery cannot deadlock or expose stale work, and unassigned tasks invent no recipient');
    phase = 'Stage 08 workspace compatibility';
    let workspaceTask = (await json<{
        task: WorkspaceTask;
    }>(api, `${workspace}/${legacyLeads[1]}/tasks`, agent, 'POST', { title: marker + ' workspace task', dueAt: due(-10), ownerMembershipId: membershipIds[2] }, 201)).task;
    assert.equal((await detail(workspaceTask.id)).task.leadId, legacyLeads[1]);
    assert((await detail(workspaceTask.id)).history.items.some(e => e.kind === 'created'));
    assert.equal((await reminders(workspaceTask.id)).length, 1);
    await processTaskReminders(database, { batchSize: 100 });
    assert.equal((await notifications(workspaceTask.id)).length, 1);
    workspaceTask = (await json<{
        task: WorkspaceTask;
    }>(api, `${workspace}/${legacyLeads[1]}/tasks/${workspaceTask.id}`, agent, 'PATCH', { version: workspaceTask.version, status: 'completed' })).task;
    assert.equal(workspaceTask.status, 'completed');
    assert((await reminders(workspaceTask.id)).every(r => r.status === 'cancelled'));
    assert((await detail(workspaceTask.id)).history.items.some(e => e.kind === 'completed'));
    pass('existing lead workspace task creation and completion share the central queue, durable reminder cancellation and actor history without duplicate identities');
    phase = 'new backend persistence and current-grant reminder privacy';
    const persistent = await detail(manual.id), persistReminders = await reminders(reassigned.id);
    await api.close();
    const fresh = await start();
    assert.equal((await fresh.request('/api/auth/me', admin)).status, 200);
    assert.deepEqual(await json<TaskDetail>(fresh, `${tasks}/${manual.id}`, admin), persistent);
    assert.deepEqual(await reminders(reassigned.id), persistReminders);
    await processTaskReminders(database, { batchSize: 100 });
    assert.equal((await reminders(reassigned.id)).filter(r => r.status === 'delivered').length, 1);
    await database.query('UPDATE organization_memberships SET active=false WHERE id=$1', [membershipIds[1]]);
    await deny(fresh, `${tasks}/${manual.id}`, manager, 'GET', undefined, 401);
    await processTaskReminders(database, { batchSize: 100 });
    assert((await reminders(reassigned.id)).every(r => r.status === 'cancelled'));
    const revTask = (await json<{
        task: TaskRecord;
    }>(fresh, tasks, admin, 'POST', { propertyId: properties[0], title: marker + ' live grant revoked', dueAt: due(-10), ownerMembershipId: membershipIds[2] }, 201)).task;
    await processTaskReminders(database, { batchSize: 100 });
    await database.query('DELETE FROM property_access_assignments WHERE membership_id=$1', [membershipIds[2]]);
    await deny(fresh, `${tasks}/${revTask.id}`, agent);
    const revokedInbox = await json<Paginated<TaskReminder>>(fresh, `${tasks}/reminders?pageSize=100`, agent);
    assert(!revokedInbox.items.some(r => r.taskId === revTask.id), 'UI reads must conceal revoked records before the worker catches up.');
    await processTaskReminders(database, { batchSize: 100 });
    assert((await reminders(revTask.id)).every(r => r.status === 'cancelled'));
    pass('tasks, ordered history, durable reminder generations and normal sessions survive a new backend/pool; membership/property revocation conceals and cancels reminders immediately');
}
try {
    await main();
    console.log(`Stage 09 task checks complete: ${groups} groups passed.`);
}
catch (error) {
    const detail = error instanceof assert.AssertionError ? error.message.split(/\r?\n/, 1)[0] : JSON.stringify({ name: error instanceof Error ? error.name : 'unknown', code: (error as {
            code?: string;
        })?.code, frame: error instanceof Error ? error.stack?.split(/\r?\n/).find(line => line.includes('check-tasks.ts'))?.trim() : undefined });
    console.error(`Stage 09 task checks failed during ${phase}: ${detail}`);
    process.exitCode = 1;
}
finally {
    try {
        for (const close of servers.reverse())
            await close();
        await database.close();
        if (ownsScratch) {
            await verifiedCluster();
            assert(/^ootla_demo_stage09_[a-f0-9]{32}$/.test(scratchName), 'Unexpected cleanup target.');
            const target = await owner.query<{
                owner: string;
            }>('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1', [scratchName]);
            assert(target.rowCount === 1 && target.rows[0]?.owner === 'ootla', 'Scratch ownership changed; refusing deletion.');
            const quoted = (await owner.query<{
                name: string;
            }>('SELECT quote_ident($1) AS name', [scratchName])).rows[0]!.name;
            await owner.query(`DROP DATABASE ${quoted}`);
            assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1', [scratchName])).rowCount, 0);
            console.log('PASS removed only the owned Stage 09 scratch database; retained demo data was never modified');
        }
    }
    catch {
        console.error('Stage 09 owned scratch cleanup failed. No unrelated database deletion was attempted.');
        process.exitCode = 1;
    }
    finally {
        if (ownerConnected)
            await owner.end();
    }
}
