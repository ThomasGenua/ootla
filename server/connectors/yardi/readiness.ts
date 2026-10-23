import type { YardiReadiness,YardiReadinessDimensions,YardiRequirement } from '../../../shared/yardi-contracts.js';
import { yardiDomainReadiness } from './ownership.js';
/** Evidence inventory: no authorized client documentation, schema, samples,
 * authentication requirements, licensed scope or live verification was supplied.
 * A typed browser draft and simulator credentials never change these facts. */
export function yardiReadinessDimensions():YardiReadinessDimensions{
 return{scaffoldingImplemented:true,mappingTested:false,credentialsConfigured:false,liveBehaviorVerified:false};
}
const requirements:readonly YardiRequirement[]=[
 {key:'documentation',label:'Authorized client interface documentation',description:'The client-provided documentation for the exact licensed Yardi interface, including permitted record types and read/write restrictions.',required:'always',available:false},
 {key:'interface',label:'Licensed interface and access permissions',description:'The exact licensed interface identifier and written confirmation of the client-approved permissions.',required:'always',available:false},
 {key:'authentication',label:'Approved authentication requirements',description:'The documented credential type, authorization process, expiry and renewal requirements. Share actual credentials only through an approved secure channel.',required:'always',available:false},
 {key:'property_scope',label:'Approved property scope',description:'The client-approved external property identifiers and the organization they belong to. Properties and units remain separate records.',required:'always',available:false},
 {key:'sample_payloads',label:'Authorized sample payloads and identifiers',description:'Approved representative payloads or schemas for the requested records, stable identities, revisions and availability provenance.',required:'always',available:false},
 {key:'mapping_profile',label:'Reviewed client field mappings',description:'An explicit mapping from the approved payload to existing canonical fields, with ownership, conflict and relationship rules.',required:'always',available:false},
 {key:'test_environment',label:'Approved provider test environment',description:'A client-authorized test environment and a verification plan for reads, retries, duplicates and incremental changes.',required:'always',available:false},
 {key:'webhook_verification',label:'Callback verification, if applicable',description:'If the licensed interface uses callbacks, provide its actual verification, replay-prevention and permission requirements. No callback protocol is assumed.',required:'if_applicable',available:false},
];
export function getYardiReadiness(credentialStorageAvailable=false):YardiReadiness{
 return{
  provider:'yardi',status:'not_configured',code:'YARDI_CLIENT_DOCUMENTATION_REQUIRED',
  dimensions:yardiReadinessDimensions(),
  evidence:{authorizedDocumentation:false,authorizedSamplePayloads:false,licensedInterface:false,approvedAuthentication:false,approvedPropertyScope:false,approvedMappingProfile:false,liveProviderVerification:false},
  transport:{status:'not_configured',networkEnabled:false,liveAdapterRegistered:false,message:'No client-authorized Yardi transport is configured. This readiness check does not connect to a provider.'},
  credentialStorageAvailable,domains:yardiDomainReadiness(),requiredInputs:requirements.map(item=>({...item})),
  message:'Yardi-ready scaffolding is implemented. Client-specific mappings, live credentials and live provider behavior are not verified. The separate Yardi-style simulator remains synthetic.',
 };
}
