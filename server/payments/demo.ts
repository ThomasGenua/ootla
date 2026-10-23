import type {PaymentStatusAdapter} from './adapter.js';
/** Isolated source read only. Confirmation events live in separate synthetic provider tables. */
export const demoPaymentAdapter:PaymentStatusAdapter={
 key:'ootla_payment_demo',mode:'demo',
 async read(c,organizationId,referenceId){
  const r=(await c.query('SELECT * FROM payment_demo_provider_records WHERE organization_id=$1 AND payment_reference_id=$2 FOR SHARE',[organizationId,referenceId])).rows[0];
  if(!r)return null;
  if(r.status==='confirmed'&&!(await c.query("SELECT id FROM payment_demo_provider_events WHERE organization_id=$1 AND payment_reference_id=$2 AND provider_record_id=$3 AND event_id=$4 AND provider_version=$5 AND status='confirmed'",[organizationId,referenceId,r.id,r.latest_event_id,r.version])).rowCount)return null;
  return{recordId:r.id,organizationId:r.organization_id,referenceId:r.payment_reference_id,status:r.status,version:r.version,eventId:r.latest_event_id};
 }
};
