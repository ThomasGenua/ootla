import { createHash } from 'node:crypto';
import type { PoolClient, QueryResultRow } from 'pg';
import type { z } from 'zod';
import type { AuthUser } from '../../shared/contracts.js';
import { importFields, importEntities, type ImportEntity, type ImportBatch, type ImportBatchDetail, type ImportRow, type ImportRowStatus, type ImportOnboarding, type ImportUndoPreview, type ImportUndoItem, type ImportDuplicate, type importUploadSchema, type importMapSchema, type importDecisionsSchema } from '../../shared/import-contracts.js';
import type { Paginated } from '../../shared/property-contracts.js';
import type { Database } from '../db/pool.js';
import { ApiError } from '../http/errors.js';
import { IMPORT_LIMITS, parseImportCsv, safeCsvCell } from './import-csv.js';
type Row = QueryResultRow;
type Page = {
    page: number;
    pageSize: number;
};
const states: ImportRowStatus[] = ['pending', 'valid', 'invalid', 'needs_review', 'ready', 'created', 'linked', 'skipped', 'failed', 'undone', 'retained'];
const entitySingular: Record<ImportEntity, string> = { properties: 'property', units: 'unit', contacts: 'contact', leads: 'lead' };
const referenceColumn: Record<ImportEntity, string> = { properties: 'property_id', units: 'unit_id', contacts: 'contact_id', leads: 'lead_id' };
const iso = (v: unknown): string | null => v ? (v instanceof Date ? v : new Date(String(v))).toISOString() : null;
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const namespace = (s: string) => s.trim().toLowerCase();
const provider = (source: string, entity: ImportEntity, id: string) => 'import_' + hash(`${source}\0${entity}\0${id}`).slice(0, 48);
const phoneKey = (s: string) => s.replace(/[^0-9]/g, '');
const paged = <T>(items: T[], total: number, p: Page): Paginated<T> => ({ items, total, page: p.page, pageSize: p.pageSize, totalPages: Math.ceil(total / p.pageSize) });
const recordUrl = (entity: ImportEntity, id: string | null): string | null => !id ? null : entity === 'properties' ? `/admin/properties?property=${id}` : entity === 'units' ? null : entity === 'contacts' ? `/admin/contacts?contact=${id}` : `/admin/leads?lead=${id}`;
async function authorize(c: PoolClient, u: AuthUser, allowConnected = false): Promise<void> {
    const m = (await c.query(`SELECT m.id,s.mode FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' JOIN organization_data_settings s ON s.organization_id=m.organization_id WHERE m.id=$1 AND m.organization_id=$2 AND m.user_id=$3 AND m.active AND m.role='organization_admin' FOR SHARE OF m,u,s`, [u.membershipId, u.organization.id, u.id])).rows[0];
    if (!m)
        throw new ApiError(403, 'IMPORT_PERMISSION_DENIED', 'Only an active organization administrator can access customer imports.');
    if (!allowConnected && m.mode !== 'standalone')
        throw new ApiError(403, 'STANDALONE_REQUIRED', 'Customer CSV imports are available only for standalone organizations. Yardi-owned records remain authoritative.');
}
async function audit(c: PoolClient, u: AuthUser, action: string, metadata: Record<string, unknown>) { await c.query('INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,$3,$4)', [u.organization.id, u.id, action, JSON.stringify(metadata)]); }
async function batchRow(c: PoolClient, u: AuthUser, id: string, lock = false): Promise<Row> { const r = (await c.query(`SELECT * FROM import_batches WHERE id=$1 AND organization_id=$2 ${lock ? 'FOR UPDATE' : ''}`, [id, u.organization.id])).rows[0]; if (!r)
    throw new ApiError(404, 'IMPORT_NOT_FOUND', 'This import batch is unavailable in your organization.'); return r; }
async function mappedId(c: PoolClient, org: string, source: string, entity: ImportEntity, id: string): Promise<string | null> { if (!id)
    return null; const col = referenceColumn[entity]; return (await c.query(`SELECT ${col} AS id FROM external_record_mappings WHERE organization_id=$1 AND entity_type=$2 AND provider=$3 AND external_id=$4`, [org, entitySingular[entity], provider(source, entity, id), id])).rows[0]?.id ?? null; }
function rowDto(r: Row, entity: ImportEntity): ImportRow { return { id: r.id, rowNumber: r.row_number, values: r.raw_values, normalized: r.normalized, status: r.status, errors: r.errors, duplicates: r.duplicates, decision: r.decision, existingContactId: r.existing_contact_id, recordId: r.record_id, recordUrl: entity === 'units' && r.normalized._propertyId ? `/admin/properties?property=${r.normalized._propertyId}` : recordUrl(entity, r.record_id), result: r.result }; }
async function batchDto(c: PoolClient, r: Row): Promise<ImportBatch> { const counts = Object.fromEntries(states.map(s => [s, 0])) as Record<ImportRowStatus, number>; for (const n of (await c.query('SELECT status,count(*)::int AS count FROM import_rows WHERE batch_id=$1 GROUP BY status', [r.id])).rows)
    counts[n.status as ImportRowStatus] = n.count; return { id: r.id, entity: r.entity, filename: r.filename, sourceName: r.source_name, status: r.status, headers: r.headers, mapping: r.mapping, rowCount: r.row_count, counts, createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)!, confirmedAt: iso(r.confirmed_at), completedAt: iso(r.completed_at), attempts: r.attempts, lastError: r.last_error, canConfirm: r.status === 'review' && counts.needs_review === 0 && counts.pending === 0 && (counts.valid + counts.ready + counts.skipped) > 0, canUndo: ['completed', 'failed'].includes(r.status) && counts.created > 0 }; }
