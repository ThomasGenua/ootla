import {z} from 'zod';
const propertyId=z.union([z.literal('demo'),z.string().regex(/^properties\/[1-9][0-9]{0,18}$/)]);
export const analyticsKinds=['summary','acquisition','landing','events'] as const;
export type AnalyticsKind=typeof analyticsKinds[number];
const date=z.iso.date(),key=z.uuid();
export const analyticsQuerySchema=z.object({from:date,to:date,kind:z.enum(analyticsKinds).default('summary'),comparison:z.enum(['previous','none']).default('previous'),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(10),refresh:z.enum(['true','false']).default('false')}).strict().refine(v=>v.from<=v.to&&Date.parse(v.to+'T00:00:00Z')-Date.parse(v.from+'T00:00:00Z')<=365*86400000,'Choose a date range of at most 366 days.');
export const analyticsSelectionSchema=z.object({requestKey:key,propertyId,crmPropertyId:z.uuid().nullable().default(null)}).strict();
export const analyticsRequestSchema=z.object({requestKey:key}).strict();
export const analyticsPropertyQuerySchema=z.object({pageToken:z.string().max(4096).optional()}).strict();
export const analyticsCrmOptionsSchema=z.object({q:z.string().trim().max(200).default(''),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(25)}).strict();
export interface AnalyticsProperty{id:string;name:string;timeZone:string|null}
export interface AnalyticsSelection extends AnalyticsProperty{crmPropertyId:string|null;crmPropertyName:string|null}
export interface AnalyticsStatus{state:'demo'|'not_configured'|'connecting'|'connected'|'degraded'|'revoked'|'disconnected';mode:'illustrative'|'live'|'unavailable';configured:boolean;canManage:boolean;canReadReports:boolean;selectedProperty:AnalyticsSelection|null;lastSuccessfulFetch:string|null;lastError:string|null;notice:string;scope:'https://www.googleapis.com/auth/analytics.readonly'}
export interface AnalyticsProperties{items:AnalyticsProperty[];nextPageToken:string|null;source:'google'|'illustrative'}
export interface AnalyticsRow{label:string;users:number|null;sessions:number|null;events:number|null;keyEvents:number|null}
export interface AnalyticsRemoteReport{rows:AnalyticsRow[];total:number;timeZone:string|null;metadata:{thresholded:boolean;otherRow:boolean;sampled?:boolean;truncated?:boolean;empty?:boolean};available:boolean}
export interface AnalyticsReport{
 kind:AnalyticsKind;source:{mode:'illustrative'|'google'|'unavailable';label:string;propertyId:string|null;propertyName:string|null;timeZone:string|null};
 range:{from:string;to:string};comparisonRange:{from:string;to:string}|null;summary:{users:number|null;sessions:number|null;events:number|null;keyEvents:number|null};
 comparison:{users:number|null;sessions:number|null;events:number|null;keyEvents:number|null}|null;rows:AnalyticsRow[];total:number;page:number;pageSize:number;totalPages:number;
 available:boolean;fetchedAt:string|null;cached:boolean;cacheExpiresAt:string|null;metadata:{thresholded:boolean;otherRow:boolean;sampled?:boolean;truncated?:boolean;empty?:boolean};notice:string;attributionNotice:string;
}

export interface AnalyticsKeyEvents{available:boolean;source:'google'|'illustrative'|'unavailable';items:Array<{name:string;eventName:string;countingMethod:string}>;nextPageToken:string|null;notice:string}
