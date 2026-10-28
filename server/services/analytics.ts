import type { AuthUser } from '../../shared/contracts.js';
import type { AnalyticsSnapshot } from '../../shared/pilot-contracts.js';
import type { Database } from '../db/pool.js';
import type { ServerConfig } from '../config/env.js';
import { staffOrganizationAccess } from './application-access.js';
const scope = `l.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments p WHERE p.organization_id=l.organization_id AND p.property_id=l.property_id AND p.membership_id=$3)) AND NOT EXISTS(SELECT 1 FROM lead_property_interests i WHERE i.organization_id=l.organization_id AND i.lead_id=l.id AND $2<>'organization_admin' AND NOT EXISTS(SELECT 1 FROM property_access_assignments p WHERE p.organization_id=i.organization_id AND p.property_id=i.property_id AND p.membership_id=$3))`;
export async function leasingAnalytics(database:Database,config:ServerConfig,user:AuthUser,digest:string,days:number):Promise<AnalyticsSnapshot>{return database.transaction(async c=>{
 const actor=await staffOrganizationAccess(c,config,user,digest,{permission:'analytics.read'}),args=[actor.organization.id,actor.organization.role,actor.membershipId,days];
 // A lead-created cohort avoids dividing unrelated counts from different populations.
 const cte=`WITH cohort AS (SELECT l.* FROM leads l WHERE ${scope} AND l.intent='leasing' AND l.created_at>=now()-($4::int*interval '1 day')), facts AS (SELECT l.id,l.pipeline_stage,l.source,l.created_at,
 EXISTS(SELECT 1 FROM viewings v WHERE v.organization_id=$1 AND v.lead_id=l.id AND v.status IN ('scheduled','completed','no_show')) AS toured,
 EXISTS(SELECT 1 FROM applications a WHERE a.organization_id=$1 AND a.lead_id=l.id) AS started,
 EXISTS(SELECT 1 FROM applications a WHERE a.organization_id=$1 AND a.lead_id=l.id AND a.portal_submitted_at IS NOT NULL) AS submitted,
 (SELECT min(v.verified_at) FROM lease_verified_milestones v WHERE v.organization_id=$1 AND v.lead_id=l.id) AS leased_at
 FROM cohort l)`;
 const row=(await c.query(cte+` SELECT count(*)::int AS leads,count(*) FILTER(WHERE toured)::int AS toured,count(*) FILTER(WHERE started)::int AS started,count(*) FILTER(WHERE submitted)::int AS submitted,count(*) FILTER(WHERE leased_at IS NOT NULL)::int AS leased,percentile_cont(0.5) WITHIN GROUP(ORDER BY extract(epoch FROM (leased_at-created_at))/86400) FILTER(WHERE leased_at>=created_at) AS median FROM facts`,args)).rows[0];
 const stages=(await c.query(cte+' SELECT pipeline_stage AS stage,count(*)::int AS count FROM facts GROUP BY pipeline_stage ORDER BY count DESC,stage',args)).rows as AnalyticsSnapshot['stages'];
 const sources=(await c.query(cte+' SELECT source,count(*)::int AS leads,count(*) FILTER(WHERE leased_at IS NOT NULL)::int AS leased FROM facts GROUP BY source ORDER BY leads DESC,source',args)).rows as AnalyticsSnapshot['sources'];
 const overdue=Number((await c.query(`SELECT count(*) AS n FROM tasks t LEFT JOIN leads l ON l.id=t.lead_id AND l.organization_id=t.organization_id WHERE t.organization_id=$1 AND t.status='open' AND t.due_at<now() AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments p WHERE p.organization_id=t.organization_id AND p.property_id=t.property_id AND p.membership_id=$3)) AND (t.lead_id IS NULL OR (${scope}))`,args.slice(0,3))).rows[0].n);
 return{days,asOf:new Date().toISOString(),cohortLeads:row.leads,toured:row.toured,applicationsStarted:row.started,applicationsSubmitted:row.submitted,leased:row.leased,inquiryToTourPercent:row.leads?Math.round(1000*row.toured/row.leads)/10:null,applicationCompletionPercent:row.started?Math.round(1000*row.submitted/row.started)/10:null,medianDaysToLease:row.median==null?null:Math.round(Number(row.median)*10)/10,overdueTasks:overdue,stages,sources};
});}
