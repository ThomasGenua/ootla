import { z } from 'zod';
const text = (maximum: number) => z.string().trim().max(maximum).refine(value => !/[\u0000-\u001f\u007f]/.test(value));
export const applicantLoginSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(1024) }).strict();
export const applicantInvitationAcceptSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(12).max(128) }).strict();
export const applicantDetailsSchema = z.object({ displayName: text(200), phone: text(50), currentAddress: text(1000), moveInDate: z.union([z.literal(''), z.iso.date()]) }).strict();
export const applicantSaveSchema = z.object({ version: z.number().int().positive(), details: applicantDetailsSchema }).strict();
export const applicantVersionSchema = z.object({ version: z.number().int().positive() }).strict();
export const applicantConsentVersion = 'application-v1' as const;
export const applicantConsentText = 'I consent to Ootla storing and sharing the details and documents I provide with authorized staff for this property application. I confirm that my information is accurate to the best of my knowledge. This consent does not authorize screening, payment collection or an automated application decision.';
export const applicantConsentSchema = z.object({ version: z.literal(applicantConsentVersion), accepted: z.literal(true) }).strict();
export const applicationCreateSchema = z.object({ leadId: z.uuid() }).strict();
export const applicationListSchema = z.object({ q: text(200).default(''), status: z.enum(['all', 'draft', 'submitted', 'staff_review']).default('all'), page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) }).strict();
export const applicationInvitationSchema = z.object({ participantId: z.uuid(), expiresInHours: z.number().int().min(1).max(168).default(72) }).strict();
export const applicationParticipantSchema = z.object({ contactId: z.uuid(), email: z.string().trim().toLowerCase().email().max(254) }).strict();
export const applicationSettingsSchema = z.object({ version: z.number().int().positive(), coApplicantsEnabled: z.boolean(), checklist: z.array(z.object({ id: z.uuid().optional(), label: text(120).refine(value => value.length > 0), required: z.boolean() }).strict()).min(1).max(10) }).strict();
export const applicantDocumentSchema = z.object({ checklistId: z.uuid(), name: text(180).refine(value => value.length > 0) }).strict();
export interface ApplicantUser {
    id: string;
    name: string;
    email: string;
    organization: {
        id: string;
        name: string;
    };
    sessionExpiresAt: string;
}
export interface ApplicantConfig {
    demoEnabled: boolean;
    demoCredentials?: {
        email: string;
        password: string;
    };
    outboundMode: 'simulation';
}
export interface ApplicationSummary {
    id: string;
    applicantName: string;
    status: 'draft' | 'submitted' | 'staff_review';
    property: {
        id: string;
        name: string;
    };
    unit: {
        id: string;
        label: string;
    } | null;
    leadId: string | null;
    portalEnabled: boolean;
    coApplicantsEnabled: boolean;
    version: number;
    lastSavedAt: string;
    submittedAt: string | null;
    participantCount: number;
    readyCount: number;
    yourRole?: 'primary' | 'co_applicant';
    sourceSystem: string;
    providerOwned: boolean;
}
export interface ApplicantDocument {
    id: string;
    checklistId: string;
    name: string;
    mediaType: string;
    sizeBytes: number;
    createdAt: string;
    downloadUrl: string;
}
export type ApplicantDetails = z.infer<typeof applicantDetailsSchema>;
export interface ApplicationChecklist {
    id: string;
    label: string;
    required: boolean;
}
export interface PortalApplication {
    application: ApplicationSummary;
    participant: {
        id: string;
        role: 'primary' | 'co_applicant';
        version: number;
        details: ApplicantDetails;
        readyAt: string | null;
    };
    participants: {
        id: string;
        name: string;
        role: 'primary' | 'co_applicant';
        ready: boolean;
        invited: boolean;
    }[];
    checklist: (ApplicationChecklist & {
        document: ApplicantDocument | null;
    })[];
    consent: {
        version: typeof applicantConsentVersion;
        text: string;
        acceptedAt: string | null;
    };
    readiness: {
        missing: string[];
        canMarkReady: boolean;
        canSubmit: boolean;
    };
    nextSteps: string[];
    readOnly: boolean;
    preview: boolean;
}
export interface StaffApplicationParticipant {
    id: string;
    contactId: string;
    name: string;
    email: string;
    role: 'primary' | 'co_applicant';
    active: boolean;
    userBound: boolean;
    readyAt: string | null;
    details: ApplicantDetails;
    version: number;
    documents: ApplicantDocument[];
    consentAcceptedAt: string | null;
}
export interface StaffApplicationWorkspace {
    application: ApplicationSummary;
    primaryContact: {
        id: string;
        name: string;
        email: string;
        phone: string;
    };
    participants: StaffApplicationParticipant[];
    checklist: ApplicationChecklist[];
    invitations: {
        id: string;
        participantId: string;
        email: string;
        expiresAt: string;
        usedAt: string | null;
        revokedAt: string | null;
    }[];
    events: {
        id: string;
        kind: string;
        summary: string;
        occurredAt: string;
        actorName: string;
    }[];
    previewUrl: string;
}
export interface StaffApplications {
    items: ApplicationSummary[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}
export interface IssuedApplicationInvitation {
    id: string;
    url: string;
    expiresAt: string;
    delivery: 'copy_link';
    message: string;
}
