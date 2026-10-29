import type {PoolClient} from 'pg';
import {ApiError} from '../http/errors.js';
import {verifiedUnit} from './vacancies.js';

// Inbox already holds the lead lock, shared by renewal and shortlist mutations.
export async function assertPropertyDraftCurrent(c:PoolClient,messageId:string){
 const context=(await c.query('SELECT * FROM property_message_context WHERE message_id=$1',[messageId])).rows[0];
 if(!context)return;
 const changed=()=>{throw new ApiError(409,'PROPERTY_WORKFLOW_CHANGED','This proposal or availability changed after the draft was prepared. Review the current record and prepare a new reply.');};
 if(context.renewal_offer_id){
  const current=(await c.query("SELECT o.id FROM renewal_offers o JOIN tenancy_plans t ON t.id=o.plan_id JOIN resident_relationships r ON r.id=t.resident_id WHERE o.id=$1 AND o.version=$2 AND o.status='offered' AND o.respond_by>=CURRENT_DATE AND t.status='active' AND r.status='active' FOR SHARE OF o,t,r",[context.renewal_offer_id,context.source_version])).rows[0];
  if(!current)changed();
 }else{
  const w=(await c.query('SELECT * FROM unit_waitlist WHERE id=$1 FOR SHARE',[context.waitlist_id])).rows[0];
  if(!w||w.status!=='drafted'||w.version!==context.source_version||w.draft_id!==messageId)changed();
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['turnover:'+w.unit_id]);
  const current=(await c.query(`SELECT un.id FROM units un JOIN leads l ON l.id=$2 WHERE un.id=$1 AND ${verifiedUnit('un')} AND l.intent='leasing' AND l.pipeline_stage NOT IN ('leased','won','lost_closed') AND EXISTS(SELECT 1 FROM lead_property_interests i WHERE i.lead_id=l.id AND i.property_id=un.property_id) AND NOT EXISTS(SELECT 1 FROM unit_turnovers t WHERE t.unit_id=un.id AND t.status<>'ready') FOR SHARE OF un`,[w.unit_id,w.lead_id])).rows[0];
  if(!current)changed();
 }
}
