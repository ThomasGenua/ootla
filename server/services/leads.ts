import {routeNewLead} from './lead-routing.js';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import type { z } from 'zod';
import type { AuthUser, OrganizationRole } from '../../shared/contracts.js';
import { leasingStages, salesStages, type LeadAccess, type LeadRecord, type LeadDirectory, type LeadDetail, type LeadEvent, type LeadOptions, type DuplicateSuggestions, type LeadIntent, type StageChoice, leadCreateSchema, type leadUpdateSchema, type leadStageSchema, type leadDirectorySchema, type leadOptionsSchema, type duplicateSuggestionsSchema, type leaseVerificationSchema } from '../../shared/lead-contracts.js';
import type { Paginated } from '../../shared/property-contracts.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { assertFieldOwnership } from './property-foundation.js';
interface Queryable {
    query<T extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<T>>;
}
type Row = QueryResultRow;
type Page = {
    page: number;
    pageSize: number;
};
const params = (u: AuthUser): unknown[] => [u.organization.id, u.organization.role, u.membershipId];
const propertyScope = (a: string) => `${a}.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=${a}.organization_id AND pa.property_id=${a}.id AND pa.membership_id=$3))`;
const scope = (a: string) => `${a}.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=${a}.organization_id AND pa.property_id=${a}.property_id AND pa.membership_id=$3))`;
const iso = (v: unknown): string | null => v ? (v instanceof Date ? v : new Date(String(v))).toISOString() : null;
const paged = <T>(items: T[], total: number, p: Page): Paginated<T> => ({ items, total, page: p.page, pageSize: p.pageSize, totalPages: Math.ceil(total / p.pageSize) });
const missing = (): never => { throw new ApiError(404, 'LEAD_NOT_FOUND', 'This lead is unavailable or outside your assigned property access.'); };
const access = (u: AuthUser): LeadAccess => ({ canManage: u.permissions.includes('leasing.manage'), canVerifyLease: u.permissions.includes('leasing.manage') && ['organization_admin', 'property_manager'].includes(u.organization.role) });
export const leadStageGraphs: Record<LeadIntent, Record<string, string[]>> = {
    leasing: { new_inquiry: ['contacted', 'lost_closed'], contacted: ['new_inquiry', 'tour_scheduled', 'application_started', 'lost_closed'], tour_scheduled: ['contacted', 'application_started', 'lost_closed'], application_started: ['tour_scheduled', 'application_submitted', 'lost_closed'], application_submitted: ['application_started', 'staff_review', 'lost_closed'], staff_review: ['application_submitted', 'lease_pending', 'lost_closed'], lease_pending: ['staff_review', 'leased', 'lost_closed'], leased: [], lost_closed: ['new_inquiry'] },
    sales: { new_inquiry: ['contacted', 'lost_closed'], contacted: ['new_inquiry', 'viewing_scheduled', 'negotiation', 'lost_closed'], viewing_scheduled: ['contacted', 'negotiation', 'lost_closed'], negotiation: ['viewing_scheduled', 'offer_pending', 'lost_closed'], offer_pending: ['negotiation', 'won', 'lost_closed'], won: [], lost_closed: ['new_inquiry'] }
};
const stages = (intent: LeadIntent) => intent === 'leasing' ? leasingStages : salesStages;
const stageLabel = (intent: LeadIntent, stage: string) => stages(intent).find(s => s.key === stage)?.label ?? stage;
function stageEvidence(r: Row, target: string): boolean {
    if (r.intent !== 'leasing')
        return true;
    const required: Record<string, string> = { application_started: 'draft', application_submitted: 'submitted', staff_review: 'staff_review', lease_pending: 'staff_review' };
    const rank: Record<string, number> = { draft: 0, submitted: 1, staff_review: 2 };
    return target === 'leased' ? Boolean(r.verified_lease_id) : !required[target] || (rank[r.application_summary_status] ?? -1) >= (rank[required[target]!] ?? Infinity);
}
function choices(r: Row): StageChoice[] {
    if (r.has_hidden_interests)
        return [];
    return (leadStageGraphs[r.intent as LeadIntent][r.pipeline_stage] ?? []).filter(s => stageEvidence(r, s)).map(key => ({ key, label: stageLabel(r.intent, key) }));
}
const verifiedJoin = `LEFT JOIN LATERAL(SELECT vm.lease_id,vm.verified_at,vm.evidence_reference,vm.evidence_kind,vu.display_name AS verified_by_name FROM lease_verified_milestones vm JOIN leases vl ON vl.id=vm.lease_id AND vl.organization_id=vm.organization_id AND vl.lead_id=vm.lead_id AND vl.property_id=vm.property_id AND vl.contact_id=vm.contact_id JOIN users vu ON vu.id=vm.verified_by_user_id WHERE vm.organization_id=l.organization_id AND vm.lead_id=l.id AND vl.status='active' AND vl.starts_on IS NOT NULL AND vl.updated_at=vm.lease_updated_at AND vl.unit_id IS NOT DISTINCT FROM l.unit_id AND vl.source_system='local' AND cardinality(vl.source_owned_fields)=0 AND NOT EXISTS(SELECT 1 FROM external_record_mappings em WHERE em.organization_id=vl.organization_id AND em.lease_id=vl.id AND em.provider='yardi')  AND (vm.evidence_kind='manual_attestation' OR (vm.evidence_kind='demo_event' AND EXISTS(SELECT 1 FROM organizations eo WHERE eo.id=vm.organization_id AND eo.environment='demo'))) AND NOT EXISTS(SELECT 1 FROM lease_workflows wf WHERE wf.organization_id=vm.organization_id AND wf.lease_id=vm.lease_id AND (wf.signature_verified_at IS NULL OR (wf.leased_milestone='completed' AND wf.stage<>'completed') OR (wf.leased_milestone='fully_signed' AND wf.stage NOT IN ('fully_signed','move_in_scheduled','completed')))) ORDER BY vm.verified_at DESC,vm.id LIMIT 1) vm ON TRUE`;
const select = `l.*,c.display_name AS contact_name,c.email AS contact_email,c.phone AS contact_phone,p.name AS property_name,p.property_type AS primary_property_type,un.label AS unit_label,un.bedrooms AS unit_bedrooms,om.user_id AS owner_user_id,ou.display_name AS owner_name,om.role AS owner_role,vm.lease_id AS verified_lease_id,vm.verified_at,vm.evidence_reference,vm.evidence_kind,vm.verified_by_name,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',ip.id,'name',ip.name) ORDER BY lower(ip.name),ip.id) FROM lead_property_interests li JOIN properties ip ON ip.id=li.property_id AND ip.organization_id=li.organization_id WHERE li.organization_id=l.organization_id AND li.lead_id=l.id AND (${propertyScope('ip')})),'[]'::jsonb) AS interest_properties,EXISTS(SELECT 1 FROM lead_property_interests hi JOIN properties hp ON hp.id=hi.property_id AND hp.organization_id=hi.organization_id WHERE hi.organization_id=l.organization_id AND hi.lead_id=l.id AND NOT($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments hpa WHERE hpa.organization_id=hp.organization_id AND hpa.property_id=hp.id AND hpa.membership_id=$3))) AS has_hidden_interests`;
const joins = `JOIN contacts c ON c.id=l.contact_id AND c.organization_id=l.organization_id JOIN properties p ON p.id=l.property_id AND p.organization_id=l.organization_id LEFT JOIN units un ON un.id=l.unit_id AND un.organization_id=l.organization_id AND un.property_id=l.property_id LEFT JOIN organization_memberships om ON om.id=l.owner_membership_id AND om.organization_id=l.organization_id LEFT JOIN users ou ON ou.id=om.user_id ${verifiedJoin}`;
function unitDescription(r: Row): string | null {
    if (!r.unit_id)
        return null;
    const names: Record<string, string> = { apartment: 'apartment', apartments: 'apartment', townhome: 'townhome', townhomes: 'townhome', townhouse: 'townhouse', townhouses: 'townhouse', condo: 'condo', condominium: 'condominium', house: 'house', houses: 'house', single_family: 'home' };
    const noun = names[String(r.primary_property_type).toLowerCase()] ?? 'unit';
    return r.unit_bedrooms === 0 ? `Studio ${noun}` : `${r.unit_bedrooms}-bedroom ${noun}`;
}
const dto = (r: Row): LeadRecord => ({ id: r.id, contactId: r.contact_id, name: r.contact_name, email: r.contact_email, phone: r.contact_phone, intent: r.intent, propertyId: r.property_id, propertyName: r.property_name, unitId: r.unit_id, unitLabel: r.unit_label, unitDescription: unitDescription(r), interestPropertyIds: r.interest_properties.map((p: {
        id: string;
    }) => p.id), interestProperties: r.interest_properties, owner: r.owner_membership_id ? { membershipId: r.owner_membership_id, userId: r.owner_user_id, name: r.owner_name, role: r.owner_role } : null, source: r.source, preferences: r.preferences, stage: r.pipeline_stage, stageLabel: stageLabel(r.intent, r.pipeline_stage), nextActionAt: iso(r.next_action_at), nextAction: r.next_action, notes: r.notes, applicationSummary: r.application_summary_id ? { id: r.application_summary_id, status: r.application_summary_status } : null, verifiedLeaseMilestone: r.verified_lease_id ? { leaseId: r.verified_lease_id, verifiedAt: iso(r.verified_at)!, verifiedByName: r.verified_by_name, evidenceReference: r.evidence_reference, evidenceKind: r.evidence_kind } : null, allowedStages: choices(r), version: r.version, createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)! });
