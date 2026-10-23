import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import type { z } from 'zod';
import type { AuthUser, OrganizationRole, Permission } from '../../shared/contracts.js';
import type { ApplicationRecord, AssignedStaff, ContactDetail, ContactHistory, ContactRecord, ExternalMapping, FoundationAccess, FoundationEntity, HouseholdRecord, LeaseRecord, Paginated, PropertyDetail, PropertyGroup, PropertySummary, RelatedLead, UnitRecord } from '../../shared/property-contracts.js';
import type { applicationCreateSchema, contactCreateSchema, contactDirectorySchema, contactUpdateSchema, externalMappingSchema, householdCreateSchema, householdMemberSchema, leaseCreateSchema, propertyCreateSchema, propertyDirectorySchema, propertyUpdateSchema, unitCreateSchema, unitUpdateSchema } from '../../shared/property-contracts.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { syncLeadApplicationSummary } from './leads.js';
type Row = QueryResultRow;
interface Queryable {
    query<T extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<T>>;
}
type Page = {
    page: number;
    pageSize: number;
};
const tables: Record<FoundationEntity, string> = { property: 'properties', unit: 'units', contact: 'contacts', application: 'applications', lease: 'leases' };
const mapColumns: Record<FoundationEntity, string> = { property: 'property_id', unit: 'unit_id', contact: 'contact_id', application: 'application_id', lease: 'lease_id' };
const defaultOwned: Record<FoundationEntity, string[]> = { property: ['name', 'address', 'city', 'type'], unit: ['label', 'bedrooms', 'status', 'monthlyRent', 'availabilitySource', 'lastVerifiedAt'], contact: ['displayName', 'email', 'phone'], application: ['contactId', 'householdId', 'propertyId', 'unitId', 'leadId', 'status'], lease: ['contactId', 'householdId', 'propertyId', 'unitId', 'applicationId', 'leadId', 'status', 'startsOn', 'endsOn'] };
const scope = (a: string) => `(${a}.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=${a}.organization_id AND pa.property_id=${a}.property_id AND pa.membership_id=$3)))`;
const propertyScope = (a: string) => `(${a}.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=${a}.organization_id AND pa.property_id=${a}.id AND pa.membership_id=$3)))`;
const params = (u: AuthUser): unknown[] => [u.organization.id, u.organization.role, u.membershipId];
const iso = (v: unknown): string | null => v ? (v instanceof Date ? v : new Date(String(v))).toISOString() : null;
const paged = <T>(items: T[], total: number, p: Page): Paginated<T> => ({ items, total, page: p.page, pageSize: p.pageSize, totalPages: Math.ceil(total / p.pageSize) });
const missing = (kind: string): never => { throw new ApiError(404, 'RECORD_NOT_FOUND', `This ${kind} is unavailable or outside your assigned access.`); };
export function permission(u: AuthUser, key: Permission): void { if (!u.permissions.includes(key))
    throw new ApiError(403, 'PERMISSION_DENIED', 'Your staff role does not allow this action.'); }
const owned = (r: Row, e: FoundationEntity): string[] => { const explicit = Array.isArray(r.source_owned_fields) ? r.source_owned_fields as string[] : []; const yardi = r.source_system === 'yardi' || r.mode === 'yardi_connected' && r.mapped_yardi === true; const configured = r.yardi_owned_fields?.[e]; return [...new Set([...explicit, ...(yardi ? (Array.isArray(configured) ? configured.filter((v: unknown) => typeof v === 'string') : defaultOwned[e]) : [])])]; };
const ownership = (a: string, e: FoundationEntity) => `${a}.source_system,${a}.source_owned_fields,ds.mode,ds.yardi_owned_fields,EXISTS(SELECT 1 FROM external_record_mappings em WHERE em.organization_id=${a}.organization_id AND em.${mapColumns[e]}=${a}.id AND em.provider='yardi') AS mapped_yardi`;
const settings = (a: string) => `LEFT JOIN organization_data_settings ds ON ds.organization_id=${a}.organization_id`;
export async function assertLocalCreateAllowed(c: PoolClient, u: AuthUser, _entity: FoundationEntity): Promise<void> {
    // A new unmapped Ootla-owned local record never writes a provider record.
    await c.query('SELECT id FROM organizations WHERE id=$1 FOR SHARE', [u.organization.id]);
}
export async function assertFieldOwnership(c: PoolClient, u: AuthUser, e: FoundationEntity, id: string, fields: string[]): Promise<void> {
    if (!(await c.query(`SELECT id FROM ${tables[e]} WHERE organization_id=$1 AND id=$2 FOR UPDATE`, [u.organization.id, id])).rowCount)
        missing(e);
    await c.query('SELECT organization_id FROM organization_data_settings WHERE organization_id=$1 FOR SHARE', [u.organization.id]);
    const r = (await c.query(`SELECT ${ownership('r', e)} FROM ${tables[e]} r ${settings('r')} WHERE r.organization_id=$1 AND r.id=$2`, [u.organization.id, id])).rows[0]!;
    const prohibited = fields.filter(f => owned(r, e).includes(f));
    if (prohibited.length)
        throw new ApiError(409, 'SOURCE_OWNED_FIELD', `The configured source owns these fields: ${prohibited.join(', ')}. Update them in the authoritative source.`);
}
async function authorize(c: PoolClient, u: AuthUser, key: Permission): Promise<AuthUser> {
    const r = await c.query<{
        role: OrganizationRole;
    }>(`SELECT m.role FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' WHERE m.id=$1 AND m.organization_id=$2 AND m.user_id=$3 AND m.active AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission=$4) FOR SHARE OF m,u`, [u.membershipId, u.organization.id, u.id, key]);
    if (!r.rows[0])
        throw new ApiError(403, 'PERMISSION_DENIED', 'Your current staff role does not allow this action.');
    return { ...u, organization: { ...u.organization, role: r.rows[0].role } };
}
async function audit(c: PoolClient, u: AuthUser, action: string, meta: Record<string, unknown>): Promise<void> { await c.query('INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,$3,$4)', [u.organization.id, u.id, action, JSON.stringify(meta)]); }
async function lockProperty(c: PoolClient, u: AuthUser, id: string): Promise<void> {
    if (!(await c.query(`SELECT p.id FROM properties p WHERE ${propertyScope('p')} AND p.id=$4 FOR UPDATE OF p`, [...params(u), id])).rowCount)
        missing('property');
    if (u.organization.role !== 'organization_admin' && !(await c.query('SELECT property_id FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=$3 FOR SHARE', [u.organization.id, u.membershipId, id])).rowCount)
        missing('property');
}
async function lockProperties(c: PoolClient, u: AuthUser, ids: string[]): Promise<void> { for (const id of [...new Set(ids)].sort())
    await lockProperty(c, u, id); }
