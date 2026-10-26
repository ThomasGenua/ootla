import type {PoolClient} from 'pg';
/** No registered adapter currently implements documented maintenance writes. Local saves remain real. */
export async function maintenanceSourceState(c:PoolClient,organizationId:string):Promise<{state:'local'|'awaiting_configuration';notice:string}>{
 const mode=(await c.query('SELECT mode FROM organization_data_settings WHERE organization_id=$1',[organizationId])).rows[0]?.mode??'standalone';
 if(mode==='standalone')return{state:'local',notice:'Saved in Ootla. Authorized staff manage this standalone request; no external dispatch has been requested.'};
 const connection=(await c.query("SELECT provider,state,last_error FROM connector_connections WHERE organization_id=$1 ORDER BY updated_at DESC LIMIT 1",[organizationId])).rows[0];
 return{state:'awaiting_configuration',notice:'Saved locally in Ootla; awaiting a documented, configured Yardi maintenance-write capability. '+(connection?.state==='degraded'?'The configured connector is degraded. ':connection?'The '+connection.state+' connector does not provide verified maintenance writes. ':'No provider connection is configured. ')+'Nothing has been sent to Yardi and no technician dispatch is confirmed.'};
}
