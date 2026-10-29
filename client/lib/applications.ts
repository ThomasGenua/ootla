import { api, ApiError, type AuthUser } from './api';
import {productError} from './product-copy';
import type { PortalApplication, StaffApplicationWorkspace, StaffApplications, IssuedApplicationInvitation } from '../../shared/applicant-contracts';
import type { LeadDirectory } from '../../shared/lead-contracts';
import type { ContactRecord, Paginated } from '../../shared/property-contracts';
import { foundationApi } from './property-foundation';
import type { ScreeningWorkspace } from '../../shared/screening-contracts';
import { initializeScreeningWorkspace } from './screening';
import type { PaymentWorkspace,PaymentDestinations } from '../../shared/payment-contracts';
import { initializePaymentWorkspace } from './payments';
import type { LeaseWorkflowWorkspace } from '../../shared/lease-workflow-contracts';
import { initializeLeaseWorkflow } from './lease-workflow';
export type ApplicationsWorkspace=
 |{kind:'restricted';message:string}
 |{kind:'directory';directory:StaffApplications}
 |{kind:'create';leads:LeadDirectory}
 |{kind:'detail';detail:StaffApplicationWorkspace;contacts:Paginated<ContactRecord>|null;screening:ScreeningWorkspace;payment:PaymentWorkspace;destinations:PaymentDestinations|null;lease:LeaseWorkflowWorkspace}
 |{kind:'preview';preview:PortalApplication};
