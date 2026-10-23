import type {PoolClient} from 'pg';
export interface PaymentProviderObservation{recordId:string;organizationId:string;referenceId:string;status:'pending'|'confirmed';version:number;eventId:string|null}
export interface PaymentStatusAdapter{
 readonly key:string;readonly mode:'demo';
 read(c:PoolClient,organizationId:string,referenceId:string):Promise<PaymentProviderObservation|null>;
}
