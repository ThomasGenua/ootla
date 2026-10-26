import {maintenanceTaskScope} from './maintenance-task-scope.js';
import type {PortfolioView,PortfolioColumn} from '../../shared/reporting-contracts.js';
import {reportingCte} from './reporting-queries.js';
const n=(key:string,label:string,format:PortfolioColumn['format']='number'):PortfolioColumn=>({key,label,format});
export const reportTables:Record<PortfolioView,{title:string;columns:PortfolioColumn[];rows:string}>={
 properties:{title:'Property performance',columns:[n('group','Group','text'),n('region','Reporting region','text'),n('leads','Leads created'),n('bookings','Viewings booked'),n('applications','Applications submitted'),n('verifiedLeases','Leases verified'),n('openLeads','Open cohort leads'),n('openTasks','Current open tasks')],rows:`
 SELECT p.id::text AS id,p.name AS label,'/admin/properties?property='||p.id AS url,jsonb_build_object(
 'group',g.name,'region',p.region,
 'leads',COALESCE(l.leads,0),'openLeads',COALESCE(l.open_leads,0),'bookings',COALESCE(v.bookings,0),'applications',COALESCE(a.applications,0),'verifiedLeases',COALESCE(m.leases,0),'openTasks',COALESCE(t.tasks,0)) AS values,
 COALESCE(l.leads,0) AS lead_sort,COALESCE(t.tasks,0) AS task_sort
 FROM allowed_properties p LEFT JOIN property_groups g ON g.id=p.group_id AND g.organization_id=p.organization_id
 LEFT JOIN(SELECT property_id,count(*) AS leads,count(*) FILTER(WHERE pipeline_stage NOT IN('lost_closed','leased','won')) AS open_leads FROM cohort_leads GROUP BY property_id)l ON l.property_id=p.id
 LEFT JOIN(SELECT property_id,count(*) AS bookings FROM selected_viewings WHERE created_at>=$9 AND created_at<$10 AND created_at<=$11 AND status<>'cancelled' GROUP BY property_id)v ON v.property_id=p.id
 LEFT JOIN(SELECT property_id,count(*) AS applications FROM selected_applications WHERE portal_submitted_at>=$9 AND portal_submitted_at<$10 AND portal_submitted_at<=$11 GROUP BY property_id)a ON a.property_id=p.id
 LEFT JOIN(SELECT property_id,count(DISTINCT lease_id) AS leases FROM valid_milestones WHERE verified_at>=$9 AND verified_at<$10 AND verified_at<=$11 GROUP BY property_id)m ON m.property_id=p.id
 LEFT JOIN(SELECT property_id,count(*) AS tasks FROM selected_tasks GROUP BY property_id)t ON t.property_id=p.id`},
 sources:{title:'Recorded lead source',columns:[n('leads','Leads created'),n('leasing','Leasing inquiries'),n('sales','Sales opportunities'),n('openLeads','Currently open'),n('booked','Leasing leads with a later booking'),n('conversion','Lead-to-booking cohort %','percent')],rows:`
 SELECT source AS id,CASE WHEN btrim(source)='' THEN 'Source not recorded' ELSE source END AS label,NULL::text AS url,
 jsonb_build_object('leads',count(*),'leasing',count(*) FILTER(WHERE intent='leasing'),'sales',count(*) FILTER(WHERE intent='sales'),'openLeads',count(*) FILTER(WHERE pipeline_stage NOT IN('lost_closed','leased','won')),
 'booked',count(*) FILTER(WHERE intent='leasing' AND EXISTS(SELECT 1 FROM selected_viewings v WHERE v.lead_id=l.id AND v.status<>'cancelled' AND v.created_at>=l.created_at AND v.created_at<$12)),
 'conversion',round(100.0*count(*) FILTER(WHERE intent='leasing' AND EXISTS(SELECT 1 FROM selected_viewings v WHERE v.lead_id=l.id AND v.status<>'cancelled' AND v.created_at>=l.created_at AND v.created_at<$12))/NULLIF(count(*) FILTER(WHERE intent='leasing'),0),2)) AS values,
 count(*) AS lead_sort,0::bigint AS task_sort FROM cohort_leads l GROUP BY source`},
 pipeline:{title:'Current stage and cohort age',columns:[n('intent','Opportunity type','text'),n('stage','Current stage','text'),n('leads','Open cohort leads'),n('averageDays','Average age since creation','days'),n('oldestDays','Oldest lead age','days')],rows:`
 SELECT intent||':'||pipeline_stage AS id,intent||' / '||replace(pipeline_stage,'_',' ') AS label,NULL::text AS url,
 jsonb_build_object('intent',intent,'stage',replace(pipeline_stage,'_',' '),'leads',count(*),'averageDays',round(avg(EXTRACT(epoch FROM($11::timestamptz-created_at))/86400),2),'oldestDays',round(max(EXTRACT(epoch FROM($11::timestamptz-created_at))/86400),2)) AS values,
 count(*) AS lead_sort,0::bigint AS task_sort FROM cohort_leads WHERE pipeline_stage NOT IN('lost_closed','leased','won') GROUP BY intent,pipeline_stage`},
 follow_ups:{title:'Lead follow-up timing',columns:[n('property','Property','text'),n('stage','Current stage','text'),n('owner','Assigned agent','text'),n('dueAt','Next action due','date'),n('overdueHours','Hours overdue','hours'),n('firstLoggedHours','First logged follow-up','hours'),n('ageDays','Age since lead creation','days')],rows:`
 SELECT l.id::text AS id,l.display_name AS label,'/admin/leads?lead='||l.id AS url,
 jsonb_build_object('property',p.name,'stage',replace(l.pipeline_stage,'_',' '),'owner',u.display_name,'dueAt',l.next_action_at,
 'overdueHours',CASE WHEN l.next_action_at<$11 THEN round(EXTRACT(epoch FROM($11::timestamptz-l.next_action_at))/3600,2) ELSE 0 END,
 'firstLoggedHours',CASE WHEN f.followed_at IS NULL THEN NULL ELSE round(EXTRACT(epoch FROM(f.followed_at-l.created_at))/3600,2) END,
 'ageDays',round(EXTRACT(epoch FROM($11::timestamptz-l.created_at))/86400,2)) AS values,1::bigint AS lead_sort,
 (SELECT count(*) FROM selected_tasks t WHERE t.lead_id=l.id)::bigint AS task_sort
 FROM cohort_leads l JOIN allowed_properties p ON p.id=l.property_id LEFT JOIN first_follow_up f ON f.id=l.id
 LEFT JOIN organization_memberships m ON m.id=l.owner_membership_id AND m.organization_id=l.organization_id LEFT JOIN users u ON u.id=m.user_id
 WHERE l.pipeline_stage NOT IN('lost_closed','leased','won') AND ($14::text<>'follow_up_due' OR l.next_action_at<$11)`},
 workload:{title:'Staff workload now',columns:[n('openLeads','Open cohort leads'),n('openTasks','Current actionable tasks'),n('overdueTasks','Overdue actionable tasks'),n('completedInPeriod','Tasks completed in period')],rows:`
 SELECT COALESCE(w.owner_id::text,'unassigned') AS id,COALESCE(u.display_name,'Unassigned') AS label,
 CASE WHEN w.owner_id IS NULL THEN '/admin/tasks?view=unassigned' ELSE '/admin/tasks?view=team&ownerMembershipId='||w.owner_id END AS url,
 jsonb_build_object('openLeads',COALESCE(l.leads,0),'openTasks',COALESCE(t.tasks,0),'overdueTasks',COALESCE(t.overdue,0),'completedInPeriod',COALESCE(d.completed,0)) AS values,
 COALESCE(l.leads,0) AS lead_sort,COALESCE(t.tasks,0) AS task_sort
 FROM(SELECT owner_membership_id AS owner_id FROM cohort_leads WHERE pipeline_stage NOT IN('lost_closed','leased','won')
 UNION SELECT owner_membership_id FROM selected_tasks
 UNION SELECT owner_membership_id FROM completed_tasks)w
 LEFT JOIN organization_memberships m ON m.id=w.owner_id AND m.organization_id=$1 LEFT JOIN users u ON u.id=m.user_id
 LEFT JOIN(SELECT owner_membership_id,count(*) AS leads FROM cohort_leads WHERE pipeline_stage NOT IN('lost_closed','leased','won') GROUP BY owner_membership_id)l ON l.owner_membership_id IS NOT DISTINCT FROM w.owner_id
 LEFT JOIN(SELECT owner_membership_id,count(*) AS tasks,count(*) FILTER(WHERE due_at<$11) AS overdue FROM selected_tasks GROUP BY owner_membership_id)t ON t.owner_membership_id IS NOT DISTINCT FROM w.owner_id
 LEFT JOIN(SELECT owner_membership_id,count(*) AS completed FROM completed_tasks GROUP BY owner_membership_id)d ON d.owner_membership_id IS NOT DISTINCT FROM w.owner_id`},
 applications:{title:'Application progress',columns:[n('property','Property','text'),n('status','Current status','text'),n('submittedAt','Actual portal submission','date'),n('missingDocuments','Required documents outstanding'),n('ageDays','Days since application creation','days')],rows:`
 SELECT a.id::text AS id,'Application '||left(a.id::text,8) AS label,'/admin/applications?application='||a.id AS url,
 jsonb_build_object('property',p.name,'status',replace(a.status,'_',' '),'submittedAt',a.portal_submitted_at,'missingDocuments',COALESCE(am.missing_count,0),
 'ageDays',round(EXTRACT(epoch FROM($11::timestamptz-a.created_at))/86400,2)) AS values,
 0::bigint AS lead_sort,COALESCE(am.missing_count,0)::bigint AS task_sort
 FROM selected_applications a JOIN allowed_properties p ON p.id=a.property_id LEFT JOIN application_missing am ON am.id=a.id
 WHERE (a.created_at>=$9 AND a.created_at<$10 OR a.portal_submitted_at>=$9 AND a.portal_submitted_at<$10) AND a.created_at<=$11
 AND ($14::text<>'missing_documents' OR a.portal_enabled AND COALESCE(am.missing_count,0)>0 AND COALESCE((SELECT d.decision FROM application_decisions d WHERE d.organization_id=a.organization_id AND d.application_id=a.id ORDER BY d.created_at DESC,d.id DESC LIMIT 1),'request_information') NOT IN('approved','declined','withdrawn')) AND ($14::text<>'staff_review' OR a.status='staff_review' AND COALESCE((SELECT d.decision FROM application_decisions d WHERE d.organization_id=a.organization_id AND d.application_id=a.id ORDER BY d.created_at DESC,d.id DESC LIMIT 1),'request_information') NOT IN('approved','declined','withdrawn'))`}
};
const completedTasks=`,completed_tasks AS MATERIALIZED(
 SELECT t.id,t.organization_id,t.owner_membership_id FROM tasks t JOIN allowed_properties p ON p.id=t.property_id
 WHERE t.organization_id=$1 ${maintenanceTaskScope('t')} AND t.status='completed' AND t.completed_at>=$9 AND t.completed_at<$10 AND t.completed_at<=$11
 AND (t.lead_id IS NULL OR EXISTS(SELECT 1 FROM authorized_leads l WHERE l.id=t.lead_id AND l.property_id=t.property_id AND l.contact_id=t.contact_id))
 AND (t.application_id IS NULL OR EXISTS(SELECT 1 FROM selected_applications a WHERE a.id=t.application_id AND a.property_id=t.property_id AND a.contact_id=t.contact_id AND a.lead_id IS NOT DISTINCT FROM t.lead_id))
 AND ($7::uuid IS NULL OR t.owner_membership_id=$7)
 AND ($8::uuid IS NULL OR t.team_id=$8 OR EXISTS(SELECT 1 FROM task_team_members tm WHERE tm.organization_id=t.organization_id AND tm.team_id=$8 AND tm.membership_id=t.owner_membership_id))
)`;
export function reportingRowsSql(view:PortfolioView):string{return reportingCte+completedTasks+',report_rows AS('+reportTables[view].rows+'),filtered_rows AS(SELECT * FROM report_rows WHERE ($13::text=\'\' OR label ILIKE $13 OR EXISTS(SELECT 1 FROM jsonb_each_text(values) v WHERE v.value ILIKE $13)) AND ($14::text IS NOT NULL)) ';}
