import { yardiConfigDraftSchema,type YardiConfigValidation,type YardiValidationIssue } from '../../../shared/yardi-contracts.js';
import { ApiError } from '../../http/errors.js';
import { yardiReadinessDimensions } from './readiness.js';
/** Pure, non-persisting draft validation. Supplied text is a proposal, not proof. */
export function validateYardiConfiguration(value:unknown):YardiConfigValidation{
 const parsed=yardiConfigDraftSchema.safeParse(value);
 if(!parsed.success)throw new ApiError(400,'INVALID_YARDI_CONFIG','Use supported neutral configuration fields, distinct scope identifiers and no credential, endpoint or payload fields.');
 const input=parsed.data,issues:YardiValidationIssue[]=[];
 const required=(field:string,present:boolean,label:string)=>{
  issues.push({field,code:present?'CLIENT_APPROVAL_UNVERIFIED':'CLIENT_INPUT_REQUIRED',message:present?label+' was supplied as a draft but has not been verified against authorized client evidence.':label+' must be supplied and approved by the client.'});
 };
 required('documentationReference',Boolean(input.documentationReference),'Exact interface documentation');
 required('interfaceId',Boolean(input.interfaceId),'Licensed interface identification');
 required('clientEnvironment',Boolean(input.clientEnvironment),'Provider test environment');
 required('propertyExternalIds',Boolean(input.propertyExternalIds?.length),'Approved property scope');
 issues.push({field:'authentication',code:'AUTHENTICATION_REQUIREMENTS_REQUIRED',message:'The documented authentication method is unknown. This validator does not collect or configure credentials.'});
 issues.push({field:'mapping',code:'AUTHORIZED_PAYLOAD_REQUIRED',message:'No approved source payload, schema or client mapping profile is available. Source selectors and record transformations have not been verified.'});
 issues.push({field:'transport',code:'YARDI_TRANSPORT_NOT_CONFIGURED',message:'No live Yardi transport or licensed adapter is configured. No provider request was made.'});
 const capabilities=input.requestedCapabilities??[];
 for(const capability of capabilities)if(capability==='resident'||capability==='payment_status')issues.push({field:'requestedCapabilities',code:'YARDI_RECORD_UNSUPPORTED',message:capability==='resident'?'Resident synchronization requires an approved interface and a supported canonical resident model.':'Verified payment/accounting status requires an approved provider contract and a supported read-only status model. Payment actions are unavailable.'});
 return{
  status:capabilities.some(kind=>kind==='resident'||kind==='payment_status')?'unsupported':'not_configured',
  syntaxValid:true,readyForLive:false,persisted:false,networkUsed:false,dimensions:yardiReadinessDimensions(),
  summary:{documentationReferenceProvided:Boolean(input.documentationReference),interfaceIdProvided:Boolean(input.interfaceId),environmentProvided:Boolean(input.clientEnvironment),propertyCount:input.propertyExternalIds?.length??0,requestedCapabilities:[...capabilities]},
  issues,message:'This dry run checks only the proposed configuration shape. It saves nothing and cannot verify a client interface, authentication, mappings or live behavior.',
 };
}