async function rowsPage(c: PoolClient, r: Row, p: Page & {
    view?: string;
}): Promise<Paginated<ImportRow>> { let extra = ''; if (p.view === 'invalid')
    extra = " AND status IN ('invalid','failed')"; if (p.view === 'duplicates')
    extra = " AND (status='needs_review' OR jsonb_array_length(duplicates)>0)"; if (p.view === 'results')
    extra = " AND status IN ('created','linked','skipped','failed','invalid','undone','retained')"; const total = Number((await c.query(`SELECT count(*) FROM import_rows WHERE batch_id=$1${extra}`, [r.id])).rows[0]?.count ?? 0); const rows = (await c.query(`SELECT * FROM import_rows WHERE batch_id=$1${extra} ORDER BY row_number LIMIT $2 OFFSET $3`, [r.id, p.pageSize, (p.page - 1) * p.pageSize])).rows; return paged(rows.map(x => rowDto(x, r.entity)), total, p); }
async function detail(c: PoolClient, r: Row): Promise<ImportBatchDetail> { return { batch: await batchDto(c, r), fields: importFields[r.entity as ImportEntity], rows: await rowsPage(c, r, { page: 1, pageSize: 25 }) }; }
function editable(r: Row) { if (!['uploaded', 'mapped', 'review'].includes(r.status))
    throw new ApiError(409, 'IMPORT_ALREADY_CONFIRMED', 'Confirmed import batches cannot be remapped or revalidated.'); }
