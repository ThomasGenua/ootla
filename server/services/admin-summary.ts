import {renewalSummaryCounts} from './renewals.js';
import {maintenanceStaffScope} from './maintenance-access.js';
import {maintenanceTaskScope,maintenanceTaskActive} from './maintenance-task-scope.js';
import {maintenanceAutomationJobScope} from './automation-maintenance-scope.js';
import type { AuthUser, DashboardPeriod } from '../../shared/contracts.js';
import type { AdminPageSummary, AdminSummaryMetric, AdminSummaryPage } from '../../shared/admin-summary-contracts.js';
import type { Database } from '../db/pool.js';

/** All identifiers below are internal constants, never browser-provided SQL. */
const propertyScope = (alias: string, column = 'property_id') => `${alias}.organization_id=$1 AND ($2='organization_admin' OR EXISTS(
  SELECT 1 FROM property_access_assignments pa
  WHERE pa.organization_id=${alias}.organization_id AND pa.property_id=${alias}.${column} AND pa.membership_id=$3))`;
const allLeadInterests = (alias: string, leadColumn = 'lead_id') => `($2='organization_admin' OR NOT EXISTS(
  SELECT 1 FROM lead_property_interests li WHERE li.organization_id=${alias}.organization_id AND li.lead_id=${alias}.${leadColumn}
    AND NOT EXISTS(SELECT 1 FROM property_access_assignments ia
      WHERE ia.organization_id=li.organization_id AND ia.property_id=li.property_id AND ia.membership_id=$3)))`;
const leadScope = `${propertyScope('l')} AND ${allLeadInterests('l', 'id')}`;
const linkedScope = (alias: string) => `${propertyScope(alias)} AND ${allLeadInterests(alias)}`+(alias==='j'?maintenanceAutomationJobScope(alias):alias==='t'?maintenanceTaskScope(alias):'');
const openLead = "l.pipeline_stage NOT IN ('leased','won','lost_closed')";
const taskJoins = 'LEFT JOIN leads l ON l.id=t.lead_id AND l.organization_id=t.organization_id LEFT JOIN viewings v ON v.id=t.tour_id AND v.organization_id=t.organization_id';
const relevantTask = `t.status='open' AND (l.id IS NULL OR ${openLead} OR (l.pipeline_stage='leased' AND COALESCE(to_jsonb(t)->>'purpose','crm')='move_in')) AND
  (t.tour_id IS NULL OR (v.id IS NOT NULL AND v.status<>'cancelled' AND v.lead_id=t.lead_id AND v.property_id=t.property_id)) AND
  (t.application_id IS NULL OR EXISTS(SELECT 1 FROM applications ra WHERE ra.id=t.application_id AND ra.organization_id=t.organization_id
    AND ra.property_id=t.property_id AND ra.lead_id IS NOT DISTINCT FROM t.lead_id AND ra.contact_id IS NOT DISTINCT FROM t.contact_id))`+maintenanceTaskActive('t');
const metric = (key: string, label: string, value: number|null, icon: AdminSummaryMetric['icon'], note?: string): AdminSummaryMetric =>
  ({ key, label, value, icon, ...(note ? { note } : {}) });
const values = (user: AuthUser): unknown[] => [user.organization.id, user.organization.role, user.membershipId];
const roles: Record<AuthUser['organization']['role'], string> = {
  organization_admin:'Org admin',leasing_agent:'Leasing agent',property_manager:'Property manager',
  read_only_analyst:'Read-only analyst',staff:'Staff',read_only:'Read only',
};
type Four = AdminPageSummary['metrics'];
const restricted = (page: AdminSummaryPage, labels: [string,string,string,string], note: string): AdminPageSummary => ({
  page, scopeLabel: note, period: null, metrics: labels.map((label,index) => metric('restricted_'+index,label,null,'key',note)) as Four,
});

