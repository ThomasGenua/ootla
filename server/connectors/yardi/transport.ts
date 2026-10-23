import type { YardiRecordKind } from '../../../shared/yardi-contracts.js';
export interface YardiReadRequest {
 entity:YardiRecordKind;
 propertyExternalIds:readonly string[];
 cursor?:string|null;
}
export type YardiTransportFailure={
 status:'not_configured'|'unsupported';
 code:'YARDI_TRANSPORT_NOT_CONFIGURED'|'YARDI_RECORD_UNSUPPORTED'|'YARDI_WRITE_UNSUPPORTED';
 message:string;
 networkUsed:false;
};
/** Future documented adapters return raw records for explicit mapping validation;
 * this neutral envelope does not prescribe any Yardi payload or auth fields. */
export interface YardiTransportSuccess {
 status:'ok';
 records:readonly unknown[];
 nextCursor:string|null;
 networkUsed:boolean;
}
export type YardiTransportOutcome=YardiTransportSuccess|YardiTransportFailure;
export interface ClientAuthorizedYardiReadTransport {
 readonly interfaceId:string|null;
 read(request:YardiReadRequest):Promise<YardiTransportOutcome>;
}
/**
 * No interface, endpoint, auth shape, payload or callback protocol is invented.
 * A real implementation needs the client's actual authorized documentation.
 * This boundary is deliberately absent from the registered connector adapters.
 */
export class UnconfiguredYardiTransport implements ClientAuthorizedYardiReadTransport {
 readonly interfaceId=null;
 async read(request:YardiReadRequest):Promise<YardiTransportFailure>{
  return request.entity==='resident'||request.entity==='payment_status'
   ?{status:'unsupported',code:'YARDI_RECORD_UNSUPPORTED',message:'This domain has no approved canonical synchronization model or configured client transport.',networkUsed:false}
   :{status:'not_configured',code:'YARDI_TRANSPORT_NOT_CONFIGURED',message:'A licensed client interface, approved authentication and source mappings are required before provider reads can be implemented.',networkUsed:false};
 }
}
export function rejectYardiWrite():YardiTransportFailure{
 return{status:'unsupported',code:'YARDI_WRITE_UNSUPPORTED',message:'No universal Yardi writes or payment authorization, capture, charge or refund operation is available.',networkUsed:false};
}
