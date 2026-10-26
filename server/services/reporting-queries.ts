import {maintenanceTaskScope,maintenanceTaskActive} from './maintenance-task-scope.js';
import type {AuthUser} from '../../shared/contracts.js';
import type {PortfolioQuery} from '../../shared/reporting-contracts.js';
export const leadAccessSql=(alias:string)=>`NOT EXISTS(SELECT 1 FROM lead_property_interests li WHERE li.organization_id=${alias}.organization_id AND li.lead_id=${alias}.id AND $2<>'organization_admin' AND NOT EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=li.organization_id AND pa.property_id=li.property_id AND pa.membership_id=$3))`;
export function reportingParams(a:AuthUser,q:PortfolioQuery,now:string):unknown[]{const from=q.from+'T00:00:00.000Z',until=new Date(Date.parse(q.to+'T00:00:00Z')+86400000).toISOString();return[a.organization.id,a.organization.role,a.membershipId,q.propertyId??null,q.groupId??null,q.region??null,q.agentMembershipId??null,q.teamId??null,from,until,now,new Date(Math.min(Date.parse(until),Date.parse(now))).toISOString()];}
/** Every aggregate shares these exact authorized, canonical relationships. No private record bodies enter reporting. */
export const reportingCte=`WITH allowed_properties AS MATERIALIZED(
 SELECT p.id,p.organization_id,p.name,p.group_id,r.region FROM properties p LEFT JOIN property_reporting_regions r ON r.organization_id=p.organization_id AND r.property_id=p.id
 WHERE p.organization_id=$1 AND $12::timestamptz IS NOT NULL AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=p.organization_id AND pa.property_id=p.id AND pa.membership_id=$3))
 AND ($4::uuid IS NULL OR p.id=$4) AND ($5::uuid IS NULL OR p.group_id=$5) AND ($6::text IS NULL OR r.region=$6)
), all_authorized_leads AS MATERIALIZED(
 SELECT l.id,l.organization_id,l.property_id,l.contact_id,l.display_name,l.intent,l.pipeline_stage,l.owner_membership_id,l.source,l.next_action_at,l.created_at FROM leads l WHERE l.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=l.organization_id AND pa.property_id=l.property_id AND pa.membership_id=$3)) AND ${leadAccessSql('l')}
), authorized_leads AS MATERIALIZED(
 SELECT l.* FROM all_authorized_leads l JOIN allowed_properties p ON p.id=l.property_id
), selected_leads AS MATERIALIZED(
 SELECT l.* FROM authorized_leads l WHERE ($7::uuid IS NULL OR l.owner_membership_id=$7)
 AND ($8::uuid IS NULL OR EXISTS(SELECT 1 FROM task_team_members tm WHERE tm.organization_id=l.organization_id AND tm.team_id=$8 AND tm.membership_id=l.owner_membership_id))
), cohort_leads AS MATERIALIZED(
 SELECT l.* FROM selected_leads l WHERE l.created_at>=$9::timestamptz AND l.created_at<$10::timestamptz AND l.created_at<=$11::timestamptz
), selected_viewings AS MATERIALIZED(
 SELECT v.id,v.organization_id,v.property_id,v.lead_id,v.created_at,v.starts_at,v.ends_at,v.status,l.intent,l.contact_id FROM viewings v JOIN all_authorized_leads l ON l.id=v.lead_id AND l.organization_id=v.organization_id JOIN allowed_properties p ON p.id=v.property_id
 WHERE v.organization_id=$1 AND ($7::uuid IS NULL OR l.owner_membership_id=$7) AND ($8::uuid IS NULL OR EXISTS(SELECT 1 FROM task_team_members tm WHERE tm.organization_id=l.organization_id AND tm.team_id=$8 AND tm.membership_id=l.owner_membership_id))
), selected_applications AS MATERIALIZED(
 SELECT a.id,a.organization_id,a.property_id,a.contact_id,a.lead_id,a.status,a.portal_enabled,a.co_applicants_enabled,a.created_at,a.portal_submitted_at FROM applications a JOIN allowed_properties p ON p.id=a.property_id
 WHERE a.organization_id=$1 AND (a.lead_id IS NULL OR EXISTS(SELECT 1 FROM selected_leads l WHERE l.id=a.lead_id AND l.property_id=a.property_id AND l.contact_id=a.contact_id))
 AND (a.lead_id IS NOT NULL OR $7::uuid IS NULL AND $8::uuid IS NULL)
), application_missing AS MATERIALIZED(
 SELECT a.id,count(*)::int AS missing_count FROM selected_applications a JOIN application_participants ap ON ap.application_id=a.id AND ap.organization_id=a.organization_id AND ap.property_id=a.property_id AND ap.active AND (ap.role='primary' AND ap.contact_id=a.contact_id OR ap.role='co_applicant' AND a.co_applicants_enabled)
 JOIN application_checklist_items ci ON ci.organization_id=a.organization_id AND ci.application_id=a.id AND ci.active AND ci.required
 WHERE a.portal_enabled AND COALESCE((SELECT d.decision FROM application_decisions d WHERE d.organization_id=a.organization_id AND d.application_id=a.id ORDER BY d.created_at DESC,d.id DESC LIMIT 1),'request_information') NOT IN('approved','declined','withdrawn') AND NOT EXISTS(SELECT 1 FROM application_documents d WHERE d.organization_id=a.organization_id AND d.application_id=a.id AND d.participant_id=ap.id AND d.checklist_item_id=ci.id)
 GROUP BY a.id
), valid_milestones AS MATERIALIZED(
 SELECT m.id,m.lease_id,m.verified_at,m.evidence_kind,ls.application_id,ls.property_id,ls.lead_id,ls.contact_id FROM lease_verified_milestones m
 JOIN leases ls ON ls.id=m.lease_id AND ls.organization_id=m.organization_id AND ls.property_id=m.property_id AND ls.contact_id=m.contact_id AND ls.lead_id=m.lead_id AND ls.updated_at=m.lease_updated_at AND ls.status='active'
 JOIN selected_leads l ON l.id=m.lead_id AND l.property_id=m.property_id AND l.contact_id=m.contact_id
 WHERE m.organization_id=$1
), selected_tasks AS MATERIALIZED(
 SELECT t.id,t.organization_id,t.property_id,t.contact_id,t.lead_id,t.owner_membership_id,t.team_id,t.due_at,t.status,t.application_id,t.tour_id,t.purpose FROM tasks t JOIN allowed_properties p ON p.id=t.property_id LEFT JOIN authorized_leads l ON l.id=t.lead_id AND l.property_id=t.property_id AND l.contact_id=t.contact_id
 LEFT JOIN viewings v ON v.id=t.tour_id AND v.organization_id=t.organization_id AND v.lead_id=t.lead_id AND v.property_id=t.property_id
 WHERE t.organization_id=$1 ${maintenanceTaskScope('t')}${maintenanceTaskActive('t')} AND t.status='open' AND (t.lead_id IS NULL OR l.id IS NOT NULL AND (l.pipeline_stage NOT IN('lost_closed','leased','won') OR l.pipeline_stage='leased' AND t.purpose='move_in'))
 AND (t.tour_id IS NULL OR v.id IS NOT NULL AND v.status<>'cancelled')
 AND (t.application_id IS NULL OR EXISTS(SELECT 1 FROM selected_applications a WHERE a.id=t.application_id AND a.property_id=t.property_id AND a.contact_id=t.contact_id AND a.lead_id IS NOT DISTINCT FROM t.lead_id))
 AND ($7::uuid IS NULL OR t.owner_membership_id=$7)
 AND ($8::uuid IS NULL OR t.team_id=$8 OR EXISTS(SELECT 1 FROM task_team_members tm WHERE tm.organization_id=t.organization_id AND tm.team_id=$8 AND tm.membership_id=t.owner_membership_id))
), first_follow_up AS MATERIALIZED(
 SELECT l.id,min(f.at) AS followed_at FROM cohort_leads l JOIN LATERAL(
  SELECT e.occurred_at AS at FROM lead_workspace_events e WHERE e.organization_id=l.organization_id AND e.lead_id=l.id AND e.property_id=l.property_id AND e.contact_id=l.contact_id AND e.kind='call' AND e.occurred_at>=l.created_at AND e.occurred_at<=$11::timestamptz
  UNION ALL
  SELECT m.created_at AS at FROM customer_conversations cv JOIN conversation_messages m ON m.conversation_id=cv.id AND m.organization_id=cv.organization_id WHERE cv.organization_id=l.organization_id AND cv.lead_id=l.id AND cv.property_id=l.property_id AND cv.contact_id=l.contact_id AND m.role='staff' AND m.status IN('sent','delivered') AND m.created_at>=l.created_at AND m.created_at<=$11::timestamptz
 )f ON true GROUP BY l.id
)`;
export const reportingSummarySql=`${reportingCte}
 SELECT
 (SELECT count(*) FROM cohort_leads) AS leads_created,
 (SELECT count(*) FROM selected_viewings WHERE created_at>=$9 AND created_at<$10 AND created_at<=$11 AND status<>'cancelled') AS viewings_booked,
 (SELECT count(*) FROM selected_applications WHERE portal_submitted_at>=$9 AND portal_submitted_at<$10 AND portal_submitted_at<=$11) AS applications_submitted,
 (SELECT count(DISTINCT lease_id) FROM valid_milestones WHERE verified_at>=$9 AND verified_at<$10 AND verified_at<=$11) AS leases_verified,
 (SELECT count(*) FROM cohort_leads WHERE intent='leasing') AS lead_denominator,
 (SELECT count(*) FROM cohort_leads l WHERE intent='leasing' AND EXISTS(SELECT 1 FROM selected_viewings v WHERE v.lead_id=l.id AND v.status<>'cancelled' AND v.created_at>=l.created_at AND v.created_at<$12)) AS lead_numerator,
 (SELECT count(*) FROM selected_viewings WHERE intent='leasing' AND status='completed' AND starts_at>=$9 AND starts_at<$10 AND starts_at<$12) AS tour_denominator,
 (SELECT count(*) FROM selected_viewings v WHERE intent='leasing' AND status='completed' AND starts_at>=$9 AND starts_at<$10 AND starts_at<$12 AND EXISTS(SELECT 1 FROM selected_applications a WHERE a.lead_id=v.lead_id AND a.property_id=v.property_id AND a.contact_id=v.contact_id AND a.created_at>=COALESCE(v.ends_at,v.starts_at) AND a.created_at<$12)) AS tour_numerator,
 (SELECT count(*) FROM selected_applications WHERE portal_submitted_at>=$9 AND portal_submitted_at<$10 AND portal_submitted_at<$12) AS app_denominator,
 (SELECT count(*) FROM selected_applications a WHERE portal_submitted_at>=$9 AND portal_submitted_at<$10 AND portal_submitted_at<$12 AND EXISTS(SELECT 1 FROM valid_milestones m WHERE m.application_id=a.id AND m.property_id=a.property_id AND m.contact_id=a.contact_id AND m.lead_id IS NOT DISTINCT FROM a.lead_id AND m.verified_at>=a.portal_submitted_at AND m.verified_at<$12)) AS app_numerator,
 (SELECT count(*) FROM cohort_leads WHERE pipeline_stage NOT IN('lost_closed','leased','won')) AS open_leads,
 (SELECT count(*) FROM cohort_leads WHERE pipeline_stage NOT IN('lost_closed','leased','won') AND next_action_at<$11) AS overdue_leads,
 (SELECT avg(EXTRACT(epoch FROM(f.followed_at-l.created_at))/3600.0) FROM first_follow_up f JOIN cohort_leads l ON l.id=f.id) AS average_first_hours,
 (SELECT count(*) FROM first_follow_up) AS logged_leads,
 (SELECT count(*) FROM selected_tasks WHERE owner_membership_id IS NULL) AS unassigned_tasks,
 (SELECT count(*) FROM valid_milestones WHERE verified_at>=$9 AND verified_at<$10 AND verified_at<=$11 AND evidence_kind='manual_attestation') AS manual_attestation,
 (SELECT count(*) FROM valid_milestones WHERE verified_at>=$9 AND verified_at<$10 AND verified_at<=$11 AND evidence_kind='demo_event') AS demo_event,
 (SELECT count(*) FROM valid_milestones WHERE verified_at>=$9 AND verified_at<$10 AND verified_at<=$11 AND evidence_kind='provider_verified') AS provider_verified
`;
