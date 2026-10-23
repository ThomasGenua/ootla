import { z } from 'zod';
import { yardiRecordKinds,type YardiRecordKind,type YardiValidationIssue } from '../../../shared/yardi-contracts.js';
import { yardiCanonicalFields } from './ownership.js';

const text=(max:number)=>z.string().trim().min(1).max(max).refine(value=>!/[\u0000-\u001f\u007f]/.test(value));
const segment=z.union([
 text(200).refine(value=>!['__proto__','prototype','constructor'].includes(value)),
 z.number().int().min(0).max(10000),
]);
export const yardiSourcePathSchema=z.array(segment).min(1).max(16);
export const yardiMappingProfileSchema=z.object({
 documentationReference:text(500),
 interfaceId:text(500),
 entity:z.enum(yardiRecordKinds),
 recordIdSourcePath:yardiSourcePathSchema,
 fields:z.array(z.object({canonicalField:text(100),sourcePath:yardiSourcePathSchema}).strict()).min(1).max(30),
}).strict().refine(profile=>new Set(profile.fields.map(field=>field.canonicalField)).size===profile.fields.length,{message:'Map each canonical field once.'});
export type YardiMappingProfile=z.infer<typeof yardiMappingProfileSchema>;
export const configuredYardiMappingProfiles:readonly YardiMappingProfile[]=Object.freeze([]);

export interface YardiMappingValidation {
 status:'not_configured'|'unsupported'|'contract_tested';
 mappingTested:false;
 issues:YardiValidationIssue[];
 /** Only synthetic contract exercises can return values; no CRM write occurs. */
 sourceRecordId?:string;
 values?:Record<string,string|number|null>;
}
function issue(code:string,message:string,field='mapping'):YardiValidationIssue{return{field,code,message};}
function checked(value:unknown):{profile:YardiMappingProfile}|{result:YardiMappingValidation}{
 const parsed=yardiMappingProfileSchema.safeParse(value);
 if(!parsed.success)return{result:{status:'not_configured',mappingTested:false,issues:[issue('INVALID_MAPPING_PROFILE','Use bounded literal source paths and one mapping per canonical field.')]}};
 const profile=parsed.data;
 if(profile.entity==='resident'||profile.entity==='payment_status')return{result:{status:'unsupported',mappingTested:false,issues:[issue('YARDI_RECORD_UNSUPPORTED','This domain requires an approved canonical synchronization model before any mapping can be enabled.')]}};
 if(profile.fields.some(field=>!yardiCanonicalFields[profile.entity].includes(field.canonicalField)))return{result:{status:'not_configured',mappingTested:false,issues:[issue('CANONICAL_FIELD_UNSUPPORTED','Only declared canonical fields may be mapped. Staff decisions, notes, assignments and payment actions remain outside source mappings.')]}};
 return{profile};
}
/** A neutral profile is not proof of an authorized source schema or payload. */
export function validateYardiMappingProfile(value:unknown):YardiMappingValidation{
 const result=checked(value);if('result'in result)return result.result;
 return{status:'not_configured',mappingTested:false,issues:[issue('AUTHORIZED_PAYLOAD_REQUIRED','No authorized client payload or approved client mapping profile is available. Source paths have not been resolved or verified.')]};
}
function at(root:unknown,path:readonly(string|number)[]):unknown{
 let value=root;
 for(const key of path){
  if(value===null||typeof value!=='object'||!Object.hasOwn(value,key))return undefined;
  if(Array.isArray(value)&&typeof key!=='number')return undefined;
  value=(value as Record<string|number,unknown>)[key];
 }
 return value;
}
function canonicalValue(entity:YardiRecordKind,field:string,value:unknown):string|number|null|undefined{
 if(value===null)return ['lastVerifiedAt','householdId','unitId','leadId','applicationId','startsOn','endsOn'].includes(field)?null:undefined;
 if(field==='bedrooms')return typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=100?value:undefined;
 if(field==='monthlyRent')return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=9999999999.99?value:undefined;
 if(typeof value!=='string'||/[\u0000-\u001f\u007f]/.test(value))return undefined;
 const trimmed=value.trim();
 if(['contactId','householdId','propertyId','unitId','leadId','applicationId'].includes(field))return z.uuid().safeParse(trimmed).success?trimmed:undefined;
 if(field==='email')return trimmed===''||z.email().max(254).safeParse(trimmed).success?trimmed.toLowerCase():undefined;
 if(field==='status'){
  const allowed=entity==='unit'?['available','reserved','occupied']:entity==='application'?['draft','submitted','staff_review']:entity==='lease'?['draft','active','ended']:[];
  return allowed.includes(trimmed)?trimmed:undefined;
 }
 if(field==='availabilitySource')return ['unknown','staff_reported','demo','import','yardi'].includes(trimmed)?trimmed:undefined;
 if(field==='lastVerifiedAt')return z.iso.datetime({offset:true}).safeParse(trimmed).success?trimmed:undefined;
 if(field==='startsOn'||field==='endsOn')return z.iso.date().safeParse(trimmed).success?trimmed:undefined;
 const maximum=field==='address'?500:['phone','label','type'].includes(field)?100:200;
 if(trimmed.length>maximum||(!trimmed&&!['address','phone'].includes(field)))return undefined;
 return trimmed;
}
/**
 * Pure synthetic-contract exercise for tests. It cannot register a profile,
 * assert client authorization, persist a record or lift real mapping readiness.
 * The production HTTP API deliberately has no sample/profile upload endpoint.
 */
export function projectYardiContractFixture(value:unknown,fixture:unknown):YardiMappingValidation{
 const result=checked(value);if('result'in result)return result.result;
 const profile=result.profile,external=at(fixture,profile.recordIdSourcePath);
 const id=typeof external==='string'?external.trim():typeof external==='number'&&Number.isSafeInteger(external)&&external>=0?String(external):'';
 if(!id||id.length>200||/[\u0000-\u001f\u007f]/.test(id))return{status:'not_configured',mappingTested:false,issues:[issue('SOURCE_ID_REQUIRED','A stable bounded source identity is required; names are never used to merge people.','recordIdSourcePath')]};
 const values:Record<string,string|number|null>={},issues:YardiValidationIssue[]=[];
 for(const field of profile.fields){
  const normalized=canonicalValue(profile.entity,field.canonicalField,at(fixture,field.sourcePath));
  if(normalized===undefined)issues.push(issue('SOURCE_VALUE_INVALID','A declared source path is absent or its value does not match the canonical field.',field.canonicalField));
  else values[field.canonicalField]=normalized;
 }
 return issues.length?{status:'not_configured',mappingTested:false,issues}:{status:'contract_tested',mappingTested:false,sourceRecordId:id,values,issues:[]};
}
