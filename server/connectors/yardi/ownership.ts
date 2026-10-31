import type { YardiDomainReadiness,YardiRecordKind } from '../../../shared/yardi-contracts.js';
const commonStaffWork=['Internal notes and documents','Staff assignments and tasks','Consent and staff review decisions','Lead preferences, next actions and pipeline decisions'];
/** Names here describe existing Ootla fields, never provider payload selectors. */
export const yardiCanonicalFields:Readonly<Record<YardiRecordKind,readonly string[]>>={
 property:['name','address','city','type'],
 unit:['label','bedrooms','status','monthlyRent','availabilitySource','lastVerifiedAt'],
 contact:['displayName','email','phone'],
 application:['contactId','propertyId','unitId','leadId','status'],
 lease:['contactId','propertyId','unitId','applicationId','leadId','status','startsOn','endsOn'],
 resident:[],
 payment_status:[],
};
export function yardiDomainReadiness():YardiDomainReadiness[]{
 const labels:Record<YardiRecordKind,string>={property:'Properties',unit:'Units and availability',contact:'Contact identities',application:'Application facts',lease:'Leases',resident:'Residents',payment_status:'Payment status and accounting boundary'};
 return(Object.keys(yardiCanonicalFields) as YardiRecordKind[]).map(entity=>{
  const unsupported=entity==='resident'||entity==='payment_status';
  return{
   entity,label:labels[entity],canonicalSupport:unsupported?'unsupported':'existing_foundation',
   status:unsupported?'unsupported':'not_configured',
   authority:entity==='payment_status'?'verified_existing_provider':'configured_yardi',
   canonicalFields:[...yardiCanonicalFields[entity]],
   fieldOwnership:entity==='payment_status'
    ? 'Yardi remains authoritative for configured accounting records. Ootla may display verified status from an approved existing payment provider; no accounting ledger write or payment operation is implemented.'
    : entity==='resident'
     ? 'Yardi remains authoritative for configured resident records. Ootla has no resident-record sync implementation.'
     : 'Only explicitly configured source fields may be read from the client-authorized interface. Yardi remains authoritative for those configured fields.',
   staffRetains:[...commonStaffWork],
   message:unsupported
    ? 'Unsupported in the current adapter. Client documentation and a suitable canonical record model are required before implementation.'
    : 'The shared CRM foundation exists. A client-authorized mapping profile, supported transport and provider verification are still required.',
  };
 });
}
