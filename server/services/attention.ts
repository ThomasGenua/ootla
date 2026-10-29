import type {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import type {attentionQuery} from '../../shared/connected-contracts.js';
import {Operations} from './operations.js';
import {leadScope,scopeArgs} from './operations-access.js';
import {scope as taskScope,relevant as taskRelevant} from './tasks.js';

export class Attention extends Operations {
 async queue(user:AuthUser,digest:string,input:z.infer<typeof attentionQuery>){return this.staff(user,digest,async(c,a)=>{
  // Each source uses the same related-property restrictions as its destination.
  const sql=`WITH candidates AS (
   SELECT co.id,'inquiry'::text AS kind,'Reply to '||ct.display_name AS title,co.property_id,co.owner_membership_id,
    COALESCE(co.response_due_at,inbound.created_at+interval '4 hours') AS due_at,1 AS urgency,
    '/admin/inbox?conversation='||co.id AS url,'Review and reply'::text AS action
   FROM conversations co JOIN leads l ON l.id=co.lead_id JOIN contacts ct ON ct.id=l.contact_id
   JOIN LATERAL(SELECT m.created_at FROM conversation_messages m WHERE m.conversation_id=co.id AND m.direction='inbound' ORDER BY m.created_at DESC,m.id DESC LIMIT 1) inbound ON true
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
  ), filtered AS(SELECT x.*,p.name AS property_name,u.display_name AS owner_name FROM candidates x JOIN properties p ON p.id=x.property_id
   LEFT JOIN organization_memberships om ON om.id=x.owner_membership_id LEFT JOIN users u ON u.id=om.user_id
   WHERE ($4='all' OR $4='mine' AND x.owner_membership_id=$3 OR $4='unassigned' AND x.owner_membership_id IS NULL) AND ($5='all' OR x.kind=$5))`;
  const args=[...scopeArgs(a),input.owner,input.kind];
  const total=Number((await c.query(sql+' SELECT count(*) AS n FROM filtered',args)).rows[0].n);
  const items=(await c.query(sql+' SELECT *,due_at<=now() AS overdue FROM filtered ORDER BY urgency,(due_at>now()),due_at,kind,id LIMIT 25 OFFSET $6',[...args,(input.page-1)*25])).rows;
  return{items,total,page:input.page,pageSize:25,notice:'Unanswered inquiries have a four-hour response target unless staff sets a deadline. Applications appear after three days without an update; resident requests after one day, or immediately when urgent. Snoozed inquiries return at their snooze time or on a new reply.'};
 });}
}
