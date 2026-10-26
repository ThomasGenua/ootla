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
import type { ApplicationRecord, ContactDetail, ContactRecord, ExternalMapping, HouseholdRecord, LeaseRecord, Paginated, PropertyDetail, PropertyGroup, PropertySummary, UnitRecord } from '../shared/property-contracts.js';

// Every write below targets a newly-created, uniquely owned scratch database.
// The retained demo is never seeded, reset or modified, and credentials stay in memory.
const root = path.resolve(import.meta.dirname, '..');
const source = loadConfig();
const sourceUrl = new URL(source.databaseUrl);
assert(source.demoMode && !source.production && /^ootla_demo(?:_[a-z0-9_]+)?$/.test(source.databaseName ?? ''),
  'Run Stage 06 checks only from the documented non-production isolated Ootla demo configuration.');
assert(sourceUrl.hostname === '127.0.0.1' && sourceUrl.port === '55439' && sourceUrl.username === 'ootla' && !sourceUrl.search && !sourceUrl.hash,
  'The project-owned local PostgreSQL cluster and restricted application role are required.');
const scratchName = `ootla_demo_stage06_${randomUUID().replaceAll('-', '')}`;
const scratchUrl = new URL(sourceUrl);
scratchUrl.pathname = `/${scratchName}`;
const config: ServerConfig = { ...source, nodeEnv: 'test', production: false, appUrl: 'http://ootla.test', databaseUrl: scratchUrl.toString(), databaseName: scratchName };
const ownerUrl = new URL(sourceUrl);
ownerUrl.username = 'ootla_cluster_owner';
ownerUrl.pathname = '/postgres';
const owner = new Client({ connectionString: ownerUrl.toString(), connectionTimeoutMillis: 5_000 });
const database = new Database(config);
const prefix = '/api/property-foundation';
const organizations = [randomUUID(), randomUUID()];
const userIds = Array.from({ length: 5 }, () => randomUUID());
const membershipIds = userIds.map(() => randomUUID());
const emails = userIds.map(id => `stage06-${id}@example.test`);
const roles = ['organization_admin', 'property_manager', 'leasing_agent', 'read_only_analyst', 'organization_admin'] as const;
const password = `Stage06-${randomUUID()}!`;
const legacyProperties = [randomUUID(), randomUUID(), randomUUID()];
const legacyUnits = legacyProperties.map(() => randomUUID());
const legacyLeads = legacyProperties.map(() => randomUUID());
const servers: Array<() => Promise<void>> = [];
let ownerConnected = false;
let ownsScratch = false;
let groups = 0;
let phase = 'safe scratch database setup';
let beforeLegacy = '';
const pass = (label: string) => { groups += 1; console.log(`PASS ${label}`); };
const normalize = (value: string) => path.resolve(value).replaceAll('\\', '/').toLowerCase();

