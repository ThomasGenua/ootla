import type {PoolClient} from 'pg';
import type {ServerConfig} from '../config/env.js';
import type {OrganizationAiPolicy} from '../../shared/organization-admin-contracts.js';
import {organizationAiTools} from '../../shared/organization-admin-contracts.js';
import {aiIntents} from '../../shared/ai-contracts.js';
import {ApiError} from '../http/errors.js';
import {isIsolatedDemo} from './demo-environment.js';
export async function organizationAiPolicy(c:PoolClient,config:ServerConfig,org:string):Promise<OrganizationAiPolicy>{
 const r=(await c.query('SELECT to_jsonb(p) AS policy FROM organization_assistant_policies p WHERE organization_id=$1 FOR SHARE',[org])).rows[0]?.policy??{},a=config.ai;
 const lower=(v:unknown,max:number)=>typeof v==='number'&&Number.isFinite(v)?Math.min(v,max):max;
 const tools=(r.permitted_tools??organizationAiTools) as OrganizationAiPolicy['permittedTools'];
 return{enabled:r.enabled!==false,publicEnabled:r.public_enabled!==false,operatingRules:r.operating_rules??'',permittedTools:r.allow_task_creation===false?tools.filter(t=>t!=='create_task'):tools,permittedIntents:r.permitted_intents??[...aiIntents],mutationConfirmation:'always',maxRequestsPerMinute:lower(r.max_requests_per_minute,a.maxRequestsPerMinute),maxTokensPerRequest:lower(r.max_tokens_per_request,a.maxTokensPerRequest),dailyTokenBudget:lower(r.daily_token_budget,a.dailyTokenBudget),dailyCostBudgetMicros:lower(r.daily_cost_budget_micros===null?null:Number(r.daily_cost_budget_micros),a.dailyCostBudgetMicros),version:r.version??1,updatedAt:r.updated_at??null,mode:await isIsolatedDemo(config,c)?'simulated':a.provider==='openai'&&a.apiKey&&a.model?'configured_unverified':'not_configured',notice:'Organization policy can restrict existing tools and budgets. It cannot grant record access, bypass staff confirmation, activate a provider, decide applications or authorize payments. Provider credentials remain server-side.',serverCeilings:{maxRequestsPerMinute:a.maxRequestsPerMinute,maxTokensPerRequest:a.maxTokensPerRequest,dailyTokenBudget:a.dailyTokenBudget,dailyCostBudgetMicros:a.dailyCostBudgetMicros}};
}
export async function assertAiCapability(c:PoolClient,config:ServerConfig,org:string,tool:OrganizationAiPolicy['permittedTools'][number]='native_read',intent?:typeof aiIntents[number],publicReply=false):Promise<OrganizationAiPolicy>{const p=await organizationAiPolicy(c,config,org);if(!p.enabled||publicReply&&!p.publicEnabled||!p.permittedTools.includes(tool)||intent&&!p.permittedIntents.includes(intent))throw new ApiError(403,'AI_ORGANIZATION_POLICY_DENIED','The current organization assistant policy does not permit this operation. Ask authorized staff to review its settings.');return p;}
export interface OrganizationDeliveryPolicy{timeZone:string;quietHours:{enabled:boolean;startHour:number;endHour:number};inAppEnabled:boolean}
export async function organizationDeliveryPolicy(c:Pick<PoolClient,'query'>,org:string):Promise<OrganizationDeliveryPolicy>{
 const ready=(await c.query("SELECT to_regclass('public.organization_admin_settings') IS NOT NULL AS ready")).rows[0]?.ready;
 const r=ready?(await c.query('SELECT time_zone,quiet_enabled,quiet_start,quiet_end,in_app_enabled FROM organization_admin_settings WHERE organization_id=$1 FOR SHARE',[org])).rows[0]:null;
 return{timeZone:r?.time_zone??'Africa/Lagos',quietHours:{enabled:r?.quiet_enabled??false,startHour:r?.quiet_start??21,endHour:r?.quiet_end??8},inAppEnabled:r?.in_app_enabled!==false};
}
export function organizationIsQuiet(p:OrganizationDeliveryPolicy,now=new Date()):boolean{const q=p.quietHours;if(!q.enabled||q.startHour===q.endHour)return false;const h=Number(new Intl.DateTimeFormat('en',{timeZone:p.timeZone,hour:'2-digit',hourCycle:'h23'}).format(now));return q.startHour<q.endHour?h>=q.startHour&&h<q.endHour:h>=q.startHour||h<q.endHour;}
