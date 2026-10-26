import {createHash} from 'node:crypto';
import type {PoolClient,QueryResultRow} from 'pg';
import type {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import {portfolioQuerySchema,type PortfolioQuery,type PortfolioReport,type PortfolioCohort,type PortfolioTable,type ReportingOptions,type reportingOptionsSchema,type reportingRegionSchema} from '../../shared/reporting-contracts.js';
import type {Database} from '../db/pool.js';
import type {ServerConfig} from '../config/env.js';
import {ApiError} from '../http/errors.js';
import {staffOrganizationAccess} from './application-access.js';
import {reportingParams,reportingSummarySql} from './reporting-queries.js';
import {reportingRowsSql,reportTables} from './reporting-tables.js';
import {definitions,reportingLimitations} from './reporting-definitions.js';
type Row=QueryResultRow;
const n=(v:unknown):number=>Number(v??0);
const like=(v:string):string=>v?'%'+v.replace(/[\\%_]/g,c=>'\\'+c)+'%':'';
const page=<T>(items:T[],total:number,p:{page:number;pageSize:number})=>({items,total,page:p.page,pageSize:p.pageSize,totalPages:Math.ceil(total/p.pageSize)});
const unavailable=():never=>{throw new ApiError(404,'REPORTING_FILTER_UNAVAILABLE','Choose filters from your current organization and assigned property access.');};
const canExport=(a:AuthUser)=>['organization_admin','property_manager'].includes(a.organization.role);
export function safeReportingCsvCell(value:unknown):string{let text=value===null||value===undefined?'':String(value);if(/^[\s\uFEFF]*[=+@-]/u.test(text)||/^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
export class PortfolioReportingService{
 constructor(private db:Database,private config:ServerConfig){}
 /** Used by the shared Ask context boundary after exact current-session authorization. */
 async validateScope(c:PoolClient,a:AuthUser,q:PortfolioQuery):Promise<void>{
  if(!a.permissions.includes('analytics.read'))throw new ApiError(403,'REPORTING_DENIED','Your current staff role cannot view portfolio reporting.');
  if(a.organization.role!=='organization_admin')await c.query('SELECT property_id FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 ORDER BY property_id FOR SHARE',[a.organization.id,a.membershipId]);
  const allowed="p.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=p.organization_id AND pa.membership_id=$3 AND pa.property_id=p.id))";
  const params=[a.organization.id,a.organization.role,a.membershipId];
  if(q.propertyId&&!(await c.query('SELECT p.id FROM properties p WHERE '+allowed+' AND p.id=$4 FOR SHARE OF p',[...params,q.propertyId])).rowCount)unavailable();
  if(q.groupId&&!(await c.query('SELECT g.id FROM property_groups g WHERE g.organization_id=$1 AND g.id=$4 AND EXISTS(SELECT 1 FROM properties p WHERE '+allowed+' AND p.group_id=g.id) FOR SHARE OF g',[...params,q.groupId])).rowCount)unavailable();
  if(q.region&&!(await c.query('SELECT r.property_id FROM property_reporting_regions r JOIN properties p ON p.id=r.property_id AND p.organization_id=r.organization_id WHERE '+allowed+' AND r.region=$4 LIMIT 1',[...params,q.region])).rowCount)unavailable();
  if(q.agentMembershipId&&!(await c.query("SELECT m.id FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' WHERE m.organization_id=$1 AND m.id=$4 AND m.active AND m.account_kind='staff' AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission='leasing.manage') AND ($2='organization_admin' OR m.role='organization_admin' AND EXISTS(SELECT 1 FROM properties p WHERE "+allowed+") OR EXISTS(SELECT 1 FROM property_access_assignments mp JOIN properties p ON p.id=mp.property_id AND p.organization_id=mp.organization_id WHERE mp.organization_id=m.organization_id AND mp.membership_id=m.id AND "+allowed+")) FOR SHARE OF m,u",[...params,q.agentMembershipId])).rowCount)unavailable();
  if(q.teamId&&!(await c.query("SELECT t.id FROM task_teams t WHERE t.organization_id=$1 AND t.id=$4 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM tasks st JOIN properties p ON p.id=st.property_id AND p.organization_id=st.organization_id WHERE st.organization_id=t.organization_id AND st.team_id=t.id AND "+allowed+") OR EXISTS(SELECT 1 FROM task_team_members tm JOIN property_access_assignments mp ON mp.membership_id=tm.membership_id AND mp.organization_id=tm.organization_id JOIN properties p ON p.id=mp.property_id AND p.organization_id=mp.organization_id WHERE tm.organization_id=t.organization_id AND tm.team_id=t.id AND "+allowed+")) FOR SHARE OF t",[...params,q.teamId])).rowCount)unavailable();
 }
 private async authorize(c:PoolClient,u:AuthUser,digest:string,q?:PortfolioQuery):Promise<AuthUser>{const a=await staffOrganizationAccess(c,this.config,u,digest,{permission:'analytics.read'});if(q)await this.validateScope(c,a,q);return a;}
 private query(q:PortfolioQuery):PortfolioQuery{const parsed=portfolioQuerySchema.safeParse(q);if(!parsed.success)throw new ApiError(400,'REPORTING_INVALID_QUERY','Choose valid report filters and an ordered UTC date range of at most three years.');return parsed.data;}
 private async table(c:PoolClient,a:AuthUser,q:PortfolioQuery,now:string,exportAll=false):Promise<PortfolioTable>{
  const prefix=reportingRowsSql(q.view),params=[...reportingParams(a,q,now),like(q.q),q.attention];
  const total=n((await c.query(prefix+'SELECT count(*) AS total FROM filtered_rows',params)).rows[0]?.total);
  if(exportAll&&total>5000)throw new ApiError(413,'REPORTING_EXPORT_LIMIT','This export exceeds 5,000 rows. Narrow the date range or filters before exporting.');
  const order={age_desc:"COALESCE((values->>'ageDays')::numeric,(values->>'averageDays')::numeric) DESC NULLS LAST,label COLLATE \"C\",id",name_asc:'label COLLATE "C",id',leads_desc:'lead_sort DESC,label COLLATE "C",id',open_tasks_desc:'task_sort DESC,label COLLATE "C",id'}[q.sort];
  const rows=(await c.query(prefix+'SELECT id,label,url,values FROM filtered_rows ORDER BY '+order+' LIMIT $15 OFFSET $16',[...params,exportAll?5000:q.pageSize,exportAll?0:(q.page-1)*q.pageSize])).rows;
  const items=rows.map(r=>({id:String(r.id),label:String(r.label),url:r.url??null,values:r.values as Record<string,string|number|null>}));
  return{...page(items,total,exportAll?{page:1,pageSize:5000}:q),view:q.view,title:reportTables[q.view].title,columns:reportTables[q.view].columns};
 }
 async report(u:AuthUser,digest:string,input:PortfolioQuery):Promise<PortfolioReport>{const q=this.query(input);return this.db.transaction(async c=>{
  await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  const a=await this.authorize(c,u,digest,q),now=(await c.query('SELECT clock_timestamp() AS at')).rows[0].at.toISOString() as string;
  const params=reportingParams(a,q,now),r=(await c.query(reportingSummarySql,params)).rows[0],table=await this.table(c,a,q,now);
  const cohort=(key:PortfolioCohort['key'],label:string,numerator:unknown,denominator:unknown):PortfolioCohort=>({key,label,numerator:n(numerator),denominator:n(denominator),ratePercent:n(denominator)>0?Math.round(n(numerator)*10000/n(denominator))/100:null,definitionId:key});
  return{query:q,range:{from:q.from,to:q.to,fromInstant:String(params[8]),untilInstant:String(params[9]),timeZone:'UTC',cohortCutoff:String(params[11])},observedAt:now,
   periodCounts:{leadsCreated:n(r.leads_created),viewingsBooked:n(r.viewings_booked),applicationsSubmitted:n(r.applications_submitted),leasesVerified:n(r.leases_verified)},
   cohorts:[cohort('lead_to_tour','Leasing lead to saved viewing',r.lead_numerator,r.lead_denominator),cohort('tour_to_application','Completed viewing to application started',r.tour_numerator,r.tour_denominator),cohort('application_to_lease','Submitted application to verified lease',r.app_numerator,r.app_denominator)],
   followUp:{openLeadCount:n(r.open_leads),overdueLeadCount:n(r.overdue_leads),averageFirstLoggedHours:r.average_first_hours===null?null:n(r.average_first_hours),loggedLeadCount:n(r.logged_leads),unassignedOpenTasks:n(r.unassigned_tasks)},
   provenance:{manualAttestation:n(r.manual_attestation),demoEvent:n(r.demo_event),providerVerified:n(r.provider_verified)},table,definitions,access:{canExport:canExport(a),canManageRegions:a.organization.role==='organization_admin'},
   notice:'Database-backed CRM records. Dates are UTC; conversion outcomes stop at the selected end date or current observation time, whichever comes first. The table search and attention filter affect table rows; header counts and cohorts use the selected date, property, group, region, agent and team scope.',
   limitations:reportingLimitations};
 });}
 async explain(u:AuthUser,digest:string,q:PortfolioQuery):Promise<PortfolioReport>{return this.report(u,digest,q);}
 async export(u:AuthUser,digest:string,input:PortfolioQuery):Promise<{csv:string;filename:string;rowCount:number}>{const q=this.query(input);return this.db.transaction(async c=>{
  await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');const a=await this.authorize(c,u,digest,q);
  if(!canExport(a))throw new ApiError(403,'REPORTING_EXPORT_DENIED','A current organization administrator or property manager must export reporting data.');
  const now=(await c.query('SELECT clock_timestamp() AS at')).rows[0].at.toISOString() as string,t=await this.table(c,a,q,now,true);
  const lines=[['Record',...t.columns.map(v=>v.label)],...t.items.map(r=>[r.label,...t.columns.map(v=>r.values[v.key])])];
  const csv='\uFEFF'+lines.map(cells=>cells.map(safeReportingCsvCell).join(',')).join('\r\n')+'\r\n';
  if(Buffer.byteLength(csv,'utf8')>5*1024*1024)throw new ApiError(413,'REPORTING_EXPORT_SIZE','Narrow these filters to keep the report below the 5 MiB export limit.');
  return{csv,filename:'ootla-'+q.view+'-'+q.from+'-to-'+q.to+'.csv',rowCount:t.items.length};
 });}
 async options(u:AuthUser,digest:string,q:z.infer<typeof reportingOptionsSchema>):Promise<ReportingOptions>{return this.db.transaction(async c=>{
  const a=await this.authorize(c,u,digest),base=[a.organization.id,a.organization.role,a.membershipId],allowed="p.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=p.organization_id AND pa.membership_id=$3 AND pa.property_id=p.id))";
  const paged=async(sql:string,search:string)=>{const values=[...base,like(search)],total=n((await c.query('SELECT count(*) AS total FROM ('+sql+') opt WHERE ($4::text=\'\' OR name ILIKE $4)',values)).rows[0].total);const rows=(await c.query('SELECT * FROM ('+sql+') opt WHERE ($4::text=\'\' OR name ILIKE $4) ORDER BY name COLLATE "C",id LIMIT $5 OFFSET $6',[...values,q.pageSize,(q.page-1)*q.pageSize])).rows;return page(rows,total,q);};
  const properties=await paged('SELECT p.id,p.name FROM properties p WHERE '+allowed,q.q);
  const groups=await paged('SELECT g.id,g.name FROM property_groups g WHERE g.organization_id=$1 AND EXISTS(SELECT 1 FROM properties p WHERE '+allowed+' AND p.group_id=g.id)',q.groupSearch);
  const regions=await paged('SELECT DISTINCT r.region AS id,r.region AS name FROM property_reporting_regions r JOIN properties p ON p.id=r.property_id AND p.organization_id=r.organization_id WHERE '+allowed,q.regionSearch);
  const agents=await paged("SELECT m.id,u.display_name AS name FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' WHERE m.organization_id=$1 AND m.active AND m.account_kind='staff' AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission='leasing.manage') AND ($2='organization_admin' OR m.role='organization_admin' AND EXISTS(SELECT 1 FROM properties p WHERE "+allowed+") OR EXISTS(SELECT 1 FROM property_access_assignments mp JOIN properties p ON p.id=mp.property_id AND p.organization_id=mp.organization_id WHERE mp.organization_id=m.organization_id AND mp.membership_id=m.id AND "+allowed+"))",q.agentSearch);
  const teams=await paged("SELECT t.id,t.name FROM task_teams t WHERE t.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM tasks st JOIN properties p ON p.id=st.property_id AND p.organization_id=st.organization_id WHERE st.organization_id=t.organization_id AND st.team_id=t.id AND "+allowed+") OR EXISTS(SELECT 1 FROM task_team_members tm JOIN property_access_assignments mp ON mp.membership_id=tm.membership_id AND mp.organization_id=tm.organization_id JOIN properties p ON p.id=mp.property_id AND p.organization_id=mp.organization_id WHERE tm.organization_id=t.organization_id AND tm.team_id=t.id AND "+allowed+"))",q.teamSearch);
  return{properties:{...properties,items:properties.items.map(r=>({id:r.id,name:r.name}))},groups:{...groups,items:groups.items.map(r=>({id:r.id,name:r.name}))},regions:{...regions,items:regions.items.map(r=>({name:r.name}))},agents:{...agents,items:agents.items.map(r=>({membershipId:r.id,name:r.name}))},teams:{...teams,items:teams.items.map(r=>({id:r.id,name:r.name}))},canManageRegions:a.organization.role==='organization_admin'};
 });}
 async region(u:AuthUser,digest:string,i:z.infer<typeof reportingRegionSchema>):Promise<{propertyId:string;region:string|null}>{return this.db.transaction(async c=>{
  const a=await this.authorize(c,u,digest);if(a.organization.role!=='organization_admin')throw new ApiError(403,'REPORTING_REGION_DENIED','Only an organization administrator can configure Ootla reporting regions.');
  if(!(await c.query('SELECT id FROM properties WHERE id=$1 AND organization_id=$2 FOR SHARE',[i.propertyId,a.organization.id])).rowCount)unavailable();
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ootla.reporting:'+a.organization.id]);
  const hash=createHash('sha256').update(JSON.stringify({propertyId:i.propertyId,region:i.region})).digest('hex');
  const prior=(await c.query('SELECT request_hash FROM reporting_action_receipts WHERE organization_id=$1 AND actor_user_id=$2 AND request_key=$3',[a.organization.id,a.id,i.requestKey])).rows[0];
  if(prior){if(prior.request_hash!==hash)throw new ApiError(409,'REPORTING_REQUEST_CONFLICT','Use a new request identifier for changed reporting settings.');return{propertyId:i.propertyId,region:i.region};}
  if(i.region===null)await c.query('DELETE FROM property_reporting_regions WHERE organization_id=$1 AND property_id=$2',[a.organization.id,i.propertyId]);
  else await c.query('INSERT INTO property_reporting_regions(organization_id,property_id,region,updated_by_user_id) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id,property_id) DO UPDATE SET region=EXCLUDED.region,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=clock_timestamp()',[a.organization.id,i.propertyId,i.region,a.id]);
  await c.query("INSERT INTO audit_events(organization_id,actor_user_id,action,metadata) VALUES($1,$2,'reporting.region_configured',$3)",[a.organization.id,a.id,JSON.stringify({propertyId:i.propertyId,region:i.region})]);
  await c.query('INSERT INTO reporting_action_receipts(organization_id,actor_user_id,request_key,request_hash) VALUES($1,$2,$3,$4)',[a.organization.id,a.id,i.requestKey,hash]);return{propertyId:i.propertyId,region:i.region};
 });}
}