// Internal staff text and evidence must not leak through older lead endpoints.
const mayReadPrivate = (u: AuthUser, r: Row): boolean => u.permissions.includes('leasing.manage') && !r.has_hidden_interests;
const privateRow = (u: AuthUser, r: Row): Row => mayReadPrivate(u,r) ? r : { ...r, notes: '', verified_lease_id: null, evidence_reference: null };
const privateNotesSql = (u: AuthUser): string => u.permissions.includes('leasing.manage')
    ? "CASE WHEN NOT EXISTS(SELECT 1 FROM lead_property_interests ni WHERE ni.organization_id=l.organization_id AND ni.lead_id=l.id AND NOT("+scope('ni')+")) THEN l.notes ELSE '' END"
    : "''";
async function authorize(c: PoolClient, u: AuthUser): Promise<AuthUser> {
    const r = (await c.query<{
        role: OrganizationRole;
    }>(`SELECT m.role FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' WHERE m.id=$1 AND m.organization_id=$2 AND m.user_id=$3 AND m.active AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission='leasing.manage') FOR SHARE OF m,u`, [u.membershipId, u.organization.id, u.id])).rows[0];
    if (!r)
        throw new ApiError(403, 'PERMISSION_DENIED', 'Your current staff role does not allow lead changes.');
    return { ...u, organization: { ...u.organization, role: r.role } };
}
async function audit(c: PoolClient, u: AuthUser, action: string, metadata: Record<string, unknown>): Promise<void> { await c.query('INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,$3,$4)', [u.organization.id, u.id, action, JSON.stringify(metadata)]); }
async function event(c: PoolClient, u: AuthUser, id: string, kind: LeadEvent['kind'], stage: string, previous: string | null, metadata: Record<string, unknown>): Promise<void> { await c.query('INSERT INTO lead_events(organization_id,lead_id,kind,previous_stage,stage,actor_user_id,actor_membership_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [u.organization.id, id, kind, previous, stage, u.id, u.membershipId, JSON.stringify(metadata)]); await audit(c, u, `lead.${kind}`, { leadId: id, previousStage: previous, stage, ...metadata }); }
async function lockProperties(c: PoolClient, u: AuthUser, ids: string[]): Promise<void> {
    for (const id of [...new Set(ids)].sort()) {
        if (!(await c.query(`SELECT p.id FROM properties p WHERE ${propertyScope('p')} AND p.id=$4 FOR SHARE OF p`, [...params(u), id])).rowCount)
            throw new ApiError(403, 'PROPERTY_ACCESS_DENIED', 'Every lead property interest must be within your assigned access.');
        if (u.organization.role !== 'organization_admin' && !(await c.query('SELECT property_id FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=$3 FOR SHARE', [u.organization.id, u.membershipId, id])).rowCount)
            throw new ApiError(403, 'PROPERTY_ACCESS_DENIED', 'Your property assignment has changed.');
    }
}
async function currentInterests(c: PoolClient, u: AuthUser, id: string): Promise<string[]> {
    return (await c.query<{
        property_id: string;
    }>('SELECT property_id FROM lead_property_interests WHERE organization_id=$1 AND lead_id=$2 ORDER BY property_id FOR SHARE', [u.organization.id, id])).rows.map(r => r.property_id);
}
async function validateOwner(c: PoolClient, u: AuthUser, id: string | null, properties: string[]): Promise<void> {
    if (!id)
        return;
    const owner = (await c.query(`SELECT m.id,m.role FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' WHERE m.organization_id=$1 AND m.id=$2 AND m.active AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission='leasing.manage') FOR SHARE OF m,u`, [u.organization.id, id])).rows[0];
    if (!owner)
        throw new ApiError(400, 'INVALID_OWNER', 'Choose an active staff member with lead-management permission in this organization.');
    if (owner.role !== 'organization_admin') {
        const grants = await c.query('SELECT property_id FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=ANY($3::uuid[]) FOR SHARE', [u.organization.id, id, properties]);
        if (grants.rowCount !== properties.length)
            throw new ApiError(400, 'INVALID_OWNER', 'The lead owner needs access to every property interest.');
    }
}
async function validateLinks(c: PoolClient, u: AuthUser, contactId: string, properties: string[]): Promise<void> {
    if (!(await c.query('SELECT id FROM contacts WHERE organization_id=$1 AND id=$2 FOR SHARE', [u.organization.id, contactId])).rowCount)
        throw new ApiError(400, 'INVALID_CONTACT', 'Choose an existing contact in this organization.');
    const rows = await c.query('SELECT property_id FROM contact_property_links WHERE organization_id=$1 AND contact_id=$2 AND property_id=ANY($3::uuid[]) FOR SHARE', [u.organization.id, contactId, properties]);
    if (rows.rowCount !== properties.length)
        throw new ApiError(400, 'CONTACT_PROPERTY_LINK_REQUIRED', 'Associate this contact with every selected property explicitly in Contacts first.');
}
async function validateUnit(c: PoolClient, u: AuthUser, propertyId: string, unitId: string | null): Promise<void> {
    if (unitId && !(await c.query('SELECT id FROM units WHERE organization_id=$1 AND property_id=$2 AND id=$3 FOR SHARE', [u.organization.id, propertyId, unitId])).rowCount)
        throw new ApiError(400, 'INVALID_UNIT', 'Choose a unit belonging to the primary property.');
}
function version(r: Row, expected: number): void {
    if (r.version !== expected)
        throw new ApiError(409, 'LEAD_VERSION_CONFLICT', 'This lead changed since you opened it. Refresh before saving.');
}
function translate(error: unknown): never {
    if (error instanceof ApiError)
        throw error;
    const code = (error as {
        code?: string;
    })?.code;
    if (code === '23503')
        throw new ApiError(400, 'INVALID_RELATIONSHIP', 'Use records belonging to the same organization, property and contact.');
    if (code === '23505')
        throw new ApiError(409, 'DUPLICATE_RECORD', 'This explicit record reference already exists.');
    if (code === '23514' || code === '22003')
        throw new ApiError(400, 'INVALID_INPUT', 'Check the lead fields and stage.');
    throw error;
}
/** Called inside the application mutation transaction. The application remains authoritative. */
export async function syncLeadApplicationSummary(c: PoolClient, u: AuthUser, ids: (string | null | undefined)[]): Promise<void> {
    for (const id of [...new Set(ids.filter((v): v is string => Boolean(v)))].sort()) {
        const lead = (await c.query('SELECT * FROM leads WHERE organization_id=$1 AND id=$2 FOR UPDATE', [u.organization.id, id])).rows[0];
        if (!lead)
            continue;
        const app = (await c.query('SELECT id,status FROM applications WHERE organization_id=$1 AND lead_id=$2 ORDER BY updated_at DESC,created_at DESC,id LIMIT 1', [u.organization.id, id])).rows[0];
        if ((app?.id ?? null) === lead.application_summary_id && (app?.status ?? null) === lead.application_summary_status)
            continue;
        await c.query('UPDATE leads SET application_summary_id=$3,application_summary_status=$4,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2', [u.organization.id, id, app?.id ?? null, app?.status ?? null]);
        await event(c, u, id, 'application_summary', lead.pipeline_stage, null, { applicationId: app?.id ?? null, status: app?.status ?? null });
    }
}
export class Leads {
    constructor(private readonly database: Database) { }
    private async write<T>(u: AuthUser, fn: (c: PoolClient, a: AuthUser) => Promise<T>): Promise<T> {
        return this.database.transaction(async (c) => {
            try {
                return await fn(c, await authorize(c, u));
            }
            catch (error) {
                return translate(error);
            }
        });
    }
    private async row(u: AuthUser, id: string, q: Queryable = this.database): Promise<Row> { const r = (await q.query(`SELECT ${select} FROM leads l ${joins} WHERE ${scope('l')} AND l.id=$4`, [...params(u), id])).rows[0] ?? missing(); return privateRow(u,r); }
    private async lock(c: PoolClient, u: AuthUser, id: string): Promise<Row> {
        const r = (await c.query(`SELECT l.* FROM leads l WHERE ${scope('l')} AND l.id=$4 FOR UPDATE OF l`, [...params(u), id])).rows[0];
        if (!r)
            missing();
        await lockProperties(c, u, [r.property_id, ...await currentInterests(c, u, id)]);
        return r;
    }
    async directory(u: AuthUser, i: z.infer<typeof leadDirectorySchema>): Promise<LeadDirectory> { const values = [...params(u), i.q, i.intent, i.stage, i.propertyId || null, i.ownerMembershipId, i.source, i.nextAction]; const where = `${scope('l')} AND ($4='' OR strpos(lower(c.display_name||' '||c.email||' '||c.phone||' '||p.name||' '||l.source||' '||(${privateNotesSql(u)})||' '||l.next_action),lower($4))>0) AND ($5='' OR l.intent=$5) AND ($6='' OR l.pipeline_stage=$6) AND ($7::uuid IS NULL OR EXISTS(SELECT 1 FROM lead_property_interests li JOIN properties ip ON ip.id=li.property_id AND ip.organization_id=li.organization_id WHERE li.organization_id=l.organization_id AND li.lead_id=l.id AND li.property_id=$7 AND (${propertyScope('ip')}))) AND ($8='' OR ($8='unassigned' AND l.owner_membership_id IS NULL) OR l.owner_membership_id::text=$8) AND ($9='' OR l.source=$9) AND ($10='' OR ($10='none' AND l.next_action_at IS NULL) OR ($10='overdue' AND l.next_action_at<now()) OR ($10='upcoming' AND l.next_action_at>=now()))`; const total = Number((await this.database.query(`SELECT count(*) AS total FROM leads l ${joins} WHERE ${where}`, values)).rows[0]?.total ?? 0); const sorts = { updated_desc: 'l.updated_at DESC,l.id', created_desc: 'l.created_at DESC,l.id', name_asc: 'lower(c.display_name),l.id', next_action_asc: 'l.next_action_at ASC NULLS LAST,l.id' }; const rows = (await this.database.query(`SELECT ${select} FROM leads l ${joins} WHERE ${where} ORDER BY ${sorts[i.sort]} LIMIT $11 OFFSET $12`, [...values, i.pageSize, (i.page - 1) * i.pageSize])).rows; const counts = (await this.database.query(`SELECT l.intent,l.pipeline_stage,count(*)::int AS total FROM leads l ${joins} WHERE ${where} GROUP BY l.intent,l.pipeline_stage`, values)).rows; return { ...paged(rows.map(r => dto(privateRow(u,r))), total, i), stageCounts: counts.map(r => ({ intent: r.intent, stage: r.pipeline_stage, label: stageLabel(r.intent, r.pipeline_stage), total: r.total })), access: access(u) }; }
    async followUps(u: AuthUser, q = '', filters: string[] = []): Promise<{
        items: LeadRecord[];
    }> { const legacy: Record<string, string> = { new: 'new_inquiry', viewing_scheduled: 'tour_scheduled', qualified: 'application_started' }; const selected = filters.map(s => legacy[s] ?? s); const rows = (await this.database.query(`SELECT ${select} FROM leads l ${joins} WHERE ${scope('l')} AND l.pipeline_stage NOT IN ('leased','won','lost_closed') AND ($4='' OR strpos(lower(c.display_name||' '||c.email||' '||p.name),lower($4))>0) AND (cardinality($5::text[])=0 OR l.pipeline_stage=ANY($5::text[])) ORDER BY l.next_action_at ASC NULLS LAST,l.created_at,l.id LIMIT 3`, [...params(u), q, selected])).rows; return { items: rows.map(r => dto(privateRow(u,r))) }; }
    async events(u: AuthUser, id: string, p: Page, q: Queryable = this.database): Promise<Paginated<LeadEvent>> {
        const record = await this.row(u, id, q);
        if (!mayReadPrivate(u,record)) return paged([],0,p);
        const visible = new Set<string>(record.interest_properties.map((p: {
            id: string;
        }) => p.id));
        const total = Number((await q.query('SELECT count(*) AS total FROM lead_events WHERE organization_id=$1 AND lead_id=$2', [u.organization.id, id])).rows[0]?.total ?? 0);
        const rows = (await q.query('SELECT e.*,u.display_name AS actor_name FROM lead_events e JOIN users u ON u.id=e.actor_user_id WHERE e.organization_id=$1 AND e.lead_id=$2 ORDER BY e.occurred_at DESC,e.id LIMIT $3 OFFSET $4', [u.organization.id, id, p.pageSize, (p.page - 1) * p.pageSize])).rows;
        return paged(rows.map(r => ({ id: r.id, kind: r.kind, previousStage: r.previous_stage, stage: r.stage, actor: { id: r.actor_user_id, name: r.actor_name }, occurredAt: iso(r.occurred_at)!, metadata: { ...r.metadata, ...(Array.isArray(r.metadata.interestPropertyIds) ? { interestPropertyIds: r.metadata.interestPropertyIds.filter((id: string) => visible.has(id)) } : {}) } })), total, p);
    }
    async detail(u: AuthUser, id: string, p: Page = { page: 1, pageSize: 25 }): Promise<LeadDetail> { const r = await this.row(u, id); const grants = access(u); return { lead: dto(r), events: await this.events(u, id, p), access: r.has_hidden_interests ? { canManage: false, canVerifyLease: false } : grants }; }
    async options(u: AuthUser, i: z.infer<typeof leadOptionsSchema>): Promise<LeadOptions> {
        if (i.propertyId)
            await locklessProperty(this.database, u, i.propertyId);
        const props = (await this.database.query(`SELECT p.id,p.name,count(*) OVER()::int AS total FROM properties p WHERE ${propertyScope('p')} AND ($4='' OR strpos(lower(p.name||' '||p.city),lower($4))>0) ORDER BY lower(p.name),p.id LIMIT $5 OFFSET $6`, [...params(u), i.q, i.pageSize, (i.page - 1) * i.pageSize])).rows;
        let owners: Row[] = [], units: Row[] = [];
        owners = (await this.database.query(`SELECT m.id AS membership_id,m.user_id,u.display_name AS name,m.role,count(*) OVER()::int AS total FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' WHERE m.organization_id=$1 AND m.active AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission='leasing.manage') AND (m.role='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=m.organization_id AND pa.membership_id=m.id AND ($2::uuid IS NULL OR pa.property_id=$2) AND ($6='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments actor_pa WHERE actor_pa.organization_id=pa.organization_id AND actor_pa.property_id=pa.property_id AND actor_pa.membership_id=$7)))) AND ($3='' OR strpos(lower(u.display_name),lower($3))>0) ORDER BY lower(u.display_name),m.id LIMIT $4 OFFSET $5`, [u.organization.id, i.propertyId ?? null, i.q, i.pageSize, (i.page - 1) * i.pageSize, u.organization.role, u.membershipId])).rows;
        if (i.propertyId) {
            units = (await this.database.query(`SELECT id,label,count(*) OVER()::int AS total FROM units WHERE organization_id=$1 AND property_id=$2 AND ($3='' OR strpos(lower(label),lower($3))>0) ORDER BY lower(label),id LIMIT $4 OFFSET $5`, [u.organization.id, i.propertyId, i.q, i.pageSize, (i.page - 1) * i.pageSize])).rows;
        }
        return { owners: owners.map(r => ({ membershipId: r.membership_id, userId: r.user_id, name: r.name, role: r.role })), ownerTotal: owners[0]?.total ?? 0, units: units.map(r => ({ id: r.id, label: r.label })), unitTotal: units[0]?.total ?? 0, properties: props.map(r => ({ id: r.id, name: r.name })), propertyTotal: props[0]?.total ?? 0 };
    }
    async duplicates(u: AuthUser, i: z.infer<typeof duplicateSuggestionsSchema>): Promise<DuplicateSuggestions> { const rows = (await this.database.query(`SELECT c.id,c.display_name,c.email,c.phone,(SELECT count(*)::int FROM leads l WHERE l.contact_id=c.id AND ${scope('l')}) AS lead_count,($4<>'' AND lower(c.display_name)=lower($4)) AS same_name,($5<>'' AND lower(c.email)=lower($5)) AS same_email,(length(regexp_replace($6,'[^0-9]','','g'))>=5 AND regexp_replace(c.phone,'[^0-9]','','g')=regexp_replace($6,'[^0-9]','','g')) AS same_phone FROM contacts c WHERE c.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM contact_property_links cp WHERE cp.contact_id=c.id AND ${scope('cp')})) AND (($4<>'' AND lower(c.display_name)=lower($4)) OR ($5<>'' AND lower(c.email)=lower($5)) OR ($6<>'' AND length(regexp_replace($6,'[^0-9]','','g'))>=5 AND regexp_replace(c.phone,'[^0-9]','','g')=regexp_replace($6,'[^0-9]','','g'))) ORDER BY lower(c.display_name),c.id LIMIT 10`, [...params(u), i.name, i.email, i.phone])).rows; return { items: rows.map(r => ({ contactId: r.id, name: r.display_name, email: r.email, phone: r.phone, reasons: [...(r.same_email ? ['Same email; shared addresses are possible.'] : []), ...(r.same_phone ? ['Same phone; shared numbers are possible.'] : []), ...(r.same_name ? ['Same name; identity is not confirmed.'] : [])], leadCount: r.lead_count })), notice: 'Suggestions only. Choose an existing contact explicitly or create a separate person; names never merge records.' }; }
    async create(u: AuthUser, i: z.infer<typeof leadCreateSchema>): Promise<LeadRecord> { return this.write(u,(c,a)=>this.createLinked(c,a,i)); }
    /** Server-only creation in an authorized domain transaction; public channels pass their revalidated publisher, never a browser actor. */
    async createLinked(c:PoolClient,a:AuthUser,i:z.infer<typeof leadCreateSchema>):Promise<LeadRecord>{
        i=leadCreateSchema.parse(i);
        a=await authorize(c,a);
            const interests = [...new Set([i.propertyId, ...i.interestPropertyIds])];
            if (interests.length > 20)
                throw new ApiError(400, 'INVALID_INPUT', 'Use at most 20 property interests, including the primary property.');
            await lockProperties(c, a, interests);
            i={...i,ownerMembershipId:i.ownerMembershipId??await routeNewLead(c,a,i.propertyId,interests)};
            await validateOwner(c, a, i.ownerMembershipId, interests);
            await validateUnit(c, a, i.propertyId, i.unitId);
            let contactId = i.contactId;
            if (contactId)
                await validateLinks(c, a, contactId, interests);
            else {
                const person = i.newContact!;
                contactId = (await c.query('INSERT INTO contacts(organization_id,display_name,email,phone) VALUES($1,$2,$3,$4) RETURNING id', [a.organization.id, person.displayName, person.email.toLowerCase(), person.phone])).rows[0]!.id;
                for (const propertyId of interests)
                    await c.query('INSERT INTO contact_property_links(organization_id,contact_id,property_id) VALUES($1,$2,$3)', [a.organization.id, contactId, propertyId]);
                await audit(c, a, 'contact.created', { contactId, propertyIds: interests, origin: 'lead_creation' });
            }
            const person = (await c.query('SELECT display_name,email FROM contacts WHERE organization_id=$1 AND id=$2', [a.organization.id, contactId])).rows[0]!;
            const r = (await c.query(`INSERT INTO leads(organization_id,property_id,unit_id,contact_id,display_name,email,status,intent,notes,owner_membership_id,source,preferences,next_action_at,next_action) VALUES($1,$2,$3,$4,$5,$6,'new',$7,$8,$9,$10,$11,$12,$13) RETURNING id`, [a.organization.id, i.propertyId, i.unitId, contactId, person.display_name, person.email, i.intent, i.notes, i.ownerMembershipId, i.source, JSON.stringify(i.preferences), i.nextActionAt, i.nextAction])).rows[0]!;
            for (const propertyId of interests)
                await c.query('INSERT INTO lead_property_interests(organization_id,lead_id,contact_id,property_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [a.organization.id, r.id, contactId, propertyId]);
            await event(c, a, r.id, 'created', 'new_inquiry', null, { propertyId: i.propertyId, interestPropertyIds: interests, ownerMembershipId: i.ownerMembershipId, contactId });
            return dto(await this.row(a, r.id, c));
    }
    async update(u: AuthUser, id: string, i: z.infer<typeof leadUpdateSchema>): Promise<LeadRecord> {
        return this.write(u, async (c, a) => {
            const r = await this.lock(c, a, id);
            version(r, i.version);
            const interests = i.interestPropertyIds === undefined ? await currentInterests(c, a, id) : [...new Set([r.property_id, ...i.interestPropertyIds])];
            if (interests.length > 20)
                throw new ApiError(400, 'INVALID_INPUT', 'Use at most 20 explicit property interests.');
            await lockProperties(c, a, interests);
            await validateLinks(c, a, r.contact_id, interests);
            await validateOwner(c, a, i.ownerMembershipId === undefined ? r.owner_membership_id : i.ownerMembershipId, interests);
            if (i.unitId !== undefined) {
                await validateUnit(c, a, r.property_id, i.unitId);
                if (i.unitId !== r.unit_id && (await c.query('SELECT id FROM applications WHERE organization_id=$1 AND lead_id=$2 UNION ALL SELECT id FROM leases WHERE organization_id=$1 AND lead_id=$2 LIMIT 1', [a.organization.id, id])).rowCount)
                    throw new ApiError(409, 'LINKED_RECORD_CONFLICT', 'This lead has an application or lease. Keep its unit aligned through staff review.');
            }
            if (i.interestPropertyIds !== undefined) {
                if ((await c.query('SELECT 1 FROM viewings WHERE organization_id=$1 AND lead_id=$2 AND NOT(property_id=ANY($3::uuid[])) LIMIT 1', [a.organization.id, id, interests])).rowCount)
                    throw new ApiError(409, 'VIEWING_INTEREST_IN_USE', 'Keep property interests that have viewing history. Review the viewing and related records before changing this relationship.');
                await c.query('DELETE FROM lead_property_interests WHERE organization_id=$1 AND lead_id=$2 AND NOT(property_id=ANY($3::uuid[]))', [a.organization.id, id, interests]);
                for (const propertyId of interests)
                    await c.query('INSERT INTO lead_property_interests(organization_id,lead_id,contact_id,property_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [a.organization.id, id, r.contact_id, propertyId]);
            }
            const columns: Record<string, string> = { unitId: 'unit_id', ownerMembershipId: 'owner_membership_id', source: 'source', preferences: 'preferences', nextActionAt: 'next_action_at', nextAction: 'next_action', notes: 'notes' };
            const fields = Object.keys(i).filter(k => columns[k]);
            const values: unknown[] = [a.organization.id, id];
            const assignments = fields.map(k => { values.push(k === 'preferences' ? JSON.stringify(i.preferences) : (i as Record<string, unknown>)[k]); return `${columns[k]}=$${values.length}`; });
            await c.query(`UPDATE leads SET ${[...assignments, 'version=version+1', 'updated_at=now()'].join(',')} WHERE organization_id=$1 AND id=$2`, values);
            await event(c, a, id, 'updated', r.pipeline_stage, null, { fields: Object.keys(i).filter(k => k !== 'version') });
            return dto(await this.row(a, id, c));
        });
    }
    async changeStage(u: AuthUser, id: string, i: z.infer<typeof leadStageSchema>): Promise<LeadRecord> {
        return this.write(u, async (c, a) => {
            const locked = await this.lock(c, a, id);
            version(locked, i.version);
            const r = await this.row(a, id, c);
            if (!(leadStageGraphs[r.intent as LeadIntent][r.pipeline_stage] ?? []).includes(i.stage))
                throw new ApiError(409, 'INVALID_STAGE_TRANSITION', 'Choose a permitted next stage for this opportunity pipeline.');
            if (!stageEvidence(r, i.stage))
                throw new ApiError(409, i.stage === 'leased' ? 'VERIFIED_LEASE_REQUIRED' : 'APPLICATION_MILESTONE_REQUIRED', i.stage === 'leased' ? 'Leased requires a matching active lease and an explicit verified milestone. Moving a card cannot verify a lease.' : 'This stage needs the matching status on a linked application record; update the application through staff review.');
            if (i.stage === 'leased') {
                const lease = await c.query(`SELECT l.id FROM lease_verified_milestones vm JOIN leases l ON l.id=vm.lease_id AND l.organization_id=vm.organization_id JOIN leads own_lead ON own_lead.id=vm.lead_id AND own_lead.organization_id=vm.organization_id WHERE vm.organization_id=$1 AND vm.lead_id=$2 AND l.status='active' AND l.starts_on IS NOT NULL AND l.updated_at=vm.lease_updated_at AND l.unit_id IS NOT DISTINCT FROM own_lead.unit_id AND l.source_system='local' AND cardinality(l.source_owned_fields)=0 AND NOT EXISTS(SELECT 1 FROM external_record_mappings em WHERE em.organization_id=l.organization_id AND em.lease_id=l.id AND em.provider='yardi')  AND (vm.evidence_kind='manual_attestation' OR (vm.evidence_kind='demo_event' AND EXISTS(SELECT 1 FROM organizations eo WHERE eo.id=vm.organization_id AND eo.environment='demo'))) AND NOT EXISTS(SELECT 1 FROM lease_workflows wf WHERE wf.organization_id=vm.organization_id AND wf.lease_id=vm.lease_id AND (wf.signature_verified_at IS NULL OR (wf.leased_milestone='completed' AND wf.stage<>'completed') OR (wf.leased_milestone='fully_signed' AND wf.stage NOT IN ('fully_signed','move_in_scheduled','completed')))) FOR SHARE OF l,vm`, [a.organization.id, id]);
                if (!lease.rowCount)
                    throw new ApiError(409, 'VERIFIED_LEASE_REQUIRED', 'The verified matching lease is no longer active.');
            }
            await c.query('UPDATE leads SET pipeline_stage=$3,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2', [a.organization.id, id, i.stage]);
            await event(c, a, id, 'stage_changed', i.stage, r.pipeline_stage, { reason: i.reason });
            return dto(await this.row(a, id, c));
        });
    }
    async verifyLease(u: AuthUser, id: string, i: z.infer<typeof leaseVerificationSchema>): Promise<LeadRecord> {
        return this.write(u, async (c, a) => {
            if (!['organization_admin', 'property_manager'].includes(a.organization.role))
                throw new ApiError(403, 'PERMISSION_DENIED', 'Only an organization admin or property manager may record a verified lease milestone.');
            const lead = await this.lock(c, a, id);
            version(lead, i.version);
            if (lead.intent !== 'leasing')
                throw new ApiError(409, 'WRONG_PIPELINE', 'Lease verification belongs only to leasing opportunities.');
            const lease = (await c.query('SELECT * FROM leases WHERE organization_id=$1 AND id=$2 AND lead_id=$3 AND property_id=$4 AND contact_id=$5 AND unit_id IS NOT DISTINCT FROM $6::uuid FOR UPDATE', [a.organization.id, i.leaseId, id, lead.property_id, lead.contact_id, lead.unit_id])).rows[0];
            if (!lease || lease.unit_id && lead.unit_id && lease.unit_id !== lead.unit_id)
                throw new ApiError(400, 'INVALID_LEASE', 'Choose a lease for this same lead, property, contact and unit.');
            if ((await c.query('SELECT id FROM lease_workflows WHERE organization_id=$1 AND lease_id=$2',[a.organization.id,lease.id])).rowCount) throw new ApiError(409,'LEASE_WORKFLOW_REQUIRED','Progress this managed lease through its ordered workflow and configured milestone; a separate lead action cannot certify it.');
            if (lease.status !== 'active' || !lease.starts_on)
                throw new ApiError(409, 'LEASE_NOT_ACTIVE', 'Verify an already active lease with a recorded start date and supporting evidence.');
            if (lease.source_system !== 'local' || lease.source_owned_fields.length || (await c.query(`SELECT id FROM external_record_mappings WHERE organization_id=$1 AND lease_id=$2 AND provider='yardi' FOR SHARE`, [a.organization.id, lease.id])).rowCount)
                throw new ApiError(409, 'SOURCE_OWNED_FIELD', 'Provider-owned leases need authoritative provider verification; local staff cannot certify them.');
            await assertFieldOwnership(c, a, 'lease', lease.id, ['status', 'startsOn', 'endsOn', 'contactId', 'propertyId', 'unitId', 'leadId']);
            if ((await c.query('SELECT vm.id FROM lease_verified_milestones vm JOIN leases vl ON vl.organization_id=vm.organization_id AND vl.id=vm.lease_id WHERE vm.organization_id=$1 AND vm.lease_id=$2 AND vm.lease_updated_at=vl.updated_at', [a.organization.id, lease.id])).rowCount)
                throw new ApiError(409, 'ALREADY_VERIFIED', 'This current lease version already has immutable verification evidence.');
            await c.query('INSERT INTO lease_verified_milestones(organization_id,lead_id,lease_id,property_id,contact_id,evidence_reference,verified_by_user_id,verified_by_membership_id,lease_updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,(SELECT updated_at FROM leases WHERE organization_id=$1 AND id=$3))', [a.organization.id, id, lease.id, lead.property_id, lead.contact_id, i.evidenceReference, a.id, a.membershipId]);
            await c.query('UPDATE leads SET version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2', [a.organization.id, id]);
            await event(c, a, id, 'lease_verified', lead.pipeline_stage, null, { leaseId: lease.id, evidenceReference: i.evidenceReference });
            return dto(await this.row(a, id, c));
        });
    }
}
async function locklessProperty(q: Queryable, u: AuthUser, id: string): Promise<void> {
    if (!(await q.query(`SELECT p.id FROM properties p WHERE ${propertyScope('p')} AND p.id=$4`, [...params(u), id])).rowCount)
        throw new ApiError(404, 'PROPERTY_NOT_FOUND', 'This property is unavailable or outside your access.');
}
