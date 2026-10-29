import {api,ApiError,type AuthUser} from './api';
import {productError} from './product-copy';
import type {AiConfiguration,AiOptions,AiResponse,AiKnowledgeDirectory} from '../../shared/ai-contracts';
import {aiResultContent} from '../pages/ai-assistant';
export type AiWorkspace={kind:'ready';configuration:AiConfiguration;options:AiOptions;knowledge:AiKnowledgeDirectory|null;result:AiResponse|null}|{kind:'restricted';message:string};
type Navigate=(path:string,replace?:boolean,focusSelector?:string)=>void;
export async function loadAiWorkspace(query:URLSearchParams,signal:AbortSignal):Promise<AiWorkspace>{
 try{
  const params=new URLSearchParams();for(const key of ['propertyId','propertySearch','recordSearch','page'])if(query.get(key))params.set(key,query.get(key)!);
  params.set('pageSize',query.get('pageSize')??'25');
  const [configuration,options]=await Promise.all([api<AiConfiguration>('/api/ai/config',{signal}),api<AiOptions>('/api/ai/options?'+params,{signal})]);
  const [knowledge,result]=await Promise.all([options.selectedProperty?api<AiKnowledgeDirectory>('/api/ai/knowledge?'+new URLSearchParams({propertyId:options.selectedProperty.id,q:query.get('knowledgeSearch')??'',page:query.get('knowledgePage')??'1',pageSize:query.get('knowledgePageSize')??'10'}),{signal}):null,query.get('request')?api<AiResponse>('/api/ai/requests/'+encodeURIComponent(query.get('request')!),{signal}):null]);
  return{kind:'ready',configuration,options,knowledge,result};
 }catch(issue){if(issue instanceof ApiError&&issue.status===403)return{kind:'restricted',message:productError(issue)};throw issue;}
}
function errorIn(form:HTMLElement,issue:unknown):void{const output=form.querySelector<HTMLElement>('[data-ai-error]')??document.querySelector<HTMLElement>('[data-ai-global-error]');if(output){output.textContent=productError(issue);output.tabIndex=-1;output.focus({preventScroll:true});}}
const scenarios:Record<string,string>={property_question:'What approved information is available about this property?',availability:'What units are currently available at this property?',viewing_options:'What viewing options are available at this property?',application_checklist:'What is missing from this application checklist?',create_follow_up:'Create a follow-up task for this lead.',staff_handoff:'Please request a staff handoff for this property.'};
export function initializeAiAssistant(signal:AbortSignal,navigate:Navigate):void{
 const workspace=document.querySelector<HTMLElement>('[data-ai-workspace]');if(!workspace)return;
 const updateConfirmation=()=>{const form=workspace.querySelector<HTMLFormElement>('[data-ai-request]'),confirmation=form?.querySelector<HTMLInputElement>('[name=confirmAction]');if(confirmation)confirmation.required=Boolean(form?.querySelector<HTMLInputElement>('[name=taskTitle]')?.value.trim()||form?.querySelector<HTMLInputElement>('[name=taskDue]')?.value);};
 workspace.addEventListener('input',updateConfirmation,{signal});
 workspace.addEventListener('change',updateConfirmation,{signal});
 workspace.addEventListener('click',async event=>{
  if(!(event.target instanceof Element))return;
  const scenario=event.target.closest<HTMLElement>('[data-ai-scenario]');
  if(scenario){const form=workspace.querySelector<HTMLFormElement>('[data-ai-request]'),message=form?.querySelector<HTMLTextAreaElement>('[name=message]'),name=scenario.dataset.aiScenario!;
   if(message&&scenarios[name]){message.value=scenarios[name];message.focus({preventScroll:true});}
   if(name==='create_follow_up'&&form){const details=form.querySelector<HTMLDetailsElement>('[data-ai-task-details]');if(details)details.open=true;const title=form.querySelector<HTMLInputElement>('[name=taskTitle]'),due=form.querySelector<HTMLInputElement>('[name=taskDue]');if(title&&!title.value)title.value='Follow up with this prospect';if(due&&!due.value){const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);tomorrow.setHours(10,0,0,0);const local=new Date(tomorrow.getTime()-tomorrow.getTimezoneOffset()*60000);due.value=local.toISOString().slice(0,16);}}
   updateConfirmation();return;
  }
  const refresh=event.target.closest<HTMLButtonElement>('[data-ai-refresh]');if(refresh&&!refresh.disabled){refresh.disabled=true;try{const result=await api<AiResponse>('/api/ai/requests/'+encodeURIComponent(refresh.dataset.aiRefresh!),{signal});if(!signal.aborted){const host=workspace.querySelector<HTMLElement>('[data-ai-result]');if(host){host.innerHTML=aiResultContent(result);host.tabIndex=-1;host.focus({preventScroll:true});}}}catch(issue){if(!signal.aborted)errorIn(workspace,issue);}finally{if(!signal.aborted)refresh.disabled=false;}}
 },{signal});
 workspace.addEventListener('submit',async event=>{
  const form=event.target;if(!(form instanceof HTMLFormElement))return;
  if(form.hasAttribute('data-ai-filter')){event.preventDefault();const data=new FormData(form),query=new URLSearchParams();for(const[key,value]of data)if(typeof value==='string'&&value.trim())query.set(key,value.trim());navigate('/admin/ai?'+query,false,'[data-ai-workspace]');return;}
  if(!form.hasAttribute('data-ai-request')&&!form.hasAttribute('data-ai-knowledge-form'))return;event.preventDefault();if(!form.reportValidity())return;
  const button=form.querySelector<HTMLButtonElement>('button[type=submit]');if(button?.disabled)return;
  const data=new FormData(form),propertyId=workspace.dataset.propertyId!;let endpoint='/api/ai/requests',method='POST',body:Record<string,unknown>={};
  try{
   if(form.hasAttribute('data-ai-request')){
    body={propertyId,message:String(data.get('message')??'').trim()};for(const key of ['applicationId','leadId'])if(data.get(key))body[key]=String(data.get(key));
    const title=String(data.get('taskTitle')??'').trim(),due=String(data.get('taskDue')??'');if(title||due){if(!title||!due)throw new Error('Provide both the task title and due date, or leave both empty.');if(data.get('confirmAction')!=='on'){form.querySelector<HTMLInputElement>('[name=confirmAction]')?.focus();throw new Error('Confirm creation of the follow-up task before running this action.');}body.confirmAction=true;const instant=new Date(due);if(!Number.isFinite(instant.getTime()))throw new Error('Choose a valid task due date.');body.task={title,dueAt:instant.toISOString(),priority:String(data.get('taskPriority')??'normal')};}
   }else{const id=form.dataset.aiKnowledgeForm;if(id&&id!=='new'){endpoint='/api/ai/knowledge/'+encodeURIComponent(id);method='PATCH';body={title:String(data.get('title')??'').trim(),body:String(data.get('body')??'').trim(),status:String(data.get('status')??'draft')};}else{endpoint='/api/ai/knowledge';body={propertyId,title:String(data.get('title')??'').trim(),body:String(data.get('body')??'').trim(),status:String(data.get('status')??'draft')};}}
   if(form.hasAttribute('data-ai-knowledge-form'))body.publicEnabled=data.get('publicEnabled')==='on';
   const payload=JSON.stringify(body);if(!form.dataset.requestKey||form.dataset.requestPayload!==payload){form.dataset.requestKey=crypto.randomUUID();form.dataset.requestPayload=payload;}body.requestKey=form.dataset.requestKey;
   if(button)button.disabled=true;form.setAttribute('aria-busy','true');const error=form.querySelector<HTMLElement>('[data-ai-error]');if(error)error.textContent='';
   const pending=form.querySelector<HTMLElement>('[data-ai-pending]');if(pending){pending.hidden=false;pending.textContent='Checking scope and current records. No action is confirmed yet.';}
   if(form.hasAttribute('data-ai-request')){const host=workspace.querySelector<HTMLElement>('[data-ai-result]');if(host)host.innerHTML='<section class="ap-panel"><h3>Request in progress</h3><p role="status">No new action is confirmed. The server is checking scope and current facts.</p></section>';}
   const result=await api<AiResponse>(endpoint,{method,body:JSON.stringify(body),signal});if(signal.aborted)return;
   const query=new URLSearchParams({propertyId});if(form.hasAttribute('data-ai-request')){query.set('request',result.id);for(const key of ['applicationId','leadId'])if(data.get(key))query.set(key,String(data.get(key)));}else query.set('knowledgeSaved','1');
   navigate('/admin/ai?'+query,true,form.hasAttribute('data-ai-request')?'[data-ai-result]':'[data-ai-knowledge-success]');
  }catch(issue){if(!signal.aborted){errorIn(form,issue);if(form.hasAttribute('data-ai-request')&&form.getAttribute('aria-busy')==='true'){const host=workspace.querySelector<HTMLElement>('[data-ai-result]');if(host)host.innerHTML='<section class="ap-panel"><h3>Outcome not confirmed</h3><p>No outcome is confirmed for this attempt. Retry the same request to recover its recorded result.</p></section>';}}}
  finally{if(!signal.aborted){if(button)button.disabled=false;form.removeAttribute('aria-busy');const pending=form.querySelector<HTMLElement>('[data-ai-pending]');if(pending)pending.hidden=true;}}
 },{signal});
}