function mappedValues(r: Row, b: Row): Record<string, string> { return Object.fromEntries(Object.entries(b.mapping as Record<string, string>).map(([key, header]) => [key, String(r.raw_values[header] ?? '').trim()])); }
function normalize(entity: ImportEntity, v: Record<string, string>): {
    value: Record<string, string | number | null>;
    errors: string[];
} {
    const n: Record<string, string | number | null> = { ...v };
    const errors: string[] = [];
    const need = (key: string, max = 200) => { if (!v[key] || v[key]!.length > max)
        errors.push(`${key} is required and must contain at most ${max} characters.`); };
    need('sourceId', 128);
    if (entity === 'properties') {
        need('name');
        if ((v.address?.length ?? 0) > 500)
            errors.push('address must contain at most 500 characters.');
        if ((v.city?.length ?? 0) > 150)
            errors.push('city must contain at most 150 characters.');
        if ((v.type?.length ?? 0) > 100)
            errors.push('type must contain at most 100 characters.');
        n.type = v.type || 'residential';
    }
    if (entity === 'units') {
        need('propertySourceId', 128);
        need('label', 100);
        if (!/^(0|[1-9]\d?)$/.test(v.bedrooms ?? ''))
            errors.push('bedrooms must be a whole number from 0 to 99.');
        n.bedrooms = Number(v.bedrooms);
        if (!/^\d{1,10}(\.\d{1,2})?$/.test(v.monthlyRent ?? '') || Number(v.monthlyRent) > 9999999999.99)
            errors.push('monthlyRent must be a nonnegative amount with at most two decimal places.');
        n.monthlyRent = Number(v.monthlyRent);
        n.status = v.status || 'available';
        if (!['available', 'reserved', 'occupied'].includes(String(n.status)))
            errors.push('status must be available, reserved or occupied.');
    }
    if (entity === 'contacts') {
        need('displayName');
        n.email = (v.email ?? '').toLowerCase();
        n.phone = v.phone ?? '';
        if (n.email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(n.email)) || String(n.email).length > 254))
            errors.push('email must be a valid address of at most 254 characters.');
        if (String(n.phone).length > 100)
            errors.push('phone must contain at most 100 characters.');
        if (v.propertySourceId && v.propertySourceId.length > 128)
            errors.push('propertySourceId must contain at most 128 characters.');
    }
    if (entity === 'leads') {
        need('propertySourceId', 128);
        need('contactSourceId', 128);
        n.intent = v.intent || 'leasing';
        if (!['leasing', 'sales'].includes(String(n.intent)))
            errors.push('intent must be leasing or sales.');
        n.stage = v.stage || 'new_inquiry';
        if (n.stage !== 'new_inquiry')
            errors.push('Only new_inquiry can be imported. Advance stages through the CRM with required evidence.');
        if ((v.nextAction?.length ?? 0) > 500)
            errors.push('nextAction must contain at most 500 characters.');
        if (v.nextActionAt && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(v.nextActionAt) || !Number.isFinite(Date.parse(v.nextActionAt))))
            errors.push('nextActionAt must be an ISO date-time with a timezone.');
    }
    for (const value of Object.values(v))
        if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
            errors.push('Control characters are not supported.');
            break;
        }
    return { value: n, errors };
}
async function references(c: PoolClient, b: Row, n: Record<string, string | number | null>, errors: string[]) {
    for (const [field, entity, target] of [['propertySourceId', 'properties', '_propertyId'], ['contactSourceId', 'contacts', '_contactId'], ['unitSourceId', 'units', '_unitId']] as const) {
        if (!n[field])
            continue;
        const id = await mappedId(c, b.organization_id, b.source_name, entity, String(n[field]));
        if (!id)
            errors.push(`${field} was not found in this source. Import and reconcile the referenced records first.`);
        else {
            n[target] = id;
            const col = referenceColumn[entity];
            const record = (await c.query('SELECT source_system,source_owned_fields FROM ' + entity + ' WHERE organization_id=$1 AND id=$2', [b.organization_id, id])).rows[0];
            if (!record || record.source_system === 'yardi' || record.source_owned_fields.length || (await c.query('SELECT 1 FROM external_record_mappings WHERE organization_id=$1 AND ' + col + '=$2 AND provider=$3 LIMIT 1', [b.organization_id, id, 'yardi'])).rowCount)
                errors.push(field + ' refers to an authoritative source-owned record. Use its configured source workflow.');
        }
    }
    if (n._unitId && n._propertyId && !(await c.query('SELECT id FROM units WHERE organization_id=$1 AND id=$2 AND property_id=$3', [b.organization_id, n._unitId, n._propertyId])).rowCount)
        errors.push('unitSourceId must belong to the selected property.');
}
async function duplicates(c: PoolClient, b: Row, n: Record<string, string | number | null>): Promise<ImportDuplicate[]> { const email = String(n.email ?? ''), phone = phoneKey(String(n.phone ?? '')), name = String(n.displayName ?? ''); const rows = (await c.query(`SELECT id,display_name,email,phone,CASE WHEN $2<>'' AND email=$2 THEN 'email' WHEN $3<>'' AND regexp_replace(phone,'[^0-9]','','g')=$3 THEN 'phone' ELSE 'name_only' END AS reason FROM contacts WHERE organization_id=$1 AND (($2<>'' AND email=$2) OR ($3<>'' AND regexp_replace(phone,'[^0-9]','','g')=$3) OR lower(display_name)=lower($4)) ORDER BY CASE WHEN $2<>'' AND email=$2 THEN 0 WHEN $3<>'' AND regexp_replace(phone,'[^0-9]','','g')=$3 THEN 1 ELSE 2 END,id LIMIT 10`, [b.organization_id, email, phone, name])).rows; return rows.map(r => ({ id: r.id, displayName: r.display_name, email: r.email, phone: r.phone, reason: r.reason, url: `/admin/contacts?contact=${r.id}` })); }
export class Imports {
    constructor(private database: Database) { }
    async onboarding(u: AuthUser): Promise<ImportOnboarding> { return this.database.transaction(async (c) => { await authorize(c, u, true); const s = (await c.query('SELECT mode FROM organization_data_settings WHERE organization_id=$1', [u.organization.id])).rows[0]; return { organization: { id: u.organization.id, name: u.organization.name, mode: s.mode }, canImport: s.mode === 'standalone', limits: IMPORT_LIMITS, entities: importEntities.map(key => ({ key, label: { properties: 'Properties', units: 'Units', contacts: 'Contacts', leads: 'Leads' }[key], fields: importFields[key] })), csvOnly: true, steps: ['Upload', 'Map fields', 'Validate', 'Review duplicates', 'Confirm import', 'Reconcile results'] }; }); }
    async list(u: AuthUser, p: Page): Promise<Paginated<ImportBatch>> { return this.database.transaction(async (c) => { await authorize(c, u); const total = Number((await c.query('SELECT count(*) FROM import_batches WHERE organization_id=$1', [u.organization.id])).rows[0]?.count ?? 0); const rows = (await c.query('SELECT * FROM import_batches WHERE organization_id=$1 ORDER BY created_at DESC,id LIMIT $2 OFFSET $3', [u.organization.id, p.pageSize, (p.page - 1) * p.pageSize])).rows; const batches:ImportBatch[]=[];for(const row of rows)batches.push(await batchDto(c,row));return paged(batches, total, p); }); }
    async get(u: AuthUser, id: string): Promise<ImportBatchDetail> { return this.database.transaction(async (c) => { await authorize(c, u); return detail(c, await batchRow(c, u, id)); }); }
    async rows(u: AuthUser, id: string, p: Page & {
        view?: string;
    }): Promise<Paginated<ImportRow>> { return this.database.transaction(async (c) => { await authorize(c, u); return rowsPage(c, await batchRow(c, u, id), p); }); }
    async upload(u: AuthUser, i: z.infer<typeof importUploadSchema>): Promise<ImportBatchDetail> {
        const parsed = parseImportCsv(i.csv), source = namespace(i.sourceName), digest = hash(i.csv);
        if (!/\.csv$/i.test(i.filename))
            throw new ApiError(400, 'CSV_REQUIRED', 'Upload a UTF-8 .csv file. XLSX is not configured.');
        return this.database.transaction(async (c) => {
            await authorize(c, u);
            await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`ootla.import.upload:${u.organization.id}:${source}:${i.entity}:${digest}`]);
            let b = (await c.query('SELECT * FROM import_batches WHERE organization_id=$1 AND source_name=$2 AND entity=$3 AND upload_sha256=$4', [u.organization.id, source, i.entity, digest])).rows[0];
            if (b)
                return detail(c, b);
            b = (await c.query('INSERT INTO import_batches(organization_id,entity,filename,source_name,upload_sha256,headers,row_count,created_by_user_id,created_by_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *', [u.organization.id, i.entity, i.filename, source, digest, JSON.stringify(parsed.headers), parsed.rows.length, u.id, u.membershipId])).rows[0];
            for (let offset = 0; offset < parsed.rows.length; offset += 100) {
                const chunk = parsed.rows.slice(offset, offset + 100);
                await c.query(`INSERT INTO import_rows(organization_id,batch_id,row_number,raw_values) SELECT $1,$2,r.row_number,r.raw_values FROM jsonb_to_recordset($3::jsonb) AS r(row_number integer,raw_values jsonb)`, [u.organization.id, b.id, JSON.stringify(chunk.map(r => ({ row_number: r.rowNumber, raw_values: r.values })))]);
            }
            await audit(c, u, 'import.uploaded', { batchId: b.id, entity: i.entity, rowCount: parsed.rows.length });
            return detail(c, b);
        });
    }
    async map(u: AuthUser, id: string, i: z.infer<typeof importMapSchema>): Promise<ImportBatchDetail> { return this.database.transaction(async (c) => { await authorize(c, u); const b = await batchRow(c, u, id, true); editable(b); const fields = importFields[b.entity as ImportEntity], keys = new Set(fields.map(f => f.key)), headers = new Set(b.headers as string[]); const selected = Object.entries(i.mapping).filter(([, v]) => v !== ''); if (selected.some(([k, v]) => !keys.has(k) || !headers.has(v)) || new Set(selected.map(([, v]) => v)).size !== selected.length)
        throw new ApiError(400, 'INVALID_MAPPING', 'Map each supported target field to a different uploaded header.'); if (fields.some(f => f.required && !i.mapping[f.key]))
        throw new ApiError(400, 'REQUIRED_MAPPING', 'Map every required field before validation.'); await c.query(`UPDATE import_rows SET status='pending',normalized='{}',errors='[]',duplicates='[]',decision=NULL,existing_contact_id=NULL WHERE batch_id=$1`, [id]); const updated = (await c.query(`UPDATE import_batches SET mapping=$2,status='mapped',updated_at=now() WHERE id=$1 RETURNING *`, [id, JSON.stringify(Object.fromEntries(selected))])).rows[0]; await audit(c, u, 'import.mapped', { batchId: id }); return detail(c, updated); }); }
    async validate(u: AuthUser, id: string): Promise<ImportBatchDetail> {
        return this.database.transaction(async (c) => {
            await authorize(c, u);
            const b = await batchRow(c, u, id, true);
            editable(b);
            if (!Object.keys(b.mapping).length)
                throw new ApiError(409, 'MAPPING_REQUIRED', 'Map the CSV fields first.');
            const rows = (await c.query('SELECT * FROM import_rows WHERE batch_id=$1 ORDER BY row_number', [id])).rows;
            const ids = new Map<string, number>();
            const sameContacts = new Map<string, number>();
            for (const r of rows) {
                const v = mappedValues(r, b);
                ids.set(v.sourceId ?? '', (ids.get(v.sourceId ?? '') ?? 0) + 1);
                if (b.entity === 'contacts')
                    for (const k of [v.email ? 'e:' + v.email.toLowerCase() : '', phoneKey(v.phone ?? '') ? 'p:' + phoneKey(v.phone ?? '') : '', v.displayName ? 'n:' + v.displayName.toLowerCase() : ''])
                        if (k)
                            sameContacts.set(k, (sameContacts.get(k) ?? 0) + 1);
            }
            for (const r of rows) {
                const { value: n, errors } = normalize(b.entity, mappedValues(r, b));
                if ((ids.get(String(n.sourceId)) ?? 0) > 1)
                    errors.push('sourceId is repeated in this file. Give each record a unique source ID.');
                await references(c, b, n, errors);
                const existing = n.sourceId ? await mappedId(c, b.organization_id, b.source_name, b.entity, String(n.sourceId)) : null;
                if (existing)
                    n._existingId = existing;
                let suggestions: ImportDuplicate[] = [];
                let repeated = false;
                if (b.entity === 'contacts' && !existing && !errors.length) {
                    suggestions = await duplicates(c, b, n);
                    const keys = [n.email ? 'e:' + String(n.email).toLowerCase() : '', phoneKey(String(n.phone ?? '')) ? 'p:' + phoneKey(String(n.phone ?? '')) : '', n.displayName ? 'n:' + String(n.displayName).toLowerCase() : ''];
                    repeated = keys.some(k => k && (sameContacts.get(k) ?? 0) > 1);
                }
                let status: ImportRowStatus = errors.length ? 'invalid' : suggestions.length || repeated ? 'needs_review' : 'valid';
                await c.query('UPDATE import_rows SET normalized=$2,status=$3,errors=$4,duplicates=$5,decision=NULL,existing_contact_id=NULL,result=$6 WHERE id=$1', [r.id, JSON.stringify(n), status, JSON.stringify(errors), JSON.stringify(suggestions), repeated ? 'Similar contacts appear in this file. Review each identity; names alone cannot establish identity.' : existing ? 'This source ID is already linked. Existing values will be preserved.' : null]);
            }
            const updated = (await c.query(`UPDATE import_batches SET status='review',updated_at=now() WHERE id=$1 RETURNING *`, [id])).rows[0];
            await audit(c, u, 'import.validated', { batchId: id });
            return detail(c, updated);
        });
    }
    async decisions(u: AuthUser, id: string, i: z.infer<typeof importDecisionsSchema>): Promise<ImportBatchDetail> {
        return this.database.transaction(async (c) => {
            await authorize(c, u);
            const b = await batchRow(c, u, id, true);
            if (b.status !== 'review')
                throw new ApiError(409, 'REVIEW_REQUIRED', 'Validate this batch before reviewing duplicates.');
            for (const d of i.decisions) {
                const r = (await c.query('SELECT * FROM import_rows WHERE batch_id=$1 AND id=$2 FOR UPDATE', [id, d.rowId])).rows[0];
                if (!r || !['needs_review', 'valid', 'ready'].includes(r.status))
                    throw new ApiError(400, 'INVALID_IMPORT_ROW', 'Choose a valid row from this batch.');
                if (d.action === 'use_existing') {
                    if (b.entity !== 'contacts' || !d.existingContactId)
                        throw new ApiError(400, 'CONTACT_REVIEW_REQUIRED', 'Choose an existing contact after reviewing matching contact details.');
                    const target = (await c.query('SELECT * FROM contacts WHERE organization_id=$1 AND id=$2 FOR SHARE', [u.organization.id, d.existingContactId])).rows[0];
                    if(target&&(target.source_system==='yardi'||target.source_owned_fields.length||(await c.query("SELECT 1 FROM external_record_mappings WHERE organization_id=$1 AND contact_id=$2 AND provider='yardi' LIMIT 1",[u.organization.id,d.existingContactId])).rowCount))throw new ApiError(403,'SOURCE_OWNERSHIP','Use the authoritative source workflow for this contact.');
                    const email = String(r.normalized.email ?? ''), phone = phoneKey(String(r.normalized.phone ?? ''));
                    if (!target || !((email && target.email === email) || (phone && phoneKey(target.phone) === phone)))
                        throw new ApiError(400, 'IDENTITY_EVIDENCE_REQUIRED', 'A name alone cannot link contacts. Review a matching email address or phone number, or create a separate contact.');
                }
                await c.query(`UPDATE import_rows SET decision=$2,existing_contact_id=$3,status=$4 WHERE id=$1`, [r.id, d.action, d.action === 'use_existing' ? d.existingContactId : null, d.action === 'skip' ? 'skipped' : 'ready']);
            }
            await audit(c, u, 'import.duplicates_reviewed', { batchId: id, rows: i.decisions.length });
            return detail(c, b);
        });
    }
    async confirm(u: AuthUser, id: string, retry = false): Promise<ImportBatchDetail> {
        return this.database.transaction(async (c) => {
            await authorize(c, u);
            const b = await batchRow(c, u, id, true);
            if (['queued', 'running'].includes(b.status) || (b.status === 'completed' && !retry))
                return detail(c, b);
            if (retry) {
                const failed = Number((await c.query("SELECT count(*) FROM import_rows WHERE batch_id=$1 AND status='failed'", [id])).rows[0]?.count ?? 0);
                if (b.status === 'completed' && failed === 0)
                    return detail(c, b);
                if (b.status !== 'failed' && !(b.status === 'completed' && failed > 0))
                    throw new ApiError(409, 'RETRY_UNAVAILABLE', 'Only failed batches or completed batches with failed rows can be deliberately retried.');
                if (b.attempts >= 3)
                    throw new ApiError(409, 'RETRY_LIMIT', 'This batch reached its retry limit. Reconcile the safe error report before uploading corrected rows.');
                await c.query(`UPDATE import_rows SET status='ready',errors='[]',result=NULL,attempts=0,next_attempt_at=now() WHERE batch_id=$1 AND status='failed' AND record_id IS NULL`, [id]);
            }
            else {
                const dto = await batchDto(c, b);
                if (!dto.canConfirm)
                    throw new ApiError(409, 'REVIEW_REQUIRED', 'Validate the batch and review all ambiguous contacts before confirming at least one valid row.');
            }
            await c.query(`UPDATE import_rows SET status='ready' WHERE batch_id=$1 AND status='valid'`, [id]);
            const updated = (await c.query(`UPDATE import_batches SET attempts=attempts+$2,status='queued',confirmed_at=COALESCE(confirmed_at,now()),next_attempt_at=now(),last_error=NULL,updated_at=now() WHERE id=$1 RETURNING *`, [id, retry ? 1 : 0])).rows[0];
            await audit(c, u, retry ? 'import.retry_requested' : 'import.confirmed', { batchId: id });
            return detail(c, updated);
        });
    }
    async errorCsv(u: AuthUser, id: string): Promise<string> { return this.database.transaction(async (c) => { await authorize(c, u); const b = await batchRow(c, u, id); const rows = (await c.query(`SELECT row_number,status,errors,result FROM import_rows WHERE batch_id=$1 AND status IN ('invalid','failed','retained') ORDER BY row_number`, [id])).rows; return [['batch_id', 'source_row', 'status', 'error'].map(safeCsvCell).join(','), ...rows.map(r => [b.id, r.row_number, r.status, (r.errors as string[]).join(' ') || r.result || 'No additional details.'].map(safeCsvCell).join(','))].join('\r\n') + '\r\n'; }); }
    async undoPreview(u: AuthUser, id: string, p: Page = { page: 1, pageSize: 25 }): Promise<ImportUndoPreview> { return this.database.transaction(async (c) => { await authorize(c, u); const b = await batchRow(c, u, id); return undoPreview(c, b, p); }); }
    async undo(u: AuthUser, id: string): Promise<ImportUndoPreview> {
        return this.database.transaction(async (c) => {
            await authorize(c, u);
            const b = await batchRow(c, u, id, true);
            if (b.status === 'undone')
                return undoPreview(c, b, { page: 1, pageSize: 25 });
            if (!['completed', 'failed'].includes(b.status))
                throw new ApiError(409, 'UNDO_UNAVAILABLE', 'Wait for processing to finish before undoing untouched records.');
            await c.query("SELECT set_config('ootla.import_undo','true',true)");
            const rows = (await c.query(`SELECT * FROM import_rows WHERE batch_id=$1 AND created_record AND status IN ('created','retained') ORDER BY row_number DESC FOR UPDATE`, [id])).rows;
            for (const r of rows) {
                const check = await undoCheck(c, b, r, true);
                if (!check.eligible) {
                    await c.query(`UPDATE import_rows SET status='retained',result=$2 WHERE id=$1`, [r.id, check.reason]);
                    continue;
                }
                await c.query('SAVEPOINT import_undo_row');
                try {
                    if (r.mapping_id)
                        await c.query('DELETE FROM external_record_mappings WHERE id=$1 AND organization_id=$2', [r.mapping_id, b.organization_id]);
                    if (b.entity === 'leads')
                        await c.query('DELETE FROM lead_events WHERE organization_id=$1 AND lead_id=$2', [b.organization_id, r.record_id]);
                    if (b.entity === 'contacts')
                        await c.query('DELETE FROM contact_property_links WHERE organization_id=$1 AND contact_id=$2', [b.organization_id, r.record_id]);
                    await c.query(`DELETE FROM ${b.entity} WHERE organization_id=$1 AND id=$2`, [b.organization_id, r.record_id]);
                    await c.query(`UPDATE import_rows SET status='undone',result='Untouched batch-created record removed; import history retained.' WHERE id=$1`, [r.id]);
                    await c.query('RELEASE SAVEPOINT import_undo_row');
                }
                catch {
                    await c.query('ROLLBACK TO SAVEPOINT import_undo_row');
                    await c.query(`UPDATE import_rows SET status='retained',result='Related records or subsequent work prevent safe undo.' WHERE id=$1`, [r.id]);
                    await c.query('RELEASE SAVEPOINT import_undo_row');
                }
            }
            await c.query(`UPDATE import_batches SET status='undone',updated_at=now() WHERE id=$1`, [id]);
            await audit(c, u, 'import.undo_completed', { batchId: id });
            return undoPreview(c, { ...b, status: 'undone' }, { page: 1, pageSize: 25 });
        });
    }
}
async function undoCheck(c: PoolClient, b: Row, r: Row, lock = false): Promise<ImportUndoItem> {
    const item: ImportUndoItem = { rowId: r.id, rowNumber: r.row_number, recordId: r.record_id, recordUrl: rowDto(r, b.entity).recordUrl, eligible: false, reason: 'Only untouched records created by this batch can be removed.' };
    if (!r.created_record || !['created', 'retained'].includes(r.status))
        return item;
    const current = (await c.query(`SELECT to_jsonb(t) AS snapshot,t.import_revision FROM ${b.entity} t WHERE t.organization_id=$1 AND t.id=$2 ${lock ? 'FOR UPDATE OF t' : ''}`, [b.organization_id, r.record_id])).rows[0];
    if (!current)
        return { ...item, reason: 'The record is already absent.' };
    const snapshot = { ...current.snapshot };
    delete snapshot.import_revision;
    const saved = { ...r.snapshot };
    delete saved.import_revision;
    if (String(current.import_revision) !== String(r.snapshot_revision) || JSON.stringify(snapshot) !== JSON.stringify(saved))
        return { ...item, reason: 'The record was edited or later related work was recorded; it will be retained.' };
    const column = referenceColumn[b.entity as ImportEntity];
    if ((await c.query(`SELECT id FROM external_record_mappings WHERE organization_id=$1 AND ${column}=$2 AND id IS DISTINCT FROM $3 LIMIT 1`, [b.organization_id, r.record_id, r.mapping_id])).rowCount)
        return { ...item, reason: 'Another source mapping now depends on the record.' };
    const tables: Record<ImportEntity, [
        string,
        string
    ][]> = { properties: [['units', 'property_id'], ['leads', 'property_id'], ['tasks', 'property_id'], ['viewings', 'property_id'], ['applications', 'property_id'], ['leases', 'property_id'], ['contact_property_links', 'property_id'], ['household_property_links', 'property_id'], ['property_access_assignments', 'property_id'], ['task_routing_rules', 'property_id']], units: [['leads', 'unit_id'], ['viewings', 'unit_id'], ['applications', 'unit_id'], ['leases', 'unit_id']], contacts: [['leads', 'contact_id'], ['applications', 'contact_id'], ['leases', 'contact_id'], ['household_members', 'contact_id'], ['tasks', 'contact_id'], ['lead_documents', 'contact_id'], ['lead_workspace_events', 'contact_id'], ['provider_verified_updates', 'contact_id']], leads: [['tasks', 'lead_id'], ['viewings', 'lead_id'], ['applications', 'lead_id'], ['leases', 'lead_id'], ['lead_activities', 'lead_id'], ['lead_workspace_events', 'lead_id'], ['lead_documents', 'lead_id'], ['provider_verified_updates', 'lead_id'], ['lease_verified_milestones', 'lead_id']] };
    for (const [table, key] of tables[b.entity as ImportEntity])
        if ((await c.query(`SELECT 1 FROM ${table} WHERE organization_id=$1 AND ${key}=$2 LIMIT 1`, [b.organization_id, r.record_id])).rowCount)
            return { ...item, reason: 'Related records or subsequent staff work depend on this record.' };
    return { ...item, eligible: true, reason: 'Untouched record created by this batch, with no subsequent dependent work.' };
}
async function undoPreview(c: PoolClient, b: Row, p: Page): Promise<ImportUndoPreview> { const rows = (await c.query(`SELECT * FROM import_rows WHERE batch_id=$1 AND created_record ORDER BY row_number`, [b.id])).rows; let eligible = 0, retained = 0; const items: ImportUndoItem[] = []; for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const check = await undoCheck(c, b, r);
    if (check.eligible)
        eligible++;
    else if (r.status !== 'undone')
        retained++;
    if (i >= (p.page - 1) * p.pageSize && i < p.page * p.pageSize)
        items.push(r.status === 'undone' ? { ...check, reason: 'Previously removed safely; import history is retained.' } : check);
} return { batchId: b.id, eligible, retained, items, total: rows.length, ...p, totalPages: Math.ceil(rows.length / p.pageSize) }; }
async function writeMapping(c: PoolClient, b: Row, r: Row, id: string): Promise<string> { const col = referenceColumn[b.entity as ImportEntity]; return (await c.query(`INSERT INTO external_record_mappings(organization_id,entity_type,${col},provider,external_id) VALUES($1,$2,$3,$4,$5) RETURNING id`, [b.organization_id, entitySingular[b.entity as ImportEntity], id, provider(b.source_name, b.entity, r.normalized.sourceId), r.normalized.sourceId])).rows[0]!.id; }
async function processRow(c: PoolClient, b: Row, r: Row): Promise<void> {
    const n = r.normalized as Record<string, string | number | null>, sourceId = String(n.sourceId);
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`ootla.import.source:${b.organization_id}:${b.source_name}:${b.entity}:${sourceId}`]);
    const mapped = await mappedId(c, b.organization_id, b.source_name, b.entity, sourceId);
    if (mapped) {
        await c.query(`UPDATE import_rows SET status='skipped',record_id=$2,result='Source ID already exists; no existing values were overwritten.',processed_at=now() WHERE id=$1`, [r.id, mapped]);
        return;
    }
    const errors: string[] = [];
    await references(c, b, n, errors);
    if (errors.length)
        throw new ApiError(400, 'IMPORT_REFERENCE_CHANGED', 'A referenced source record is no longer available. Reconcile and validate corrected rows.');
    let id: string, created = true;
    if (b.entity === 'properties') {
        id = (await c.query(`INSERT INTO properties(organization_id,name,address,city,property_type,source_system) VALUES($1,$2,$3,$4,$5,'import') RETURNING id`, [b.organization_id, n.name, n.address ?? '', n.city ?? '', n.type])).rows[0]!.id;
    }
    else if (b.entity === 'units') {
        const p = (await c.query('SELECT source_system,source_owned_fields FROM properties WHERE organization_id=$1 AND id=$2 FOR SHARE', [b.organization_id, n._propertyId])).rows[0];
        if (!p || p.source_system === 'yardi' || p.source_owned_fields.length)
            throw new ApiError(403, 'SOURCE_OWNERSHIP', 'Yardi-owned property records cannot receive standalone imported units.');
        id = (await c.query(`INSERT INTO units(organization_id,property_id,label,bedrooms,status,monthly_rent,source_system,availability_source,availability_verified_at) VALUES($1,$2,$3,$4,$5,$6,'import','import',NULL) RETURNING id`, [b.organization_id, n._propertyId, n.label, n.bedrooms, n.status, n.monthlyRent])).rows[0]!.id;
    }
    else if (b.entity === 'contacts') {
        if (r.decision === 'use_existing') {
            const target = (await c.query('SELECT * FROM contacts WHERE organization_id=$1 AND id=$2 FOR SHARE', [b.organization_id, r.existing_contact_id])).rows[0];
            if (!target || target.source_system === 'yardi' || target.source_owned_fields.length || (await c.query("SELECT 1 FROM external_record_mappings WHERE organization_id=$1 AND contact_id=$2 AND provider='yardi' LIMIT 1",[b.organization_id,r.existing_contact_id])).rowCount)
                throw new ApiError(403, 'SOURCE_OWNERSHIP', 'This existing contact is unavailable or owned by Yardi.');
            const e = String(n.email ?? ''), p = phoneKey(String(n.phone ?? ''));
            if (!((e && target.email === e) || (p && phoneKey(target.phone) === p)))
                throw new ApiError(409, 'IDENTITY_CHANGED', 'The reviewed contact details changed. No contact was linked.');
            id = target.id;
            created = false;
        }
        else {
            if (r.decision !== 'create' && (await duplicates(c, b, n)).length)
                throw new ApiError(409, 'DUPLICATE_REVIEW_CHANGED', 'A possible duplicate appeared after validation. Review a new batch before creating this identity.');
            id = (await c.query(`INSERT INTO contacts(organization_id,display_name,email,phone,source_system) VALUES($1,$2,$3,$4,'import') RETURNING id`, [b.organization_id, n.displayName, n.email ?? '', n.phone ?? ''])).rows[0]!.id;
        }
        if (n._propertyId)
            await c.query('INSERT INTO contact_property_links(organization_id,contact_id,property_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [b.organization_id, id, n._propertyId]);
    }
    else {
        const contact = (await c.query('SELECT * FROM contacts WHERE organization_id=$1 AND id=$2 FOR SHARE', [b.organization_id, n._contactId])).rows[0];
        if (!contact)
            throw new ApiError(409, 'CONTACT_CHANGED', 'The imported contact is unavailable.');
        await c.query('INSERT INTO contact_property_links(organization_id,contact_id,property_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [b.organization_id, n._contactId, n._propertyId]);
        id = (await c.query(`INSERT INTO leads(organization_id,property_id,unit_id,contact_id,display_name,email,status,intent,pipeline_stage,source,next_action,next_action_at) VALUES($1,$2,$3,$4,$5,$6,'new',$7,'new_inquiry','import',$8,$9) RETURNING id`, [b.organization_id, n._propertyId, n._unitId ?? null, n._contactId, contact.display_name, contact.email, n.intent, n.nextAction ?? '', n.nextActionAt || null])).rows[0]!.id;
        await c.query(`INSERT INTO lead_events(organization_id,lead_id,kind,stage,actor_user_id,actor_membership_id,metadata) VALUES($1,$2,'created','new_inquiry',$3,$4,$5)`, [b.organization_id, id, b.created_by_user_id, b.created_by_membership_id, JSON.stringify({ origin: 'import', batchId: b.id, sourceRow: r.row_number })]);
    }
    await c.query('UPDATE import_rows SET record_id=$2,created_record=$3 WHERE id=$1', [r.id, id, created]);
    const mappingId = await writeMapping(c, b, r, id);
    const snapshot = created ? (await c.query(`SELECT to_jsonb(t) AS data,import_revision FROM ${b.entity} t WHERE id=$1 AND organization_id=$2`, [id, b.organization_id])).rows[0] : null;
    await c.query(`UPDATE import_rows SET status=$2,mapping_id=$3,snapshot=$4,snapshot_revision=$5,normalized=$6,result=$7,processed_at=now(),errors='[]' WHERE id=$1`, [r.id, created ? 'created' : 'linked', mappingId, snapshot?.data ?? null, snapshot?.import_revision ?? null, JSON.stringify(n), created ? 'Created in the shared CRM.' : 'Explicitly linked to the reviewed contact; existing details were preserved.']);
}
export async function processImportBatches(database: Database, options: {
    batchSize?: number;
} = {}): Promise<number> {
    if (!database.pool)
        return 0;
    const max = Math.min(100, Math.max(1, options.batchSize ?? 100));
    let selected: string | null = null;
    try {
        return await database.transaction(async (c) => {
            if (!(await c.query("SELECT to_regclass('public.import_batches') AS present")).rows[0]?.present)
                return 0;
            const b = (await c.query(`SELECT * FROM import_batches WHERE status IN ('queued','running') AND next_attempt_at<=now() ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`)).rows[0];
            if (!b)
                return 0;
            selected = b.id;
            const active = (await c.query(`SELECT m.id FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' JOIN organization_data_settings s ON s.organization_id=m.organization_id AND s.mode='standalone' WHERE m.id=$1 AND m.organization_id=$2 AND m.user_id=$3 AND m.role='organization_admin' AND m.active FOR SHARE OF m,u,s`, [b.created_by_membership_id, b.organization_id, b.created_by_user_id])).rowCount;
            if (!active) {
                await c.query(`UPDATE import_batches SET status='failed',last_error='Import paused because administrator access or standalone organization mode changed.',updated_at=now() WHERE id=$1`, [b.id]);
                return 0;
            }
            await c.query("SELECT set_config('ootla.import_batch',$1,true)", [b.id]);
            await c.query(`UPDATE import_batches SET status='running',updated_at=now() WHERE id=$1`, [b.id]);
            const rows = (await c.query(`SELECT * FROM import_rows WHERE batch_id=$1 AND status='ready' AND next_attempt_at<=now() ORDER BY row_number LIMIT $2 FOR UPDATE`, [b.id, max])).rows;
            for (const r of rows) {
                await c.query('SAVEPOINT import_row');
                try {
                    await processRow(c, b, r);
                    await c.query('RELEASE SAVEPOINT import_row');
                }
                catch (error) {
                    await c.query('ROLLBACK TO SAVEPOINT import_row');
                    const permanent = error instanceof ApiError;
                    const attempts = Number(r.attempts) + 1;
                    const retry = !permanent && attempts < 3;
                    const message = permanent ? error.message : 'The row could not be saved. Existing records were preserved.';
                    await c.query(`UPDATE import_rows SET status=$2,attempts=$3,next_attempt_at=now()+($4*interval '1 second'),errors=$5,result=$6 WHERE id=$1`, [r.id, retry ? 'ready' : 'failed', attempts, retry ? 30 * 2 ** (attempts - 1) : 0, JSON.stringify([message]), retry ? 'A bounded background retry is scheduled.' : message]);
                    await c.query('RELEASE SAVEPOINT import_row');
                }
            }
            const pending = (await c.query(`SELECT count(*)::int AS count,min(next_attempt_at) AS next FROM import_rows WHERE batch_id=$1 AND status='ready'`, [b.id])).rows[0]!;
            if (pending.count > 0)
                await c.query(`UPDATE import_batches SET status='queued',next_attempt_at=COALESCE($2,now()),updated_at=now() WHERE id=$1`, [b.id, pending.next]);
            else {
                await c.query(`UPDATE import_batches SET status='completed',completed_at=now(),updated_at=now(),last_error=NULL WHERE id=$1`, [b.id]);
                await c.query(`INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,'import.completed',$3)`, [b.organization_id, b.created_by_user_id, JSON.stringify({ batchId: b.id })]);
            }
            return rows.length;
        });
    }
    catch {
        if (selected)
            await database.transaction(async (c) => { const b = (await c.query('SELECT attempts,status FROM import_batches WHERE id=$1 FOR UPDATE', [selected])).rows[0]; if (!b || !['queued', 'running'].includes(b.status))
                return; const attempts = Math.min(3, Number(b.attempts) + 1); await c.query(`UPDATE import_batches SET attempts=$2,status=$3,next_attempt_at=now()+($4*interval '1 second'),last_error='Background processing was interrupted. Created records remain linked to their source IDs.',updated_at=now() WHERE id=$1`, [selected, attempts, attempts >= 3 ? 'failed' : 'queued', 30 * 2 ** (attempts - 1)]); }).catch(() => undefined);
        return 0;
    }
}
export function startImportWorker(database: Database): () => Promise<void> { let stopped = false, running: Promise<void> | null = null; const tick = () => { if (stopped || running)
    return; running = processImportBatches(database).then(() => undefined).catch(() => undefined).finally(() => { running = null; }); }; const timer = setInterval(tick, 2000); timer.unref(); tick(); return async () => { stopped = true; clearInterval(timer); await running; }; }