/** Read-only aggregates reuse existing tenant, assigned-property and private-work boundaries. */
export async function loadAdminPageSummary(database: Database, user: AuthUser, page: AdminSummaryPage, period: DashboardPeriod): Promise<AdminPageSummary> {
  const args = values(user);
  const admin = user.organization.role === 'organization_admin';
  const propertyRead = user.permissions.includes('properties.read');
  const leasing = user.permissions.includes('leasing.manage');
  const scope = admin ? 'Current organization records' : 'Current records in your property access';
  const result = (metrics: Four, scopeLabel = scope, selectedPeriod: DashboardPeriod|null = null): AdminPageSummary => ({ page, scopeLabel, period: selectedPeriod, metrics });
  const read = async (sql: string, parameters = args) => (await database.query(sql,parameters)).rows[0]!;
  const count = (row: Record<string,unknown>, key: string) => Number(row[key] ?? 0);

  if(page==='organization')return result([metric('members','Staff members',null,'users'),metric('properties','Properties',null,'home'),metric('groups','Groups',null,'home'),metric('rules','Routing rules',null,'settings')],'Load organization administration for current authorized counts.');
  if(page==='integration-health')return result([metric('services','Services',null,'link'),metric('simulated','Simulated',null,'sparkles'),metric('verified','Live verified',null,'check'),metric('issues','Needs attention',null,'clock')],'Load integration health for actual recorded evidence.');
  if(page==='audit')return result([metric('events','Matching events',null,'document'),metric('roles','Role changes',null,'users'),metric('integrations','Integration writes',null,'link'),metric('failed','Failed or denied',null,'clock')],'Load the authorized audit history for current filtered counts.');
  if(page==='voice')return result([metric('sessions','Sessions',null,'users'),metric('active','Active',null,'clock'),metric('booked','Viewings booked',null,'calendar'),metric('handoffs','Staff requests',null,'users')],'Load the voice workspace for actual authorized session counts.');

  if(page==='renewals'||page==='resident-access'){
    const resident=page==='resident-access',labels:[string,string,string,string]=resident?['Active grants','Pending invitations','Not invited','Inactive leases']:['Published terms','Expired terms','Not published','Inactive leases'];
    if(!leasing||resident&&!['organization_admin','property_manager'].includes(user.organization.role))return restricted(page,labels,'Requires current assigned resident-record access; resident administration requires an administrator or property manager.');
    const row=await renewalSummaryCounts(database,user,resident);
    return result(resident?[metric('active_grants','Active grants',row.active_grants??0,'users'),metric('pending_invitations','Pending invitations',row.pending_invitations??0,'clock'),metric('not_invited','Not invited',row.not_invited??0,'document'),metric('inactive','Inactive leases',row.inactive??0,'home')]:[metric('current','Published terms',row.current??0,'document'),metric('expired','Expired terms',row.expired??0,'clock'),metric('not_published','Not published',row.not_published??0,'users'),metric('inactive','Inactive leases',row.inactive??0,'home')],'Current canonical lease relationships in your property access');
  }

  if(page==='maintenance'){
    if(!leasing)return restricted(page,['Matching requests','Open requests','Unassigned requests','Overdue requests'],'Requires current maintenance access.');
    const row=await read(`SELECT count(*)::int AS matching,count(*) FILTER(WHERE mr.status NOT IN('resolved','closed'))::int AS open,count(*) FILTER(WHERE mr.status NOT IN('resolved','closed') AND mr.owner_membership_id IS NULL)::int AS unassigned,count(*) FILTER(WHERE mr.status NOT IN('resolved','closed') AND mr.due_at<clock_timestamp())::int AS overdue FROM maintenance_requests mr WHERE ${maintenanceStaffScope('mr')}`);
    return result([metric('matching','Matching requests',count(row,'matching'),'document'),metric('open','Open requests',count(row,'open'),'home'),metric('unassigned','Unassigned requests',count(row,'unassigned'),'users'),metric('overdue','Overdue requests',count(row,'overdue'),'clock')],'Current authorized maintenance records');
  }

  if(page==='automations'){
    if(!leasing)return restricted(page,['Enabled rules','Awaiting approval','Queued work','Failed work'],'Requires current lead-management permission.');
    const ready=(await database.query("SELECT to_regclass('public.automation_jobs') IS NOT NULL AS ready")).rows[0]?.ready;
    if(!ready)return result([metric('enabled','Enabled rules',null,'settings'),metric('approval','Awaiting approval',null,'users'),metric('queued','Queued work',null,'clock'),metric('failed','Failed work',null,'document')],'Run the automation migration to prepare this workspace.');
    const ruleScope="r.organization_id=$1 AND ($2='organization_admin' OR r.property_id IS NOT NULL AND EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=r.organization_id AND pa.property_id=r.property_id AND pa.membership_id=$3))";
    const row=await read("SELECT (SELECT count(*)::int FROM automation_rules r WHERE "+ruleScope+" AND r.enabled) AS enabled,(SELECT count(*)::int FROM automation_jobs j WHERE "+linkedScope('j')+" AND j.status='awaiting_approval') AS approval,(SELECT count(*)::int FROM automation_jobs j WHERE "+linkedScope('j')+" AND j.status='queued') AS queued,(SELECT count(*)::int FROM automation_jobs j WHERE "+linkedScope('j')+" AND j.status='failed') AS failed");
    return result([metric('enabled','Enabled rules',count(row,'enabled'),'settings'),metric('approval','Awaiting approval',count(row,'approval'),'users'),metric('queued','Queued work',count(row,'queued'),'clock'),metric('failed','Failed work',count(row,'failed'),'document')],'Actual authorized rule and job records; enabled does not mean externally connected.');
  }

  if (page === 'conversations') {
    if(!leasing)return restricted(page,['AI active','Staff requested','Staff handling','Queued replies'],'Requires authorized customer-conversation access.');
    const ready=(await database.query("SELECT to_regclass('public.customer_conversations') IS NOT NULL AS ready")).rows[0]?.ready;
    if(!ready)return result([metric('ai','AI active',null,'sparkles'),metric('requested','Staff requested',null,'users'),metric('handling','Staff handling',null,'users'),metric('queued','Queued replies',null,'clock')], 'Run the conversation migration to prepare this workspace.');
    const row=await read("SELECT count(*) FILTER(WHERE c.ownership='ai_active')::int AS ai,count(*) FILTER(WHERE c.ownership='staff_requested')::int AS requested,count(*) FILTER(WHERE c.ownership='staff_handling')::int AS handling FROM customer_conversations c WHERE "+linkedScope('c'));
    const queued=await read("SELECT count(*)::int AS n FROM conversation_outbox o JOIN customer_conversations c ON c.id=o.conversation_id AND c.organization_id=o.organization_id WHERE o.state='queued' AND "+linkedScope('c'));
    return result([metric('ai','AI active',count(row,'ai'),'sparkles'),metric('requested','Staff requested',count(row,'requested'),'users'),metric('handling','Staff handling',count(row,'handling'),'users'),metric('queued','Queued replies',count(queued,'n'),'clock','Local simulated outbox.')]);
  }

  if (page === 'profile' || page === 'settings') {
    const row=await read(`SELECT
      (SELECT count(*)::int FROM organization_memberships m WHERE m.organization_id=$1 AND m.user_id=$4 AND m.active) AS memberships,
      (SELECT count(*)::int FROM properties p WHERE ${propertyScope('p','id')}) AS properties,
      (SELECT count(*)::int FROM sessions s WHERE s.user_id=$4 AND s.organization_id=$1 AND s.expires_at>now()) AS sessions,
      (SELECT count(*)::int FROM staff_user_preferences sp WHERE sp.organization_id=$1 AND sp.membership_id=$3 AND sp.user_id=$4) AS preferences,
      COALESCE((SELECT (COALESCE((btrim(staff_phone)<>'')::int,0)+COALESCE((btrim(staff_job_title)<>'')::int,0)) FROM users WHERE id=$4),0) AS contact_details`,[...args,user.id]);
    return result(page==='profile'?[metric('memberships','Active memberships',count(row,'memberships'),'users'),metric('property_access','Accessible properties',count(row,'properties'),'home'),metric('contact_details','Contact fields completed',count(row,'contact_details'),'document'),metric('sessions','Active sessions',count(row,'sessions'),'check')]:[metric('preferences','Saved preference profiles',count(row,'preferences'),'settings'),metric('properties','Accessible properties',count(row,'properties'),'home'),metric('memberships','Active memberships',count(row,'memberships'),'users'),metric('sessions','Active sessions',count(row,'sessions'),'check')],'Your account in this organization');
  }
  if (page === 'imports') {
    if (!admin) return restricted(page,['Import batches','Processing','Rows needing review','Rows created'],'Requires an organization administrator.');
    const mode = (await read('SELECT mode FROM organization_data_settings WHERE organization_id=$1',[user.organization.id]))?.mode;
    if (mode !== 'standalone') return restricted(page,['Import batches','Processing','Rows needing review','Rows created'],'CSV imports require a standalone organization.');
    const row = await read(`SELECT
      (SELECT count(*)::int FROM import_batches b WHERE b.organization_id=$1) AS batches,
      (SELECT count(*)::int FROM import_batches b WHERE b.organization_id=$1 AND b.status IN ('queued','running')) AS processing,
      (SELECT count(*)::int FROM import_rows r WHERE r.organization_id=$1 AND r.status='needs_review') AS review,
      (SELECT count(*)::int FROM import_rows r WHERE r.organization_id=$1 AND r.status='created') AS created`,[user.organization.id]);
    return result([metric('batches','Import batches',count(row,'batches'),'document'),metric('processing','Processing',count(row,'processing'),'clock'),metric('review','Rows needing review',count(row,'review'),'users'),metric('created','Rows created',count(row,'created'),'check','Retained rows currently marked created; undone rows excluded.')], 'Current standalone import records');
  }
  if (page === 'integrations') {
    if (!admin) return restricted(page,['Connections','Queued syncs','Failed syncs','Open conflicts'],'Requires an organization administrator.');
    const row = await read(`SELECT
      (SELECT count(*)::int FROM connector_connections c WHERE c.organization_id=$1) AS connections,
      (SELECT count(*)::int FROM connector_jobs j WHERE j.organization_id=$1 AND j.status IN ('queued','running')) AS queued,
      (SELECT count(*)::int FROM connector_jobs j WHERE j.organization_id=$1 AND j.status='failed') AS failed,
      (SELECT count(*)::int FROM connector_conflicts c WHERE c.organization_id=$1 AND c.status='open') AS conflicts`,[user.organization.id]);
    return result([metric('connections','Connections',count(row,'connections'),'link','Saved connector records; this count does not assert a live connection.'),metric('queued','Queued syncs',count(row,'queued'),'clock'),metric('failed','Failed syncs',count(row,'failed'),'document'),metric('conflicts','Open conflicts',count(row,'conflicts'),'users')], 'Current organization connector records');
  }
  if(page==='ai'){
    if(!propertyRead)return restricted(page,['Your requests','Completed requests','Saved tasks','Needs staff help'],'Requires property-record read permission.');
    const ready=(await read("SELECT to_regclass('public.ai_requests') IS NOT NULL AS ready",[])).ready;
    if(!ready)return result([metric('requests','Your requests',null,'sparkles'),metric('completed','Completed requests',null,'check'),metric('tasks','Saved tasks',null,'document'),metric('handoffs','Needs staff help',null,'users')],'AI operational records are not available yet.');
    const aiScope=propertyScope('r')+' AND '+allLeadInterests('r')+' AND r.actor_user_id=$4';
    const row=await read(`SELECT (SELECT count(*)::int FROM ai_requests r WHERE ${aiScope}) AS requests,
      (SELECT count(*)::int FROM ai_requests r WHERE ${aiScope} AND r.status='completed') AS completed,
      (SELECT count(*)::int FROM task_creation_receipts tc JOIN ai_requests r ON r.organization_id=tc.organization_id AND r.id::text=split_part(tc.request_key,':',1) WHERE tc.namespace='ai_follow_up' AND ${aiScope}) AS tasks,
      (SELECT count(*)::int FROM ai_requests r WHERE ${aiScope} AND r.status='handoff') AS handoffs`,[...args,user.id]);
    return result([metric('requests','Your requests',count(row,'requests'),'sparkles'),metric('completed','Completed requests',count(row,'completed'),'check'),metric('tasks','Saved tasks',count(row,'tasks'),'document','Tasks verified after successful domain-service execution.'),metric('handoffs','Needs staff help',count(row,'handoffs'),'users','Requests requiring authorized staff assistance.')],'');
  }
  if (page === 'tasks') {

    const labels: [string,string,string,string] = ['Open tasks','Overdue tasks','Unassigned','Completed tasks'];
    if (!leasing) return restricted(page,labels,'Requires authorized lead-management access.');
    const filter = '';
    const row = await read(`SELECT
      count(*) FILTER(WHERE ${relevantTask})::int AS open,
      count(*) FILTER(WHERE ${relevantTask} AND t.due_at<now())::int AS overdue,
      count(*) FILTER(WHERE ${relevantTask} AND t.owner_membership_id IS NULL)::int AS unassigned,
      count(*) FILTER(WHERE ${relevantTask} AND t.owner_membership_id=$3)::int AS mine,
      count(*) FILTER(WHERE t.status='completed')::int AS completed
      FROM tasks t ${taskJoins} WHERE ${linkedScope('t')}${filter}`);
    return result([metric('open','Open tasks',count(row,'open'),'document','Currently actionable; closed leads and cancelled tours excluded.'),metric('overdue','Overdue tasks',count(row,'overdue'),'clock'),metric('unassigned','Unassigned',count(row,'unassigned'),'users'),metric('completed','Completed tasks',count(row,'completed'),'check')], 'All accessible task records');
  }
  if (page === 'calendar') {
    if (!leasing) return restricted(page,['Scheduled viewings','Completed','Cancelled','No-shows'],'Requires authorized lead-management access.');
    // Managed viewings carry their scheduling timezone. Legacy timestamps are explicitly UTC in the Calendar.
    const timeZone = "COALESCE(v.time_zone,'UTC')";
    const row = await read(`SELECT count(*) FILTER(WHERE v.status='scheduled')::int AS scheduled,
      count(*) FILTER(WHERE v.status='completed')::int AS completed,
      count(*) FILTER(WHERE v.status='cancelled')::int AS cancelled,
      count(*) FILTER(WHERE v.status='no_show')::int AS no_show
      FROM viewings v WHERE ${linkedScope('v')} AND ($4='all' OR (
        v.starts_at AT TIME ZONE ${timeZone} >= date_trunc(CASE $4 WHEN 'month' THEN 'month' ELSE 'week' END,now() AT TIME ZONE ${timeZone})
        AND v.starts_at AT TIME ZONE ${timeZone} < date_trunc(CASE $4 WHEN 'month' THEN 'month' ELSE 'week' END,now() AT TIME ZONE ${timeZone}) +
          CASE $4 WHEN 'month' THEN interval '1 month' ELSE interval '1 week' END))`,[...args,period]);
    return result([metric('scheduled','Scheduled viewings',count(row,'scheduled'),'calendar'),metric('completed','Completed',count(row,'completed'),'check'),metric('cancelled','Cancelled',count(row,'cancelled'),'document'),metric('no_show','No-shows',count(row,'no_show'),'users')], 'Viewing dates in their recorded timezone; legacy records use UTC',period);
  }
  if(page==='reports'){
    if(!user.permissions.includes('analytics.read'))return restricted(page,['Leads created','Viewings booked','Applications submitted','Leases verified'],'Requires current analytics permission.');
    return result([metric('leads','Leads created',null,'users'),metric('viewings','Viewings booked',null,'calendar'),metric('applications','Applications submitted',null,'document'),metric('leases','Leases verified',null,'key')],'Select a portfolio report period and authorized filters below. Period counts are separate from cohort conversion rates.');
  }
  if(page==='analytics'){
    if(!user.permissions.includes('analytics.read'))return restricted(page,['Active users','Sessions','Events','Key events'],'Requires analytics permission.');
    return result([metric('users','Active users',null,'users'),metric('sessions','Sessions',null,'clock'),metric('events','Events',null,'document'),metric('key_events','Key events',null,'check')],'Website analytics; choose a configured or illustrative report and date range below.');
  }
  if (!propertyRead) return restricted(page,['Records','In progress','Assigned','Completed'],'Requires property-record read permission.');
  if (page === 'properties') {
    const row = await read(`SELECT
      (SELECT count(*)::int FROM properties p WHERE ${propertyScope('p','id')}) AS properties,
      (SELECT count(*)::int FROM units u WHERE ${propertyScope('u')}) AS units,
      (SELECT count(*)::int FROM units u WHERE ${propertyScope('u')} AND u.status='available') AS available,
      (SELECT count(*)::int FROM units u WHERE ${propertyScope('u')} AND u.status='available' AND u.availability_verified_at IS NOT NULL) AS verified`);
    return result([metric('properties','Properties',count(row,'properties'),'home'),metric('units','Units',count(row,'units'),'key','Units are separate from properties.'),metric('available','Reported available',count(row,'available'),'home','Includes unverified and simulated source records.'),metric('dated','Availability dated',count(row,'verified'),'clock','Reported available units with a recorded timestamp; this does not confirm freshness or a live source.')]);
  }
  if (page === 'leads') {
    const row = await read(`SELECT count(*) FILTER(WHERE ${openLead})::int AS open,
      count(*) FILTER(WHERE l.pipeline_stage='new_inquiry')::int AS new,
      count(*) FILTER(WHERE ${openLead} AND l.owner_membership_id IS NULL)::int AS unassigned,
      count(*) FILTER(WHERE ${openLead} AND l.next_action_at<now())::int AS overdue
      FROM leads l WHERE ${leadScope}`);
    return result([metric('open','Open leads',count(row,'open'),'users'),metric('new','New inquiries',count(row,'new'),'document'),metric('unassigned','Unassigned',leasing?count(row,'unassigned'):null,'users',leasing?undefined:'Requires lead-management access.'),metric('overdue','Overdue next actions',leasing?count(row,'overdue'):null,'clock',leasing?undefined:'Requires lead-management access.')]);
  }
  if (page === 'contacts') {
    const contactScope = `c.organization_id=$1 AND ($2='organization_admin' OR EXISTS(SELECT 1 FROM contact_property_links cp
      WHERE cp.organization_id=c.organization_id AND cp.contact_id=c.id AND EXISTS(SELECT 1 FROM property_access_assignments pa
        WHERE pa.organization_id=cp.organization_id AND pa.property_id=cp.property_id AND pa.membership_id=$3)))`;
    const row = await read(`SELECT
      (SELECT count(*)::int FROM contacts c WHERE ${contactScope}) AS contacts,
      (SELECT count(*)::int FROM contacts c WHERE ${contactScope} AND EXISTS(SELECT 1 FROM leads l WHERE l.organization_id=c.organization_id AND l.contact_id=c.id AND ${leadScope})) AS leads,
      (SELECT count(*)::int FROM contacts c WHERE ${contactScope} AND btrim(c.email)<>'') AS email,
      (SELECT count(*)::int FROM contacts c WHERE ${contactScope} AND btrim(c.phone)<>'') AS phone`);
    return result([metric('contacts','Contacts',count(row,'contacts'),'users'),metric('leads','Linked to leads',count(row,'leads'),'home'),metric('email','With email',count(row,'email'),'document'),metric('phone','With phone',count(row,'phone'),'users')]);
  }
  const row = await read(`SELECT count(*)::int AS total,
    count(*) FILTER(WHERE a.status='draft')::int AS draft,
    count(*) FILTER(WHERE a.status='submitted')::int AS submitted,
    count(*) FILTER(WHERE a.status='staff_review')::int AS review
    FROM applications a WHERE ${linkedScope('a')}`);
  return result([metric('total','Applications',count(row,'total'),'document'),metric('draft','Draft applications',count(row,'draft'),'document'),metric('submitted','Submitted',count(row,'submitted'),'check'),metric('review','Staff review',count(row,'review'),'users')]);
}