export async function loadApplicationsWorkspace(query:URLSearchParams,signal:AbortSignal):Promise<ApplicationsWorkspace>{
 try{
  const id=query.get('application');
  if(id){
   if(query.get('preview')==='1')return{kind:'preview',preview:await api<PortalApplication>('/api/applications/'+encodeURIComponent(id)+'/preview',{signal})};
   const detail=await api<StaffApplicationWorkspace>('/api/applications/'+encodeURIComponent(id),{signal});
   const contacts=detail.application.coApplicantsEnabled&&query.get('participants')==='add'?await api<Paginated<ContactRecord>>(foundationApi+'/contacts?'+new URLSearchParams({propertyId:detail.application.property.id,q:query.get('contactSearch')??'',page:query.get('contactPage')??'1',pageSize:query.get('contactPageSize')??'20'}),{signal}):null;
   const [screening,payment,lease]=await Promise.all([api<ScreeningWorkspace>('/api/application-journey/'+encodeURIComponent(id)+'/screening',{signal}),api<PaymentWorkspace>('/api/application-payments/'+encodeURIComponent(id),{signal}),api<LeaseWorkflowWorkspace>('/api/application-leases/'+encodeURIComponent(id),{signal})]);
   const destinations=payment.access.canConfigure?await api<PaymentDestinations>('/api/application-payments/destinations',{signal}):null;
   return{kind:'detail',detail,contacts,screening,payment,destinations,lease};
  }
  if(query.get('view')==='new')return{kind:'create',leads:await api<LeadDirectory>('/api/leads?'+new URLSearchParams({intent:'leasing',q:query.get('leadSearch')??'',page:query.get('leadPage')??'1',pageSize:query.get('leadPageSize')??'20'}),{signal})};
  const params=new URLSearchParams();for(const key of ['q','status','page','pageSize'])if(query.has(key))params.set(key,query.get(key)!);
  return{kind:'directory',directory:await api<StaffApplications>('/api/applications/list?'+params,{signal})};
 }catch(issue){if(issue instanceof ApiError&&issue.status===403)return{kind:'restricted',message:productError(issue)};throw issue;}
}
const value=(data:FormData,key:string):string=>String(data.get(key)??'').trim();
function displayError(form:HTMLElement,issue:unknown):void{const error=form.querySelector<HTMLElement>('[data-application-error]')??document.querySelector<HTMLElement>('[data-application-global-error]');if(error){error.textContent=productError(issue);error.tabIndex=-1;error.focus({preventScroll:true});}}
export function initializeApplicationsWorkspace(signal:AbortSignal,navigate:(path:string,replace?:boolean,focusSelector?:string)=>void,user:AuthUser):void{
 const workspace=document.querySelector<HTMLElement>('[data-applications-workspace]');if(!workspace)return;
 initializeScreeningWorkspace(signal,navigate);
 initializePaymentWorkspace(signal,navigate);
 initializeLeaseWorkflow(signal,navigate);
 workspace.addEventListener('click',async event=>{
  if(!(event.target instanceof Element))return;
  if(event.target.closest('[data-application-add-checklist]')){
   const list=workspace.querySelector<HTMLElement>('[data-application-checklist-rows]');if(!list||list.children.length>=10)return;
   const template=workspace.querySelector<HTMLTemplateElement>('[data-application-checklist-template]');if(!template)return;
   const fragment=template.content.cloneNode(true)as DocumentFragment,index=crypto.randomUUID();fragment.querySelectorAll<HTMLElement>('[id],[for]').forEach(element=>{if(element.id)element.id=element.id.replace('TEMPLATE',index);if(element.hasAttribute('for'))element.setAttribute('for',element.getAttribute('for')!.replace('TEMPLATE',index));});list.append(fragment);return;
  }
  const remove=event.target.closest('[data-application-remove-checklist]');if(remove){const row=remove.closest('[data-application-checklist-row]'),list=row?.parentElement;if(row&&list&&list.children.length>1)row.remove();return;}
  if(event.target.closest('[data-application-copy-invite]')){const input=workspace.querySelector<HTMLInputElement>('[data-application-invite-link]'),status=workspace.querySelector<HTMLElement>('[data-application-invite-status]');if(!input)return;input.select();try{await navigator.clipboard.writeText(input.value);if(status)status.textContent='Invitation copied. Share it directly with the intended applicant.';}catch{if(status)status.textContent='Select and copy this private invitation using your keyboard.';}}
 },{signal});
 workspace.addEventListener('submit',async event=>{
  const form=event.target;if(!(form instanceof HTMLFormElement))return;
  if(form.hasAttribute('data-application-filter')){
   event.preventDefault();const data=new FormData(form),query=new URLSearchParams();for(const[key,item]of data)if(typeof item==='string'&&item.trim())query.set(key,item.trim());navigate('/admin/applications?'+query,false,'[data-applications-results]');return;
  }
  if(!form.hasAttribute('data-application-form'))return;event.preventDefault();if(!form.reportValidity()||!user.permissions.includes('leasing.manage'))return;
  const button=form.querySelector<HTMLButtonElement>('button[type=submit]');if(button?.disabled)return;if(button)button.disabled=true;form.setAttribute('aria-busy','true');
  const error=form.querySelector<HTMLElement>('[data-application-error]');if(error)error.textContent='';
  const action=form.dataset.applicationForm,id=workspace.dataset.applicationId,base='/api/applications'+(id?'/'+encodeURIComponent(id):''),data=new FormData(form);
  try{
   let result:unknown;
   if(action==='create')result=await api('/api/applications',{method:'POST',body:JSON.stringify({leadId:value(data,'leadId')}),signal});
   else if(action==='invite'){result=await api<IssuedApplicationInvitation>(base+'/invitations',{method:'POST',body:JSON.stringify({participantId:value(data,'participantId'),expiresInHours:Number(value(data,'expiresInHours'))}),signal});if(!signal.aborted)showIssuedInvitation(workspace,result as IssuedApplicationInvitation);return;}
   else if(action==='participant_revoke')result=await api(base+'/participants/'+encodeURIComponent(form.dataset.participantId!)+'/revoke',{method:'POST',body:'{}',signal});
   else if(action==='revoke')result=await api(base+'/invitations/'+encodeURIComponent(form.dataset.invitationId!),{method:'DELETE',signal});
   else if(action==='settings'){
    const checklist=[...form.querySelectorAll<HTMLElement>('[data-application-checklist-row]')].map(row=>({...(row.dataset.checklistId?{id:row.dataset.checklistId}:{}),label:row.querySelector<HTMLInputElement>('[data-checklist-label]')!.value.trim(),required:row.querySelector<HTMLInputElement>('[data-checklist-required]')!.checked}));
    result=await api(base+'/settings',{method:'PUT',body:JSON.stringify({version:Number(workspace.dataset.applicationVersion),coApplicantsEnabled:data.get('coApplicantsEnabled')==='on',checklist}),signal});
   }else if(action==='participant')result=await api(base+'/participants',{method:'POST',body:JSON.stringify({contactId:value(data,'contactId'),email:value(data,'email')}),signal});
   else return;
   if(!signal.aborted){
    const created=result as{application?:{id?:string};id?:string};const applicationId=id??created.application?.id??created.id;
    if(!applicationId)throw new Error('Application saved; reopen the Applications list to continue.');
    navigate('/admin/applications?'+new URLSearchParams({application:applicationId,saved:action!}),true,'[data-application-success]');
   }
  }catch(issue){if(!signal.aborted)displayError(form,issue);}
  finally{if(!signal.aborted){if(button)button.disabled=false;form.removeAttribute('aria-busy');}}
 },{signal});
}
function showIssuedInvitation(workspace:HTMLElement,result:IssuedApplicationInvitation):void{
 const url=new URL(result.url,location.origin);
 if(url.origin!==location.origin||url.pathname!=='/applicant/invite'||url.search||!/^#token=[a-f0-9]{64}$/.test(url.hash))throw new Error('The invitation was created, but its URL could not be validated. Request a replacement.');
 const host=workspace.querySelector<HTMLElement>('[data-application-issued]'),input=host?.querySelector<HTMLInputElement>('[data-application-invite-link]'),status=host?.querySelector<HTMLElement>('[data-application-invite-status]');if(!host||!input)return;
 input.value=url.href;if(status)status.textContent='Expires '+new Date(result.expiresAt).toLocaleString()+'. Copy this private link now; it is shown only once. No email or text has been sent.';
 host.hidden=false;host.tabIndex=-1;host.focus();
}
