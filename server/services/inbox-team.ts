import type {z} from 'zod';
import type {AuthUser} from '../../shared/contracts.js';
import type {noteSchema,timingSchema,composerSchema} from '../../shared/connected-contracts.js';
import {Inbox} from './inbox.js';
import {ApiError} from '../http/errors.js';
import {eligibleOwner,stale,operationEvent} from './operations-access.js';

export class InboxTeam extends Inbox {
 async team(user:AuthUser,digest:string,id:string,page=1){return this.staff(user,digest,async(c,a)=>{
  await this.access(c,a,id);
  const notes=(await c.query(`SELECT n.*,u.display_name AS author_name,count(*) OVER()::int AS total,
   ARRAY(SELECT mu.display_name FROM conversation_mentions cm JOIN organization_memberships m ON m.id=cm.membership_id JOIN users mu ON mu.id=m.user_id WHERE cm.note_id=n.id ORDER BY mu.display_name) AS mentions,
   EXISTS(SELECT 1 FROM conversation_mentions cm WHERE cm.note_id=n.id AND cm.membership_id=$3 AND cm.read_at IS NULL) AS mentioned
   FROM conversation_notes n JOIN users u ON u.id=n.author_id WHERE n.conversation_id=$1 ORDER BY n.created_at DESC,n.id LIMIT 25 OFFSET $2`,[id,(page-1)*25,a.membershipId])).rows;
  const composer=(await c.query('SELECT u.display_name AS name,p.membership_id,p.expires_at FROM conversation_composers p JOIN organization_memberships m ON m.id=p.membership_id JOIN users u ON u.id=m.user_id WHERE p.conversation_id=$1 AND p.expires_at>clock_timestamp() AND m.active AND u.active',[id])).rows[0];
  return{notes,page,total:notes[0]?.total??0,composer:composer?{name:composer.name,mine:composer.membership_id===a.membershipId,expiresAt:composer.expires_at}:null};
 });}
 async note(user:AuthUser,digest:string,id:string,input:z.infer<typeof noteSchema>){return this.staff(user,digest,async(c,a)=>{
  const co=await this.access(c,a,id,true);
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['note:'+a.organization.id+':'+input.requestKey]);
  const old=(await c.query('SELECT * FROM conversation_notes WHERE organization_id=$1 AND request_key=$2',[a.organization.id,input.requestKey])).rows[0];
  if(old){const mentions=(await c.query('SELECT membership_id FROM conversation_mentions WHERE note_id=$1 ORDER BY membership_id',[old.id])).rows.map(r=>r.membership_id);if(old.conversation_id!==id||old.author_id!==a.id||old.body!==input.body||JSON.stringify(mentions)!==JSON.stringify([...input.mentions].sort()))throw new ApiError(409,'REQUEST_CONFLICT','Use a new request for a different note.');return old;}
  const properties=[co.property_id,...(await c.query('SELECT property_id FROM lead_property_interests WHERE lead_id=$1',[co.lead_id])).rows.map(r=>r.property_id)];
  for(const member of [...input.mentions].sort())await eligibleOwner(c,a.organization.id,member,properties);
  const row=(await c.query('INSERT INTO conversation_notes(organization_id,conversation_id,author_id,request_key,body) VALUES($1,$2,$3,$4,$5) RETURNING *',[a.organization.id,id,a.id,input.requestKey,input.body])).rows[0];
  for(const member of input.mentions)await c.query('INSERT INTO conversation_mentions(note_id,membership_id) VALUES($1,$2)',[row.id,member]);
  await operationEvent(c,a.organization.id,co.property_id,co.lead_id,a.id,'inbox.note','Internal team note added.');return row;
 });}
 async acknowledge(user:AuthUser,digest:string,id:string,noteId:string){return this.staff(user,digest,async(c,a)=>{await this.access(c,a,id);await c.query('UPDATE conversation_mentions cm SET read_at=now() FROM conversation_notes n WHERE cm.note_id=n.id AND n.conversation_id=$1 AND n.id=$2 AND cm.membership_id=$3',[id,noteId,a.membershipId]);return{read:true};});}
 async timing(user:AuthUser,digest:string,id:string,input:z.infer<typeof timingSchema>){return this.staff(user,digest,async(c,a)=>{
  const co=await this.access(c,a,id,true);if(co.version!==input.version)throw stale();
  if(input.snoozedUntil&&(Date.parse(input.snoozedUntil)<=Date.now()||Date.parse(input.snoozedUntil)>Date.now()+30*86400000))throw new ApiError(400,'INVALID_DEADLINE','Choose a future snooze within 30 days.');
  if(input.responseDueAt&&Math.abs(Date.parse(input.responseDueAt)-Date.now())>30*86400000)throw new ApiError(400,'INVALID_DEADLINE','Choose a response deadline within 30 days of today.');
  await c.query('UPDATE conversations SET snoozed_until=$2,response_due_at=$3,version=version+1,updated_at=now() WHERE id=$1',[id,input.snoozedUntil,input.responseDueAt]);
  await operationEvent(c,a.organization.id,co.property_id,co.lead_id,a.id,'inbox.timing','Response deadline or snooze updated.');return{saved:true};
 });}
 async compose(user:AuthUser,digest:string,id:string,input:z.infer<typeof composerSchema>){return this.staff(user,digest,async(c,a)=>{
  await this.access(c,a,id,true);
  if(input.release){await c.query('DELETE FROM conversation_composers WHERE conversation_id=$1 AND membership_id=$2 AND client_id=$3',[id,a.membershipId,input.clientId]);return{released:true};}
  const row=(await c.query(`INSERT INTO conversation_composers(conversation_id,membership_id,client_id,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '75 seconds')
   ON CONFLICT(conversation_id) DO UPDATE SET membership_id=$2,client_id=$3,expires_at=clock_timestamp()+interval '75 seconds'
   WHERE conversation_composers.expires_at<=clock_timestamp() OR (conversation_composers.membership_id=$2 AND conversation_composers.client_id=$3) RETURNING expires_at`,[id,a.membershipId,input.clientId])).rows[0];
  if(!row)throw new ApiError(409,'REPLY_IN_PROGRESS','Another browser is replying. Wait until it finishes.');return{expiresAt:row.expires_at};
 });}
 async journey(user:AuthUser,digest:string,id:string){return this.staff(user,digest,async(c,a)=>{
  const co=await this.access(c,a,id);
  const tours=(await c.query('SELECT id,status,starts_at,ends_at,time_zone,location,managed_by_ootla FROM viewings WHERE organization_id=$1 AND lead_id=$2 AND property_id=$3 ORDER BY starts_at DESC,id LIMIT 10',[a.organization.id,co.lead_id,co.property_id])).rows;
  const applications=(await c.query('SELECT id,status,portal_enabled FROM applications WHERE organization_id=$1 AND lead_id=$2 AND property_id=$3 ORDER BY created_at DESC,id LIMIT 10',[a.organization.id,co.lead_id,co.property_id])).rows;
  return{tours,applications};
 });}
}
