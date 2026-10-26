import type {PoolClient} from 'pg';
export function isNativeWebsiteChat(row:{mode?:unknown;origin?:unknown}):boolean{return row.mode==='native'&&row.origin==='website';}
/** A queued staff reply is re-authorized against its actual saved author, never the public visitor. */
export async function nativeStaffReplyAuthorAllowed(c:PoolClient,organizationId:string,propertyId:string,leadId:string,authorUserId:string|null):Promise<boolean>{
 if(!authorUserId)return false;
 const member=(await c.query("SELECT m.id,m.role FROM organization_memberships m JOIN users u ON u.id=m.user_id AND u.active AND u.account_kind='staff' WHERE m.organization_id=$1 AND m.user_id=$2 AND m.active AND m.account_kind='staff' AND EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.role_key=m.role AND rp.permission='leasing.manage') FOR SHARE OF m,u",[organizationId,authorUserId])).rows[0];
 if(!member)return false;if(member.role==='organization_admin')return true;
 const lead=(await c.query('SELECT id FROM leads WHERE organization_id=$1 AND id=$2 FOR SHARE',[organizationId,leadId])).rows[0];if(!lead)return false;
 const interests=(await c.query('SELECT property_id FROM lead_property_interests WHERE organization_id=$1 AND lead_id=$2',[organizationId,leadId])).rows;
 const required=[...new Set([propertyId,...interests.map(r=>String(r.property_id))])];
 const granted=(await c.query('SELECT property_id FROM property_access_assignments WHERE organization_id=$1 AND membership_id=$2 AND property_id=ANY($3::uuid[]) FOR SHARE',[organizationId,member.id,required])).rows;
 const ids=new Set(granted.map(r=>String(r.property_id)));return required.every(id=>ids.has(id));
}