async function verifiedCluster() {
  const identity = await owner.query<{ data_directory: string }>('SHOW data_directory');
  assert.equal(normalize(identity.rows[0]?.data_directory ?? ''), normalize(path.join(root, '.local/postgres/data')),
    'Refusing to operate outside the project-owned PostgreSQL data directory.');
}
async function createScratch() {
  await owner.connect(); ownerConnected = true;
  await verifiedCluster();
  assert(/^ootla_demo_stage06_[a-f0-9]{32}$/.test(scratchName));
  assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1', [scratchName])).rowCount, 0,
    'The uniquely named scratch database already exists; nothing was changed.');
  const role = (await owner.query<{ rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean }>(
    'SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1', ['ootla'])).rows[0];
  assert(role && !role.rolsuper && !role.rolcreatedb && !role.rolcreaterole, 'Use the established restricted application role.');
  const quoted = (await owner.query<{ name: string }>('SELECT quote_ident($1) AS name', [scratchName])).rows[0]!.name;
  await owner.query(`CREATE DATABASE ${quoted} OWNER ootla`);
  ownsScratch = true;
  assert.equal((await database.query<{ name: string }>('SELECT current_database() AS name')).rows[0]?.name, scratchName);
}
async function installLegacyBaseline() {
  await database.query(`CREATE TABLE schema_migrations(name text PRIMARY KEY, checksum char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
  for (const name of ['001_foundation.sql', '002_staff_roles_property_access.sql', '003_demo_dataset.sql']) {
    const sql = await readFile(path.join(root, 'migrations', name), 'utf8');
    await database.transaction(async client => {
      await client.query(sql.replace(/^\uFEFF/, ''));
      await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name, createHash('sha256').update(sql).digest('hex')]);
    });
  }
  const passwordHash = await hashPassword(password);
  await database.transaction(async client => {
    for (const [index, organizationId] of organizations.entries()) {
      await client.query("INSERT INTO organizations(id,name,slug,environment) VALUES($1,$2,$3,'demo')",
        [organizationId, `Stage 06 scratch organization ${index}`, `stage06-${randomUUID()}`]);
    }
    for (const [index, id] of userIds.entries()) {
      await client.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)',
        [id, emails[index], `Stage 06 ${roles[index]}`, passwordHash]);
      await client.query('INSERT INTO organization_memberships(id,organization_id,user_id,role) VALUES($1,$2,$3,$4)',
        [membershipIds[index], organizations[index === 4 ? 1 : 0], id, roles[index]]);
    }
    for (const [index, propertyId] of legacyProperties.entries()) {
      const organizationId = organizations[index === 2 ? 1 : 0];
      await client.query('INSERT INTO properties(id,organization_id,name,address,city,property_type) VALUES($1,$2,$3,$4,$5,$6)',
        [propertyId, organizationId, `Legacy ${index}`, `${index} Example Street`, index === 0 ? 'Lagos' : 'Abuja', 'residential']);
      await client.query("INSERT INTO units(id,organization_id,property_id,label,bedrooms,status,monthly_rent) VALUES($1,$2,$3,'A1',2,'available',1200)",
        [legacyUnits[index], organizationId, propertyId]);
      await client.query("INSERT INTO leads(id,organization_id,property_id,unit_id,display_name,email,status,intent,notes) VALUES($1,$2,$3,$4,$5,$6,'new','leasing',$7)",
        [legacyLeads[index], organizationId, propertyId, legacyUnits[index], `Legacy person ${index}`, `legacy-${index}@example.test`, 'Retain original history']);
    }
    for (const index of [1, 2, 3]) {
      await client.query('INSERT INTO property_access_assignments(organization_id,membership_id,property_id) VALUES($1,$2,$3)',
        [organizations[0], membershipIds[index], legacyProperties[0]]);
    }
  });
  beforeLegacy = JSON.stringify((await database.query(`SELECT l.id,l.organization_id,l.property_id,l.unit_id,l.display_name,l.email,l.status,l.intent,l.notes,l.created_at,l.updated_at,u.password_hash
    FROM leads l CROSS JOIN users u WHERE u.id=$1 ORDER BY l.id`, [userIds[0]])).rows);
}
async function utility(script = 'scripts/migrate.ts', args: string[] = []) {
  try {
    await promisify(execFile)(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), path.join(root, script), ...args], {
      cwd: root, windowsHide: true, timeout: 30_000,
      env: { ...process.env, NODE_ENV: 'test', DEMO_MODE: 'true', DATABASE_URL: config.databaseUrl, APP_URL: config.appUrl },
    });
  } catch { assert.fail('The additive scratch migration command failed; raw credentials and database/process output are omitted.'); }
}
async function start() {
  const db = new Database(config);
  const app = createApp(config, db);
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); listener.once('error', reject);
  });
  let closed = false;
  const close = async () => {
    if (closed) return; closed = true;
    server.closeIdleConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await db.close();
  };
  servers.push(close);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (route: string, cookie = '', method = 'GET', body?: unknown) => fetch(base + route, {
    method, redirect: 'manual', headers: { ...(cookie ? { Cookie: cookie } : {}), ...(method === 'GET' ? {} : { Origin: config.appUrl }),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { close, request,
    login: async (index: number) => {
      const response = await request('/api/auth/login', '', 'POST', { email: emails[index], password });
      assert.equal(response.status, 200, 'A real hashed scratch staff account must sign in through normal authentication.');
      const cookie = response.headers.get('set-cookie')?.split(';')[0];
      assert(cookie && /HttpOnly/i.test(response.headers.get('set-cookie')!), 'Normal HttpOnly session cookie is required.');
      return cookie;
    },
  };
}
type Api = Awaited<ReturnType<typeof start>>;
async function json<T>(api: Api, route: string, cookie: string, method = 'GET', body?: unknown, expected = 200): Promise<T> {
  const response = await api.request(route, cookie, method, body);
  assert.equal(response.status, expected, `${method} ${route.split('?')[0]} must return ${expected}.`);
  return response.json() as Promise<T>;
}
async function deny(api: Api, route: string, cookie: string, method = 'GET', body?: unknown, expected: number | number[] = [403, 404]) {
  const response = await api.request(route, cookie, method, body);
  if (expected === 409 && method === 'PATCH') assert.equal((await response.clone().json() as { code: string }).code, 'SOURCE_OWNED_FIELD', 'Source-owned writes must explain their conflict.');
  assert((Array.isArray(expected) ? expected : [expected]).includes(response.status), `${method} ${route.split('?')[0]} must deny or reject invalid access; received ${response.status}.`);
}
async function rejectsSql(sql: string, values: unknown[], code: string, label: string) {
  assert(database.pool);
  let rejected = false;
  try { await database.pool.query(sql, values); }
  catch (error) { rejected = true; assert.equal((error as { code?: string }).code, code, label); }
  assert(rejected, label);
}

async function main() {
  await createScratch();
  await installLegacyBaseline();
  await utility();
  assert.equal(await database.state(), 'ready');
  const afterLegacy = JSON.stringify((await database.query(`SELECT l.id,l.organization_id,l.property_id,l.unit_id,l.display_name,l.email,l.status,l.intent,l.notes,l.created_at,l.updated_at,u.password_hash
    FROM leads l CROSS JOIN users u WHERE u.id=$1 ORDER BY l.id`, [userIds[0]])).rows);
  assert.equal(afterLegacy, beforeLegacy, 'Additive migration must preserve legacy lead data, original timestamps and password hashes.');
  const linked = (await database.query<{ id: string; contact_id: string }>('SELECT id,contact_id FROM leads ORDER BY id')).rows;
  assert.equal(linked.length, 3);
  assert(linked.every(lead => lead.contact_id), 'Every existing lead must gain a canonical contact link.');
  assert.equal((await database.query<{ n: number }>('SELECT count(*)::integer AS n FROM properties')).rows[0]?.n, 3);
  assert.equal((await database.query<{ n: number }>('SELECT count(*)::integer AS n FROM units')).rows[0]?.n, 3);
  await utility();
  assert.equal((await database.query<{ n: number }>('SELECT count(*)::integer AS n FROM contacts')).rows[0]?.n, 3,
    'Repeated additive migrations must not duplicate backfilled identities.');
  pass('additive migration backfills canonical contacts while preserving legacy records, hashes, timestamps and distinct property/unit identities');

  phase = 'retained demo seed compatibility without contact duplication';
  await utility('scripts/seed.ts');
  const firstSeedContacts = JSON.stringify((await database.query('SELECT * FROM contacts ORDER BY id')).rows);
  const firstSeedLinks = JSON.stringify((await database.query('SELECT * FROM contact_property_links ORDER BY contact_id,organization_id,property_id')).rows);
  const firstSeedLeads = JSON.stringify((await database.query('SELECT * FROM leads ORDER BY id')).rows);
  await utility('scripts/seed.ts');
  assert.equal(JSON.stringify((await database.query('SELECT * FROM contacts ORDER BY id')).rows), firstSeedContacts,
    'Ordinary repeated Stage 03 seeding after migration must not create orphan or duplicate canonical contacts.');
  assert.equal(JSON.stringify((await database.query('SELECT * FROM contact_property_links ORDER BY contact_id,organization_id,property_id')).rows), firstSeedLinks);
  assert.equal(JSON.stringify((await database.query('SELECT * FROM leads ORDER BY id')).rows), firstSeedLeads,
    'Repeated seeding must preserve existing lead IDs, history, contact links and timestamps.');
  pass('ordinary explicit demo seeding remains idempotent after contact backfill without orphan identities or altered history');
  phase = 'optional large-volume fixture command is deliberate and repeatable';
  const beforeVolume = JSON.stringify((await database.query('SELECT * FROM properties ORDER BY id')).rows);
  const volumeArgs = ['--properties=50', '--units-per-property=2', `--confirm=${scratchName}`];
  await utility('scripts/seed-property-volume.ts', [...volumeArgs, '--dry-run']);
  assert.equal(JSON.stringify((await database.query('SELECT * FROM properties ORDER BY id')).rows), beforeVolume, 'Volume dry-run must not change records.');
  await utility('scripts/seed-property-volume.ts', volumeArgs);
  const demoOrganizationId = (await database.query<{ id: string }>("SELECT id FROM organizations WHERE slug='ootla-demo'")).rows[0]!.id;
  const volumeProperties = (await database.query<{ id: string; source_system: string }>("SELECT id,source_system FROM properties WHERE organization_id=$1 AND seed_key LIKE 'stage06.volume.%' ORDER BY id", [demoOrganizationId])).rows;
  const volumeUnits = (await database.query<{ id: string; source_system: string; availability_source: string; availability_verified_at: Date | null }>("SELECT id,source_system,availability_source,availability_verified_at FROM units WHERE organization_id=$1 AND seed_key LIKE 'stage06.volume.%' ORDER BY id", [demoOrganizationId])).rows;
  assert.equal(volumeProperties.length, 50); assert.equal(volumeUnits.length, 100);
  assert(volumeProperties.every(row => row.source_system === 'demo'));
  assert(volumeUnits.every(row => row.source_system === 'demo' && row.availability_source === 'demo' && row.availability_verified_at === null));
  await database.query('UPDATE properties SET name=$1 WHERE id=$2', ['Preserved volume staff edit', volumeProperties[0]!.id]);
  await database.query("UPDATE units SET status='reserved',monthly_rent=321 WHERE id=$1", [volumeUnits[0]!.id]);
  const editedProperties = JSON.stringify((await database.query('SELECT * FROM properties ORDER BY id')).rows);
  const editedUnits = JSON.stringify((await database.query('SELECT * FROM units ORDER BY id')).rows);
  await utility('scripts/seed-property-volume.ts', volumeArgs);
  assert.equal(JSON.stringify((await database.query('SELECT * FROM properties ORDER BY id')).rows), editedProperties, 'Repeating the optional fixture command must preserve counts, IDs and staff edits.');
  assert.equal(JSON.stringify((await database.query('SELECT * FROM units ORDER BY id')).rows), editedUnits);
  pass('optional volume dry-run writes nothing and explicit 50-property/100-unit fixtures are synthetic, unverified, repeatable and preserve edits');
  phase = 'normal staff login and backend directory isolation';
  const api = await start();
  const [admin, manager, agent, analyst, otherAdmin] = await Promise.all(userIds.map((_, index) => api.login(index)));
  await deny(api, `${prefix}/properties`, '', 'GET', undefined, 401);
  const initial = await json<Paginated<PropertySummary>>(api, `${prefix}/properties`, admin!);
  assert.equal(initial.total, 2);
  assert.equal(initial.items.length, 2);
  for (const token of [manager!, agent!, analyst!]) {
    const scoped = await json<Paginated<PropertySummary>>(api, `${prefix}/properties`, token);
    assert.equal(scoped.total, 1);
    assert.equal(scoped.items[0]?.id, legacyProperties[0]);
    await deny(api, `${prefix}/properties/${legacyProperties[1]}`, token);
    await deny(api, `${prefix}/properties/${legacyProperties[2]}`, token);
  }
  await deny(api, `${prefix}/properties/${legacyProperties[2]}`, admin!);
  await deny(api, `${prefix}/properties/${legacyProperties[0]}`, otherAdmin!);
  pass('normal cookie authentication, organization boundaries and assigned-property filtering are enforced on the backend');

  phase = 'standalone management, provenance and strict directory queries';
  const group = (await json<{ group: PropertyGroup }>(api, `${prefix}/groups`, admin!, 'POST', { name: 'Coastal portfolio' }, 201)).group;
  const property = (await json<{ property: PropertySummary }>(api, `${prefix}/properties`, admin!, 'POST', {
    name: 'Harbour Example', address: '1 Example Road', city: 'Lagos', type: 'mixed_use', groupId: group.id,
  }, 201)).property;
  assert.equal(property.group?.id, group.id);
  assert.equal(property.source, 'local');
  assert.equal(property.unitCount, 0, 'A newly created property must not be reinterpreted as a unit.');
  const unit = (await json<{ unit: UnitRecord }>(api, `${prefix}/properties/${property.id}/units`, admin!, 'POST', {
    label: 'Studio 1', bedrooms: 0, status: 'available', monthlyRent: 975,
  }, 201)).unit;
  assert.equal(unit.propertyId, property.id);
  assert.equal(unit.availabilitySource, 'staff_reported');
  assert.equal(unit.lastVerifiedAt, null, 'Creating an available unit is not an availability verification event.');
  const beforeVerified = await json<PropertyDetail>(api, `${prefix}/properties/${property.id}`, admin!);
  assert.equal(beforeVerified.property.unitCount, 1);
  assert.equal(beforeVerified.property.availableUnitCount, 1);
  assert.equal(beforeVerified.units.items[0]?.lastVerifiedAt, null);
  const verifiedAt = new Date(Date.now() - 60_000).toISOString();
  const verifiedUnit = (await json<{ unit: UnitRecord }>(api, `${prefix}/properties/${property.id}/units/${unit.id}`, admin!, 'PATCH', {
    monthlyRent: 995, lastVerifiedAt: verifiedAt,
  })).unit;
  assert.equal(verifiedUnit.monthlyRent, 995);
  assert.equal(verifiedUnit.lastVerifiedAt, verifiedAt);
  await deny(api, `${prefix}/properties/${property.id}/units/${unit.id}`, admin!, 'PATCH', {
    lastVerifiedAt: new Date(Date.now() + 86_400_000).toISOString(),
  }, 400);
  const changedAvailability = (await json<{ unit: UnitRecord }>(api, `${prefix}/properties/${property.id}/units/${unit.id}`, admin!, 'PATCH', { status: 'reserved' })).unit;
  assert.equal(changedAvailability.lastVerifiedAt, null, 'Changing availability must clear a stale verification timestamp.');
  const restoredAvailability = (await json<{ unit: UnitRecord }>(api, `${prefix}/properties/${property.id}/units/${unit.id}`, admin!, 'PATCH', {
    status: 'available', lastVerifiedAt: verifiedAt,
  })).unit;
  assert.equal(restoredAvailability.lastVerifiedAt, verifiedAt);
  const renamed = (await json<{ property: PropertySummary }>(api, `${prefix}/properties/${property.id}`, admin!, 'PATCH', {
    name: 'Harbour Updated', address: '2 Example Road',
  })).property;
  assert.equal(renamed.name, 'Harbour Updated');
  assert.equal(renamed.address, '2 Example Road');
  const filter = new URLSearchParams({ q: 'harbour', city: 'Lagos', type: 'mixed_use', source: 'local', groupId: group.id, availability: 'available', sort: 'name_desc', page: '1', pageSize: '1' });
  const filtered = await json<Paginated<PropertySummary>>(api, `${prefix}/properties?${filter}`, admin!);
  assert.equal(filtered.total, 1); assert.equal(filtered.items[0]?.id, property.id);
  assert.equal(filtered.pageSize, 1); assert.equal(filtered.totalPages, 1);
  const unverified = await json<Paginated<PropertySummary>>(api, `${prefix}/properties?availability=unverified`, admin!);
  assert(unverified.items.some(item => item.id === legacyProperties[0]), 'Legacy availability must remain visibly unverified.');
  const injection = await json<Paginated<PropertySummary>>(api, `${prefix}/properties?q=${encodeURIComponent("'; DROP TABLE properties; --")}`, admin!);
  assert.equal(injection.total, 0, 'SQL-looking search text must be treated as a literal search value.');
  for (const query of ['page=0', 'pageSize=101', 'pageSize=-1', 'sort=DROP_TABLE', 'groupId=bad', 'unknown=true', 'source=pretend', 'q=x&q=y']) {
    await deny(api, `${prefix}/properties?${query}`, admin!, 'GET', undefined, 400);
  }
  for (const token of [agent!, analyst!]) {
    await deny(api, `${prefix}/properties/${legacyProperties[0]}`, token, 'PATCH', { name: 'Unauthorized change' }, 403);
    await deny(api, `${prefix}/properties/${legacyProperties[0]}/units`, token, 'POST', { label: 'Bad', bedrooms: 1, status: 'available', monthlyRent: 10 }, 403);
  }
  await deny(api, `${prefix}/groups`, analyst!, 'POST', { name: 'Denied group' }, 403);
  await deny(api, `${prefix}/properties`, manager!, 'POST', { name: 'Denied property' }, 403);
  await deny(api, `${prefix}/properties/${property.id}`, manager!, 'PATCH', { name: 'Outside assigned access' });
  const managerEdit = await json<{ property: PropertySummary }>(api, `${prefix}/properties/${legacyProperties[0]}`, manager!, 'PATCH', { address: 'Manager updated address' });
  assert.equal(managerEdit.property.address, 'Manager updated address');
  await deny(api, `${prefix}/properties`, admin!, 'POST', { name: 'Cannot spoof ownership', organizationId: organizations[1] }, 400);
  await deny(api, `${prefix}/properties/${property.id}`, admin!, 'PATCH', { source: 'yardi' }, 400);
  await deny(api, `${prefix}/properties/${property.id}/units/${legacyUnits[0]}`, admin!, 'PATCH', { status: 'occupied' });
  pass('standalone property/unit management, explicit availability provenance, strict server-side filters/sorting/validation and write permissions');

  phase = 'canonical contact, household and lead/application/lease relationships';
  const contact = (await json<{ contact: ContactRecord }>(api, `${prefix}/contacts`, admin!, 'POST', {
    displayName: 'Canonical Example', email: 'canonical@example.test', phone: '+10000000000', propertyIds: [legacyProperties[0]],
  }, 201)).contact;
  const beforeContactLink = (await database.query<{ n: number }>('SELECT count(*)::integer AS n FROM contacts')).rows[0]!.n;
  await deny(api, `${prefix}/contacts/${contact.id}/properties`, agent!, 'POST', { propertyId: legacyProperties[1] });
  await deny(api, `${prefix}/contacts/${contact.id}/properties`, otherAdmin!, 'POST', { propertyId: legacyProperties[1] });
  await deny(api, `${prefix}/contacts/${contact.id}/properties`, admin!, 'POST', { propertyId: legacyProperties[2] });
  await deny(api, `${prefix}/contacts/${contact.id}/properties`, analyst!, 'POST', { propertyId: legacyProperties[0] }, 403);
  const linkedContact = (await json<{ contact: ContactRecord }>(api, `${prefix}/contacts/${contact.id}/properties`, admin!, 'POST', { propertyId: legacyProperties[1] })).contact;
  assert.equal(linkedContact.id, contact.id, 'Adding a property association must reuse the existing canonical identity.');
  assert.deepEqual([...linkedContact.propertyIds].sort(), legacyProperties.slice(0, 2).sort());
  await json<{ contact: ContactRecord }>(api, `${prefix}/contacts/${contact.id}/properties`, admin!, 'POST', { propertyId: legacyProperties[1] });
  assert.equal((await database.query<{ n: number }>('SELECT count(*)::integer AS n FROM contacts')).rows[0]!.n, beforeContactLink,
    'Repeated explicit property association must not create another contact.');
  assert.equal((await database.query<{ n: number }>('SELECT count(*)::integer AS n FROM contact_property_links WHERE contact_id=$1', [contact.id])).rows[0]!.n, 2);
  await deny(api, `${prefix}/contacts/${contact.id}/properties`, agent!, 'POST', { propertyId: legacyProperties[0] }, 403);
  const agentContact = (await json<{ contact: ContactRecord }>(api, `${prefix}/contacts`, agent!, 'POST', {
    displayName: 'Assigned scope contact', email: 'assigned-scope@example.test', propertyIds: [legacyProperties[0]],
  }, 201)).contact;
  const editedContact = (await json<{ contact: ContactRecord }>(api, `${prefix}/contacts/${agentContact.id}`, agent!, 'PATCH', { phone: '+10000000001' })).contact;
  assert.equal(editedContact.phone, '+10000000001');
  assert.equal(editedContact.email, 'assigned-scope@example.test', 'A partial contact edit must preserve omitted identity fields.');
  await deny(api, `${prefix}/contacts/${contact.id}`, agent!, 'PATCH', { phone: '+10000000002' }, 403);
  const privateContact = (await json<{ contact: ContactRecord }>(api, `${prefix}/contacts`, admin!, 'POST', {
    displayName: 'Private Household Member', email: 'private-member@example.test', propertyIds: [legacyProperties[1]],
  }, 201)).contact;
  const household = (await json<{ household: HouseholdRecord }>(api, `${prefix}/households`, admin!, 'POST', {
    name: 'Example household', propertyIds: [legacyProperties[0], legacyProperties[1]],
    members: [{ contactId: contact.id, relationship: 'primary' }, { contactId: privateContact.id, relationship: 'member' }],
  }, 201)).household;
  assert.equal(household.members.length, 2);
  const canonicalLeadIds = [randomUUID(), randomUUID()];
  await database.transaction(async client => {
    for (const [index, id] of canonicalLeadIds.entries()) {
      await client.query("INSERT INTO leads(id,organization_id,property_id,unit_id,contact_id,display_name,email,status,intent) VALUES($1,$2,$3,$4,$5,'Canonical Example','canonical@example.test','qualified','leasing')",
        [id, organizations[0], legacyProperties[index], legacyUnits[index], contact.id]);
      await client.query("INSERT INTO lead_activities(organization_id,property_id,lead_id,kind,summary,occurred_at) VALUES($1,$2,$3,'note',$4,NOW())",
        [organizations[0], legacyProperties[index], id, index === 0 ? 'Visible inquiry history' : 'Private property inquiry history']);
    }
  });
  const application = (await json<{ application: ApplicationRecord }>(api, `${prefix}/applications`, agent!, 'POST', {
    contactId: contact.id, householdId: household.id, propertyId: legacyProperties[0], unitId: legacyUnits[0], leadId: canonicalLeadIds[0], status: 'staff_review',
  }, 201)).application;
  const lease = (await json<{ lease: LeaseRecord }>(api, `${prefix}/leases`, admin!, 'POST', {
    contactId: contact.id, householdId: household.id, propertyId: legacyProperties[0], unitId: legacyUnits[0], applicationId: application.id,
    leadId: canonicalLeadIds[0], status: 'draft', startsOn: '2027-01-01', endsOn: '2027-12-31',
  }, 201)).lease;
  await json<{ application: ApplicationRecord }>(api, `${prefix}/applications`, admin!, 'POST', {
    contactId: contact.id, householdId: household.id, propertyId: legacyProperties[1], unitId: legacyUnits[1], leadId: canonicalLeadIds[1],
  }, 201);
  assert.equal(lease.startsOn, '2027-01-01', 'Lease calendar dates must remain date-only values without timezone conversion.');
  assert.equal(lease.endsOn, '2027-12-31');
  await deny(api, `${prefix}/leases/${lease.id}`, admin!, 'PATCH', { endsOn: '2026-12-31' }, 400);
  const revisedLease = (await json<{ lease: LeaseRecord }>(api, `${prefix}/leases/${lease.id}`, admin!, 'PATCH', { endsOn: '2028-01-01' })).lease;
  assert.equal(revisedLease.startsOn, '2027-01-01', 'Partial lease updates must preserve omitted start dates and relationships.');
  assert.equal(revisedLease.endsOn, '2028-01-01');
  assert.equal(revisedLease.applicationId, application.id);
  assert.equal(application.contactId, contact.id); assert.equal(lease.contactId, contact.id);
  const history = await json<ContactDetail>(api, `${prefix}/contacts/${contact.id}?pageSize=100`, admin!);
  assert.equal(history.contact.id, contact.id);
  for (const kind of ['lead', 'application', 'lease', 'activity']) {
    assert(history.history.items.some(item => item.kind === kind), `The canonical identity must retain ${kind} history.`);
  }
  assert.equal(new Set(history.history.items.map(item => item.propertyId)).size, 2);
  const limitedHistory = await json<ContactDetail>(api, `${prefix}/contacts/${contact.id}?pageSize=2&page=1`, admin!);
  assert.equal(limitedHistory.history.items.length, 2); assert.equal(limitedHistory.history.total, history.history.total);
  const scopedHistory = await json<ContactDetail>(api, `${prefix}/contacts/${contact.id}?pageSize=100`, agent!);
  assert(scopedHistory.history.items.every(item => item.propertyId === legacyProperties[0]), 'Canonical history must not leak records from unassigned properties.');
  assert.deepEqual(scopedHistory.contact.propertyIds, [legacyProperties[0]]);
  assert(scopedHistory.households.every(item => item.propertyIds.every(id => id === legacyProperties[0])));
  assert(!JSON.stringify(scopedHistory).includes('Private Household Member'), 'Households must not disclose contacts limited to an unassigned property.');
  assert(!JSON.stringify(scopedHistory).includes('Private property inquiry history'));
  await deny(api, `${prefix}/contacts/${privateContact.id}`, agent!);
  await deny(api, `${prefix}/contacts/${contact.id}`, otherAdmin!);
  await deny(api, `${prefix}/contacts`, analyst!, 'POST', { displayName: 'Denied', propertyIds: [legacyProperties[0]] }, 403);
  await deny(api, `${prefix}/contacts/${contact.id}`, analyst!, 'PATCH', { displayName: 'Denied' }, 403);
  await deny(api, `${prefix}/applications`, analyst!, 'POST', { contactId: contact.id, propertyId: legacyProperties[0] }, 403);
  await deny(api, `${prefix}/leases`, analyst!, 'POST', { contactId: contact.id, propertyId: legacyProperties[0] }, 403);
  await deny(api, `${prefix}/contacts`, agent!, 'POST', { displayName: 'Outside scope', propertyIds: [legacyProperties[1]] });
  await deny(api, `${prefix}/applications`, agent!, 'POST', { contactId: contact.id, propertyId: legacyProperties[1] });
  await deny(api, `${prefix}/applications`, admin!, 'POST', { contactId: contact.id, propertyId: legacyProperties[0], unitId: legacyUnits[1] }, [400, 404]);
  await deny(api, `${prefix}/applications`, admin!, 'POST', { contactId: privateContact.id, propertyId: legacyProperties[0], leadId: canonicalLeadIds[0] }, [400, 404]);
  await deny(api, `${prefix}/leases`, admin!, 'POST', { contactId: contact.id, propertyId: legacyProperties[1], applicationId: application.id }, [400, 404]);
  await deny(api, `${prefix}/leases`, admin!, 'POST', { contactId: contact.id, propertyId: legacyProperties[0], startsOn: '2027-12-31', endsOn: '2027-01-01' }, 400);
  const contactDirectory = await json<Paginated<ContactRecord>>(api, `${prefix}/contacts?q=canonical&propertyId=${legacyProperties[0]}&pageSize=1`, agent!);
  assert.equal(contactDirectory.total, 1); assert.equal(contactDirectory.items[0]?.id, contact.id);
  const propertyDetail = await json<PropertyDetail>(api, `${prefix}/properties/${legacyProperties[0]}?pageSize=1`, admin!);
  assert.equal(propertyDetail.units.items.length, 1);
  assert.equal(propertyDetail.leads.items.length, 1, 'Related leads must also be paginated.');
  assert.equal(propertyDetail.leads.total, 2);
  assert(propertyDetail.staff.some(staff => staff.membershipId === membershipIds[1]), 'Detail must show persisted property staff assignments.');
  pass('one contact identity connects household, leads, applications, leases and retained history with paginated, property-scoped detail');

  phase = 'database tenant and relationship constraints';
  const otherContact = (await database.query<{ contact_id: string }>('SELECT contact_id FROM leads WHERE id=$1', [legacyLeads[2]])).rows[0]!.contact_id;
  await rejectsSql('INSERT INTO contact_property_links(organization_id,contact_id,property_id) VALUES($1,$2,$3)',
    [organizations[0], otherContact, legacyProperties[0]], '23503', 'Cross-organization contact/property links must fail at the database boundary.');
  await rejectsSql('INSERT INTO household_members(organization_id,household_id,contact_id) VALUES($1,$2,$3)',
    [organizations[0], household.id, otherContact], '23503', 'Cross-organization household members must fail at the database boundary.');
  await rejectsSql('INSERT INTO applications(organization_id,contact_id,property_id,unit_id) VALUES($1,$2,$3,$4)',
    [organizations[0], contact.id, legacyProperties[0], legacyUnits[1]], '23503', 'An application cannot refer to a unit from a different property.');
  await rejectsSql('INSERT INTO applications(organization_id,contact_id,property_id,lead_id) VALUES($1,$2,$3,$4)',
    [organizations[0], contact.id, legacyProperties[0], legacyLeads[0]], '23503', 'An application cannot refer to a lead owned by another canonical contact.');
  await rejectsSql('INSERT INTO leases(organization_id,contact_id,property_id,application_id) VALUES($1,$2,$3,$4)',
    [organizations[0], contact.id, legacyProperties[1], application.id], '23503', 'A lease cannot refer to an application for a different property.');
  await rejectsSql('UPDATE properties SET group_id=$1 WHERE id=$2', [group.id, legacyProperties[2]], '23503',
    'Property groups cannot cross organization boundaries.');
  pass('composite database constraints reject cross-organization and mismatched property/contact/unit/lead/application relationships');

  phase = 'dedicated provider mappings and source ownership';
  const mapping = (await json<{ mapping: ExternalMapping }>(api, `${prefix}/external-mappings`, admin!, 'POST', {
    entityType: 'property', entityId: property.id, provider: 'yardi', externalId: 'EXAMPLE-PROP-104',
  }, 201)).mapping;
  assert.equal(mapping.entityId, property.id);
  const mappings = await json<{ items: ExternalMapping[] }>(api, `${prefix}/external-mappings?entityType=property&entityId=${property.id}`, admin!);
  assert(mappings.items.some(item => item.id === mapping.id));
  await deny(api, `${prefix}/external-mappings`, agent!, 'GET', undefined, 403);
  await deny(api, `${prefix}/external-mappings`, agent!, 'POST', { entityType: 'property', entityId: property.id, provider: 'yardi', externalId: 'NO' }, 403);
  await deny(api, `${prefix}/external-mappings`, otherAdmin!, 'POST', { entityType: 'property', entityId: property.id, provider: 'yardi', externalId: 'NO' });
  await deny(api, `${prefix}/external-mappings`, admin!, 'POST', { entityType: 'property', entityId: legacyProperties[0], provider: 'yardi', externalId: 'EXAMPLE-PROP-104' }, 409);
  await deny(api, `${prefix}/external-mappings`, admin!, 'POST', { entityType: 'property', entityId: property.id, provider: 'yardi', externalId: 'OTHER-EXTERNAL-ID' }, 409);
  await rejectsSql("INSERT INTO external_record_mappings(organization_id,entity_type,property_id,provider,external_id) VALUES($1,'property',$2,'yardi','CROSS-TENANT')",
    [organizations[0], legacyProperties[2]], '23503', 'Provider IDs cannot map across organizations.');
  await rejectsSql("INSERT INTO external_record_mappings(organization_id,entity_type,unit_id,provider,external_id) VALUES($1,'property',$2,'yardi','WRONG-TYPE')",
    [organizations[0], legacyUnits[0]], '23514', 'Mapping entity type must match the referenced typed identity.');
  await rejectsSql("INSERT INTO external_record_mappings(organization_id,entity_type,property_id,unit_id,provider,external_id) VALUES($1,'property',$2,$3,'yardi','TWO-TARGETS')",
    [organizations[0], legacyProperties[0], legacyUnits[0]], '23514', 'Every provider mapping must reference exactly one entity.');
  await database.query("UPDATE organization_data_settings SET mode='yardi_connected' WHERE organization_id=$1", [organizations[0]]);
  const owned = await json<PropertyDetail>(api, `${prefix}/properties/${property.id}`, admin!);
  assert(owned.property.readOnlyFields.includes('name') && owned.access.organizationMode === 'yardi_connected');
  await deny(api, `${prefix}/properties/${property.id}`, admin!, 'PATCH', { name: 'Forbidden Yardi overwrite' }, 409);
  await deny(api, `/api/properties/${property.id}`, admin!, 'PATCH', { name: 'Legacy route must not bypass source ownership' }, 409);
  const groupEdit = await json<{ property: PropertySummary }>(api, `${prefix}/properties/${property.id}`, admin!, 'PATCH', { groupId: null });
  assert.equal(groupEdit.property.group, null, 'Ootla-owned grouping remains editable beside Yardi-owned record fields.');
  await database.query("UPDATE units SET source_system='yardi' WHERE id=$1", [unit.id]);
  await deny(api, `${prefix}/properties/${property.id}/units/${unit.id}`, admin!, 'PATCH', { status: 'occupied' }, 409);
  await database.query("UPDATE contacts SET source_system='yardi' WHERE id=$1", [contact.id]);
  await deny(api, `${prefix}/contacts/${contact.id}`, admin!, 'PATCH', { displayName: 'Forbidden resident overwrite' }, 409);
  await database.query("UPDATE applications SET source_system='yardi' WHERE id=$1", [application.id]);
  await database.query("UPDATE leases SET source_system='yardi' WHERE id=$1", [lease.id]);
  await deny(api, `${prefix}/applications/${application.id}`, admin!, 'PATCH', { status: 'draft' }, 409);
  await deny(api, `${prefix}/leases/${lease.id}`, admin!, 'PATCH', { status: 'active' }, 409);
  await database.query("UPDATE organization_data_settings SET mode='standalone' WHERE organization_id=$1", [organizations[0]]);
  await deny(api, `${prefix}/properties/${property.id}/units/${unit.id}`, admin!, 'PATCH', { monthlyRent: 1200 }, 409);
  await database.query("UPDATE properties SET source_owned_fields=ARRAY['name']::text[] WHERE id=$1", [legacyProperties[0]]);
  await deny(api, `${prefix}/properties/${legacyProperties[0]}`, admin!, 'PATCH', { name: 'Explicitly protected field' }, 409);
  await deny(api, `/api/properties/${legacyProperties[0]}`, manager!, 'PATCH', { name: 'Legacy explicitly protected field' }, 409);
  pass('dedicated typed provider-ID registry, uniqueness, organization isolation and Yardi/explicit field ownership including legacy APIs');

  phase = 'live grant revocation and process persistence';
  const revoke = await api.request(`/api/properties/${legacyProperties[0]}/access/${userIds[2]}`, admin!, 'DELETE');
  assert.equal(revoke.status, 204);
  await deny(api, `${prefix}/properties/${legacyProperties[0]}`, agent!);
  await deny(api, `${prefix}/contacts/${contact.id}`, agent!);
  const revokedDirectory = await json<Paginated<PropertySummary>>(api, `${prefix}/properties`, agent!);
  assert.equal(revokedDirectory.total, 0, 'A retained cookie must immediately observe assignment revocation.');
  await api.close();
  const restarted = await start();
  assert.equal((await restarted.request('/api/auth/me', admin!)).status, 200, 'Server-managed session must survive a new backend instance.');
  const retainedDetail = await json<PropertyDetail>(restarted, `${prefix}/properties/${property.id}`, admin!);
  assert.equal(retainedDetail.property.name, 'Harbour Updated');
  assert.equal(retainedDetail.units.items[0]?.lastVerifiedAt, verifiedAt);
  const retainedContact = await json<ContactDetail>(restarted, `${prefix}/contacts/${contact.id}?pageSize=100`, admin!);
  assert.equal(retainedContact.history.total, history.history.total);
  assert.equal(retainedContact.contact.id, contact.id);
  const retainedLease = (await database.query<{ contact_id: string; application_id: string }>('SELECT contact_id,application_id FROM leases WHERE id=$1', [lease.id])).rows[0]!;
  assert.equal(retainedLease.contact_id, contact.id); assert.equal(retainedLease.application_id, application.id);
  pass('existing cookies observe grant revocation immediately and persistent records/history/sessions survive a new backend instance');

  phase = 'large portfolio server-side pagination';
  const bulkGroup = (await json<{ group: PropertyGroup }>(restarted, `${prefix}/groups`, admin!, 'POST', { name: 'Large portfolio check' }, 201)).group;
  await database.query(`INSERT INTO properties(organization_id,name,city,property_type,group_id)
    SELECT $1,'Bulk property '||lpad(n::text,4,'0'),CASE WHEN n%2=0 THEN 'Lagos' ELSE 'Abuja' END,'residential',$2
    FROM generate_series(1,2701) AS series(n)`, [organizations[0], bulkGroup.id]);
  await database.query(`INSERT INTO units(organization_id,property_id,label,bedrooms,status,monthly_rent,source_system,availability_source)
    SELECT organization_id,id,'Bulk A1',1,'available',1000,'demo','demo' FROM properties WHERE group_id=$1 ORDER BY name,id LIMIT 17`, [bulkGroup.id]);
  const expectedIds = (await database.query<{ id: string }>('SELECT id FROM properties WHERE group_id=$1 ORDER BY name,id', [bulkGroup.id])).rows.map(row => row.id);
  const seen: string[] = [];
  for (let page = 1; page <= 28; page += 1) {
    const response = await restarted.request(`${prefix}/properties?groupId=${bulkGroup.id}&page=${page}&pageSize=100&sort=name_asc`, admin!);
    assert.equal(response.status, 200);
    const text = await response.text();
    const directory = JSON.parse(text) as Paginated<PropertySummary>;
    assert.equal(directory.total, 2701, 'The 2,701-property portfolio count must count properties, not its 17 units.');
    assert.equal(directory.totalPages, 28); assert.equal(directory.page, page); assert.equal(directory.pageSize, 100);
    assert.equal(directory.items.length, page === 28 ? 1 : 100);
    assert(text.length < 150_000, 'A directory response must remain bounded to its requested page.');
    seen.push(...directory.items.map(item => item.id));
  }
  assert.equal(new Set(seen).size, 2701);
  assert.deepEqual(seen, expectedIds, 'Stable server-side pagination must return each property exactly once.');
  const repeated = await json<Paginated<PropertySummary>>(restarted, `${prefix}/properties?groupId=${bulkGroup.id}&page=2&pageSize=100&sort=name_asc`, admin!);
  assert.deepEqual(repeated.items.map(item => item.id), expectedIds.slice(100, 200));
  const descending = await json<Paginated<PropertySummary>>(restarted, `${prefix}/properties?groupId=${bulkGroup.id}&pageSize=10&sort=name_desc`, admin!);
  assert.deepEqual(descending.items.map(item => item.id), expectedIds.slice(-10).reverse());
  const emptyPage = await json<Paginated<PropertySummary>>(restarted, `${prefix}/properties?groupId=${bulkGroup.id}&page=29&pageSize=100`, admin!);
  assert.equal(emptyPage.total, 2701); assert.equal(emptyPage.items.length, 0);
  assert.equal((await database.query<{ n: number }>('SELECT count(*)::integer AS n FROM units u JOIN properties p ON p.id=u.property_id WHERE p.group_id=$1', [bulkGroup.id])).rows[0]?.n, 17);
  const restrictedBulk = await json<Paginated<PropertySummary>>(restarted, `${prefix}/properties?groupId=${bulkGroup.id}&pageSize=100`, manager!);
  assert.equal(restrictedBulk.total, 0);
  pass('2,701 distinct properties and 17 separate units use bounded server pagination, accurate totals, stable ordering and assigned-property isolation');
}

try {
  await main();
  console.log(`Stage 06 property foundation checks complete: ${groups} groups passed.`);
} catch (error) {
  const detail = error instanceof assert.AssertionError ? error.message.split(/\r?\n/, 1)[0] : 'Raw database/process details intentionally omitted.';
  console.error(`Stage 06 property foundation checks failed during ${phase}: ${detail}`);
  process.exitCode = 1;
} finally {
  try {
    for (const close of servers.reverse()) await close();
    await database.close();
    if (ownsScratch) {
      await verifiedCluster();
      assert(/^ootla_demo_stage06_[a-f0-9]{32}$/.test(scratchName), 'Unexpected cleanup target.');
      const target = await owner.query<{ owner: string }>('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1', [scratchName]);
      assert(target.rowCount === 1 && target.rows[0]?.owner === 'ootla', 'Scratch database ownership changed; refusing deletion.');
      const quoted = (await owner.query<{ name: string }>('SELECT quote_ident($1) AS name', [scratchName])).rows[0]!.name;
      await owner.query(`DROP DATABASE ${quoted}`);
      assert.equal((await owner.query('SELECT 1 FROM pg_database WHERE datname=$1', [scratchName])).rowCount, 0);
      console.log('PASS removed only the owned Stage 06 scratch database; retained demo data was never modified');
    }
  } catch {
    console.error('Stage 06 scratch database cleanup failed. No unrelated database deletion was attempted.');
    process.exitCode = 1;
  } finally { if (ownerConnected) await owner.end(); }
}