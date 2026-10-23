import {z} from 'zod';
export const leaseWorkflowStages=['lease_preparation','signature_requested','partially_signed','fully_signed','move_in_scheduled','completed'] as const;
export type LeaseWorkflowStage=typeof leaseWorkflowStages[number];
export const leaseStageLabels:Record<LeaseWorkflowStage,string>={lease_preparation:'Lease preparation',signature_requested:'Signature requested',partially_signed:'Partially signed',fully_signed:'Fully signed',move_in_scheduled:'Move-in scheduled',completed:'Completed'};
export const leaseEvidenceKinds=['manual_attestation','demo_event'] as const;
export type LeaseEvidenceKind=typeof leaseEvidenceKinds[number];
const text=(n:number)=>z.string().trim().min(1).max(n).refine(v=>!/[\u0000-\u001f\u007f]/.test(v));
export const leaseWorkflowActionSchema=z.object({requestKey:z.uuid()}).strict();
export const leaseWorkflowCreateSchema=leaseWorkflowActionSchema.extend({startsOn:z.iso.date(),endsOn:z.iso.date().nullable().default(null)}).strict().refine(v=>!v.endsOn||v.endsOn>=v.startsOn);
export const leaseWorkflowTransitionSchema=leaseWorkflowActionSchema.extend({stage:z.enum(leaseWorkflowStages).exclude(['lease_preparation']),evidence:z.object({kind:z.enum(leaseEvidenceKinds),reference:text(500).refine(v=>v.length>=5)}).strict(),moveInAt:z.iso.datetime({offset:true}).optional()}).strict();
export const moveInTaskTemplateSchema=z.object({key:z.string().regex(/^[a-z][a-z0-9_-]{0,59}$/),title:text(300),dayOffset:z.number().int().min(-30).max(30),priority:z.enum(['low','normal','high','urgent'])}).strict();
export type MoveInTaskTemplate=z.infer<typeof moveInTaskTemplateSchema>;
export const leaseWorkflowSettingsSchema=leaseWorkflowActionSchema.extend({leasedMilestone:z.enum(['fully_signed','completed']),moveInTasks:z.array(moveInTaskTemplateSchema).min(1).max(12).refine(v=>new Set(v.map(i=>i.key)).size===v.length)}).strict();
export interface LeaseWorkflowSettings{configured:boolean;leasedMilestone:'fully_signed'|'completed';moveInTasks:MoveInTaskTemplate[];notice:string}
export interface LeaseWorkflowRecord{id:string;leaseId:string;stage:LeaseWorkflowStage;stageLabel:string;startsOn:string;endsOn:string|null;moveInAt:string|null;version:number;leasedMilestone:'fully_signed'|'completed';signatureEvidenceKind:LeaseEvidenceKind|null;signatureVerifiedAt:string|null;leadId:string|null;residentCount:number;simulated:boolean}
export interface LeaseWorkflowWorkspace{
 applicationId:string;mode:'demo'|'manual'|'unsupported_provider'|'not_configured';workflow:LeaseWorkflowRecord|null;
 latestDecision:{decision:string;createdAt:string}|null;propertyTimeZone:string;
 allowedTransitions:{key:LeaseWorkflowStage;label:string}[];evidenceKinds:LeaseEvidenceKind[];
 events:{id:string;fromStage:LeaseWorkflowStage|null;toStage:LeaseWorkflowStage;evidenceKind:LeaseEvidenceKind|null;reference:string;actorName:string;occurredAt:string;simulated:boolean}[];
 tasks:{id:string;title:string;dueAt:string;status:string;ownerName:string|null}[];settings:LeaseWorkflowSettings;notice:string;
 access:{canCreate:boolean;canTransition:boolean;canReopen:boolean;canConfigure:boolean};
}
