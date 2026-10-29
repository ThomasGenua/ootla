import type {PoolClient} from 'pg';

// These are reviewable drafts. Calendar events never call a delivery provider.
export async function tourReplyDraft(c:PoolClient,organizationId:string,viewingId:string,eventId:string,kind:string){
 if(!['booked','rescheduled','cancelled'].includes(kind))return;
 const v=(await c.query('SELECT v.*,p.name AS property_name FROM viewings v JOIN properties p ON p.id=v.property_id WHERE v.id=$1 AND v.organization_id=$2',[viewingId,organizationId])).rows[0];
 if(!v)return;
 const co=(await c.query('INSERT INTO conversations(organization_id,property_id,lead_id,owner_membership_id) SELECT l.organization_id,l.property_id,l.id,l.owner_membership_id FROM leads l WHERE l.id=$2 AND l.organization_id=$1 ON CONFLICT(organization_id,lead_id) DO UPDATE SET updated_at=now() RETURNING id',[organizationId,v.lead_id])).rows[0];
 const time=new Intl.DateTimeFormat('en-CA',{dateStyle:'full',timeStyle:'short',timeZone:v.time_zone}).format(new Date(v.starts_at));
 const subject=kind==='cancelled'?'Tour cancelled':kind==='rescheduled'?'Updated tour confirmation':'Tour confirmation';
 const body=kind==='cancelled'?`Your tour of ${v.property_name} on ${time} (${v.time_zone}) has been cancelled. Contact our team if you would like to arrange another visit.`:`Your tour of ${v.property_name} is confirmed for ${time} (${v.time_zone}). Meeting location: ${v.location}. If you booked using a private link, reopen that original link to review or change your booking while it remains valid.`;
 await c.query("UPDATE conversation_messages SET status='cancelled',version=version+1,updated_at=now() WHERE tour_id=$1 AND tour_version<$2 AND status='draft' AND version=1",[v.id,v.version]);
 await c.query("INSERT INTO conversation_messages(organization_id,conversation_id,request_key,direction,channel,subject,body,status,tour_id,tour_version) VALUES($1,$2,$3,'outbound','email',$4,$5,'draft',$6,$7) ON CONFLICT(organization_id,request_key) DO NOTHING",[organizationId,co.id,eventId,subject,body,v.id,v.version]);
}
