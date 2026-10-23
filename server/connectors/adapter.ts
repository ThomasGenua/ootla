import type { PoolClient } from 'pg';
import type { ConnectorCapabilities, ConnectorEntity } from '../../shared/connector-contracts.js';
export interface ConnectorEnvelope {sequence:string;providerEventId:string;entityType:ConnectorEntity;externalId:string;providerVersion:number;payload:Record<string,unknown>}
export interface ConnectorAdapter {
 readonly key:string;readonly name:string;readonly label:string;
 readonly capabilities:ConnectorCapabilities;readonly fieldOwnership:Record<ConnectorEntity,string[]>;
 poll(client:PoolClient,connectionId:string,after:string,through:string,limit:number):Promise<ConnectorEnvelope[]>;
}
export class ConnectorProviderFailure extends Error {
 constructor(readonly code:'SIMULATED_PROVIDER_UNAVAILABLE'|'RECORD_APPLY_FAILED'|'INVALID_SOURCE_RECORD'){super(code);}
}
