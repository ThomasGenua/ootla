import {propertyDocumentQuerySchema,propertyDocumentReviewSchema} from '../../shared/property-document-contracts';
import type {PropertyDocument} from '../../shared/property-document-contracts';
import {api,ApiError,errorMessage} from './api';
import {nameFormControls} from './form-labels';
import type {OrganizationAdminSettings,OrganizationAdminOptions,OrganizationAdminMemberDirectory,OrganizationAdminMember,OrganizationAdminKnowledge,OrganizationLeadRoutingRule} from '../../shared/organization-admin-contracts';
import {organizationAdminPageSchema,organizationKnowledgeQuerySchema,organizationLeadRoutingQuerySchema,organizationSettingsSchema,organizationAiPolicySchema,organizationStaffCreateSchema,organizationGroupSchema,organizationPropertyGroupSchema,organizationKnowledgeSchema,organizationLeadRoutingSchema} from '../../shared/organization-admin-contracts';
import {retentionCategories,retentionUpdateSchema,retentionRunSchema} from '../../shared/operational-contracts';
import type {RetentionSnapshot,RetentionPreview,RetentionResult} from '../../shared/operational-contracts';
import type {Paginated} from '../../shared/property-contracts';
import type {OrganizationWorkspace} from '../pages/organization-admin';
import {organizationTabs,type OrganizationTab} from '../pages/organization-navigation';
import {retentionPanel} from '../pages/operations';
type Navigate=(path:string,replace?:boolean,focusSelector?:string)=>void;
const base='/api/organization-admin';
const encode=(value:string)=>encodeURIComponent(value);
function params(raw:Record<string,unknown>,schema:{safeParse:(value:unknown)=>{success:boolean;data?:unknown}}):string{
 const parsed=schema.safeParse(raw);if(!parsed.success)throw new Error('Choose a valid organization scope, search and page.');
 return new URLSearchParams(Object.entries(parsed.data as Record<string,unknown>).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)])).toString();
}
export async function loadOrganizationWorkspace(q:URLSearchParams,signal:AbortSignal):Promise<OrganizationWorkspace>{
 try{
  const settings=await api<OrganizationAdminSettings>(base+'/settings',{signal}),tab:OrganizationTab=organizationTabs.some(item=>item[0]===q.get('tab'))?q.get('tab') as OrganizationTab:'profile';
  const optionQuery=new URLSearchParams({q:q.get('optionsSearch')??'',page:q.get('optionsPage')??'1',pageSize:'25'});if(q.get('memberId'))optionQuery.set('membershipId',q.get('memberId')!);if(q.get('propertyId'))optionQuery.set('propertyId',q.get('propertyId')!);
  const options=await api<OrganizationAdminOptions>(base+'/options?'+optionQuery,{signal});
  let members:OrganizationAdminMemberDirectory|null=null,member:OrganizationAdminMember|null=null,grants:Paginated<{id:string;name:string;assignedAt:string}>|null=null,knowledge:Paginated<OrganizationAdminKnowledge>|null=null,routing:Paginated<OrganizationLeadRoutingRule>|null=null,retention:RetentionSnapshot|null=null,documents:Paginated<PropertyDocument>|null=null,document:PropertyDocument|null=null;
  if(tab==='members'){
   members=await api<OrganizationAdminMemberDirectory>(base+'/members?'+params({q:q.get('q')??'',page:q.get('page')??'1',pageSize:q.get('pageSize')??'25'},organizationAdminPageSchema),{signal});
   if(q.get('memberId')){member=(await api<{member:OrganizationAdminMember}>(base+'/members/'+encode(q.get('memberId')!),{signal})).member;grants=await api<Paginated<{id:string;name:string;assignedAt:string}>>(base+'/members/'+encode(member.id)+'/properties?'+params({q:'',page:q.get('grantsPage')??'1',pageSize:q.get('grantsPageSize')??'25'},organizationAdminPageSchema),{signal});}
  }
  if(tab==='knowledge')knowledge=await api<Paginated<OrganizationAdminKnowledge>>(base+'/knowledge?'+params({q:q.get('q')??'',page:q.get('page')??'1',pageSize:q.get('pageSize')??'25',scope:q.get('scope')??'organization',status:q.get('status')??'all',...(q.get('propertyId')?{propertyId:q.get('propertyId')!}:{})},organizationKnowledgeQuerySchema),{signal});
  if(tab==='routing')routing=await api<Paginated<OrganizationLeadRoutingRule>>(base+'/lead-routing?'+params({q:q.get('q')??'',page:q.get('propertyId')?'1':q.get('routingPage')??'1',pageSize:q.get('routingPageSize')??'25',...(q.get('propertyId')?{propertyId:q.get('propertyId')!}:{})},organizationLeadRoutingQuerySchema),{signal});
  if(tab==='documents'&&q.get('propertyId')){documents=await api<Paginated<PropertyDocument>>(base+'/property-documents?'+params({propertyId:q.get('propertyId')!,q:q.get('q')??'',page:q.get('page')??'1',pageSize:q.get('pageSize')??'25',status:q.get('status')??'all'},propertyDocumentQuerySchema),{signal});if(q.get('documentId')){document=(await api<{document:PropertyDocument}>(base+'/property-documents/'+encode(q.get('documentId')!),{signal})).document;if(document.propertyId!==q.get('propertyId'))throw new Error('This property source does not belong to the selected property.');}}
  if(tab==='retention')retention=await api<RetentionSnapshot>('/api/operations/retention',{signal});
  return{kind:'ready',settings,options,tab,members,member,grants,knowledge,routing,retention,documents,document};
 }catch(issue){if(issue instanceof ApiError&&issue.status===403)return{kind:'restricted',message:errorMessage(issue)};throw issue;}
}
export function initializeOrganizationWorkspace(signal:AbortSignal,navigate:Navigate,data:OrganizationWorkspace):void{
 const host=document.querySelector<HTMLElement>('[data-organization-workspace]');if(!host||data.kind!=='ready')return;nameFormControls(host);let busy=false;
 const q=new URLSearchParams(location.search),s=data.settings;
 const showError=(scope:HTMLElement,issue:unknown)=>{const output=scope.querySelector<HTMLElement>('[data-organization-error]')??host.querySelector<HTMLElement>('[data-organization-global-error]');if(output){output.textContent=errorMessage(issue);output.tabIndex=-1;output.focus({preventScroll:true});}};
 const requestKey=async(form:HTMLElement,body:unknown)=>{const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(body))))).map(v=>v.toString(16).padStart(2,'0')).join('');if(form.dataset.fingerprint!==hash){form.dataset.fingerprint=hash;form.dataset.requestKey=crypto.randomUUID();}return form.dataset.requestKey!;};
 const saved=(message:string,changes:Record<string,string>={})=>{const next=new URLSearchParams(q);for(const[key,value]of Object.entries(changes))next.set(key,value);next.set('saved',message);navigate('/admin/organization?'+next,true,'[data-organization-saved]');};
 const validated=(schema:{safeParse:(value:unknown)=>{success:boolean;data?:unknown}},body:unknown)=>{const result=schema.safeParse(body);if(!result.success)throw new Error('Check the required fields, limits and current version before saving.');return result.data;};
 const run=async(scope:HTMLElement,work:()=>Promise<void>)=>{if(busy)return;busy=true;host.setAttribute('aria-busy','true');const buttons=[...host.querySelectorAll<HTMLButtonElement>('button')].map(button=>({button,disabled:button.disabled}));buttons.forEach(({button})=>button.disabled=true);scope.querySelectorAll<HTMLElement>('[data-organization-error]').forEach(el=>el.textContent='');try{await work();}catch(issue){if(!signal.aborted)showError(scope.isConnected?scope:host,issue);}finally{busy=false;if(!signal.aborted){host.removeAttribute('aria-busy');buttons.forEach(({button,disabled})=>button.disabled=disabled);}}};
 host.addEventListener('change',event=>{const control=event.target;if(control instanceof HTMLSelectElement&&control.hasAttribute('data-property-document-state')){const checkbox=control.form?.querySelector<HTMLInputElement>('[name=reviewed]');if(checkbox)checkbox.required=control.value==='approved';return;}if(!(control instanceof HTMLSelectElement)||!control.hasAttribute('data-organization-group-property'))return;const target=control.form?.querySelector<HTMLSelectElement>('[name=groupId]');if(!target)return;const property=data.options.properties.items.find(item=>item.id===control.value),groupId=property?.groupId??'';if(groupId&&![...target.options].some(option=>option.value===groupId)){const option=document.createElement('option');option.value=groupId;option.textContent='Current group '+groupId;target.append(option);}target.value=groupId;},{signal});
 host.addEventListener('click',event=>{if(!(event.target instanceof Element))return;const button=event.target.closest<HTMLButtonElement>('[data-retention-preview]');if(!button||button.disabled)return;void run(button.closest<HTMLElement>('[data-organization-retention]')??host,async()=>{const preview=await api<RetentionPreview>('/api/operations/retention/preview',{method:'POST',body:'{}',signal});if(signal.aborted)return;const section=host.querySelector<HTMLElement>('[data-organization-retention]');if(section&&data.retention){section.outerHTML=retentionPanel(data.retention,preview);nameFormControls(host);const result=host.querySelector<HTMLElement>('[data-retention-preview-result]');result?.setAttribute('tabindex','-1');result?.focus();}});},{signal});
 host.addEventListener('submit',event=>{
  const form=event.target;if(!(form instanceof HTMLFormElement))return;
  const filter=form.matches('[data-organization-search],[data-organization-options],[data-organization-knowledge-filter],[data-organization-routing-filter],[data-organization-documents-filter]');
  const action=form.dataset.organizationAction;if(!filter&&!action)return;event.preventDefault();if(busy||!form.reportValidity())return;
  if(filter){const next=new URLSearchParams(q),fields=new FormData(form);next.delete('saved');for(const [key,value]of fields)if(typeof value==='string'){if(value.trim())next.set(key,value.trim());else next.delete(key);}if(form.hasAttribute('data-organization-options'))next.delete('optionsPage');else{next.delete('page');next.delete('routingPage');if(form.hasAttribute('data-organization-documents-filter'))next.delete('documentId');}navigate('/admin/organization?'+next,false,'[data-organization-workspace]');return;}
  void run(form,async()=>{
   const fields=new FormData(form),value=(name:string)=>String(fields.get(name)??'').trim(),checked=(name:string)=>fields.get(name)==='on';
   let endpoint='',method='POST',body:Record<string,unknown>={},schema:{safeParse:(value:unknown)=>{success:boolean;data?:unknown}}|null=null,includeKey=true;
   if(action==='document-upload'){
    const file=fields.get('file');if(!(file instanceof File)||file.size===0)throw new Error('Choose a nonempty property source file.');if(file.size>2*1024*1024||!['application/pdf','image/png','image/jpeg','text/plain'].includes(file.type))throw new Error('Choose a PDF, PNG, JPEG or plain-text file no larger than 2 MiB.');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(v=>v.toString(16).padStart(2,'0')).join(''),key=await requestKey(form,{propertyId:value('propertyId'),name:file.name,size:file.size,type:file.type,hash}),query=new URLSearchParams({requestKey:key,propertyId:value('propertyId'),name:file.name});
    const response=await fetch(base+'/property-documents?'+query,{method:'POST',credentials:'same-origin',headers:{'Content-Type':file.type},body:file,signal});let result:unknown;try{result=await response.json();}catch{throw new ApiError(response.status,'The server did not return a property-document result.');}if(!response.ok){const failure=result as {error?:string|{message?:string}};throw new ApiError(response.status,typeof failure.error==='string'?failure.error:failure.error?.message??'The property source could not be uploaded.');}if(!signal.aborted)saved('document-upload',{documentId:(result as {document:PropertyDocument}).document.id,propertyId:value('propertyId')});return;
   }else if(action==='document-review'){
    endpoint=base+'/property-documents/'+encode(form.dataset.documentId!);method='PATCH';schema=propertyDocumentReviewSchema;body={version:Number(form.dataset.version),title:value('title'),reviewedText:value('reviewedText'),status:value('status'),publicEnabled:checked('publicEnabled'),reviewed:checked('reviewed')};
   }else if(action==='settings'){
    endpoint=base+'/settings';method='PUT';schema=organizationSettingsSchema;
    body={version:s.version,name:s.organization.name,...s.profile,timeZone:s.timeZone,quietHours:{...s.quietHours},notifications:{...s.notifications}};
    for(const name of ['name','website','contactEmail','phone','address','timeZone'])if(fields.has(name))body[name]=value(name);
    if(fields.has('quietStart'))body.quietHours={enabled:checked('quietEnabled'),startHour:Number(value('quietStart')),endHour:Number(value('quietEnd'))};
    if(form.querySelector('[name=inAppEnabled]'))body.notifications={inAppEnabled:checked('inAppEnabled'),emailEnabled:false,smsEnabled:false};
   }else if(action==='member'){
    endpoint='/api/organizations/'+encode(s.organization.id)+'/memberships/'+encode(form.dataset.userId!);method='PATCH';body={role:value('role'),active:checked('active')};includeKey=false;
   }else if(action==='grant'||action==='revoke'){
    const propertyId=action==='grant'?value('propertyId'):form.dataset.propertyId!;
    endpoint='/api/properties/'+encode(propertyId)+'/access/'+encode(form.dataset.userId!);method=action==='grant'?'PUT':'DELETE';includeKey=false;
   }else if(action==='create-member'){
    endpoint=base+'/members';schema=organizationStaffCreateSchema;body={name:value('name'),email:value('email'),initialPassword:String(fields.get('initialPassword')??''),role:value('role'),propertyIds:fields.getAll('propertyIds').map(String)};
   }else if(action==='group-create'||action==='group-edit'){
    endpoint=base+'/groups'+(action==='group-edit'?'/'+encode(form.dataset.groupId!):'');method=action==='group-edit'?'PATCH':'POST';schema=organizationGroupSchema;body={name:value('name')};
   }else if(action==='property-group'){
    endpoint=base+'/properties/'+encode(value('propertyId'))+'/group';method='PUT';schema=organizationPropertyGroupSchema;body={groupId:value('groupId')||null};
   }else if(action==='lead-routing'){
    endpoint=base+'/lead-routing';method='PUT';schema=organizationLeadRoutingSchema;body={propertyId:value('propertyId'),teamId:value('teamId')||null,strategy:value('strategy'),enabled:checked('enabled')};
   }else if(action==='ai-policy'){
    endpoint=base+'/ai-policy';method='PUT';schema=organizationAiPolicySchema;body={version:s.aiPolicy.version,enabled:checked('enabled'),publicEnabled:checked('publicEnabled'),operatingRules:value('operatingRules'),permittedTools:fields.getAll('permittedTools').map(String),permittedIntents:fields.getAll('permittedIntents').map(String),mutationConfirmation:'always'};for(const key of ['maxRequestsPerMinute','maxTokensPerRequest','dailyTokenBudget','dailyCostBudgetMicros'])body[key]=Number(value(key));
   }else if(action==='knowledge'){
    const id=form.dataset.knowledgeId;endpoint=base+'/knowledge'+(id&&id!=='new'?'/'+encode(id):'');method=id&&id!=='new'?'PATCH':'POST';schema=organizationKnowledgeSchema;body={propertyId:value('propertyId')||null,title:value('title'),body:value('body'),status:value('status'),publicEnabled:checked('publicEnabled'),...(id&&id!=='new'?{version:Number(form.dataset.version)}:{})};
   }else if(action==='retention'){
    endpoint='/api/operations/retention';method='PUT';schema=retentionUpdateSchema;body={policies:retentionCategories.filter(category=>fields.has(category)).map(category=>({category,retentionDays:value(category)?Number(value(category)):null}))};
   }else if(action==='retention-run'){
    endpoint='/api/operations/retention/run';schema=retentionRunSchema;body={confirmation:value('confirmation')};
   }else throw new Error('This organization action is unavailable.');
   if(includeKey)body.requestKey=await requestKey(form,body);
   const payload=schema?validated(schema,body):body;
   try{
    const result=await api<unknown>(endpoint,{method,...(method==='DELETE'?{}:{body:JSON.stringify(payload)}),signal});if(signal.aborted)return;
    if(action==='retention-run'){
     const snapshot=await api<RetentionSnapshot>('/api/operations/retention',{signal});if(signal.aborted)return;data.retention=snapshot;const section=host.querySelector<HTMLElement>('[data-organization-retention]');if(section){section.outerHTML=retentionPanel(snapshot,null,result as RetentionResult);nameFormControls(host);const output=host.querySelector<HTMLElement>('[data-retention-run-result]');output?.setAttribute('tabindex','-1');output?.focus({preventScroll:true});}return;
    }
    saved(action!);
   }finally{if(action==='create-member'){const password=form.querySelector<HTMLInputElement>('[name=initialPassword]');if(password)password.value='';}}
  });
 },{signal});
}
