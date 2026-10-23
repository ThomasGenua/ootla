import { z } from 'zod';
import type { Paginated } from './property-contracts.js';
export const importEntities = ['properties', 'units', 'contacts', 'leads'] as const;
export type ImportEntity = typeof importEntities[number];
export type ImportStatus = 'uploaded' | 'mapped' | 'review' | 'queued' | 'running' | 'completed' | 'failed' | 'undone';
export type ImportRowStatus = 'pending' | 'valid' | 'invalid' | 'needs_review' | 'ready' | 'created' | 'linked' | 'skipped' | 'failed' | 'undone' | 'retained';
export interface ImportField {
    key: string;
    label: string;
    required: boolean;
    description: string;
}
export const importFields: Record<ImportEntity, ImportField[]> = {
    properties: [{ key: 'sourceId', label: 'Source ID', required: true, description: 'Stable unique ID in this source.' }, { key: 'name', label: 'Property name', required: true, description: 'A property is separate from its units.' }, { key: 'address', label: 'Address', required: false, description: '' }, { key: 'city', label: 'City', required: false, description: '' }, { key: 'type', label: 'Property type', required: false, description: 'For example apartment or house.' }],
    units: [{ key: 'sourceId', label: 'Source ID', required: true, description: 'Stable unique unit ID in this source.' }, { key: 'propertySourceId', label: 'Property source ID', required: true, description: 'Import properties in this same source first.' }, { key: 'label', label: 'Unit label', required: true, description: '' }, { key: 'bedrooms', label: 'Bedrooms', required: true, description: 'Whole number, including 0 for a studio.' }, { key: 'monthlyRent', label: 'Monthly rent', required: true, description: 'Nonnegative amount without a currency symbol.' }, { key: 'status', label: 'Availability status', required: false, description: 'available, reserved or occupied; imported availability remains unverified.' }],
    contacts: [{ key: 'sourceId', label: 'Source ID', required: true, description: 'Stable unique person ID in this source.' }, { key: 'displayName', label: 'Contact name', required: true, description: 'Names alone never merge contacts.' }, { key: 'email', label: 'Email', required: false, description: '' }, { key: 'phone', label: 'Phone', required: false, description: '' }, { key: 'propertySourceId', label: 'Property source ID', required: false, description: 'Optional existing imported property in this same source.' }],
    leads: [{ key: 'sourceId', label: 'Source ID', required: true, description: 'Stable unique opportunity ID in this source.' }, { key: 'propertySourceId', label: 'Property source ID', required: true, description: 'Import properties first, in this same source.' }, { key: 'contactSourceId', label: 'Contact source ID', required: true, description: 'Import and review contacts first, in this same source.' }, { key: 'unitSourceId', label: 'Unit source ID', required: false, description: 'Optional unit belonging to the selected property.' }, { key: 'intent', label: 'Opportunity type', required: false, description: 'leasing or sales.' }, { key: 'stage', label: 'Stage', required: false, description: 'new_inquiry only. Advance later with normal verified CRM workflows.' }, { key: 'nextAction', label: 'Next action', required: false, description: '' }, { key: 'nextActionAt', label: 'Next action date', required: false, description: 'ISO date-time with an explicit timezone.' }]
};
export interface ImportDuplicate {
    id: string;
    displayName: string;
    email: string;
    phone: string;
    reason: 'email' | 'phone' | 'name_only';
    url: string;
}
export interface ImportRow {
    id: string;
    rowNumber: number;
    values: Record<string, string>;
    normalized: Record<string, string | number | null>;
    status: ImportRowStatus;
    errors: string[];
    duplicates: ImportDuplicate[];
    decision: 'create' | 'use_existing' | 'skip' | null;
    existingContactId: string | null;
    recordId: string | null;
    recordUrl: string | null;
    result: string | null;
}
export interface ImportBatch {
    id: string;
    entity: ImportEntity;
    filename: string;
    sourceName: string;
    status: ImportStatus;
    headers: string[];
    mapping: Record<string, string>;
    rowCount: number;
    counts: Record<ImportRowStatus, number>;
    createdAt: string;
    updatedAt: string;
    confirmedAt: string | null;
    completedAt: string | null;
    attempts: number;
    lastError: string | null;
    canConfirm: boolean;
    canUndo: boolean;
}
export interface ImportBatchDetail {
    batch: ImportBatch;
    fields: ImportField[];
    rows: Paginated<ImportRow>;
}
export interface ImportOnboarding {
    organization: {
        id: string;
        name: string;
        mode: 'standalone' | 'yardi_connected';
    };
    canImport: boolean;
    limits: {
        maxBytes: number;
        maxRows: number;
        maxColumns: number;
    };
    entities: {
        key: ImportEntity;
        label: string;
        fields: ImportField[];
    }[];
    csvOnly: boolean;
    steps: string[];
}
export interface ImportUndoItem {
    rowId: string;
    rowNumber: number;
    recordId: string;
    recordUrl: string | null;
    eligible: boolean;
    reason: string;
}
export interface ImportUndoPreview {
    batchId: string;
    eligible: number;
    retained: number;
    items: ImportUndoItem[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
}
export const importUploadSchema = z.object({ entity: z.enum(importEntities), filename: z.string().trim().min(1).max(200), sourceName: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9 _.-]*$/), csv: z.string().min(1).max(5 * 1024 * 1024) }).strict();
export const importMapSchema = z.object({ mapping: z.record(z.string(), z.string().max(200)) }).strict();
export const importDecisionsSchema = z.object({ decisions: z.array(z.object({ rowId: z.uuid(), action: z.enum(['create', 'use_existing', 'skip']), existingContactId: z.uuid().optional() }).strict()).min(1).max(100) }).strict();
export const importConfirmSchema = z.object({ confirm: z.literal(true) }).strict();
export const importPageSchema = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) }).strict();
export const importRowsSchema = importPageSchema.extend({ view: z.enum(['all', 'invalid', 'duplicates', 'results']).default('all') });
