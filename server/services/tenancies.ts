import type {z} from 'zod';
import type {tenancySchema,renewalSchema,renewalAction,moveOutSchema,followupSchema,portfolioQuery} from '../../shared/property-operations-contracts.js';
import {PropertyOperations,fail,day,type Actor} from './property-operations-base.js';
import {leadScope,scopeArgs,eligibleOwner,stale,missing} from './operations-access.js';
export class Tenancies extends PropertyOperations {
 async residents(u:Actor,d:string,q:z.infer<typeof portfolioQuery>){return this.staff(u,d,async(c,a)=>({items:(await c.query(`SELECT r.id,r.property_id,ct.display_name,p.name AS property_name,un.label AS unit_label FROM resident_relationships r JOIN contacts ct ON ct.id=r.contact_id JOIN properties p ON p.id=r.property_id LEFT JOIN units un ON un.id=r.unit_id WHERE ${leadScope('r')} AND r.status='active' AND ($4::uuid IS NULL OR r.property_id=$4) AND strpos(lower(ct.display_name),lower($5))>0 ORDER BY lower(ct.display_name),r.id LIMIT 50 OFFSET $6`,[...scopeArgs(a),q.propertyId??null,q.q,(q.page-1)*50])).rows}));}
 async listPlans(u:Actor,d:string,q:z.infer<typeof portfolioQuery>){return this.staff(u,d,async(c,a)=>({items:(await c.query(`SELECT t.*,ct.display_name,p.name AS property_name,un.label AS unit_label,count(*) OVER()::int AS total FROM tenancy_plans t JOIN resident_relationships rr ON rr.id=t.resident_id JOIN contacts ct ON ct.id=rr.contact_id JOIN properties p ON p.id=t.property_id LEFT JOIN units un ON un.id=rr.unit_id WHERE ${leadScope('t')} AND ($4::uuid IS NULL OR t.property_id=$4) AND strpos(lower(ct.display_name),lower($5))>0 ORDER BY (t.status='moved_out'),t.next_action_on,t.id LIMIT 25 OFFSET $6`,[...scopeArgs(a),q.propertyId??null,q.q,(q.page-1)*25])).rows,page:q.page}));}
 async create(u:Actor,d:string,i:z.infer<typeof tenancySchema>){return this.staff(u,d,async(c,a)=>{
  const r=await this.scoped(c,a,'resident_relationships',i.residentId);
  return this.receipt(c,a,'tenancy:create',i,async()=>{
   if(r.status!=='active')fail('Create tenancy tracking for an active resident.');
   const prior=(await c.query('SELECT id FROM tenancy_plans WHERE resident_id=$1',[r.id])).rows[0];if(prior)return prior;
   await eligibleOwner(c,a.organization.id,i.ownerMembershipId,[r.property_id,...(await c.query('SELECT property_id FROM lead_property_interests WHERE lead_id=$1',[r.lead_id])).rows.map(x=>x.property_id)]);
   const days=[...i.followupDays].sort((a,b)=>b-a);
   const row=(await c.query('INSERT INTO tenancy_plans(organization_id,property_id,lead_id,resident_id,lease_start,lease_end,monthly_rent,currency,followup_days,next_action_on,owner_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$6::date-$10::integer,$11) RETURNING *',[a.organization.id,r.property_id,r.lead_id,r.id,i.leaseStart,i.leaseEnd,i.monthlyRent,i.currency,days,days[0],i.ownerMembershipId])).rows[0];
   await this.history(c,a,row,'tenancy.created',{leaseStart:i.leaseStart,leaseEnd:i.leaseEnd,monthlyRent:i.monthlyRent,currency:i.currency,source:'staff_recorded'});return row;
  });
 });}
 async detail(u:Actor,d:string,id:string){return this.staff(u,d,async(c,a)=>{const plan=await this.scoped(c,a,'tenancy_plans',id);return{plan,resident:(await c.query('SELECT ct.display_name,rr.unit_id,un.label AS unit_label FROM resident_relationships rr JOIN contacts ct ON ct.id=rr.contact_id LEFT JOIN units un ON un.id=rr.unit_id WHERE rr.id=$1',[plan.resident_id])).rows[0],offers:(await c.query('SELECT * FROM renewal_offers WHERE plan_id=$1 ORDER BY created_at DESC,id LIMIT 50',[id])).rows,history:await this.timeline(c,id)};});}
 async createOffer(u:Actor,d:string,id:string,i:z.infer<typeof renewalSchema>){return this.staff(u,d,async(c,a)=>{
  const t=await this.scoped(c,a,'tenancy_plans',id);
  return this.receipt(c,a,'renewal:create:'+id,i,async()=>{
   if(t.status!=='active')fail('Resolve the move-out notice before preparing a renewal.');
   if((await c.query("SELECT id FROM renewal_offers WHERE plan_id=$1 AND status IN ('draft','offered','accepted')",[id])).rowCount)fail('Withdraw or record the current offer before preparing another.');
   const next=(await c.query('SELECT ($1::date+1)::text AS value',[t.lease_end])).rows[0].value;
   if(i.startsOn!==next||i.respondBy<day(new Date()))fail('Start the renewal the day after the current term, with a future response date.');
   const offer=(await c.query('INSERT INTO renewal_offers(plan_id,starts_on,ends_on,monthly_rent,respond_by,terms) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[id,i.startsOn,i.endsOn,i.monthlyRent,i.respondBy,i.terms])).rows[0];
   await this.history(c,a,t,'renewal.prepared',{offerId:offer.id,...i,requestKey:undefined});return offer;
  });
 });}
 async offerAction(u:Actor,d:string,planId:string,id:string,i:z.infer<typeof renewalAction>){return this.staff(u,d,async(c,a)=>{
  const t=await this.scoped(c,a,'tenancy_plans',planId);
  return this.receipt(c,a,'renewal:'+id,i,async()=>{
   const o=(await c.query('SELECT * FROM renewal_offers WHERE id=$1 AND plan_id=$2 FOR UPDATE',[id,planId])).rows[0];if(!o)throw missing();if(o.version!==i.version)throw stale();
   let result:Record<string,unknown>={id};
   if(i.action==='offer'){
    if(t.status!=='active'||o.status!=='draft'||day(o.respond_by)<day(new Date()))fail('Only a current draft can be offered to the resident.');
    await c.query("UPDATE renewal_offers SET status='offered',version=version+1,updated_at=now() WHERE id=$1",[id]);
    if(t.lead_id)result={...result,...await this.draft(c,a,t.lead_id,i.requestKey,'Your renewal proposal',`Please review your renewal proposal in your resident workspace: ${this.config.appUrl}/resident\nProposed term: ${day(o.starts_on)} to ${day(o.ends_on)}. Monthly rent: ${t.currency} ${o.monthly_rent}. Please respond by ${day(o.respond_by)}. Your response records your preference; staff will confirm the signed renewal separately.`)};
    if(result.draftId)await c.query('INSERT INTO property_message_context(message_id,renewal_offer_id,source_version) VALUES($1,$2,$3)',[result.draftId,id,o.version+1]);
   }else if(i.action==='withdraw'){
    if(!['draft','offered','accepted'].includes(o.status))fail('This offer is already final.');
    await c.query("UPDATE renewal_offers SET status='withdrawn',version=version+1,updated_at=now() WHERE id=$1",[id]);
   }else{
    if(o.status!=='accepted'||t.status!=='active'||!i.evidence)fail('An accepted offer and a signed-renewal evidence reference are required.');
    await c.query("UPDATE renewal_offers SET status='recorded',evidence_reference=$2,version=version+1,updated_at=now() WHERE id=$1",[id,i.evidence]);
    await c.query('UPDATE tenancy_plans SET lease_start=$2,lease_end=$3,monthly_rent=$4,next_action_on=$3::date-(SELECT max(x) FROM unnest(followup_days) x),version=version+1,updated_at=now() WHERE id=$1',[planId,o.starts_on,o.ends_on,o.monthly_rent]);
   }
   await this.history(c,a,t,'renewal.'+i.action,{offerId:id,evidence:i.evidence,previousTerm:{start:day(t.lease_start),end:day(t.lease_end),rent:t.monthly_rent},source:'staff_recorded'});return result;
  });
 });}
 async followup(u:Actor,d:string,id:string,i:z.infer<typeof followupSchema>){return this.staff(u,d,async(c,a)=>{const t=await this.scoped(c,a,'tenancy_plans',id);return this.receipt(c,a,'tenancy:followup:'+id,i,async()=>{if(t.version!==i.version)throw stale();if(t.status==='moved_out')fail('This tenancy has ended.');if(i.nextActionOn<day(new Date()))fail('Choose today or a future follow-up date.');await c.query('UPDATE tenancy_plans SET next_action_on=$2,version=version+1,updated_at=now() WHERE id=$1',[id,i.nextActionOn]);await this.history(c,a,t,'tenancy.followup',{nextActionOn:i.nextActionOn,note:i.note});return{saved:true};});});}
 async moveOut(u:Actor,d:string,id:string,i:z.infer<typeof moveOutSchema>){return this.staff(u,d,async(c,a)=>{
  const t=await this.scoped(c,a,'tenancy_plans',id);
  return this.receipt(c,a,'tenancy:move-out:'+id,i,async()=>{
   if(t.version!==i.version)throw stale();if(t.status==='moved_out')fail('This move-out has already been recorded.');
   const rr=(await c.query('SELECT * FROM resident_relationships WHERE id=$1 FOR UPDATE',[t.resident_id])).rows[0];
   if(i.action==='complete'){
    if(t.status!=='notice_received'||!t.move_out_on||day(t.move_out_on)>day(new Date()))fail('Complete a recorded move-out on or after its planned date.');
    await c.query("UPDATE tenancy_plans SET status='moved_out',move_out_note=$2,version=version+1,updated_at=now() WHERE id=$1",[id,i.note]);
    await c.query("UPDATE resident_relationships SET status='ended' WHERE id=$1",[rr.id]);
    if(rr.unit_id){await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['turnover:'+rr.unit_id]);await c.query("INSERT INTO unit_turnovers(organization_id,property_id,unit_id,expected_ready_on,notes) VALUES($1,$2,$3,CURRENT_DATE,'Inspect after recorded move-out.') ON CONFLICT(unit_id) DO UPDATE SET inspection_done=false,repairs_done=false,cleaning_done=false,status='inspection',expected_ready_on=CURRENT_DATE,notes='Inspect after recorded move-out.',version=unit_turnovers.version+1,updated_at=now()",[a.organization.id,t.property_id,rr.unit_id]);}
   }else{
    await c.query('UPDATE tenancy_plans SET status=$2,move_out_on=$3,move_out_note=$4,next_action_on=COALESCE($3::date,next_action_on),version=version+1,updated_at=now() WHERE id=$1',[id,i.action==='notice'?'notice_received':'active',i.action==='notice'?i.moveOutOn:null,i.note]);
    if(i.action==='notice')await c.query("UPDATE renewal_offers SET status='withdrawn',version=version+1,updated_at=now() WHERE plan_id=$1 AND status IN ('draft','offered','accepted')",[id]);
   }
   await this.history(c,a,t,'tenancy.move_out_'+i.action,{moveOutOn:i.moveOutOn??day(t.move_out_on),note:i.note});return{saved:true};
  });
 });}
}
