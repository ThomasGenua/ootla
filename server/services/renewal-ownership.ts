import type {PoolClient,QueryResultRow} from 'pg';
/** Publication of local terms never updates a provider lease or invents verified upstream approval. */
export async function renewalOwnership(c:PoolClient,organizationId:string,leaseId:string):Promise<{blocked:boolean;reason:string|null}>{
 const lease=(await c.query('SELECT status,source_system,source_owned_fields FROM leases WHERE organization_id=$1 AND id=$2 FOR SHARE',[organizationId,leaseId])).rows[0] as QueryResultRow|undefined;
 if(!lease)return{blocked:true,reason:'The canonical lease is unavailable.'};
 const settings=(await c.query('SELECT mode FROM organization_data_settings WHERE organization_id=$1 FOR SHARE',[organizationId])).rows[0];
 const mapped=Boolean((await c.query("SELECT id FROM external_record_mappings WHERE organization_id=$1 AND lease_id=$2 AND provider='yardi' FOR SHARE",[organizationId,leaseId])).rowCount);
 const blocked=lease.source_system==='yardi'||settings?.mode==='yardi_connected'||mapped||Array.isArray(lease.source_owned_fields)&&lease.source_owned_fields.length>0;
 return{blocked,reason:blocked?'Renewal terms are controlled by the configured property source. Documented provider renewal capability is not configured; local staff cannot replace that authority.':null};
}
