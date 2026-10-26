import type {AskOotlaCapability} from './ask-ootla.js';
import {MaintenanceService} from './maintenance.js';
import {maintenanceListSchema} from '../../shared/resident-contracts.js';
import {staffMaintenanceAccess} from './maintenance-access.js';
export const residentOperationsAskCapability:AskOotlaCapability={
 name:'resident_operations',
 matches:message=>!/\b(?:create|add|save|make)\b/i.test(message)&&/\b(?:maintenance|service requests?|broken fan|bathroom fan|renewal|resident requests?)\b/i.test(message),
 async run({database,config,actor,sessionDigest,context,message}){
  const service=new MaintenanceService(database,config),now=new Date().toISOString();
  if(context.maintenanceRequestId){
   const d=await service.detail(actor,sessionDigest,context.maintenanceRequestId),r=d.request;
   let terms='';if(/renewal|lease.*dates/i.test(message))terms=await database.transaction(async c=>{
    const {request}=await staffMaintenanceAccess(c,config,actor,sessionDigest,r.id);
    const row=(await c.query("SELECT to_char(ls.starts_on,'YYYY-MM-DD') AS starts_on,to_char(ls.ends_on,'YYYY-MM-DD') AS ends_on,renew.terms,renew.source,renew.approved_at FROM leases ls LEFT JOIN LATERAL(SELECT terms,source,approved_at FROM resident_renewal_offers ro WHERE ro.organization_id=ls.organization_id AND ro.relationship_id=$3 AND ro.active AND (ro.valid_until IS NULL OR ro.valid_until>clock_timestamp()) ORDER BY ro.approved_at DESC,ro.id DESC LIMIT 1) renew ON true WHERE ls.id=$1 AND ls.organization_id=$2",[request.lease_id,actor.organization.id,r.relationshipId])).rows[0];
    return row?' Lease dates '+row.starts_on+' to '+row.ends_on+'. '+(row.terms?'Approved renewal terms ('+row.source+'): '+row.terms:'No current approved renewal offer is recorded. Staff must review next steps.'):'No permitted lease dates are available.';
   });
   return{status:'completed',mode:'simulated',body:r.location+': '+r.description+' Status '+r.status+'. '+(r.owner?'Assigned to '+r.owner.name+'.':'Awaiting staff assignment.')+(r.dueAt?' Staff target '+r.dueAt+'.':'')+' Resident access preference: '+r.accessPreferences+'. '+(r.appointmentAt?'Confirmed appointment '+r.appointmentAt+'; '+r.appointmentConfirmation:'No appointment is confirmed.')+' '+r.sourceNotice+terms+' You can propose a native follow-up task; confirmation is required before saving.',sources:[{id:'maintenance:'+r.id,kind:'maintenance',title:r.location,url:'/admin/maintenance?request='+r.id,excerpt:'Current authorized request; a preferred access window does not confirm a technician visit.',verifiedAt:r.updatedAt,simulated:config.demoMode}]};
  }
  const d=await service.list(actor,sessionDigest,maintenanceListSchema.parse({propertyId:context.propertyId,status:'unresolved',pageSize:10,.../unassigned/i.test(message)?{unassigned:'true'}:{}}));
  const open=d.items.filter(r=>!['resolved','closed'].includes(r.status));
  return{status:'completed',mode:'simulated',body:'Observed '+now+'. '+d.counts.open+' unresolved requests; '+d.counts.unassigned+' unassigned; '+d.counts.overdue+' overdue in this authorized scope. '+open.map(r=>r.location+' — '+r.status+(r.owner?' ('+r.owner.name+')':' (unassigned)')).join('; ')+'. Open a request to inspect resident access preferences, approved renewal information or create a follow-up. No provider dispatch or staff assignment was made by this summary.',sources:open.map(r=>({id:'maintenance:'+r.id,kind:'maintenance',title:r.location,url:'/admin/maintenance?request='+r.id,excerpt:r.status+'; '+r.sourceNotice,verifiedAt:r.updatedAt,simulated:config.demoMode}))};
 }
};