async function verifyGroup(c: PoolClient, u: AuthUser, id: string | null): Promise<void> { if (id && !(await c.query('SELECT id FROM property_groups WHERE organization_id=$1 AND id=$2 FOR SHARE', [u.organization.id, id])).rowCount)
    missing('property group'); }
async function contactForWrite(c: PoolClient, u: AuthUser, id: string): Promise<void> {
    if (!(await c.query('SELECT id FROM contacts WHERE organization_id=$1 AND id=$2 FOR UPDATE', [u.organization.id, id])).rowCount)
        missing('contact');
    const links = (await c.query<{
        property_id: string;
    }>('SELECT property_id FROM contact_property_links WHERE organization_id=$1 AND contact_id=$2 ORDER BY property_id', [u.organization.id, id])).rows;
    if (u.organization.role !== 'organization_admin') {
        const visible = await c.query(`SELECT property_id FROM contact_property_links cp WHERE cp.contact_id=$4 AND ${scope('cp')}`, [...params(u), id]);
        if (!visible.rowCount)
            missing('contact');
        if (visible.rowCount !== links.length)
            throw new ApiError(403, 'PERMISSION_DENIED', 'An organization admin must update an identity shared beyond your property access.');
    }
    await lockProperties(c, u, links.map(r => r.property_id));
}
function translate(error: unknown): never { if (error instanceof ApiError)
    throw error; const code = (error as {
    code?: string;
})?.code; if (code === '23505')
    throw new ApiError(409, 'DUPLICATE_RECORD', 'This record or external reference already exists.'); if (code === '23503')
    throw new ApiError(400, 'INVALID_RELATIONSHIP', 'Use related records from the same organization, property and contact.'); if (code === '23514' || code === '22003')
    throw new ApiError(400, 'INVALID_INPUT', 'Check the requested record fields.'); throw error; }
