import {z} from 'zod';
import type {Paginated} from './property-contracts.js';
export const portfolioViews=['properties','sources','pipeline','follow_ups','workload','applications'] as const;
export type PortfolioView=typeof portfolioViews[number];
const id=z.uuid(),date=z.iso.date();
export const portfolioQuerySchema=z.object({from:date,to:date,propertyId:id.optional(),groupId:id.optional(),region:z.string().trim().min(1).max(100).optional(),agentMembershipId:id.optional(),teamId:id.optional(),attention:z.enum(['all','missing_documents','follow_up_due','staff_review']).default('all'),view:z.enum(portfolioViews).default('properties'),q:z.string().trim().max(200).default(''),sort:z.enum(['name_asc','leads_desc','open_tasks_desc','age_desc']).default('name_asc'),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(25)}).strict().refine(v=>v.from<=v.to&&Date.parse(v.to+'T00:00:00Z')-Date.parse(v.from+'T00:00:00Z')<=1095*86400000,'Choose an ordered date range of at most three years.');
export type PortfolioQuery=z.infer<typeof portfolioQuerySchema>;
export const reportingOptionsSchema=z.object({q:z.string().trim().max(200).default(''),groupSearch:z.string().trim().max(200).default(''),regionSearch:z.string().trim().max(100).default(''),agentSearch:z.string().trim().max(200).default(''),teamSearch:z.string().trim().max(200).default(''),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(25)}).strict();
export const reportingRegionSchema=z.object({requestKey:z.uuid(),propertyId:id,region:z.string().trim().min(1).max(100).refine(v=>!/[\u0000-\u001f\u007f]/.test(v)).nullable()}).strict();
export interface ReportingDefinition{id:string;label:string;kind:'period_count'|'cohort_conversion'|'current_state'|'elapsed_time';source:string;dateBasis:string;numerator:string;denominator:string|null;included:string;excluded:string;limitation:string}
export interface PortfolioColumn{key:string;label:string;format:'number'|'percent'|'days'|'hours'|'text'|'date'}
export interface PortfolioRow{id:string;label:string;url:string|null;values:Record<string,string|number|null>}
export interface PortfolioTable extends Paginated<PortfolioRow>{view:PortfolioView;title:string;columns:PortfolioColumn[]}
export interface PortfolioCohort{key:'lead_to_tour'|'tour_to_application'|'application_to_lease';label:string;numerator:number;denominator:number;ratePercent:number|null;definitionId:string}
export interface PortfolioReport{
 query:PortfolioQuery;range:{from:string;to:string;fromInstant:string;untilInstant:string;timeZone:'UTC';cohortCutoff:string};observedAt:string;
 periodCounts:{leadsCreated:number;viewingsBooked:number;applicationsSubmitted:number;leasesVerified:number};
 cohorts:PortfolioCohort[];followUp:{openLeadCount:number;overdueLeadCount:number;averageFirstLoggedHours:number|null;loggedLeadCount:number;unassignedOpenTasks:number};
 provenance:{manualAttestation:number;demoEvent:number;providerVerified:number};table:PortfolioTable;definitions:ReportingDefinition[];
 access:{canExport:boolean;canManageRegions:boolean};notice:string;limitations:string[];
}
export interface ReportingOptions{properties:Paginated<{id:string;name:string}>;groups:Paginated<{id:string;name:string}>;regions:Paginated<{name:string}>;agents:Paginated<{membershipId:string;name:string}>;teams:Paginated<{id:string;name:string}>;canManageRegions:boolean}
