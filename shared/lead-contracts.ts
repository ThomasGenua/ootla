import { z } from 'zod';
import type { Paginated } from './property-contracts.js';
export const leasingStages = [
    { key: 'new_inquiry', label: 'New inquiry' }, { key: 'contacted', label: 'Contacted' }, { key: 'tour_scheduled', label: 'Tour scheduled' },
    { key: 'application_started', label: 'Application started' }, { key: 'application_submitted', label: 'Application submitted' }, { key: 'staff_review', label: 'Staff review' },
    { key: 'lease_pending', label: 'Lease pending' }, { key: 'leased', label: 'Leased' }, { key: 'lost_closed', label: 'Lost/Closed' }
] as const;
export const salesStages = [{ key: 'new_inquiry', label: 'New inquiry' }, { key: 'contacted', label: 'Contacted' }, { key: 'viewing_scheduled', label: 'Viewing scheduled' }, { key: 'negotiation', label: 'Negotiation' }, { key: 'offer_pending', label: 'Offer pending' }, { key: 'won', label: 'Won' }, { key: 'lost_closed', label: 'Lost/Closed' }] as const;
export type LeadIntent = 'leasing' | 'sales';
export type LeadStage = typeof leasingStages[number]['key'] | typeof salesStages[number]['key'];
export const leadSources = ['manual', 'website', 'referral', 'portal', 'phone', 'email', 'import', 'other', 'demo'] as const;
const text = (max: number) => z.string().trim().max(max).refine(v => !/[\u0000-\u001f\u007f]/.test(v));
const paragraph = (max: number) => z.string().trim().max(max).refine(v => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
const id = z.uuid();
export const leadPreferencesSchema = z.object({ bedrooms: z.number().int().min(0).max(100).nullable().default(null), budgetMin: z.number().min(0).max(9999999999).nullable().default(null), budgetMax: z.number().min(0).max(9999999999).nullable().default(null), moveInOn: z.iso.date().nullable().default(null), locations: z.array(text(200).min(1)).max(20).default([]), requirements: paragraph(2000).default('') }).strict().refine(v => v.budgetMin === null || v.budgetMax === null || v.budgetMin <= v.budgetMax);
export type LeadPreferences = z.infer<typeof leadPreferencesSchema>;
export const leadPageSchema = z.object({ page: z.coerce.number().int().min(1).max(1000000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
export const leadDirectorySchema = leadPageSchema.extend({ pageSize: z.coerce.number().int().min(1).max(100).default(10), q: text(200).default(''), intent: z.enum(['', 'leasing', 'sales']).default(''), stage: text(50).default(''), propertyId: z.union([id, z.literal('')]).default(''), ownerMembershipId: z.union([id, z.literal(''), z.literal('unassigned')]).default(''), source: z.union([z.enum(leadSources), z.literal('')]).default(''), nextAction: z.enum(['', 'overdue', 'upcoming', 'none']).default(''), sort: z.enum(['updated_desc', 'created_desc', 'name_asc', 'next_action_asc']).default('updated_desc'), view: z.enum(['list', 'board']).default('list') }).strict().refine(v => !v.stage || (v.intent === 'sales' ? salesStages : v.intent === 'leasing' ? leasingStages : [...leasingStages, ...salesStages]).some(s => s.key === v.stage));
const editable = { unitId: id.nullable(), ownerMembershipId: id.nullable(), source: z.enum(leadSources), interestPropertyIds: z.array(id).max(20), preferences: leadPreferencesSchema, nextActionAt: z.iso.datetime({ offset: true }).nullable(), nextAction: text(500), notes: paragraph(10000) };
export const leadCreateSchema = z.object({ propertyId: id, contactId: id.nullable().default(null), newContact: z.object({ displayName: text(200).min(1), email: z.union([z.email().max(254), z.literal('')]).default(''), phone: text(100).default('') }).strict().nullable().default(null), intent: z.enum(['leasing', 'sales']).default('leasing'), unitId: editable.unitId.default(null), ownerMembershipId: editable.ownerMembershipId.default(null), source: editable.source.default('manual'), interestPropertyIds: editable.interestPropertyIds.default([]), preferences: leadPreferencesSchema.default({ bedrooms: null, budgetMin: null, budgetMax: null, moveInOn: null, locations: [], requirements: '' }), nextActionAt: editable.nextActionAt.default(null), nextAction: editable.nextAction.default(''), notes: editable.notes.default('') }).strict().refine(v => Boolean(v.contactId) !== Boolean(v.newContact));
export const leadUpdateSchema = z.object({ version: z.number().int().positive(), unitId: editable.unitId.optional(), ownerMembershipId: editable.ownerMembershipId.optional(), source: editable.source.optional(), interestPropertyIds: editable.interestPropertyIds.optional(), preferences: editable.preferences.optional(), nextActionAt: editable.nextActionAt.optional(), nextAction: editable.nextAction.optional(), notes: editable.notes.optional() }).strict().refine(v => Object.keys(v).length > 1);
export const leadStageSchema = z.object({ version: z.number().int().positive(), stage: text(50).min(1), reason: paragraph(1000).default('') }).strict();
export const leadOptionsSchema = leadPageSchema.extend({ propertyId: id.optional(), q: text(200).default('') }).strict();
export const duplicateSuggestionsSchema = z.object({ name: text(200).default(''), email: text(254).default(''), phone: text(100).default('') }).strict().refine(v => Boolean(v.name || v.email || v.phone));
export const leaseVerificationSchema = z.object({ version: z.number().int().positive(), leaseId: id, evidenceReference: text(500).min(5), confirmVerified: z.literal(true) }).strict();
export interface LeadOwner {
    membershipId: string;
    userId: string;
    name: string;
    role: string;
}
export interface LeadAccess {
    canManage: boolean;
    canVerifyLease: boolean;
}
export interface StageChoice {
    key: string;
    label: string;
}
export interface LeadRecord {
    id: string;
    contactId: string;
    name: string;
    email: string;
    phone: string;
    intent: LeadIntent;
    propertyId: string;
    propertyName: string;
    unitId: string | null;
    unitLabel: string | null;
    unitDescription?: string | null;
    interestPropertyIds: string[];
    interestProperties: {
        id: string;
        name: string;
    }[];
    owner: LeadOwner | null;
    source: typeof leadSources[number];
    preferences: LeadPreferences;
    stage: LeadStage;
    stageLabel: string;
    nextActionAt: string | null;
    nextAction: string;
    notes: string;
    applicationSummary: {
        id: string;
        status: 'draft' | 'submitted' | 'staff_review';
    } | null;
    verifiedLeaseMilestone: {
        leaseId: string;
        verifiedAt: string;
        verifiedByName: string;
        evidenceReference: string;
        evidenceKind?: 'manual_attestation' | 'demo_event' | 'provider_verified';
    } | null;
    allowedStages: StageChoice[];
    version: number;
    createdAt: string;
    updatedAt: string;
}
export interface LeadEvent {
    id: string;
    kind: 'created' | 'updated' | 'stage_changed' | 'application_summary' | 'lease_verified';
    previousStage: string | null;
    stage: string;
    actor: {
        id: string;
        name: string;
    };
    occurredAt: string;
    metadata: Record<string, unknown>;
}
export interface LeadDirectory extends Paginated<LeadRecord> {
    stageCounts: {
        intent: LeadIntent;
        stage: string;
        label: string;
        total: number;
    }[];
    access: LeadAccess;
}
export interface LeadDetail {
    lead: LeadRecord;
    events: Paginated<LeadEvent>;
    access: LeadAccess;
}
export interface LeadOptions {
    owners: LeadOwner[];
    ownerTotal: number;
    units: {
        id: string;
        label: string;
    }[];
    unitTotal: number;
    properties: {
        id: string;
        name: string;
    }[];
    propertyTotal: number;
}
export interface DuplicateSuggestions {
    items: {
        contactId: string;
        name: string;
        email: string;
        phone: string;
        reasons: string[];
        leadCount: number;
    }[];
    notice: string;
}
