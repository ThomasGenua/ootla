import {api,ApiError}from'./api';
import {productError}from'./product-copy';
import {escapeHtml as e,icon}from'./ui';
import {containDialogFocus}from'./dialog-focus';
import {captureLocalScroll}from'./local-update';
import {presentMetricValue}from'./presentation';
import type {AdminPageSummary}from'../../shared/admin-summary-contracts';
import type {TaskDetail,TaskEvent}from'../../shared/task-contracts';
import type {TaskSuggestions,RecordSuggestion}from'../../shared/task-suggestion-contracts';
import type {FollowupEmail,FollowupResult}from'../../shared/task-followup-contracts';
const endpoint=(id:string)=>'/api/tasks/'+encodeURIComponent(id);
const date=(s:string)=>new Date(s).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
const path=(value:string|undefined)=>{if(!value)return null;try{const u=new URL(value,location.origin);return u.origin===location.origin&&/^\/admin\/(?:tasks|calendar|leads|applications)(?:$|\/)/.test(u.pathname)?u.pathname+u.search+u.hash:null;}catch{return null;}};
function history(events:TaskEvent[]):string{return events.map(event=>{const m=event.metadata,mail=m.correspondence as Record<string,unknown>|undefined;return '<li data-followup-event="'+e(event.id)+'"><strong>'+e(typeof m.reason==='string'?m.reason:event.kind.replaceAll('_',' '))+'</strong><p>'+e(event.actor?.name??'Staff')+' · '+e(date(event.occurredAt))+'</p>'+(typeof m.comment==='string'?'<p class="tf-preserve">'+e(m.comment)+'</p>':'')+(typeof m.completionComment==='string'?'<p class="tf-preserve">'+e(m.completionComment)+'</p>':'')+(mail?'<details><summary>'+e(String(mail.subject??'Email'))+' · Preview processed</summary><p>To: '+e(String(mail.to??''))+'</p><p class="tf-preserve">'+e(String(mail.body??''))+'</p></details>':'')+'</li>';}).join('');}
export function initializeTaskFollowups(host:HTMLElement,signal:AbortSignal,navigate:(url:string,replace?:boolean,focusSelector?:string)=>void):void{
 let taskDialog:HTMLDialogElement|null=null,emailDialog:HTMLDialogElement|null=null,modalTaskId:string|null=null,refreshModal:(()=>Promise<void>)|null=null;
 const panel=host.querySelector<HTMLElement>('[data-task-suggestions]'),metricStates=new Map<string,string>();
 const bindDialog=(dialog:HTMLDialogElement,opener:HTMLElement|null)=>{
  const local=new AbortController(),combined=AbortSignal.any([signal,local.signal]);
  dialog.addEventListener('click',event=>{if(event.target instanceof Element&&event.target.closest('[data-tf-close]'))dialog.close();},{signal:combined});
  dialog.addEventListener('close',()=>{local.abort();dialog.remove();opener?.isConnected&&opener.focus({preventScroll:true});},{once:true});
  signal.addEventListener('abort',()=>{local.abort();dialog.remove();},{once:true});document.body.append(dialog);dialog.showModal();containDialogFocus(dialog,combined);return combined;
 };
 const updateVersion=(id:string,version:number)=>{
  for(const element of host.querySelectorAll<HTMLElement>('[data-version]'))if((element.dataset.taskId===id||element.closest('[data-workspace-task]')?.getAttribute('data-workspace-task')===id)&&Number(element.dataset.version)<version)element.dataset.version=String(version);
 };
 const refresh=async(id:string)=>{
  const detail=await api<TaskDetail>(endpoint(id),{signal});if(signal.aborted)return;
  updateVersion(id,detail.task.version);
  const metricState=detail.task.status+':'+(detail.task.owner?.membershipId??'');if(location.pathname==='/admin/tasks'&&metricStates.get(id)!==metricState){metricStates.set(id,metricState);void api<AdminPageSummary>('/api/admin/summary?'+new URLSearchParams({page:'tasks',period:new URLSearchParams(location.search).get('period')??'month'}),{signal}).then(summary=>{if(signal.aborted)return;for(const metric of summary.metrics){const node=document.querySelector<HTMLElement>('.summary-metric[data-metric-key="'+CSS.escape(metric.key)+'"] strong');if(node){const value=presentMetricValue(metric.value).toLocaleString();node.textContent=value;node.setAttribute('aria-label',metric.label+': '+value);}}}).catch(()=>{metricStates.delete(id);});}
  if(panel?.dataset.taskId===id){
   const badge=host.querySelector<HTMLElement>('.tw-heading .tw-tag');if(badge)badge.textContent=detail.task.status[0]!.toUpperCase()+detail.task.status.slice(1);
   const actions=host.querySelector<HTMLElement>('.tw-detail-grid .tw-actions');
   if(actions){for(const form of actions.querySelectorAll('[data-task-form="status"]'))form.remove();
    const choices=detail.task.status==='open'?[['completed','Complete task'],['cancelled','Cancel task']]:[['open','Reopen task']];
    for(const[status,label]of choices){const form=document.createElement('form');form.dataset.taskForm='status';form.dataset.taskId=id;form.dataset.version=String(detail.task.version);form.dataset.taskTitle=detail.task.title;form.dataset.status=status;form.className='tw-inline-form';form.innerHTML='<button type="submit" class="tw-button">'+e(label)+'</button><p class="tw-error" data-task-error role="alert"></p>';actions.append(form);}
   }
  }
  const list=host.querySelector<HTMLElement>('.tw-history');if(list){const restore=captureLocalScroll(list);list.innerHTML=history(detail.history.items);restore();}
  const leadRow=host.querySelector<HTMLElement>('[data-workspace-task="'+CSS.escape(id)+'"]');
  if(leadRow){const badge=leadRow.querySelector<HTMLElement>('.l08-tag');if(badge)badge.textContent=detail.task.status==='completed'?'Completed':detail.task.status==='cancelled'?'Cancelled':'Open';}
  if(panel?.dataset.taskId===id)await loadActions(panel,id);
  if(taskDialog?.open&&modalTaskId===id)await refreshModal?.();
  return detail;
 };
 const actionsMarkup=(suggestions:TaskSuggestions)=>'<p class="tf-summary">'+e(suggestions.summary)+'</p><div class="tf-actions">'+suggestions.actions.filter(a=>a.kind!=='complete').map(a=>'<button type="button" class="tw-button" data-tf-action="'+e(a.id)+'" title="'+e(a.description)+'">'+e(a.label)+'</button>').join('')+'</div>';
 const loadActions=async(target:HTMLElement,id:string)=>{
  const suggestions=await api<TaskSuggestions>(endpoint(id)+'/suggestions',{signal});
  if(signal.aborted||!target.isConnected)return;
  const result=target.querySelector<HTMLElement>('[data-task-suggestion-results]')??target;result.innerHTML=actionsMarkup(suggestions);
  target.dataset.version=String(suggestions.version);(target as HTMLElement&{followupSuggestions?:TaskSuggestions}).followupSuggestions=suggestions;
  const button=target.querySelector<HTMLElement>('[data-load-task-suggestions]');if(button)button.textContent='Refresh';
 };
 const openEmail=async(id:string,version:number,opener:HTMLElement)=>{
  if(emailDialog?.open)return;
  const dialog=document.createElement('dialog');emailDialog=dialog;dialog.className='tf-dialog';dialog.setAttribute('aria-labelledby','tf-email-title');
  dialog.innerHTML='<header><h3 id="tf-email-title">Review email</h3><button type="button" class="tw-button" data-tf-close aria-label="Close email">'+icon('close')+'</button></header><div class="tf-body"><p data-tf-loading role="status">Preparing draft…</p><form data-tf-email hidden><label>To<input name="to" readonly /></label><p class="tw-hint" data-tf-generation></p><label>Subject<input name="subject" maxlength="200" required /></label><label>Message<textarea name="body" rows="9" maxlength="3000" required></textarea></label><p class="tw-hint" data-tf-delivery></p><div class="tf-actions"><button type="submit" class="tw-button" name="intent" value="save">Save draft</button><button type="submit" class="tw-button tw-primary" name="intent" value="send">Send</button></div><p data-tf-email-status role="status"></p><p class="tw-error" data-tf-email-error role="alert"></p></form><p class="tw-error" data-tf-load-error role="alert"></p></div>';
  const local=bindDialog(dialog,opener);dialog.addEventListener('close',()=>{if(emailDialog===dialog)emailDialog=null;},{once:true});
  let email:FollowupEmail,pending=false,key='',fingerprint='';
  try{const existing=await api<{email:FollowupEmail|null}>(endpoint(id)+'/follow-up/draft',{signal:local});if(local.aborted)return;
   const prepared:FollowupResult=existing.email?{email:existing.email,version:existing.email.version,eventId:existing.email.id,state:'draft',message:'Saved draft restored.'}:await api<FollowupResult>(endpoint(id)+'/follow-up/draft',{method:'POST',body:JSON.stringify({requestKey:crypto.randomUUID(),version}),signal:local});if(local.aborted)return;
   if(!prepared.email)throw Error('The draft could not be prepared.');email=prepared.email;updateVersion(id,prepared.version);await refresh(id);
   const form=dialog.querySelector<HTMLFormElement>('form')!;form.hidden=false;dialog.querySelector<HTMLElement>('[data-tf-loading]')!.hidden=true;
   const field=(name:string)=>form.elements.namedItem(name)as HTMLInputElement|HTMLTextAreaElement;
   field('to').value=email.to;field('subject').value=email.subject;field('body').value=email.body;
   dialog.querySelector<HTMLElement>('[data-tf-generation]')!.textContent=email.generation==='live'?'Prepared by OotlaAI. Review before sending.':'Prepared from the task and saved lead information.';
   dialog.querySelector<HTMLElement>('[data-tf-delivery]')!.textContent=email.delivery==='preview'?'Preview delivery only; no external email will be sent.':'Email delivery is not configured. You can edit and save this draft.';
   const send=form.querySelector<HTMLButtonElement>('[value="send"]')!;send.disabled=email.delivery!=='preview';
   form.addEventListener('submit',async event=>{event.preventDefault();if(pending||!form.reportValidity())return;const saveOnly=(event.submitter as HTMLButtonElement|null)?.value!=='send';
    const payload={version:email.version,draftId:email.id,subject:field('subject').value.trim(),body:field('body').value.trim(),confirm:true,saveOnly},next=JSON.stringify(payload);if(fingerprint!==next){fingerprint=next;key=crypto.randomUUID();}
    pending=true;const controls=[...form.querySelectorAll<HTMLButtonElement>('button[type="submit"]')];for(const control of controls)control.disabled=true;form.setAttribute('aria-busy','true');dialog.querySelector<HTMLElement>('[data-tf-email-error]')!.textContent='';
    try{const saved=await api<FollowupResult>(endpoint(id)+'/follow-up/send',{method:'POST',body:JSON.stringify({...payload,requestKey:key}),signal:local});if(local.aborted)return;updateVersion(id,saved.version);dialog.querySelector<HTMLElement>('[data-tf-email-status]')!.textContent=saved.message;
     if(saved.email){email=saved.email;fingerprint='';}else{form.dataset.sent='true';}
     await refresh(id);
    }catch(error){if(!local.aborted)dialog.querySelector<HTMLElement>('[data-tf-email-error]')!.textContent=error instanceof ApiError&&(error.status===0||error.status>=500)?'The result could not be confirmed. Your draft is kept. Retry this same message to check its saved result.':error instanceof ApiError&&error.status===409?'This task changed. Close this draft and refresh the task before trying again. Your text is kept here.':productError(error);}
    finally{pending=false;if(!local.aborted){form.removeAttribute('aria-busy');for(const control of controls)control.disabled=form.dataset.sent==='true'||control.value==='send'&&email.delivery!=='preview';}}
   },{signal:local});field('subject').focus({preventScroll:true});
  }catch(error){if(!local.aborted){dialog.querySelector<HTMLElement>('[data-tf-loading]')!.hidden=true;dialog.querySelector<HTMLElement>('[data-tf-load-error]')!.textContent=productError(error);}}
 };
 const act=async(id:string,suggestions:TaskSuggestions,action:RecordSuggestion,opener:HTMLElement)=>{
  if(action.kind==='email_draft'){await openEmail(id,suggestions.version,opener);return;}
  if(action.kind==='viewing'||action.kind==='open'){const destination=path(action.url);if(destination){taskDialog?.close();navigate(destination);}return;}
  if(action.kind==='assign'){
   if(!confirm('Assign this task to the suggested eligible staff member?'))return;
   await api(endpoint(id)+'/suggestions/confirm',{method:'POST',body:JSON.stringify({action:'assign',version:suggestions.version,confirm:true,ownerMembershipId:action.ownerMembershipId}),signal});
   await refresh(id);
  }
 };
 const openTask=async(id:string,opener:HTMLElement)=>{
  if(taskDialog?.open)return;const dialog=document.createElement('dialog');taskDialog=dialog;dialog.className='tf-dialog';dialog.setAttribute('aria-labelledby','tf-task-title');
  dialog.innerHTML='<header><h3 id="tf-task-title">Follow-up task</h3><button type="button" class="tw-button" data-tf-close aria-label="Close task">'+icon('close')+'</button></header><div class="tf-body"><p role="status" data-tf-task-loading>Loading task…</p><div data-tf-task-content></div><p class="tw-error" data-tf-task-error role="alert"></p></div>';
  const local=bindDialog(dialog,opener);dialog.addEventListener('close',()=>{if(taskDialog===dialog)taskDialog=null;},{once:true});let detail:TaskDetail,suggestions:TaskSuggestions,pending=false;
  const update=async()=>{
   [detail,suggestions]=await Promise.all([api<TaskDetail>(endpoint(id),{signal:local}),api<TaskSuggestions>(endpoint(id)+'/suggestions',{signal:local})]);if(local.aborted)return;
   const t=detail.task,content=dialog.querySelector<HTMLElement>('[data-tf-task-content]')!;
   const comment=content.querySelector<HTMLTextAreaElement>('[name=comment]')?.value??'',restore=captureLocalScroll(content);
   content.innerHTML='<h4>'+e(t.title)+'</h4><p class="tw-hint">'+e(t.contactName??'')+' · '+e(t.propertyName)+' · '+e(t.leadStageLabel??t.status)+'</p><p class="tf-preserve">'+e(t.details||'No description recorded.')+'</p><section data-tf-modal-actions><h4>Next actions</h4>'+actionsMarkup(suggestions)+'</section><form data-tf-comment><label>Leave a comment<textarea name="comment" rows="3" maxlength="2000" required placeholder="Record the agreed next step or outcome"></textarea></label><div class="tf-actions"><button type="submit" class="tw-button" name="intent" value="comment">Save comment</button>'+(t.status==='open'?'<button type="submit" class="tw-button tw-primary" name="intent" value="complete">Mark task complete</button>':'')+'</div><p role="status" data-tf-comment-status></p><p class="tw-error" data-tf-comment-error role="alert"></p></form><details class="tf-history"><summary>Task history</summary><ol>'+history(detail.history.items)+'</ol></details>';
   const editor=content.querySelector<HTMLTextAreaElement>('[name=comment]');if(editor)editor.value=comment;restore();
   dialog.querySelector<HTMLElement>('[data-tf-task-loading]')!.hidden=true;dialog.querySelector('h4')?.setAttribute('tabindex','-1');updateVersion(id,t.version);
  };
  modalTaskId=id;refreshModal=update;dialog.addEventListener('close',()=>{if(refreshModal===update){modalTaskId=null;refreshModal=null;}},{once:true});
  dialog.addEventListener('click',async event=>{const button=event.target instanceof Element?event.target.closest<HTMLButtonElement>('[data-tf-action]'):null;if(!button||pending)return;const action=suggestions?.actions.find(a=>a.id===button.dataset.tfAction);if(!action)return;button.disabled=true;try{await act(id,suggestions,action,button);}catch(error){if(!local.aborted)dialog.querySelector<HTMLElement>('[data-tf-task-error]')!.textContent=productError(error);}finally{if(button.isConnected)button.disabled=false;}},{signal:local});
  dialog.addEventListener('submit',async event=>{
   const form=event.target;if(!(form instanceof HTMLFormElement)||!form.matches('[data-tf-comment]'))return;event.preventDefault();if(pending||!form.reportValidity())return;
   const complete=(event.submitter as HTMLButtonElement|null)?.value==='complete';if(complete&&!confirm('Mark this task complete and save your comment?'))return;
   const body=String(new FormData(form).get('comment')??'').trim(),payload=JSON.stringify({body,complete,version:detail.task.version});if(form.dataset.payload!==payload){form.dataset.payload=payload;form.dataset.requestKey=crypto.randomUUID();}pending=true;
   for(const button of form.querySelectorAll<HTMLButtonElement>('button'))button.disabled=true;
   try{const saved=await api<FollowupResult>(endpoint(id)+'/follow-up/comment',{method:'POST',body:JSON.stringify({body,complete,version:detail.task.version,requestKey:form.dataset.requestKey}),signal:local});if(local.aborted)return;
    const editor=form.querySelector<HTMLTextAreaElement>('[name=comment]');if(editor)editor.value='';await refresh(id);if(!local.aborted)dialog.querySelector<HTMLElement>('[data-tf-comment-status]')!.textContent=saved.message;
   }catch(error){if(!local.aborted)form.querySelector<HTMLElement>('[data-tf-comment-error]')!.textContent=productError(error);}
   finally{pending=false;if(!local.aborted)for(const button of form.querySelectorAll<HTMLButtonElement>('button'))button.disabled=false;}
  },{signal:local});
  dialog.addEventListener('close',()=>{void refresh(id).catch(()=>{});},{once:true});
  try{await update();}catch(error){if(!local.aborted)dialog.querySelector<HTMLElement>('[data-tf-task-error]')!.textContent=productError(error);}
 };
 host.addEventListener('click',async event=>{
  const button=event.target instanceof Element?event.target.closest<HTMLButtonElement>('[data-open-lead-task],[data-tf-action],[data-load-task-suggestions],[data-open-task-followup]'):null;if(!button||button.disabled)return;
  const taskId=button.dataset.openLeadTask??button.dataset.openTaskFollowup;
  if(taskId){await openTask(taskId,button);return;}
  if(!panel?.dataset.taskId)return;const error=panel.querySelector<HTMLElement>('[data-task-suggestion-error]');button.disabled=true;
  try{if(button.hasAttribute('data-load-task-suggestions'))await loadActions(panel,panel.dataset.taskId);else{const suggestions=(panel as HTMLElement&{followupSuggestions?:TaskSuggestions}).followupSuggestions,action=suggestions?.actions.find(a=>a.id===button.dataset.tfAction);if(suggestions&&action)await act(panel.dataset.taskId,suggestions,action,button);}}
  catch(issue){if(!signal.aborted&&error)error.textContent=productError(issue);}finally{if(button.isConnected)button.disabled=false;}
 },{signal});
 if(panel?.dataset.taskId)void loadActions(panel,panel.dataset.taskId).catch(issue=>{if(!signal.aborted){const error=panel.querySelector<HTMLElement>('[data-task-suggestion-error]');if(error)error.textContent=productError(issue);}});
}
