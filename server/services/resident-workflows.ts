import type {z} from 'zod';
import type {renewalResponse,workConfirmation} from '../../shared/property-operations-contracts.js';
import {ResidentRequests} from './resident-requests.js';
import {PropertyOperations,fail,day} from './property-operations-base.js';
import type {ApplicantPrincipal} from './applicant-portal.js';
import {missing,stale} from './operations-access.js';
export class ResidentWorkflows extends ResidentRequests {
 private helper(){return new PropertyOperations(this.database,this.config);}
 async workspace(user:ApplicantPrincipal){return this.database.transaction(async c=>{
  const residents=await this.resident(c,user),ids=residents.map(r=>r.id);
  const offers=(await c.query("SELECT o.id,o.starts_on,o.ends_on,o.monthly_rent,o.respond_by,o.terms,o.status,o.response_note,o.version,t.currency,p.name AS property_name FROM renewal_offers o JOIN tenancy_plans t ON t.id=o.plan_id JOIN properties p ON p.id=t.property_id WHERE t.resident_id=ANY($1::uuid[]) AND o.status<>'draft' AND t.status<>'moved_out' ORDER BY o.created_at DESC LIMIT 100",[ids])).rows;
  const orders=(await c.query('SELECT w.id,w.request_id,w.status,w.appointment_start,w.appointment_end,w.completion_note,w.resident_confirmed_at,w.version,r.title FROM maintenance_work_orders w JOIN resident_requests r ON r.id=w.request_id WHERE r.resident_id=ANY($1::uuid[]) ORDER BY w.updated_at DESC LIMIT 100',[ids])).rows;
  return{offers,orders};
 });}
 async respond(user:ApplicantPrincipal,id:string,i:z.infer<typeof renewalResponse>){return this.database.transaction(async c=>{
  const raw=(await c.query('SELECT t.* FROM tenancy_plans t JOIN renewal_offers o ON o.plan_id=t.id WHERE o.id=$1 AND t.organization_id=$2',[id,user.organization.id])).rows[0];if(!raw)throw missing();await this.resident(c,user,raw.resident_id);
  const t=(await c.query('SELECT * FROM tenancy_plans WHERE id=$1 FOR UPDATE',[raw.id])).rows[0],h=this.helper();
  return h.receipt(c,user,'resident:renewal:'+id,i,async()=>{
   const o=(await c.query('SELECT * FROM renewal_offers WHERE id=$1 FOR UPDATE',[id])).rows[0];if(o.version!==i.version)throw stale();
   if(t.status!=='active'||o.status!=='offered'||day(o.respond_by)<day(new Date()))fail('This proposal is no longer open for a response. Contact your property team.');
   await c.query('UPDATE renewal_offers SET status=$2,response_note=$3,version=version+1,updated_at=now() WHERE id=$1',[id,i.response,i.note]);
   await c.query('UPDATE tenancy_plans SET next_action_on=CURRENT_DATE,version=version+1,updated_at=now() WHERE id=$1',[t.id]);
   await h.history(c,user,t,'renewal.resident_response',{offerId:id,response:i.response,note:i.note});return{saved:true};
  });
 });}
 async confirmWork(user:ApplicantPrincipal,id:string,i:z.infer<typeof workConfirmation>){return this.database.transaction(async c=>{
  const raw=(await c.query('SELECT r.resident_id FROM maintenance_work_orders w JOIN resident_requests r ON r.id=w.request_id WHERE w.id=$1 AND w.organization_id=$2',[id,user.organization.id])).rows[0];if(!raw)throw missing();await this.resident(c,user,raw.resident_id);
  const w=(await c.query('SELECT * FROM maintenance_work_orders WHERE id=$1 FOR UPDATE',[id])).rows[0],h=this.helper();
  return h.receipt(c,user,'resident:work:'+id,i,async()=>{
   if(w.version!==i.version)throw stale();if(w.status!=='completed'||w.resident_confirmed_at)fail('Respond after staff records new completion.');if(!i.confirmed&&!i.note)fail('Describe the issue that still needs attention.');
   await c.query("UPDATE maintenance_work_orders SET status=$2,resident_confirmed_at=CASE WHEN $3 THEN now() ELSE NULL END,version=version+1,updated_at=now() WHERE id=$1",[id,i.confirmed?'completed':'in_progress',i.confirmed]);
   const status=i.confirmed?'closed':'in_progress';await c.query('UPDATE resident_requests SET status=$2,version=version+1,updated_at=now() WHERE id=$1',[w.request_id,status]);
   await c.query('INSERT INTO resident_request_updates(request_id,actor_user_id,body,status) VALUES($1,$2,$3,$4)',[w.request_id,user.id,(i.confirmed?'Resident confirmed completion. ':'Resident requested further work. ')+i.note,status]);
   await h.history(c,user,w,'maintenance.resident_response',{confirmed:i.confirmed,note:i.note});return{saved:true};
  });
 });}
 async photos(user:ApplicantPrincipal,id:string){return this.database.transaction(async c=>{const raw=(await c.query('SELECT r.resident_id FROM maintenance_work_orders w JOIN resident_requests r ON r.id=w.request_id WHERE w.id=$1 AND w.organization_id=$2',[id,user.organization.id])).rows[0];if(!raw)throw missing();await this.resident(c,user,raw.resident_id);return{items:(await c.query('SELECT id,name FROM maintenance_photos WHERE work_order_id=$1 ORDER BY created_at,id',[id])).rows};});}
 async photo(user:ApplicantPrincipal,id:string,photoId:string){return this.database.transaction(async c=>{const raw=(await c.query('SELECT r.resident_id FROM maintenance_work_orders w JOIN resident_requests r ON r.id=w.request_id WHERE w.id=$1 AND w.organization_id=$2',[id,user.organization.id])).rows[0];if(!raw)throw missing();await this.resident(c,user,raw.resident_id);const p=(await c.query('SELECT name,media_type,content FROM maintenance_photos WHERE work_order_id=$1 AND id=$2',[id,photoId])).rows[0];if(!p)throw missing();return p;});}
}
