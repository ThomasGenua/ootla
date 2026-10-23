import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { ConnectorEntity } from '../../shared/connector-contracts.js';
import type { ConnectorAdapter, ConnectorEnvelope } from './adapter.js';

export const yardiDemoAdapter:ConnectorAdapter={
 key:'yardi_demo',name:'Yardi-style simulator',label:'Synthetic provider. No live Yardi connection.',
 capabilities:{properties:true,units:true,contacts:true,guestCards:true,availability:true,leases:false,residents:false,accounting:false,outbound:false},
 fieldOwnership:{property:['name','address','city','type'],unit:['label','bedrooms','status','monthlyRent','availabilitySource','lastVerifiedAt'],contact:['displayName','email','phone'],lead:[]},
 async poll(client,connectionId,after,through,limit){
  const rows=await client.query(`
   SELECT sequence::text,provider_event_id,entity_type,external_id,provider_version,payload
   FROM connector_demo_events WHERE connection_id=$1 AND sequence>$2::bigint AND sequence<=$3::bigint ORDER BY connector_demo_events.sequence LIMIT $4
  `,[connectionId,after,through,limit]);
  return rows.rows.map(row=>({sequence:row.sequence,providerEventId:row.provider_event_id,entityType:row.entity_type,externalId:row.external_id,providerVersion:row.provider_version,payload:row.payload} satisfies ConnectorEnvelope));
 }
};
export const demoIds={property:'SIM-PROPERTY-001',unit:'SIM-UNIT-101',contact:'SIM-CONTACT-001',lead:'SIM-GUEST-CARD-001'} as const;
export async function appendDemoEvent(client:PoolClient,organizationId:string,connectionId:string,entityType:ConnectorEntity,externalId:string,providerVersion:number,payload:Record<string,unknown>,providerEventId=randomUUID()):Promise<void>{
 await client.query(`INSERT INTO connector_demo_events(connection_id,organization_id,provider_event_id,entity_type,external_id,provider_version,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,[connectionId,organizationId,providerEventId,entityType,externalId,providerVersion,JSON.stringify(payload)]);
}
export async function seedDemoProvider(client:PoolClient,organizationId:string,connectionId:string):Promise<void>{
 const records:Array<{type:ConnectorEntity;id:string;payload:Record<string,unknown>}>= [
  {type:'property',id:demoIds.property,payload:{name:'Simulator Cedar Court',address:'12 Example Lane',city:'Lagos',type:'apartment'}},
  {type:'unit',id:demoIds.unit,payload:{propertyExternalId:demoIds.property,label:'101',bedrooms:2,status:'available',monthlyRent:1850}},
  {type:'contact',id:demoIds.contact,payload:{propertyExternalId:demoIds.property,displayName:'Taylor Brooks',email:'taylor.brooks@simulator.ootla.test',phone:'+234 555 0101'}},
  {type:'lead',id:demoIds.lead,payload:{propertyExternalId:demoIds.property,unitExternalId:demoIds.unit,contactExternalId:demoIds.contact}},
 ];
 await client.query('INSERT INTO connector_demo_state(connection_id,organization_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[connectionId,organizationId]);
 for(const record of records){
  const inserted=await client.query(`INSERT INTO connector_demo_records(connection_id,organization_id,entity_type,external_id,provider_version,payload) VALUES($1,$2,$3,$4,1,$5::jsonb) ON CONFLICT DO NOTHING RETURNING external_id`,[connectionId,organizationId,record.type,record.id,JSON.stringify(record.payload)]);
  if(inserted.rowCount)await appendDemoEvent(client,organizationId,connectionId,record.type,record.id,1,record.payload);
 }
}
