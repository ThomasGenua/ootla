import {api} from './api';
import {escapeHtml as e,link} from './ui';
import {productError} from './product-copy';
import {presentRecordText,presentRecordName} from './presentation';
import type {TaskSuggestions,RecordSuggestion,TaskSuggestionResult} from '../../shared/task-suggestion-contracts';
type Navigate=(path:string,replace?:boolean,focusSelector?:string)=>void;
export function initializeLeadAssistance(workspace:HTMLElement,signal:AbortSignal,navigate:Navigate):void{
 const host=workspace.querySelector<HTMLElement>('[data-lead-assistance-result]'),leadId=workspace.dataset.workspaceLead;
 if(!host||!leadId)return;
 const endpoint='/api/lead-workspaces/'+encodeURIComponent(leadId)+'/assistance';
 let current:TaskSuggestions|null=null,selected:RecordSuggestion|null=null,loading=false,busy=false,changed=false;
 const render=()=>{
  if(!current)return;
  host.innerHTML='<p>'+e(presentRecordText(current.summary))+'</p><ul class="ld-suggestion-actions">'+current.actions.map(a=>'<li><h4>'+e(presentRecordText(a.label))+'</h4><p class="l08-hint">'+e(presentRecordText(a.description))+'</p>'+(a.kind==='open'&&a.url?link(a.url,'Open record','l08-button'):'<button type="button" class="l08-button" data-lead-suggestion="'+e(a.id)+'">'+e(a.kind==='email_draft'?'Prepare draft':a.kind==='viewing'?'Choose a viewing':a.kind==='assign'?'Assign owner':a.label)+'</button>')+'</li>').join('')+'</ul><div data-lead-confirmation></div><details class="ld-cautions"><summary>Records considered</summary><ul class="l08-match-reasons">'+current.context.map(v=>'<li>'+e(presentRecordText(v))+'</li>').join('')+'</ul><p class="l08-error" data-assistance-error role="alert"></p>';
 };
 const load=async()=>{
  if(loading||current)return;loading=true;host.textContent='Reading saved records…';
  try{current=await api<TaskSuggestions>(endpoint,{signal});if(!signal.aborted)render();}catch(error){if(!signal.aborted)host.textContent=productError(error);}finally{loading=false;}
 };
 workspace.addEventListener('click',async event=>{
  const target=event.target instanceof Element?event.target.closest<HTMLElement>('[data-lead-ai-open],[data-lead-suggestion],[data-lead-suggestion-cancel]'):null;if(!target)return;
  if(target.hasAttribute('data-lead-ai-open')){void load();return;}
  if(target.hasAttribute('data-lead-suggestion-cancel')){if(busy)return;const previous=selected?.id;selected=null;render();if(previous)host.querySelector<HTMLElement>('[data-lead-suggestion="'+previous+'"]')?.focus();return;}
  if(!current||busy)return;selected=current.actions.find(a=>a.id===target.dataset.leadSuggestion)??null;if(!selected)return;
  const confirmation=host.querySelector<HTMLElement>('[data-lead-confirmation]');if(!confirmation)return;
  confirmation.innerHTML='<form data-lead-suggestion-confirm class="ld-confirmation"><h4 tabindex="-1">Are you sure you want to '+e(selected.kind==='assign'?presentRecordText(selected.label).toLowerCase():selected.kind==='email_draft'?'prepare this email draft':'open the viewing scheduler')+'?</h4><p>'+e(presentRecordText(selected.description))+'</p><div class="l08-actions"><button type="button" class="l08-button" data-lead-suggestion-cancel>Cancel</button><button type="submit" class="l08-button l08-primary">'+(selected.kind==='viewing'?'Continue to Calendar':'Confirm')+'</button></div></form>';
  confirmation.querySelector<HTMLElement>('h4')?.focus();
 },{signal});
 workspace.addEventListener('submit',async event=>{
  const form=event.target;if(!(form instanceof HTMLFormElement)||!form.hasAttribute('data-lead-suggestion-confirm'))return;
  event.preventDefault();if(!selected||!current||busy)return;busy=true;
  const button=form.querySelector<HTMLButtonElement>('button[type="submit"]');if(button)button.disabled=true;
  const error=host.querySelector<HTMLElement>('[data-assistance-error]');if(error)error.textContent='';
  try{
   const result=await api<TaskSuggestionResult>(endpoint+'/confirm',{method:'POST',body:JSON.stringify({action:selected.kind,version:current.version,confirm:true,...(selected.ownerMembershipId?{ownerMembershipId:selected.ownerMembershipId}:{})}),signal});
   if(signal.aborted)return;
   if(result.url){navigate(result.url);return;}
   changed=true;
   if(result.draft){host.innerHTML='<section data-lead-email-draft><h4>Email draft saved</h4><p class="l08-hint">Review this draft before sending.</p><h4>'+e(result.draft.subject)+'</h4><p class="ld-preserve-lines">'+e(result.draft.body)+'</p>'+link(result.draft.url,'Open saved draft','l08-button')+'</section>';}
   else{const next=new URLSearchParams(location.search);next.delete('assistant');next.set('saved','lead');navigate('/admin/leads?'+next,true,'#lead-detail-name');}
  }catch(issue){if(!signal.aborted&&error){error.textContent=productError(issue);error.focus({preventScroll:true});}}
  finally{busy=false;if(button?.isConnected)button.disabled=false;}
 },{signal});
 workspace.querySelector<HTMLDialogElement>('#lead-ai-dialog')?.addEventListener('close',()=>{if(changed&&!signal.aborted){const next=new URLSearchParams(location.search);next.delete('assistant');navigate('/admin/leads?'+next,true);}}, {signal});
 if(new URLSearchParams(location.search).get('assistant')==='1')void load();
}
