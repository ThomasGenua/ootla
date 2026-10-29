import type {z} from 'zod';
import type {turnoverSchema,waitlistSchema,waitlistAction,portfolioQuery} from '../../shared/property-operations-contracts.js';
import {PropertyOperations,fail,type Actor} from './property-operations-base.js';
import {leadScope,scopeArgs,propertyScope,eligibleOwner,stale} from './operations-access.js';
export const verifiedUnit=(u:string)=>`${u}.status='available' AND ${u}.availability_source IN ('staff_reported','import','yardi') AND ${u}.availability_verified_at BETWEEN now()-interval '7 days' AND now()`;
export class Vacancies extends PropertyOperations {
 async listUnits(u:Actor,d:string,q:z.infer<typeof portfolioQuery>){return this.staff(u,d,async(c,a)=>({items:(await c.query(`SELECT un.id,un.property_id,un.label,un.bedrooms,un.monthly_rent,un.status AS availability,un.availability_verified_at,p.name AS property_name,t.status AS turnover_status,t.expected_ready_on,count(*) OVER()::int AS total FROM units un JOIN properties p ON p.id=un.property_id LEFT JOIN unit_turnovers t ON t.unit_id=un.id WHERE ${propertyScope('un')} AND ($4::uuid IS NULL OR un.property_id=$4) AND strpos(lower(un.label||' '||p.name),lower($5))>0 ORDER BY t.expected_ready_on NULLS LAST,p.name,un.label,un.id LIMIT 25 OFFSET $6`,[...scopeArgs(a),q.propertyId??null,q.q,(q.page-1)*25])).rows,page:q.page}));}
 async detail(u:Actor,d:string,id:string){return this.staff(u,d,async(c,a)=>{
  const unit=await this.unit(c,a,id),turnover=(await c.query('SELECT * FROM unit_turnovers WHERE unit_id=$1',[id])).rows[0]??null;
  const waitlist=(await c.query(`SELECT w.*,ct.display_name,co.id AS conversation_id FROM unit_waitlist w JOIN leads l ON l.id=w.lead_id JOIN contacts ct ON ct.id=l.contact_id LEFT JOIN conversations co ON co.lead_id=l.id WHERE w.unit_id=$4 AND ${leadScope('w')} ORDER BY w.created_at,w.id LIMIT 100`,[...scopeArgs(a),id])).rows;
  return{unit,turnover,waitlist,canPrepare:Boolean((await c.query(`SELECT 1 FROM units un WHERE un.id=$1 AND ${verifiedUnit('un')} AND NOT EXISTS(SELECT 1 FROM unit_turnovers t WHERE t.unit_id=un.id AND t.status<>'ready')`,[id])).rowCount),history:turnover?await this.timeline(c,turnover.id):[]};
 });}
 async save(u:Actor,d:string,i:z.infer<typeof turnoverSchema>){return this.staff(u,d,async(c,a)=>{
  const unit=await this.unit(c,a,i.unitId);await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['turnover:'+unit.id]);
  return this.receipt(c,a,'turnover:save',i,async()=>{
   const old=(await c.query('SELECT * FROM unit_turnovers WHERE unit_id=$1 FOR UPDATE',[unit.id])).rows[0];if(old&&old.version!==i.version||!old&&i.version)throw stale();
   await eligibleOwner(c,a.organization.id,i.ownerMembershipId,[unit.property_id]);
   const status=!i.inspectionDone?'inspection':!i.repairsDone?'repairs':!i.cleaningDone?'cleaning':'ready';
   const row=(await c.query('INSERT INTO unit_turnovers(organization_id,property_id,unit_id,expected_ready_on,owner_membership_id,inspection_done,repairs_done,cleaning_done,notes,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(unit_id) DO UPDATE SET expected_ready_on=$4,owner_membership_id=$5,inspection_done=$6,repairs_done=$7,cleaning_done=$8,notes=$9,status=$10,version=unit_turnovers.version+1,updated_at=now() RETURNING *',[a.organization.id,unit.property_id,unit.id,i.expectedReadyOn,i.ownerMembershipId,i.inspectionDone,i.repairsDone,i.cleaningDone,i.notes,status])).rows[0];
   await this.history(c,a,row,'vacancy.updated',{...i,requestKey:undefined,status});return row;
  });
 });}
 async addWaitlist(u:Actor,d:string,i:z.infer<typeof waitlistSchema>){return this.staff(u,d,async(c,a)=>{
  const l=await this.lead(c,a,i.leadId),un=await this.unit(c,a,i.unitId);
  if(l.intent!=='leasing'||['leased','won','lost_closed'].includes(l.pipeline_stage))fail('Choose an active leasing prospect.');
  if(!(await c.query('SELECT 1 FROM lead_property_interests WHERE lead_id=$1 AND property_id=$2',[l.id,un.property_id])).rowCount)fail('Add this property to the prospect’s interests before shortlisting the unit.');
  return this.receipt(c,a,'waitlist:add',i,async()=>{
   const existing=(await c.query('SELECT * FROM unit_waitlist WHERE organization_id=$1 AND unit_id=$2 AND lead_id=$3',[a.organization.id,un.id,l.id])).rows[0];if(existing)return existing;
   const row=(await c.query('INSERT INTO unit_waitlist(organization_id,property_id,unit_id,lead_id,note) VALUES($1,$2,$3,$4,$5) RETURNING *',[a.organization.id,un.property_id,un.id,l.id,i.note])).rows[0];await this.history(c,a,row,'waitlist.added',{note:i.note});return row;
  });
 });}
 async waitAction(u:Actor,d:string,id:string,i:z.infer<typeof waitlistAction>){return this.staff(u,d,async(c,a)=>{
  const w=await this.scoped(c,a,'unit_waitlist',id);
  return this.receipt(c,a,'waitlist:'+id,i,async()=>{
   if(w.version!==i.version)throw stale();
   let result:Record<string,unknown>={saved:true},status=i.action==='close'?'closed':'waiting';
   if(i.action==='prepare'){
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['turnover:'+w.unit_id]);
    if(w.status!=='waiting')fail('Reopen this shortlist entry before preparing another follow-up.');
    const l=await this.lead(c,a,w.lead_id);if(['leased','won','lost_closed'].includes(l.pipeline_stage))fail('This prospect is no longer active.');
    const un=(await c.query(`SELECT un.*,p.name AS property_name FROM units un JOIN properties p ON p.id=un.property_id WHERE un.id=$1 AND ${verifiedUnit('un')} AND NOT EXISTS(SELECT 1 FROM unit_turnovers t WHERE t.unit_id=un.id AND t.status<>'ready') FOR SHARE OF un`,[w.unit_id])).rows[0];
    if(!un)fail('Verify current availability and finish the turnover before preparing this follow-up.');
    result=await this.draft(c,a,w.lead_id,i.requestKey,'An update on your unit shortlist',`Unit ${un.label} at ${un.property_name} is currently reported available. Please reply if you would like to discuss a viewing. Our team will reconfirm availability and your move-in date before making arrangements.`);status='drafted';
    await c.query('INSERT INTO property_message_context(message_id,waitlist_id,source_version) VALUES($1,$2,$3)',[result.draftId,id,w.version+1]);
   }
   await c.query('UPDATE unit_waitlist SET status=$2,draft_id=COALESCE($3,draft_id),version=version+1 WHERE id=$1',[id,status,result.draftId??null]);await this.history(c,a,w,'waitlist.'+i.action,{status});return result;
  });
 });}
}
