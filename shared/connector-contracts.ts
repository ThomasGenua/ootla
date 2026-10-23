import { z } from 'zod';
import type { Paginated } from './property-contracts.js';
export type ConnectorState='not_configured'|'demo'|'connecting'|'live'|'degraded'|'disconnected';
export type ConnectorEntity='property'|'unit'|'contact'|'lead';
export const connectorPageSchema=z.object({page:z.coerce.number().int().min(1).max(1000000).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(25)}).strict();
export const connectorRequestSchema=z.object({requestKey:z.uuid()}).strict();
export const connectorSyncSchema=connectorRequestSchema.extend({mode:z.enum(['incremental','replay']).default('incremental')}).strict();
export const connectorDemoActionSchema=connectorRequestSchema.extend({action:z.enum(['availability_update','contact_update','fail_next','duplicate_event','stale_event']),status:z.enum(['available','reserved','occupied']).optional()}).strict();
export const connectorResolveSchema=connectorRequestSchema.extend({resolution:z.enum(['use_provider','keep_ootla'])}).strict();
export const connectorCredentialsSchema=z.object({secret:z.string().min(1).max(4096)}).strict();
export interface ConnectorCapabilities {properties:boolean;units:boolean;contacts:boolean;guestCards:boolean;availability:boolean;leases:boolean;residents:boolean;accounting:boolean;outbound:boolean}
export interface ConnectorConnection {id:string;provider:'yardi_demo';state:ConnectorState;version:number;cursor:string;lastSuccessAt:string|null;lastAttemptAt:string|null;lastError:string|null;credentialConfigured:boolean;createdAt:string}
export interface ConnectorOverview {
 connection:ConnectorConnection|null;
 adapter:{key:'yardi_demo';name:string;label:string;capabilities:ConnectorCapabilities;fieldOwnership:Record<ConnectorEntity,string[]>;liveSetupMessage:string};
 access:{canManage:boolean;demoAvailable:boolean;credentialStorageAvailable:boolean;liveAvailable:false};
 summary:{jobs:number;mappings:number;events:number;openConflicts:number};
}
export interface ConnectorJob {id:string;mode:'incremental'|'replay';status:'queued'|'running'|'completed'|'failed'|'cancelled';attempts:number;maxAttempts:3;processedCount:number;nextAttemptAt:string;error:string|null;createdAt:string;completedAt:string|null}
export interface ConnectorMapping {id:string;entityType:ConnectorEntity;externalId:string;recordId:string;relatedUrl:string;lastProviderVersion:number;sourceOwnedFields:string[];lastSyncedAt:string|null}
export interface ConnectorEvent {id:string;providerEventId:string;sequence:string;entityType:ConnectorEntity;externalId:string;providerVersion:number;status:'applied'|'duplicate'|'conflict'|'ignored';summary:string;recordId:string|null;relatedUrl:string|null;occurredAt:string}
export interface ConnectorConflict {id:string;entityType:ConnectorEntity;externalId:string;recordId:string;relatedUrl:string;reason:'local_change'|'stale_event';fields:string[];currentValues:Record<string,string|number|null>;providerValues:Record<string,string|number|null>;status:'open'|'resolved';resolution:'use_provider'|'keep_ootla'|null;canUseProvider:boolean;createdAt:string;resolvedAt:string|null}
export type ConnectorJobs=Paginated<ConnectorJob>;
export type ConnectorMappings=Paginated<ConnectorMapping>;
export type ConnectorEvents=Paginated<ConnectorEvent>;
export type ConnectorConflicts=Paginated<ConnectorConflict>;
