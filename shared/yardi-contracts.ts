import { z } from 'zod';

/** Ootla's canonical domains, not guessed Yardi resource or field names. */
export const yardiRecordKinds=['property','unit','contact','application','lease','resident','payment_status'] as const;
export type YardiRecordKind=typeof yardiRecordKinds[number];
const reference=z.string().trim().min(1).max(500).refine(value=>!/[\u0000-\u001f\u007f]/.test(value));
export const yardiConfigDraftSchema=z.object({
 documentationReference:reference.optional(),
 interfaceId:reference.optional(),
 clientEnvironment:reference.optional(),
 propertyExternalIds:z.array(reference).max(500).optional(),
 requestedCapabilities:z.array(z.enum(yardiRecordKinds)).max(7).optional(),
}).strict().refine(value=>!value.propertyExternalIds||new Set(value.propertyExternalIds).size===value.propertyExternalIds.length,{message:'Property scope identifiers must be distinct.',path:['propertyExternalIds']})
.refine(value=>!value.requestedCapabilities||new Set(value.requestedCapabilities).size===value.requestedCapabilities.length,{message:'Requested capabilities must be distinct.',path:['requestedCapabilities']});
export type YardiConfigDraft=z.infer<typeof yardiConfigDraftSchema>;
export interface YardiReadinessDimensions {
 scaffoldingImplemented:boolean;
 mappingTested:boolean;
 credentialsConfigured:boolean;
 liveBehaviorVerified:boolean;
}
export type YardiRequirementKey='documentation'|'interface'|'authentication'|'property_scope'|'sample_payloads'|'mapping_profile'|'test_environment'|'webhook_verification';
export interface YardiRequirement {key:YardiRequirementKey;label:string;description:string;required:'always'|'if_applicable';available:false}
export interface YardiDomainReadiness {
 entity:YardiRecordKind;label:string;
 canonicalSupport:'existing_foundation'|'unsupported';
 status:'not_configured'|'unsupported';
 authority:'configured_yardi'|'verified_existing_provider';
 canonicalFields:string[];
 fieldOwnership:string;
 staffRetains:string[];
 message:string;
}
export interface YardiReadiness {
 provider:'yardi';
 status:'not_configured';
 code:'YARDI_CLIENT_DOCUMENTATION_REQUIRED';
 dimensions:YardiReadinessDimensions;
 evidence:{authorizedDocumentation:false;authorizedSamplePayloads:false;licensedInterface:false;approvedAuthentication:false;approvedPropertyScope:false;approvedMappingProfile:false;liveProviderVerification:false};
 transport:{status:'not_configured';networkEnabled:false;liveAdapterRegistered:false;message:string};
 credentialStorageAvailable:boolean;
 domains:YardiDomainReadiness[];
 requiredInputs:YardiRequirement[];
 message:string;
}
export interface YardiValidationIssue {field:string;code:string;message:string}
export interface YardiConfigValidation {
 status:'not_configured'|'unsupported';
 syntaxValid:true;
 readyForLive:false;
 persisted:false;
 networkUsed:false;
 dimensions:YardiReadinessDimensions;
 summary:{documentationReferenceProvided:boolean;interfaceIdProvided:boolean;environmentProvided:boolean;propertyCount:number;requestedCapabilities:YardiRecordKind[]};
 issues:YardiValidationIssue[];
 message:string;
}
