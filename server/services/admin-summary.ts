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
const metric = (key: string, label: string, value: number|string|null, icon: AdminSummaryMetric['icon'], note?: string): AdminSummaryMetric =>
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

  if(page==='maintenance')return result([metric('matching','Matching requests',null,'document'),metric('open','Open',null,'home'),metric('unassigned','Unassigned',null,'users'),metric('overdue','Overdue',null,'clock')],'Load the maintenance workspace for current authorized request counts.');

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

  if (page === 'profile') {
    const row = await read(`SELECT u.staff_phone,u.staff_job_title,
      (SELECT count(*)::int FROM property_access_assignments pa WHERE pa.organization_id=$1 AND pa.membership_id=$2) AS assigned
      FROM users u WHERE u.id=$3 AND EXISTS(SELECT 1 FROM organization_memberships m WHERE m.id=$2 AND m.organization_id=$1 AND m.user_id=u.id AND m.active)`, [user.organization.id,user.membershipId,user.id]);
    return result([
      metric('role','Your role',roles[user.organization.role],'key'),
      metric('property_access','Property access',admin?'All':count(row,'assigned'),'home',admin?'This organization only.':'Explicit property assignments.'),
      metric('contact_details','Contact details',Number(Boolean(row.staff_phone))+Number(Boolean(row.staff_job_title)),'users','Optional phone and job title fields completed, out of two.'),
      metric('session','Session','Active','check','Your current authenticated staff session.'),
    ], 'Your account in this organization');
  }
  if (page === 'settings') {
    const row = (await read(`SELECT default_page,lead_view,motion FROM staff_user_preferences WHERE organization_id=$1 AND membership_id=$2 AND user_id=$3`, [user.organization.id,user.membershipId,user.id])) ?? {};
    const defaultPage = row.default_page === '/admin/tasks' && !leasing ? '/admin' : row.default_page ?? '/admin';
    return result([
      metric('start_page','Start page',({'/admin':'Overview','/admin/leads':'Leads','/admin/tasks':'Tasks'} as Record<string,string>)[defaultPage] ?? 'Overview','home'),
      metric('lead_view','Lead view',row.lead_view === 'board' ? 'Board' : 'List','users'),
      metric('motion','Motion',row.motion === 'reduce' ? 'Reduced' : 'System','settings'),
      metric('session','Session','Active','check','Your current authenticated staff session.'),
    ], 'Your saved personal settings');
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
    return result([metric('requests','Your requests',count(row,'requests'),'sparkles'),metric('completed','Completed requests',count(row,'completed'),'check'),metric('tasks','Saved tasks',count(row,'tasks'),'document','Tasks verified after successful domain-service execution.'),metric('handoffs','Needs staff help',count(row,'handoffs'),'users','Requests requiring authorized staff assistance.')],'Your actual scoped AI request records; mode is shown in the AI workspace.');
  }
  if (page === 'tasks') {
    const ai = false;
    const labels: [string,string,string,string] = ai ? ['AI mode','Pending examples','Assigned to you','Completed examples'] : ['Open tasks','Overdue tasks','Unassigned','Completed tasks'];
    if (!leasing) return restricted(page,labels,'Requires authorized lead-management access.');
    const filter = ai ? " AND t.origin='ai_simulation'" : '';
    const row = await read(`SELECT
      count(*) FILTER(WHERE ${relevantTask})::int AS open,
      count(*) FILTER(WHERE ${relevantTask} AND t.due_at<now())::int AS overdue,
      count(*) FILTER(WHERE ${relevantTask} AND t.owner_membership_id IS NULL)::int AS unassigned,
      count(*) FILTER(WHERE ${relevantTask} AND t.owner_membership_id=$3)::int AS mine,
      count(*) FILTER(WHERE t.status='completed')::int AS completed
      FROM tasks t ${taskJoins} WHERE ${linkedScope('t')}${filter}`);
    if (ai) return result([metric('mode','AI mode','Simulation','sparkles','Live AI is not configured.'),metric('pending','Pending examples',count(row,'open'),'document','Open tasks explicitly recorded as AI simulations.'),metric('mine','Assigned to you',count(row,'mine'),'users','Open simulated tasks assigned to your membership.'),metric('completed','Completed examples',count(row,'completed'),'check')], 'Scripted AI examples in your accessible task records');
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
      (SELECT count(*)::int FROM households h WHERE h.organization_id=$1 AND ($2='organization_admin' OR EXISTS(
        SELECT 1 FROM household_property_links hp WHERE hp.organization_id=h.organization_id AND hp.household_id=h.id
          AND EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.organization_id=hp.organization_id AND pa.property_id=hp.property_id AND pa.membership_id=$3)))) AS households,
      (SELECT count(*)::int FROM contacts c WHERE ${contactScope} AND btrim(c.email)<>'') AS email,
      (SELECT count(*)::int FROM contacts c WHERE ${contactScope} AND btrim(c.phone)<>'') AS phone`);
    return result([metric('contacts','Contacts',count(row,'contacts'),'users'),metric('households','Households',count(row,'households'),'home'),metric('email','With email',count(row,'email'),'document'),metric('phone','With phone',count(row,'phone'),'users')]);
  }
  const row = await read(`SELECT count(*)::int AS total,
    count(*) FILTER(WHERE a.status='draft')::int AS draft,
    count(*) FILTER(WHERE a.status='submitted')::int AS submitted,
    count(*) FILTER(WHERE a.status='staff_review')::int AS review
    FROM applications a WHERE ${linkedScope('a')}`);
  return result([metric('total','Applications',count(row,'total'),'document'),metric('draft','Draft applications',count(row,'draft'),'document'),metric('submitted','Submitted',count(row,'submitted'),'check'),metric('review','Staff review',count(row,'review'),'users')]);
}
