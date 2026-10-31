import { z } from 'zod';
export type RecordSource = 'local' | 'demo' | 'import' | 'yardi';
export type FoundationEntity = 'property' | 'unit' | 'contact' | 'application' | 'lease';
export interface Paginated<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}
export interface PropertyGroup {
    id: string;
    name: string;
}
export interface FoundationAccess {
    canCreateProperties: boolean;
    canManageProperties: boolean;
    canManageContacts: boolean;
    isOrganizationAdmin: boolean;
    organizationMode: 'standalone' | 'yardi_connected';
}
export interface PropertySummary {
    id: string;
    name: string;
    address: string;
    city: string;
    type: string;
    group: PropertyGroup | null;
    source: RecordSource;
    unitCount: number;
    availableUnitCount: number;
    availabilitySource: string;
    lastVerifiedAt: string | null;
    readOnlyFields: string[];
}
export interface UnitRecord {
    id: string;
    propertyId: string;
    label: string;
    bedrooms: number;
    status: 'available' | 'reserved' | 'occupied';
    monthlyRent: number;
    source: RecordSource;
    availabilitySource: string;
    lastVerifiedAt: string | null;
    readOnlyFields: string[];
}
export interface RelatedLead {
    id: string;
    contactId: string | null;
    name: string;
    email: string;
    status: string;
    unitId: string | null;
    createdAt: string;
}
export interface AssignedStaff {
    id: string;
    membershipId: string;
    name: string;
    role: string;
}
export interface ExternalMapping {
    id: string;
    entityType: FoundationEntity;
    entityId: string;
    provider: string;
    externalId: string;
    createdAt: string;
}
export interface PropertyDetail {
    property: PropertySummary;
    units: Paginated<UnitRecord>;
    leads: Paginated<RelatedLead>;
    staff: AssignedStaff[];
    staffTotal: number;
    externalMappings: ExternalMapping[];
    access: FoundationAccess;
}
export interface ContactRecord {
    id: string;
    displayName: string;
    email: string;
    phone: string;
    source: RecordSource;
    readOnlyFields: string[];
    propertyIds: string[];
    createdAt: string;
    updatedAt: string;
}
export interface ContactHistory {
    id: string;
    kind: 'lead' | 'application' | 'lease' | 'activity';
    propertyId: string;
    propertyName: string;
    summary: string;
    occurredAt: string;
}
export interface ContactDetail {
    contact: ContactRecord;
    history: Paginated<ContactHistory>;
    externalMappings: ExternalMapping[];
    access: FoundationAccess;
}
export interface ApplicationRecord {
    id: string;
    contactId: string;
    propertyId: string;
    unitId: string | null;
    leadId: string | null;
    status: 'draft' | 'submitted' | 'staff_review';
    source: RecordSource;
}
export interface LeaseRecord {
    id: string;
    contactId: string;
    propertyId: string;
    unitId: string | null;
    applicationId: string | null;
    leadId: string | null;
    status: 'draft' | 'active' | 'ended';
    startsOn: string | null;
    endsOn: string | null;
    source: RecordSource;
}
const text = (max: number) => z.string().trim().max(max).refine(value => !/[\u0000-\u001f\u007f]/.test(value));
const name = text(200).min(1);
const identifier = z.uuid();
export const recordSourceSchema = z.enum(['local', 'demo', 'import', 'yardi']);
export const foundationPageSchema = z.object({ page: z.coerce.number().int().min(1).max(1000000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
export const propertyDirectorySchema = foundationPageSchema.extend({ q: text(200).default(''), city: text(200).default(''), groupId: z.union([identifier, z.literal('')]).default(''), type: text(100).default(''), source: z.union([recordSourceSchema, z.literal('')]).default(''), availability: z.enum(['', 'available', 'unverified']).default(''), sort: z.enum(['name_asc', 'name_desc', 'city_asc', 'created_desc']).default('name_asc') }).strict();
export const propertyCreateSchema = z.object({ name, address: text(500).default(''), city: text(200).default(''), type: text(100).min(1).default('residential'), groupId: identifier.nullable().default(null) }).strict();
export const propertyUpdateSchema = z.object({ name: name.optional(), address: text(500).optional(), city: text(200).optional(), type: text(100).min(1).optional(), groupId: identifier.nullable().optional() }).strict().refine(value => Object.keys(value).length > 0);
export type PropertyCreateInput = z.input<typeof propertyCreateSchema>;
export const unitCreateSchema = z.object({ label: text(100).min(1), bedrooms: z.number().int().min(0).max(100), status: z.enum(['available', 'reserved', 'occupied']), monthlyRent: z.number().min(0).max(9999999999.99), availabilitySource: z.enum(['staff_reported', 'import', 'demo', 'unknown']).default('staff_reported'), lastVerifiedAt: z.iso.datetime({ offset: true }).nullable().default(null) }).strict();
export const unitUpdateSchema = z.object({ label: text(100).min(1).optional(), bedrooms: z.number().int().min(0).max(100).optional(), status: z.enum(['available', 'reserved', 'occupied']).optional(), monthlyRent: z.number().min(0).max(9999999999.99).optional(), availabilitySource: z.enum(['staff_reported', 'import', 'demo', 'unknown']).optional(), lastVerifiedAt: z.iso.datetime({ offset: true }).nullable().optional() }).strict().refine(value => Object.keys(value).length > 0);
export const groupCreateSchema = z.object({ name }).strict();
export const contactCreateSchema = z.object({ displayName: name, email: z.union([z.email().max(254), z.literal('')]).default(''), phone: text(100).default(''), propertyIds: z.array(identifier).min(1).max(100) }).strict();
export const contactUpdateSchema = z.object({ displayName: name.optional(), email: z.union([z.email().max(254), z.literal('')]).optional(), phone: text(100).optional() }).strict().refine(value => Object.keys(value).length > 0);
export const contactDirectorySchema = foundationPageSchema.extend({ q: text(200).default(''), propertyId: z.union([identifier, z.literal('')]).default('') }).strict();
export const applicationCreateSchema = z.object({ contactId: identifier, propertyId: identifier, unitId: identifier.nullable().default(null), leadId: identifier.nullable().default(null), status: z.enum(['draft', 'submitted', 'staff_review']).default('draft') }).strict();
export const leaseCreateSchema = z.object({ contactId: identifier, propertyId: identifier, unitId: identifier.nullable().default(null), applicationId: identifier.nullable().default(null), leadId: identifier.nullable().default(null), status: z.enum(['draft', 'active', 'ended']).default('draft'), startsOn: z.iso.date().nullable().default(null), endsOn: z.iso.date().nullable().default(null) }).strict().refine(value => !value.startsOn || !value.endsOn || value.endsOn >= value.startsOn);
export const externalMappingSchema = z.object({ entityType: z.enum(['property', 'unit', 'contact', 'application', 'lease']), entityId: identifier, provider: text(100).min(1).regex(/^[a-z][a-z0-9_-]*$/), externalId: text(200).min(1) }).strict();