const propertyColumns = `p.id,p.name,p.address,p.city,p.property_type,p.group_id,g.name AS group_name,${ownership('p', 'property')},COALESCE(ua.unit_count,0)::int AS unit_count,COALESCE(ua.available_count,0)::int AS available_count,COALESCE(ua.availability_source,'unknown') AS availability_source,ua.last_verified_at`;
const propertyJoins = `LEFT JOIN property_groups g ON g.id=p.group_id AND g.organization_id=p.organization_id ${settings('p')} LEFT JOIN LATERAL(SELECT count(*) AS unit_count,count(*) FILTER(WHERE u.status='available') AS available_count,CASE WHEN count(DISTINCT u.availability_source)=1 THEN min(u.availability_source) WHEN count(*)=0 THEN 'unknown' ELSE 'mixed' END AS availability_source,CASE WHEN count(*)=count(u.availability_verified_at) THEN min(u.availability_verified_at) ELSE NULL END AS last_verified_at FROM units u WHERE u.organization_id=p.organization_id AND u.property_id=p.id) ua ON TRUE`;
const propertyDto = (r: Row): PropertySummary => ({ id: r.id, name: r.name, address: r.address, city: r.city, type: r.property_type, group: r.group_id ? { id: r.group_id, name: r.group_name } : null, source: r.source_system, unitCount: Number(r.unit_count), availableUnitCount: Number(r.available_count), availabilitySource: r.availability_source, lastVerifiedAt: iso(r.last_verified_at), readOnlyFields: owned(r, 'property') });
const unitDto = (r: Row): UnitRecord => ({ id: r.id, propertyId: r.property_id, label: r.label, bedrooms: r.bedrooms, status: r.status, monthlyRent: Number(r.monthly_rent), source: r.source_system, availabilitySource: r.availability_source, lastVerifiedAt: iso(r.availability_verified_at), readOnlyFields: owned(r, 'unit') });
const leadDto = (r: Row): RelatedLead => ({ id: r.id, contactId: r.contact_id, name: r.display_name, email: r.email, status: r.status, unitId: r.unit_id, createdAt: iso(r.created_at)! });
const contactDto = (r: Row): ContactRecord => ({ id: r.id, displayName: r.display_name, email: r.email, phone: r.phone, source: r.source_system, readOnlyFields: [...new Set([...owned(r, 'contact'), ...(r.has_hidden_links ? ['displayName', 'email', 'phone'] : [])])], propertyIds: r.property_ids ?? [], createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)! });
const mappingDto = (r: Row): ExternalMapping => ({ id: r.id, entityType: r.entity_type, entityId: r.property_id ?? r.unit_id ?? r.contact_id ?? r.application_id ?? r.lease_id, provider: r.provider, externalId: r.external_id, createdAt: iso(r.created_at)! });
const applicationDto = (r: Row): ApplicationRecord => ({ id: r.id, contactId: r.contact_id, householdId: r.household_id, propertyId: r.property_id, unitId: r.unit_id, leadId: r.lead_id, status: r.status, source: r.source_system });
const dateOnly = (v: unknown): string | null => v instanceof Date ? [v.getFullYear(), String(v.getMonth() + 1).padStart(2, '0'), String(v.getDate()).padStart(2, '0')].join('-') : v ? String(v).slice(0, 10) : null;
const leaseDto = (r: Row): LeaseRecord => ({ id: r.id, contactId: r.contact_id, householdId: r.household_id, propertyId: r.property_id, unitId: r.unit_id, applicationId: r.application_id, leadId: r.lead_id, status: r.status, startsOn: dateOnly(r.starts_on), endsOn: dateOnly(r.ends_on), source: r.source_system });
const contactColumns = `c.*,${ownership('c', 'contact')},ARRAY(SELECT cl.property_id FROM contact_property_links cl WHERE cl.contact_id=c.id AND ${scope('cl')} ORDER BY cl.property_id LIMIT 100) AS property_ids,($2<>'organization_admin' AND EXISTS(SELECT 1 FROM contact_property_links hidden WHERE hidden.organization_id=c.organization_id AND hidden.contact_id=c.id AND NOT EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=hidden.organization_id AND pa.property_id=hidden.property_id AND pa.membership_id=$3))) AS has_hidden_links`;
const contactScope = `c.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM contact_property_links cl WHERE cl.contact_id=c.id AND ${scope('cl')}))`;
export class PropertyFoundation {
    constructor(private readonly database: Database) { }
    private async write<T>(u: AuthUser, key: Permission, fn: (c: PoolClient, actor: AuthUser) => Promise<T>): Promise<T> { return this.database.transaction(async (c) => { try {
        return await fn(c, await authorize(c, u, key));
    }
    catch (error) {
        return translate(error);
    } }); }
    async access(u: AuthUser): Promise<FoundationAccess> { const r = (await this.database.query('SELECT mode FROM organization_data_settings WHERE organization_id=$1', [u.organization.id])).rows[0]; return { canCreateProperties: u.permissions.includes('property_access.manage'), canManageProperties: u.permissions.includes('properties.manage'), canManageContacts: u.permissions.includes('leasing.manage'), isOrganizationAdmin: u.organization.role === 'organization_admin', organizationMode: r?.mode ?? 'standalone' }; }
    async properties(u: AuthUser, i: z.infer<typeof propertyDirectorySchema>): Promise<Paginated<PropertySummary> & {
        access: FoundationAccess;
    }> {
        const where = `${propertyScope('p')} AND ($4='' OR strpos(lower(p.name||' '||p.address||' '||p.city),lower($4))>0) AND ($5='' OR p.city=$5) AND ($6::uuid IS NULL OR p.group_id=$6) AND ($7='' OR p.property_type=$7) AND ($8='' OR p.source_system=$8) AND ($9='' OR ($9='available' AND EXISTS(SELECT 1 FROM units uf WHERE uf.organization_id=p.organization_id AND uf.property_id=p.id AND uf.status='available')) OR ($9='unverified' AND EXISTS(SELECT 1 FROM units uf WHERE uf.organization_id=p.organization_id AND uf.property_id=p.id AND uf.availability_verified_at IS NULL)))`;
        const values = [...params(u), i.q, i.city, i.groupId || null, i.type, i.source, i.availability];
        const sorts = { name_asc: 'lower(p.name),p.id', name_desc: 'lower(p.name) DESC,p.id', city_asc: 'lower(p.city),lower(p.name),p.id', created_desc: 'p.created_at DESC,p.id' };
        const total = Number((await this.database.query(`SELECT count(*) AS total FROM properties p WHERE ${where}`, values)).rows[0]?.total ?? 0);
        const rows = await this.database.query(`SELECT ${propertyColumns} FROM properties p ${propertyJoins} WHERE ${where} ORDER BY ${sorts[i.sort]} LIMIT $10 OFFSET $11`, [...values, i.pageSize, (i.page - 1) * i.pageSize]);
        return { ...paged(rows.rows.map(propertyDto), total, i), access: await this.access(u) };
    }
    async groups(u: AuthUser): Promise<{
        items: PropertyGroup[];
        access: FoundationAccess;
    }> { const r = await this.database.query(`SELECT g.id,g.name FROM property_groups g WHERE g.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM properties p WHERE p.group_id=g.id AND ${propertyScope('p')})) ORDER BY lower(g.name),g.id LIMIT 100`, params(u)); return { items: r.rows as PropertyGroup[], access: await this.access(u) }; }
    async createGroup(u: AuthUser, i: {
        name: string;
    }): Promise<PropertyGroup> { return this.write(u, 'property_access.manage', async (c, a) => { const r = (await c.query('INSERT INTO property_groups(organization_id,name) VALUES($1,$2) RETURNING id,name', [a.organization.id, i.name])).rows[0]!; await audit(c, a, 'property_group.created', { groupId: r.id }); return r as PropertyGroup; }); }
    private async property(u: AuthUser, id: string, q: Queryable = this.database): Promise<PropertySummary> { const r = (await q.query(`SELECT ${propertyColumns} FROM properties p ${propertyJoins} WHERE ${propertyScope('p')} AND p.id=$4`, [...params(u), id])).rows[0]; return r ? propertyDto(r) : missing('property'); }
    async propertyDetail(u: AuthUser, id: string, page: Page = { page: 1, pageSize: 25 }): Promise<PropertyDetail> { const property = await this.property(u, id); const staff = (await this.database.query(`SELECT u.id,m.id AS membership_id,u.display_name AS name,m.role,count(*) OVER()::int AS total FROM property_access_assignments a JOIN organization_memberships m ON m.id=a.membership_id AND m.organization_id=a.organization_id AND m.active JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' WHERE a.organization_id=$1 AND a.property_id=$2 ORDER BY lower(u.display_name),u.id LIMIT 50`, [u.organization.id, id])).rows; return { property, units: await this.units(u, id, page), leads: await this.leads(u, id, page), staff: staff.map(r => ({ id: r.id, membershipId: r.membership_id, name: r.name, role: r.role } satisfies AssignedStaff)), staffTotal: staff[0]?.total ?? 0, externalMappings: u.organization.role === 'organization_admin' ? await this.entityMappings(u, 'property', id) : [], access: await this.access(u) }; }
    async units(u: AuthUser, id: string, page: Page): Promise<Paginated<UnitRecord>> { await this.property(u, id); const count = Number((await this.database.query('SELECT count(*) AS total FROM units WHERE organization_id=$1 AND property_id=$2', [u.organization.id, id])).rows[0]?.total ?? 0); const r = await this.database.query(`SELECT u.*,${ownership('u', 'unit')} FROM units u ${settings('u')} WHERE ${scope('u')} AND u.property_id=$4 ORDER BY lower(u.label),u.id LIMIT $5 OFFSET $6`, [...params(u), id, page.pageSize, (page.page - 1) * page.pageSize]); return paged(r.rows.map(unitDto), count, page); }
    async leads(u: AuthUser, id: string, page: Page): Promise<Paginated<RelatedLead>> { await this.property(u, id); const count = Number((await this.database.query('SELECT count(*) AS total FROM leads WHERE organization_id=$1 AND property_id=$2', [u.organization.id, id])).rows[0]?.total ?? 0); const r = await this.database.query(`SELECT l.id,l.contact_id,c.display_name,c.email,l.pipeline_stage AS status,l.unit_id,l.created_at FROM leads l JOIN contacts c ON c.id=l.contact_id AND c.organization_id=l.organization_id WHERE ${scope('l')} AND l.property_id=$4 ORDER BY l.created_at DESC,l.id LIMIT $5 OFFSET $6`, [...params(u), id, page.pageSize, (page.page - 1) * page.pageSize]); return paged(r.rows.map(leadDto), count, page); }
    async createProperty(u: AuthUser, i: z.infer<typeof propertyCreateSchema>): Promise<PropertySummary> { return this.write(u, 'property_access.manage', async (c, a) => { await assertLocalCreateAllowed(c, a, 'property'); await verifyGroup(c, a, i.groupId); const r = (await c.query('INSERT INTO properties(organization_id,name,address,city,property_type,group_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [a.organization.id, i.name, i.address, i.city, i.type, i.groupId])).rows[0]!; await audit(c, a, 'property.created', { propertyId: r.id }); return this.property(a, r.id, c); }); }
    async updateProperty(u: AuthUser, id: string, i: z.infer<typeof propertyUpdateSchema>): Promise<PropertySummary> { return this.write(u, 'properties.manage', async (c, a) => { await lockProperty(c, a, id); await assertFieldOwnership(c, a, 'property', id, Object.keys(i)); if (i.groupId !== undefined)
        await verifyGroup(c, a, i.groupId); await this.update(c, 'properties', a, id, i, { name: 'name', address: 'address', city: 'city', type: 'property_type', groupId: 'group_id' }); await audit(c, a, 'property.updated', { propertyId: id, fields: Object.keys(i) }); return this.property(a, id, c); }); }
    private async update(c: PoolClient, table: string, u: AuthUser, id: string, input: Record<string, unknown>, columns: Record<string, string>): Promise<Row> { const keys = Object.keys(input); return (await c.query(`UPDATE ${table} SET ${keys.map((key, n) => `${columns[key]}=$${n + 1}`).join(',')},updated_at=now() WHERE organization_id=$${keys.length + 1} AND id=$${keys.length + 2} RETURNING *`, [...keys.map(key => input[key]), u.organization.id, id])).rows[0]!; }
    private verified(i: {
        lastVerifiedAt?: string | null;
        availabilitySource?: string;
    }): void { if (i.lastVerifiedAt && new Date(i.lastVerifiedAt).getTime() > Date.now())
        throw new ApiError(400, 'INVALID_INPUT', 'Availability verification cannot be in the future.'); if (i.lastVerifiedAt && ['unknown', 'demo'].includes(i.availabilitySource ?? ''))
        throw new ApiError(400, 'INVALID_INPUT', 'Unknown and demo availability must remain unverified.'); }
    async createUnit(u: AuthUser, propertyId: string, i: z.infer<typeof unitCreateSchema>): Promise<UnitRecord> { this.verified(i); return this.write(u, 'properties.manage', async (c, a) => { await lockProperty(c, a, propertyId); await assertLocalCreateAllowed(c, a, 'unit'); const r = (await c.query('INSERT INTO units(organization_id,property_id,label,bedrooms,status,monthly_rent,availability_source,availability_verified_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [a.organization.id, propertyId, i.label, i.bedrooms, i.status, i.monthlyRent, i.availabilitySource, i.lastVerifiedAt])).rows[0]!; await audit(c, a, 'unit.created', { propertyId, unitId: r.id }); return this.unit(a, propertyId, r.id, c); }); }
    private async unit(u: AuthUser, propertyId: string, id: string, q: Queryable): Promise<UnitRecord> { const r = (await q.query(`SELECT u.*,${ownership('u', 'unit')} FROM units u ${settings('u')} WHERE ${scope('u')} AND u.property_id=$4 AND u.id=$5`, [...params(u), propertyId, id])).rows[0]; return r ? unitDto(r) : missing('unit'); }
    async updateUnit(u: AuthUser, propertyId: string, id: string, i: z.infer<typeof unitUpdateSchema>): Promise<UnitRecord> { return this.write(u, 'properties.manage', async (c, a) => { await lockProperty(c, a, propertyId); const previous = await this.unit(a, propertyId, id, c); const changes: Record<string, unknown> = { ...i }; if ((i.status !== undefined && i.status !== previous.status || i.availabilitySource !== undefined && i.availabilitySource !== previous.availabilitySource) && i.lastVerifiedAt === undefined)
        changes.lastVerifiedAt = null; this.verified({ ...i, availabilitySource: i.availabilitySource ?? previous.availabilitySource }); await assertFieldOwnership(c, a, 'unit', id, Object.keys(changes)); await this.update(c, 'units', a, id, changes, { label: 'label', bedrooms: 'bedrooms', status: 'status', monthlyRent: 'monthly_rent', availabilitySource: 'availability_source', lastVerifiedAt: 'availability_verified_at' }); await audit(c, a, 'unit.updated', { propertyId, unitId: id, fields: Object.keys(changes) }); return this.unit(a, propertyId, id, c); }); }
    async contacts(u: AuthUser, i: z.infer<typeof contactDirectorySchema>): Promise<Paginated<ContactRecord> & {
        access: FoundationAccess;
    }> { const where = `${contactScope} AND ($4='' OR strpos(lower(c.display_name||' '||c.email||' '||c.phone),lower($4))>0) AND ($5::uuid IS NULL OR EXISTS(SELECT 1 FROM contact_property_links cl WHERE cl.contact_id=c.id AND cl.property_id=$5 AND ${scope('cl')}))`; const values = [...params(u), i.q, i.propertyId || null]; const total = Number((await this.database.query(`SELECT count(*) AS total FROM contacts c WHERE ${where}`, values)).rows[0]?.total ?? 0); const rows = await this.database.query(`SELECT ${contactColumns} FROM contacts c ${settings('c')} WHERE ${where} ORDER BY lower(c.display_name),c.id LIMIT $6 OFFSET $7`, [...values, i.pageSize, (i.page - 1) * i.pageSize]); return { ...paged(rows.rows.map(contactDto), total, i), access: await this.access(u) }; }
    private async contact(u: AuthUser, id: string, q: Queryable = this.database): Promise<ContactRecord> { const r = (await q.query(`SELECT ${contactColumns} FROM contacts c ${settings('c')} WHERE ${contactScope} AND c.id=$4`, [...params(u), id])).rows[0]; return r ? contactDto(r) : missing('contact'); }
    async contactDetail(u: AuthUser, id: string, page: Page = { page: 1, pageSize: 25 }): Promise<ContactDetail> { const contact = await this.contact(u, id); const households = await this.households(u, { page: 1, pageSize: 25 }, id); return { contact, households: households.items, history: await this.contactHistory(u, id, page), externalMappings: u.organization.role === 'organization_admin' ? await this.entityMappings(u, 'contact', id) : [], access: await this.access(u) }; }
    async createContact(u: AuthUser, i: z.infer<typeof contactCreateSchema>): Promise<ContactRecord> { return this.write(u, 'leasing.manage', async (c, a) => { await lockProperties(c, a, i.propertyIds); const r = (await c.query('INSERT INTO contacts(organization_id,display_name,email,phone) VALUES($1,$2,$3,$4) RETURNING id', [a.organization.id, i.displayName, i.email.toLowerCase(), i.phone])).rows[0]!; for (const propertyId of [...new Set(i.propertyIds)])
        await c.query('INSERT INTO contact_property_links(organization_id,contact_id,property_id) VALUES($1,$2,$3)', [a.organization.id, r.id, propertyId]); await audit(c, a, 'contact.created', { contactId: r.id, propertyIds: [...new Set(i.propertyIds)] }); return this.contact(a, r.id, c); }); }
    async linkContactProperty(u: AuthUser, id: string, propertyId: string): Promise<ContactRecord> { return this.write(u, 'leasing.manage', async (c, a) => { await contactForWrite(c, a, id); await lockProperty(c, a, propertyId); const count = Number((await c.query('SELECT count(*) AS total FROM contact_property_links WHERE organization_id=$1 AND contact_id=$2', [a.organization.id, id])).rows[0]?.total ?? 0); const existing = await c.query('SELECT contact_id FROM contact_property_links WHERE organization_id=$1 AND contact_id=$2 AND property_id=$3', [a.organization.id, id, propertyId]); if (!existing.rowCount && count >= 100)
        throw new ApiError(400, 'INVALID_INPUT', 'Use at most 100 explicit property associations per contact.'); const inserted = await c.query('INSERT INTO contact_property_links(organization_id,contact_id,property_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [a.organization.id, id, propertyId]); if (inserted.rowCount)
        await audit(c, a, 'contact.property_linked', { contactId: id, propertyId }); return this.contact(a, id, c); }); }
    async updateContact(u: AuthUser, id: string, i: z.infer<typeof contactUpdateSchema>): Promise<ContactRecord> { return this.write(u, 'leasing.manage', async (c, a) => { await contactForWrite(c, a, id); await assertFieldOwnership(c, a, 'contact', id, Object.keys(i)); await this.update(c, 'contacts', a, id, { ...i, ...(i.email !== undefined ? { email: i.email.toLowerCase() } : {}) }, { displayName: 'display_name', email: 'email', phone: 'phone' }); await audit(c, a, 'contact.updated', { contactId: id, fields: Object.keys(i) }); return this.contact(a, id, c); }); }
    async contactHistory(u: AuthUser, id: string, page: Page): Promise<Paginated<ContactHistory>> {
        await this.contact(u, id);
        const internalHistory = u.permissions.includes('leasing.manage') ? `NOT EXISTS(SELECT 1 FROM lead_property_interests ni WHERE ni.organization_id=l.organization_id AND ni.lead_id=l.id AND NOT(${scope('ni')}))` : 'FALSE';
        const union = `SELECT l.id,'lead'::text AS kind,l.property_id,p.name AS property_name,'Lead: '||replace(l.pipeline_stage,'_',' ') AS summary,l.created_at AS occurred_at FROM leads l JOIN properties p ON p.id=l.property_id AND p.organization_id=l.organization_id WHERE l.contact_id=$4 AND ${scope('l')}
   UNION ALL SELECT a.id,'application',a.property_id,p.name,'Application: '||a.status,a.created_at FROM applications a JOIN properties p ON p.id=a.property_id AND p.organization_id=a.organization_id WHERE a.contact_id=$4 AND ${scope('a')}
   UNION ALL SELECT a.id,'lease',a.property_id,p.name,'Lease: '||a.status,a.created_at FROM leases a JOIN properties p ON p.id=a.property_id AND p.organization_id=a.organization_id WHERE a.contact_id=$4 AND ${scope('a')}
   UNION ALL SELECT a.id,'activity',a.property_id,p.name,a.summary,a.occurred_at FROM lead_activities a JOIN leads l ON l.id=a.lead_id AND l.organization_id=a.organization_id JOIN properties p ON p.id=a.property_id AND p.organization_id=a.organization_id WHERE l.contact_id=$4 AND ${scope('a')} AND (${internalHistory})
   UNION ALL SELECT e.id,'activity',l.property_id,p.name,CASE WHEN e.kind='stage_changed' THEN 'Lead stage: '||replace(COALESCE(e.previous_stage,''),'_',' ')||' to '||replace(e.stage,'_',' ')||' by '||eu.display_name ELSE 'Lead '||replace(e.kind,'_',' ')||' by '||eu.display_name END,e.occurred_at FROM lead_events e JOIN leads l ON l.id=e.lead_id AND l.organization_id=e.organization_id JOIN properties p ON p.id=l.property_id AND p.organization_id=l.organization_id JOIN users eu ON eu.id=e.actor_user_id WHERE l.contact_id=$4 AND ${scope('l')} AND (${internalHistory})`;
        const values = [...params(u), id];
        const total = Number((await this.database.query(`SELECT count(*) AS total FROM (${union}) h`, values)).rows[0]?.total ?? 0);
        const rows = await this.database.query(`SELECT * FROM (${union}) h ORDER BY occurred_at DESC,id,kind LIMIT $5 OFFSET $6`, [...values, page.pageSize, (page.page - 1) * page.pageSize]);
        return paged(rows.rows.map(r => ({ id: r.id, kind: r.kind, propertyId: r.property_id, propertyName: r.property_name, summary: r.summary, occurredAt: iso(r.occurred_at)! })), total, page);
    }
    private async household(u: AuthUser, id: string, q: Queryable = this.database): Promise<HouseholdRecord> {
        const r = (await q.query(`SELECT h.id,h.name,ARRAY(SELECT hp.property_id FROM household_property_links hp WHERE hp.household_id=h.id AND ${scope('hp')} ORDER BY hp.property_id LIMIT 100) AS property_ids FROM households h WHERE h.organization_id=$1 AND h.id=$4 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM household_property_links hp WHERE hp.household_id=h.id AND ${scope('hp')}))`, [...params(u), id])).rows[0];
        if (!r)
            missing('household');
        const members = (await q.query(`SELECT c.id AS contact_id,c.display_name,hm.relationship FROM household_members hm JOIN contacts c ON c.id=hm.contact_id AND c.organization_id=hm.organization_id WHERE hm.organization_id=$1 AND hm.household_id=$4 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM household_property_links hp JOIN contact_property_links cp ON cp.property_id=hp.property_id AND cp.organization_id=hp.organization_id AND cp.contact_id=c.id WHERE hp.household_id=hm.household_id AND ${scope('hp')})) ORDER BY lower(c.display_name),c.id LIMIT 100`, [...params(u), id])).rows;
        return { id: r.id, name: r.name, propertyIds: r.property_ids, members: members.map(m => ({ contactId: m.contact_id, displayName: m.display_name, relationship: m.relationship })) };
    }
    async households(u: AuthUser, page: Page, contactId?: string): Promise<Paginated<HouseholdRecord>> { const where = `h.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM household_property_links hp WHERE hp.household_id=h.id AND ${scope('hp')})) AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM household_members hm WHERE hm.household_id=h.id AND hm.organization_id=h.organization_id AND hm.contact_id=$4))`; const values = [...params(u), contactId ?? null]; const total = Number((await this.database.query(`SELECT count(*) AS total FROM households h WHERE ${where}`, values)).rows[0]?.total ?? 0); const rows = (await this.database.query(`SELECT h.id FROM households h WHERE ${where} ORDER BY lower(h.name),h.id LIMIT $5 OFFSET $6`, [...values, page.pageSize, (page.page - 1) * page.pageSize])).rows; const items: HouseholdRecord[] = []; for (const r of rows)
        items.push(await this.household(u, r.id)); return paged(items, total, page); }
    async createHousehold(u: AuthUser, i: z.infer<typeof householdCreateSchema>): Promise<HouseholdRecord> { return this.write(u, 'leasing.manage', async (c, a) => { await lockProperties(c, a, i.propertyIds); const r = (await c.query('INSERT INTO households(organization_id,name) VALUES($1,$2) RETURNING id', [a.organization.id, i.name])).rows[0]!; for (const propertyId of [...new Set(i.propertyIds)])
        await c.query('INSERT INTO household_property_links(organization_id,household_id,property_id) VALUES($1,$2,$3)', [a.organization.id, r.id, propertyId]); for (const member of i.members)
        await this.addMember(c, a, r.id, member); await audit(c, a, 'household.created', { householdId: r.id }); return this.household(a, r.id, c); }); }
    private async addMember(c: PoolClient, u: AuthUser, id: string, i: z.infer<typeof householdMemberSchema>): Promise<void> { const links = (await c.query<{
        property_id: string;
    }>('SELECT property_id FROM household_property_links WHERE organization_id=$1 AND household_id=$2 ORDER BY property_id', [u.organization.id, id])).rows; if (!links.length)
        missing('household'); await lockProperties(c, u, links.map(r => r.property_id)); const valid = await c.query(`SELECT c.id FROM contacts c WHERE c.organization_id=$1 AND c.id=$2 AND EXISTS(SELECT 1 FROM contact_property_links cp JOIN household_property_links hp ON hp.organization_id=cp.organization_id AND hp.property_id=cp.property_id AND hp.household_id=$3 WHERE cp.contact_id=c.id AND cp.organization_id=c.organization_id) FOR UPDATE OF c`, [u.organization.id, i.contactId, id]); if (!valid.rowCount)
        throw new ApiError(400, 'INVALID_RELATIONSHIP', 'A household member must be a contact associated with one of this household’s properties.'); await c.query('INSERT INTO household_members(organization_id,household_id,contact_id,relationship) VALUES($1,$2,$3,$4) ON CONFLICT(household_id,contact_id,organization_id) DO UPDATE SET relationship=EXCLUDED.relationship', [u.organization.id, id, i.contactId, i.relationship]); }
    async addHouseholdMember(u: AuthUser, id: string, i: z.infer<typeof householdMemberSchema>): Promise<HouseholdRecord> { return this.write(u, 'leasing.manage', async (c, a) => { if (!(await c.query('SELECT id FROM households WHERE organization_id=$1 AND id=$2 FOR UPDATE', [a.organization.id, id])).rowCount)
        missing('household'); await this.addMember(c, a, id, i); await audit(c, a, 'household.member_added', { householdId: id, contactId: i.contactId }); return this.household(a, id, c); }); }
    private async relationship(c: PoolClient, u: AuthUser, i: {
        contactId: string;
        propertyId: string;
        unitId: string | null;
        householdId: string | null;
        leadId: string | null;
        applicationId?: string | null;
    }): Promise<void> {
        await lockProperty(c, u, i.propertyId);
        if (!(await c.query('SELECT contact_id FROM contact_property_links WHERE organization_id=$1 AND contact_id=$2 AND property_id=$3 FOR SHARE', [u.organization.id, i.contactId, i.propertyId])).rowCount)
            throw new ApiError(400, 'INVALID_RELATIONSHIP', 'The contact must already be associated with this property.');
        if (i.unitId && !(await c.query('SELECT id FROM units WHERE organization_id=$1 AND property_id=$2 AND id=$3 FOR SHARE', [u.organization.id, i.propertyId, i.unitId])).rowCount)
            throw new ApiError(400, 'INVALID_RELATIONSHIP', 'Use a unit belonging to this property.');
        if (i.leadId && !(await c.query('SELECT id FROM leads WHERE organization_id=$1 AND property_id=$2 AND contact_id=$3 AND id=$4 AND (unit_id IS NULL OR $5::uuid IS NULL OR unit_id=$5) FOR SHARE', [u.organization.id, i.propertyId, i.contactId, i.leadId, i.unitId])).rowCount)
            throw new ApiError(400, 'INVALID_RELATIONSHIP', 'Use a lead for this contact, property and unit.');
        if (i.householdId && !(await c.query('SELECT hm.household_id FROM household_members hm JOIN household_property_links hp ON hp.household_id=hm.household_id AND hp.organization_id=hm.organization_id WHERE hm.organization_id=$1 AND hm.contact_id=$2 AND hm.household_id=$3 AND hp.property_id=$4 FOR SHARE OF hm,hp', [u.organization.id, i.contactId, i.householdId, i.propertyId])).rowCount)
            throw new ApiError(400, 'INVALID_RELATIONSHIP', 'Use a household containing this contact at this property.');
        if (i.applicationId) {
            const r = (await c.query('SELECT * FROM applications WHERE organization_id=$1 AND property_id=$2 AND contact_id=$3 AND id=$4 FOR SHARE', [u.organization.id, i.propertyId, i.contactId, i.applicationId])).rows[0];
            if (!r || r.unit_id && i.unitId && r.unit_id !== i.unitId || r.household_id && i.householdId && r.household_id !== i.householdId || r.lead_id && i.leadId && r.lead_id !== i.leadId)
                throw new ApiError(400, 'INVALID_RELATIONSHIP', 'Use an application with the same contact, property and related records.');
        }
    }
    async createApplication(u: AuthUser, i: z.infer<typeof applicationCreateSchema>): Promise<ApplicationRecord> { return this.write(u, 'leasing.manage', async (c, a) => { await assertLocalCreateAllowed(c, a, 'application'); await this.relationship(c, a, i); const r = (await c.query('INSERT INTO applications(organization_id,contact_id,household_id,property_id,unit_id,lead_id,status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *', [a.organization.id, i.contactId, i.householdId, i.propertyId, i.unitId, i.leadId, i.status])).rows[0]!; await syncLeadApplicationSummary(c,a,[i.leadId]); await audit(c, a, 'application.foundation_created', { applicationId: r.id, contactId: i.contactId, propertyId: i.propertyId }); return applicationDto(r); }); }
    async createLease(u: AuthUser, i: z.infer<typeof leaseCreateSchema>): Promise<LeaseRecord> { return this.write(u, 'leasing.manage', async (c, a) => { await assertLocalCreateAllowed(c, a, 'lease'); await this.relationship(c, a, i); const r = (await c.query('INSERT INTO leases(organization_id,contact_id,household_id,property_id,unit_id,application_id,lead_id,status,starts_on,ends_on) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *', [a.organization.id, i.contactId, i.householdId, i.propertyId, i.unitId, i.applicationId, i.leadId, i.status, i.startsOn, i.endsOn])).rows[0]!; await audit(c, a, 'lease.foundation_created', { leaseId: r.id, contactId: i.contactId, propertyId: i.propertyId }); return leaseDto(r); }); }
    async relatedRecords(u: AuthUser, e: 'application' | 'lease', page: Page, propertyId?: string): Promise<Paginated<ApplicationRecord | LeaseRecord>> { const table = tables[e], values = [...params(u), propertyId ?? null], where = `${scope('r')} AND ($4::uuid IS NULL OR r.property_id=$4)`; const total = Number((await this.database.query(`SELECT count(*) AS total FROM ${table} r WHERE ${where}`, values)).rows[0]?.total ?? 0); const rows = (await this.database.query(`SELECT r.* FROM ${table} r WHERE ${where} ORDER BY r.created_at DESC,r.id LIMIT $5 OFFSET $6`, [...values, page.pageSize, (page.page - 1) * page.pageSize])).rows; return paged(rows.map(r => e === 'application' ? applicationDto(r) : leaseDto(r)), total, page); }
    async updateRelated(u: AuthUser, e: 'application' | 'lease', id: string, i: Record<string, unknown>): Promise<ApplicationRecord | LeaseRecord> {
        return this.write(u, 'leasing.manage', async (c, a) => {
            const table = tables[e];
            const previous = (await c.query(`SELECT r.* FROM ${table} r WHERE ${scope('r')} AND r.id=$4 FOR UPDATE OF r`, [...params(a), id])).rows[0];
            if (!previous)
                missing(e);
            if(e==='lease'&&(await c.query("SELECT to_regclass('public.lease_workflows') IS NOT NULL AS ready")).rows[0]?.ready&&(await c.query('SELECT id FROM lease_workflows WHERE organization_id=$1 AND lease_id=$2',[a.organization.id,id])).rowCount) throw new ApiError(409,'LEASE_WORKFLOW_REQUIRED','Use the managed lease workflow; direct foundation edits cannot change its identity or signature evidence.');
            const existing = e === 'application' ? applicationDto(previous) : leaseDto(previous);
            const combined = { ...existing, ...i };
            await this.relationship(c, a, combined);
            await assertFieldOwnership(c, a, e, id, Object.keys(i));
            const dateValues = combined as unknown as {
                startsOn?: string | null;
                endsOn?: string | null;
            };
            if (e === 'lease' && dateValues.startsOn && dateValues.endsOn && dateValues.endsOn < dateValues.startsOn)
                throw new ApiError(400, 'INVALID_INPUT', 'Lease end date must follow its start date.');
            const r = await this.update(c, table, a, id, i, { contactId: 'contact_id', householdId: 'household_id', propertyId: 'property_id', unitId: 'unit_id', leadId: 'lead_id', status: 'status', applicationId: 'application_id', startsOn: 'starts_on', endsOn: 'ends_on' });
            if(e==='application') await syncLeadApplicationSummary(c,a,[previous.lead_id,r.lead_id]);
            await audit(c, a, `${e}.foundation_updated`, { recordId: id, fields: Object.keys(i) });
            return e === 'application' ? applicationDto(r) : leaseDto(r);
        });
    }
    private async entityMappings(u: AuthUser, e: FoundationEntity, id: string): Promise<ExternalMapping[]> { return (await this.database.query(`SELECT * FROM external_record_mappings WHERE organization_id=$1 AND ${mapColumns[e]}=$2 ORDER BY provider,id LIMIT 100`, [u.organization.id, id])).rows.map(mappingDto); }
    async mappings(u: AuthUser, page: Page, filter?: {
        entityType: FoundationEntity;
        entityId: string;
    }): Promise<Paginated<ExternalMapping>> { permission(u, 'property_access.manage'); const where = filter ? `organization_id=$1 AND ${mapColumns[filter.entityType]}=$2` : 'organization_id=$1'; const values = filter ? [u.organization.id, filter.entityId] : [u.organization.id]; const total = Number((await this.database.query(`SELECT count(*) AS total FROM external_record_mappings WHERE ${where}`, values)).rows[0]?.total ?? 0); const rows = (await this.database.query(`SELECT * FROM external_record_mappings WHERE ${where} ORDER BY created_at DESC,id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, page.pageSize, (page.page - 1) * page.pageSize])).rows; return paged(rows.map(mappingDto), total, page); }
    async createMapping(u: AuthUser, i: z.infer<typeof externalMappingSchema>): Promise<ExternalMapping> { return this.write(u, 'property_access.manage', async (c, a) => { if (i.provider === 'yardi_demo') throw new ApiError(403, 'CONNECTOR_MAPPING_REQUIRED', 'Simulator mappings are managed through the connector workflow.'); if (!(await c.query(`SELECT id FROM ${tables[i.entityType]} WHERE organization_id=$1 AND id=$2 FOR UPDATE`, [a.organization.id, i.entityId])).rowCount)
        missing(i.entityType); const r = (await c.query(`INSERT INTO external_record_mappings(organization_id,entity_type,${mapColumns[i.entityType]},provider,external_id) VALUES($1,$2,$3,$4,$5) RETURNING *`, [a.organization.id, i.entityType, i.entityId, i.provider, i.externalId])).rows[0]!; await audit(c, a, 'external_mapping.registered', { mappingId: r.id, entityType: i.entityType, entityId: i.entityId, provider: i.provider }); return mappingDto(r); }); }
}
