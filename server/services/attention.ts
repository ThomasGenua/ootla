import type {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import type {attentionQuery} from '../../shared/connected-contracts.js';
import {Operations} from './operations.js';
import {leadScope,propertyScope,scopeArgs} from './operations-access.js';
import {inquiryDeadline,inquiryEscalation} from './response-policies.js';
import {verifiedUnit} from './vacancies.js';
import {scope as taskScope,relevant as taskRelevant} from './tasks.js';

export const attentionSql=`WITH candidates AS (
   SELECT co.id,'inquiry'::text AS kind,'Reply to '||ct.display_name AS title,co.property_id,
    CASE WHEN escalation.at<=now() AND manager.id IS NOT NULL THEN manager.id ELSE co.owner_membership_id END AS owner_membership_id,
    ${inquiryDeadline} AS due_at,CASE WHEN escalation.at<=now() THEN 0 ELSE 1 END AS urgency,
    '/admin/inbox?conversation='||co.id AS url,CASE WHEN escalation.at<=now() THEN 'Review escalated reply' ELSE 'Review and reply' END AS action
   FROM conversations co JOIN leads l ON l.id=co.lead_id JOIN contacts ct ON ct.id=l.contact_id
   JOIN LATERAL(SELECT m.created_at FROM conversation_messages m WHERE m.conversation_id=co.id AND m.direction='inbound' ORDER BY m.created_at DESC,m.id DESC LIMIT 1) inbound ON true
   LEFT JOIN property_response_policies policy ON policy.property_id=co.property_id
   LEFT JOIN LATERAL(SELECT ${inquiryEscalation} AS at) escalation ON true
   LEFT JOIN organization_memberships manager ON manager.id=policy.manager_membership_id AND manager.active AND manager.role IN ('organization_admin','property_manager') AND EXISTS(SELECT 1 FROM users mu WHERE mu.id=manager.user_id AND mu.active) AND (manager.role='organization_admin' OR (EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.membership_id=manager.id AND pa.property_id=co.property_id) AND NOT EXISTS(SELECT 1 FROM lead_property_interests li WHERE li.lead_id=co.lead_id AND NOT EXISTS(SELECT 1 FROM property_access_assignments pa WHERE pa.membership_id=manager.id AND pa.property_id=li.property_id))))
   WHERE ${leadScope('co')} AND co.status='open' AND l.pipeline_stage NOT IN ('leased','won','lost_closed')
    AND (co.snoozed_until IS NULL OR co.snoozed_until<=now())
    AND NOT EXISTS(SELECT 1 FROM conversation_messages reply WHERE reply.conversation_id=co.id AND reply.direction='outbound' AND reply.status IN ('accepted','delivered','simulated') AND reply.sent_at>=inbound.created_at)
   UNION ALL
   SELECT t.id,'task',t.title,t.property_id,t.owner_membership_id,t.due_at,CASE WHEN t.priority='urgent' THEN 0 ELSE 1 END,
    '/admin/tasks?task='||t.id,'Complete or reassign task'
   FROM tasks t LEFT JOIN leads l ON l.id=t.lead_id LEFT JOIN viewings v ON v.id=t.tour_id
   WHERE ${taskScope('t')} AND ${taskRelevant('t','l','v')} AND t.due_at<=now()
   UNION ALL
   SELECT ap.id,'application','Application for '||ct.display_name,ap.property_id,l.owner_membership_id,activity.last_at+interval '3 days',1,
    '/admin/applications?application='||ap.id,'Review application and follow up'
   FROM applications ap JOIN leads l ON l.id=ap.lead_id JOIN contacts ct ON ct.id=ap.contact_id
   JOIN LATERAL(SELECT GREATEST(ap.updated_at,MAX(ev.occurred_at)) AS last_at FROM application_portal_events ev WHERE ev.application_id=ap.id AND ev.organization_id=ap.organization_id) activity ON true
   WHERE ${leadScope('ap')} AND ap.portal_enabled AND ap.status IN ('draft','submitted','staff_review') AND activity.last_at<=now()-interval '3 days'
    AND l.pipeline_stage NOT IN ('leased','won','lost_closed')
   UNION ALL
   SELECT r.id,'resident',r.title,r.property_id,r.owner_membership_id,
    CASE WHEN r.priority='urgent' THEN r.created_at ELSE r.updated_at+interval '1 day' END,CASE WHEN r.priority='urgent' THEN 0 ELSE 1 END,
    '/admin/residents?request='||r.id,'Assign or update resident'
   FROM resident_requests r WHERE ${leadScope('r')} AND r.status IN ('submitted','in_progress','waiting')
    AND (r.priority='urgent' OR r.updated_at<=now()-interval '1 day')
   UNION ALL
   SELECT n.id,'mention','Team note for '||ct.display_name,co.property_id,cm.membership_id,n.created_at,1,
    '/admin/inbox?conversation='||co.id,'Read and acknowledge mention'
   FROM conversation_mentions cm JOIN conversation_notes n ON n.id=cm.note_id JOIN conversations co ON co.id=n.conversation_id
   JOIN leads l ON l.id=co.lead_id JOIN contacts ct ON ct.id=l.contact_id
   WHERE ${leadScope('co')} AND cm.membership_id=$3 AND cm.read_at IS NULL
   UNION ALL
   SELECT w.id,'maintenance',r.title,w.property_id,w.owner_membership_id,COALESCE(w.appointment_end,w.created_at+interval '1 day'),CASE WHEN r.priority='urgent' THEN 0 ELSE 1 END,
    '/admin/maintenance?order='||w.id,'Review work order'
   FROM maintenance_work_orders w JOIN resident_requests r ON r.id=w.request_id WHERE ${leadScope('w')} AND w.status IN ('open','scheduled','in_progress') AND (r.priority='urgent' OR COALESCE(w.appointment_end,w.created_at+interval '1 day')<=now())
   UNION ALL
   SELECT t.id,'renewal','Tenancy follow-up for '||ct.display_name,t.property_id,t.owner_membership_id,t.next_action_on::timestamptz,1,
    '/admin/renewals?plan='||t.id,'Review renewal or move-out'
   FROM tenancy_plans t JOIN resident_relationships rr ON rr.id=t.resident_id JOIN contacts ct ON ct.id=rr.contact_id WHERE ${leadScope('t')} AND t.status<>'moved_out' AND t.next_action_on<=CURRENT_DATE
   UNION ALL
   SELECT t.id,'vacancy','Prepare unit '||un.label,t.property_id,t.owner_membership_id,t.expected_ready_on::timestamptz,1,
    '/admin/vacancies?unit='||t.unit_id,'Review turnover checklist'
   FROM unit_turnovers t JOIN units un ON un.id=t.unit_id WHERE ${propertyScope('t')} AND t.status<>'ready' AND t.expected_ready_on<=CURRENT_DATE
   UNION ALL
   SELECT w.id,'waitlist','Unit shortlist for '||ct.display_name,w.property_id,l.owner_membership_id,w.created_at,1,
    '/admin/vacancies?unit='||w.unit_id,'Prepare availability follow-up'
   FROM unit_waitlist w JOIN units un ON un.id=w.unit_id JOIN leads l ON l.id=w.lead_id JOIN contacts ct ON ct.id=l.contact_id WHERE ${leadScope('w')} AND w.status='waiting' AND l.pipeline_stage NOT IN ('leased','won','lost_closed') AND ${verifiedUnit('un')} AND NOT EXISTS(SELECT 1 FROM unit_turnovers t WHERE t.unit_id=un.id AND t.status<>'ready')
  ), filtered AS(SELECT x.*,p.name AS property_name,u.display_name AS owner_name FROM candidates x JOIN properties p ON p.id=x.property_id
   LEFT JOIN organization_memberships om ON om.id=x.owner_membership_id LEFT JOIN users u ON u.id=om.user_id
   WHERE ($4='all' OR $4='mine' AND x.owner_membership_id=$3 OR $4='unassigned' AND x.owner_membership_id IS NULL) AND ($5='all' OR x.kind=$5))`;

export class Attention extends Operations {
 async queue(user:AuthUser,digest:string,input:z.infer<typeof attentionQuery>){return this.staff(user,digest,async(c,a)=>{
  // Each source uses the same related-property restrictions as its destination.
  const sql=attentionSql;
  const args=[...scopeArgs(a),input.owner,input.kind];
  const total=Number((await c.query(sql+' SELECT count(*) AS n FROM filtered',args)).rows[0].n);
  const items=(await c.query(sql+' SELECT *,due_at<=now() AS overdue FROM filtered ORDER BY urgency,(due_at>now()),due_at,kind,id LIMIT 25 OFFSET $6',[...args,(input.page-1)*25])).rows;
  return{items,total,page:input.page,pageSize:25,notice:'Inquiry targets use each property’s business hours, or four elapsed hours when no policy is enabled. Manual deadlines take precedence. Escalated replies and urgent work appear first. Due tenancy follow-ups, maintenance, turnovers and ready unit shortlists join the existing application, resident and mention queues.'};
 });}
}
