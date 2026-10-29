import {containDialogFocus} from './dialog-focus';
import {api,type AuthUser} from './api';
import {productError,productNotice,businessStatus,assistantReply} from './product-copy';
import {escapeHtml as e,icon,link} from './ui';
import type {AskContext,AskThread,AskThreadDetail,AskMessage,AskAction} from '../../shared/conversation-contracts';
import type {AiOptions} from '../../shared/ai-contracts';
import type {Paginated} from '../../shared/property-contracts';

const base='/api/ask/threads';
const when=(value:string|null):string=>value?new Date(value).toLocaleString():'Not recorded';
function safeSource(url:string,label:string):string{return /^\/admin(?:[/?#]|$)/.test(url)?link(url,e(label)):e(label);}
function actionContent(action:AskAction):string{
 return '<section class="ask-task-preview"><h3>Follow-up task | '+e(businessStatus(action.status))+'</h3><dl><dt>Task</dt><dd>'+e(action.preview.title)+'</dd><dt>Due</dt><dd>'+e(when(action.preview.dueAt))+'</dd><dt>Priority</dt><dd>'+e(action.preview.priority)+'</dd></dl>'+(action.status==='proposed'||action.status==='failed'?'<p class="cv-hint">'+(action.status==='failed'?'The task could not be created. Review the details before trying again.':'Review these details, then confirm to create the task.')+'</p><button type="button" class="cv-button cv-primary" data-ask-confirm="'+e(action.id)+'">'+(action.status==='failed'?'Retry task creation':'Confirm task creation')+'</button>':action.status==='completed'&&action.url?safeSource(action.url,'Open saved task'):'<p class="cv-hint">No successful task creation is confirmed.</p>')+'</section>';
}
function messageContent(message:AskMessage):string{
 return '<article class="ask-message" data-ask-message-id="'+e(message.id)+'" data-role="'+e(message.role)+'"><div class="ask-message-head"><strong>'+e(message.role==='staff'?'You':'OotlaAI')+'</strong><span>'+e(businessStatus(message.status))+'</span></div><p class="ask-message-body">'+e(message.role==='assistant'?productNotice(assistantReply(message.body),'This answer could not be completed. Try again or ask staff for help.'):message.body)+'</p>'+(message.sources.length?'<details class="ask-sources"><summary>Sources and freshness ('+message.sources.length+')</summary><ul>'+message.sources.map(source=>'<li>'+safeSource(source.url,source.title)+'<p>'+e(source.excerpt)+'</p><p>Checked: '+e(when(source.verifiedAt))+'</p></li>').join('')+'</ul></details>':'')+'<div data-ask-action>'+(message.action?actionContent(message.action):'')+'</div><p class="cv-hint">'+e(when(message.createdAt))+'</p></article>';
}
const starters=[['What needs my attention today?','Today\u2019s priorities'],['Summarize this lead.','Summarize lead'],['What documents are missing from this application?','Missing documents'],['Show available viewing options.','Viewing options'],['Draft a reply.','Draft a reply'],['Create a follow-up task.','Follow-up task'],['Explain the outstanding work for this property.','Outstanding work']];
const maintenanceStarters=[['Summarize unresolved maintenance requests.','Unresolved requests'],['Summarize this maintenance request.','Request summary'],['What renewal terms are approved?','Approved renewals'],['Create a follow-up task.','Follow-up task']];
const reportStarters=[['Which leads need follow-up?','Lead follow-ups'],['Which applications are waiting on documents?','Missing documents'],["What is my team's workload?",'Team workload'],['Where are applications slowing down?','Application progress'],['How did this property perform during the selected period?','Property performance']];
interface ComposerDraft{message:string;title:string;due:string;priority:string;detailsOpen:boolean;payload?:string;requestKey?:string;threadKey?:string;}
type MessageUpdate='preserve'|'incoming'|'latest';
export interface AskOotlaController{updateContext(context:AskContext,reportScopeLabel?:string):void;}
const copyContext=(context:AskContext):AskContext=>({...context,...(context.report?{report:{...context.report}}:{})});
const contextKey=(context:AskContext):string=>JSON.stringify([context.page,context.propertyId,context.leadId,context.applicationId,context.maintenanceRequestId,context.report?['from','to','groupId','region','agentMembershipId','teamId','attention','q'].map(key=>context.report![key as keyof NonNullable<AskContext['report']>]):null]);

export function initializeAskOotla(signal:AbortSignal,initialContext:AskContext,user:AuthUser,reportScopeLabel?:string):AskOotlaController|undefined{
 const entry=document.querySelector<HTMLButtonElement>('[data-ask-ootla]');if(!entry)return;
 let context:AskContext={...initialContext,...(initialContext.report?{report:{...initialContext.report}}:{})},thread:AskThreadDetail|null=null,options:AiOptions|null=null,busy=false,historyPage=1;
 let mounted=false,activeDraftKey='new:'+JSON.stringify(context),latestMessagePage=1,pendingContext:{context:AskContext;reportScopeLabel?:string}|null=null;
 const drafts=new Map<string,ComposerDraft>(),messageValues=new Map<string,AskMessage>(),confirmationKeys=new Map<string,string>();
 const dialog=document.createElement('dialog');dialog.className='ootla-dialog';dialog.id='ask-ootla-dialog';dialog.setAttribute('aria-labelledby','ask-ootla-title');
 dialog.innerHTML='<header class="ootla-dialog-head"><div><h2 id="ask-ootla-title">Ask Ootla</h2><p>Private staff assistance | '+e(user.organization.name)+'</p></div><button type="button" class="ootla-dialog-close" data-ask-close aria-label="Close Ask Ootla">'+icon('close')+'</button></header><div class="ootla-dialog-scroll" data-ask-scroll><div data-ask-content></div><p class="cv-error" data-ask-error role="alert"></p></div>';
 document.body.append(dialog);containDialogFocus(dialog,signal);
 const host=dialog.querySelector<HTMLElement>('[data-ask-content]')!,error=dialog.querySelector<HTMLElement>('[data-ask-error]')!,scroll=dialog.querySelector<HTMLElement>('[data-ask-scroll]')!;
 // This is the actual drawer scroller. Preserve its visible record while patching;
 // never scroll the surrounding admin document or reconstruct this container.
 scroll.style.overflowAnchor='none';
 const nearBottom=()=>scroll.scrollHeight-scroll.clientHeight-scroll.scrollTop<=80;
 const patch=(work:()=>void,follow:false|'if-near'|'latest'=false)=>{
  const top=scroll.scrollTop,left=scroll.scrollLeft,following=nearBottom(),bounds=scroll.getBoundingClientRect();
  const anchor=[...host.querySelectorAll<HTMLElement>('[data-ask-message-id],[data-ask-context-host],.ask-history,[data-ask-question]')].find(node=>{const rect=node.getBoundingClientRect();return rect.bottom>bounds.top&&rect.top<bounds.bottom;});
  const offset=anchor?.getBoundingClientRect().top;
  work();
  if(follow==='latest'||follow==='if-near'&&following)scroll.scrollTop=scroll.scrollHeight;
  else if(anchor?.isConnected&&offset!==undefined)scroll.scrollTop=top+anchor.getBoundingClientRect().top-offset;
  else scroll.scrollTop=top;
  scroll.scrollLeft=left;
 };
 const setFeedback=(message:string)=>{const feedback=host.querySelector<HTMLElement>('[data-ask-feedback]');if(feedback)feedback.textContent=message;};
 const fail=(issue:unknown)=>{
  if(signal.aborted)return;
  if(!mounted)host.innerHTML='<p class="cv-hint">The assistant context could not be loaded. No request or task was confirmed.</p><button type="button" class="cv-button" data-ask-retry>Retry loading assistant</button>';
  // role=alert announces the error without moving focus or losing the draft.
  error.textContent=productError(issue);
 };
 const post=<T>(path:string,body:unknown)=>api<T>(path,{method:'POST',body:JSON.stringify(body),signal});
 const reportContext=()=>{
  const r=context.report;if(!r)return '';
  const exact=context.page===initialContext.page&&context.propertyId===initialContext.propertyId&&JSON.stringify(r)===JSON.stringify(initialContext.report),filters=[r.groupId?'Selected group':'',r.region?'Region: '+r.region:'',r.agentMembershipId?'Selected agent':'',r.teamId?'Selected team':'',r.attention&&r.attention!=='all'?'Table attention: '+r.attention.replaceAll('_',' '):'',r.q?'Table search: '+r.q:''].filter(Boolean);
  return '<div class="pr-ask-context" aria-label="Report assistant context"><strong>CRM report context</strong><p>Report period: '+e(r.from)+' to '+e(r.to)+' | UTC</p><p>'+e(exact&&reportScopeLabel?reportScopeLabel:filters.join(' | ')||'All permitted records in the property context')+'</p><p class="cv-hint">Answers retain these report dates and filters. Changing property keeps the dates and clears the other report filters.</p></div>';
 };
 const contextDescription=()=>'<strong>Active context</strong><p>'+e(({'/admin':'Overview','/admin/leads':'Leads','/admin/properties':'Properties','/admin/tasks':'Tasks','/admin/applications':'Applications','/admin/calendar':'Calendar','/admin/maintenance':'Maintenance','/admin/reports':'Reports','/admin/analytics':'Website analytics','/admin/conversations':'Conversations','/admin/automations':'Follow-ups','/admin/voice':'Voice assistance','/admin/ai':'AI assistant'} as Record<string,string>)[context.page]??'Workspace')+'</p><p>Property: '+e(options?.selectedProperty?.name??(context.propertyId?'Selected property':'All permitted properties'))+'</p>'+(context.leadId?'<p>Lead: '+e(options?.leads.find(row=>row.id===context.leadId)?.name??'Selected lead')+'</p>':'')+(context.applicationId?'<p>Application: '+e(options?.applications.find(row=>row.id===context.applicationId)?.label??'Selected application')+'</p>':'')+(context.maintenanceRequestId?'<p>Maintenance request: Selected request</p>':'')+reportContext();
 const propertyChoices=()=>'<option value="">All permitted properties</option>'+(options?.properties.items??[]).map(property=>'<option value="'+e(property.id)+'" '+(property.id===context.propertyId?'selected':'')+'>'+e(property.name)+'</option>').join('')+(context.propertyId&&!options?.properties.items.some(property=>property.id===context.propertyId)?'<option value="'+e(context.propertyId)+'" selected>'+e(options?.selectedProperty?.name??'Selected property')+'</option>':'');
 const replaceMarkup=(node:HTMLElement,markup:string)=>{if(node.dataset.askMarkup!==markup){node.innerHTML=markup;node.dataset.askMarkup=markup;}};
 const synchronizeBusyActions=()=>{
  const selector='[data-ask-confirm],[data-ask-thread],[data-ask-message-page],[data-ask-history],[data-ask-new],[data-ask-new-messages],[data-ask-search] button[type="submit"],[data-ask-question] button[type="submit"]';
  for(const button of host.querySelectorAll<HTMLButtonElement>(selector)){
   if(busy&&!button.disabled){button.dataset.askBusyDisabled='true';button.disabled=true;button.setAttribute('aria-busy','true');}
   else if(!busy&&button.dataset.askBusyDisabled==='true'){delete button.dataset.askBusyDisabled;button.disabled=false;button.removeAttribute('aria-busy');}
  }
 };
 const mount=()=>{
  if(mounted)return;
  host.innerHTML='<section class="ask-context" data-ask-context-host aria-label="Active assistant context"><div data-ask-context-description></div><form class="ask-context-search" data-ask-search><label>Find a property<input name="q" type="search" maxlength="120" placeholder="Search permitted properties" /></label><button class="cv-button" type="submit">Find</button></form><label>Property context<select name="propertyId" data-ask-property></select></label><p class="cv-hint">Changing context starts a new conversation.</p></section><details class="ask-history"><summary data-ask-history-title>Your conversations</summary><div data-ask-history-content></div></details><p class="cv-notice">Answers refer to your records. Review changes before confirming them.</p><div class="ask-quick-actions" data-ask-quick-actions aria-label="Suggested questions"></div><div class="ask-messages" data-ask-messages aria-label="Conversation"><p class="cv-hint" data-ask-empty>Ask about a permitted property, lead or application, or start with today\u2019s priorities. Nothing is changed until its saved result confirms it.</p></div><div data-ask-message-pagination></div><div data-ask-new-message-actions hidden><button type="button" class="cv-button" data-ask-new-messages>View new messages</button></div><form class="ask-form" data-ask-question><label for="ask-question">Ask a question</label><textarea id="ask-question" name="message" maxlength="1500" rows="3" required placeholder="What would help you move the work forward?"></textarea><details class="ask-task-details" data-ask-task-details><summary>Review follow-up task</summary><label>Task title<input name="taskTitle" maxlength="300" /></label><label>Task due date<input name="taskDue" type="datetime-local" /></label><label>Task priority<select name="taskPriority"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select></label><p class="cv-hint">Submitting these details creates a preview for your confirmation.</p></details><div class="cv-actions"><button type="submit" class="cv-button cv-primary">Ask Ootla '+icon('arrow')+'</button>'+link('/admin/ai','Property information','cv-button')+'</div><p class="ask-pending" data-ask-pending hidden role="status">Checking current permissions and records...</p><p class="cv-hint" data-ask-feedback role="status" aria-live="polite"></p></form>';
  mounted=true;host.dataset.loaded='true';
 };
 const renderContext=()=>{
  replaceMarkup(host.querySelector<HTMLElement>('[data-ask-context-description]')!,contextDescription());
  replaceMarkup(host.querySelector<HTMLSelectElement>('[data-ask-property]')!,propertyChoices());
  replaceMarkup(host.querySelector<HTMLElement>('[data-ask-quick-actions]')!,(context.report?reportStarters:context.page==='/admin/maintenance'?maintenanceStarters:starters).map(([prompt,label])=>'<button type="button" data-ask-prompt="'+e(prompt)+'">'+e(label)+'</button>').join(''));
 };
 const renderHistory=(rows:Paginated<AskThread>)=>{
  host.querySelector<HTMLElement>('[data-ask-history-title]')!.textContent='Your conversations ('+rows.total+')';
  replaceMarkup(host.querySelector<HTMLElement>('[data-ask-history-content]')!,(rows.items.length?'<ul>'+rows.items.map(item=>'<li><button type="button" data-ask-thread="'+e(item.id)+'">'+e(item.title)+'<br/><small>'+e(when(item.updatedAt))+'</small></button></li>').join('')+'</ul>':'<p>No saved conversations in this context yet.</p>')+'<div class="cv-actions">'+(rows.page>1?'<button type="button" class="cv-button" data-ask-history="-1">Newer</button>':'')+(rows.page<rows.totalPages?'<button type="button" class="cv-button" data-ask-history="1">Older</button>':'')+'<button type="button" class="cv-button" data-ask-new>New conversation</button></div>');
  synchronizeBusyActions();
 };
 const renderMessages=(update:MessageUpdate='preserve')=>{
  const messages=host.querySelector<HTMLElement>('[data-ask-messages]')!,items=thread?.messages.items??[],existing=new Map([...messages.querySelectorAll<HTMLElement>('[data-ask-message-id]')].map(node=>[node.dataset.askMessageId!,node])),ids=new Set(items.map(message=>message.id));
  const empty=messages.querySelector<HTMLElement>('[data-ask-empty]')!;empty.hidden=items.length>0;
  let previous:Element=empty;
  for(const message of items){
   let node=existing.get(message.id);const prior=messageValues.get(message.id);
   if(!node){const template=document.createElement('template');template.innerHTML=messageContent(message);node=template.content.firstElementChild as HTMLElement;}
   else if(JSON.stringify(prior)!==JSON.stringify(message)){
    if(prior&&JSON.stringify({...prior,action:null})===JSON.stringify({...message,action:null}))replaceMarkup(node.querySelector<HTMLElement>('[data-ask-action]')!,message.action?actionContent(message.action):'');
    else{const sourcesOpen=node.querySelector<HTMLDetailsElement>('.ask-sources')?.open??false,template=document.createElement('template');template.innerHTML=messageContent(message);node.innerHTML=template.content.firstElementChild!.innerHTML;node.dataset.role=message.role;const details=node.querySelector<HTMLDetailsElement>('.ask-sources');if(details)details.open=sourcesOpen;}
   }
   if(previous.nextElementSibling!==node)previous.after(node);
   previous=node;messageValues.set(message.id,message);
  }
  for(const [id,node]of existing)if(!ids.has(id)){node.remove();messageValues.delete(id);}
  replaceMarkup(host.querySelector<HTMLElement>('[data-ask-message-pagination]')!,thread&&thread.messages.totalPages>1?'<div class="cv-actions">'+(thread.messages.page>1?'<button type="button" class="cv-button" data-ask-message-page="'+(thread.messages.page-1)+'">Previous messages</button>':'')+(thread.messages.page<thread.messages.totalPages?'<button type="button" class="cv-button" data-ask-message-page="'+(thread.messages.page+1)+'">More messages</button>':'')+'</div>':'');
  const updates=host.querySelector<HTMLElement>('[data-ask-new-message-actions]')!;
  if(update==='incoming')updates.hidden=nearBottom();else if(update==='latest'||!thread)updates.hidden=true;
  synchronizeBusyActions();
 };
 const questionForm=()=>host.querySelector<HTMLFormElement>('[data-ask-question]')!;
 const saveDraft=()=>{
  if(!mounted)return;
  const form=questionForm(),values=new FormData(form);
  drafts.set(activeDraftKey,{message:String(values.get('message')??''),title:String(values.get('taskTitle')??''),due:String(values.get('taskDue')??''),priority:String(values.get('taskPriority')??'normal'),detailsOpen:form.querySelector<HTMLDetailsElement>('[data-ask-task-details]')!.open,payload:form.dataset.payload,requestKey:form.dataset.requestKey,threadKey:form.dataset.threadKey});
 };
 const restoreDraft=()=>{
  const form=questionForm(),draft=drafts.get(activeDraftKey);
  for(const [name,value]of [['message',draft?.message??''],['taskTitle',draft?.title??''],['taskDue',draft?.due??''],['taskPriority',draft?.priority??'normal']]){const input=form.elements.namedItem(name!) as HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement;input.value=value!;}
  form.querySelector<HTMLDetailsElement>('[data-ask-task-details]')!.open=draft?.detailsOpen??false;
  for(const key of ['payload','requestKey','threadKey']as const){if(draft?.[key])form.dataset[key]=draft[key];else delete form.dataset[key];}
 };
 const history=(atContext:AskContext=context,page=historyPage)=>{const params=new URLSearchParams({page:String(page),pageSize:'10'});for(const key of ['propertyId','leadId','applicationId','maintenanceRequestId']as const)if(atContext[key])params.set(key,atContext[key]!);return api<Paginated<AskThread>>(base+'?'+params,{signal});};
 const loadOptions=(search='',atContext:AskContext=context)=>{const params=new URLSearchParams({pageSize:'25',propertySearch:search});if(atContext.propertyId)params.set('propertyId',atContext.propertyId);return api<AiOptions>('/api/ai/options?'+params,{signal});};
 const messagePage=(id:string,page:number,pageSize=25)=>api<AskThreadDetail>(base+'/'+encodeURIComponent(id)+'?'+new URLSearchParams({page:String(page),pageSize:String(pageSize)}),{signal});
 const refreshHistory=async()=>{try{const rows=await history();if(!signal.aborted)patch(()=>renderHistory(rows));}catch(issue){if(!signal.aborted)error.textContent='Your change was saved. '+productError(issue);}};
 const operate=async(work:()=>Promise<void>,button?:HTMLButtonElement|null)=>{
  if(busy||signal.aborted)return;busy=true;error.textContent='';
  const property=host.querySelector<HTMLSelectElement>('[data-ask-property]'),wasDisabled=property?.disabled,buttonDisabled=button?.disabled;
  if(property)property.disabled=true;if(button){button.disabled=true;button.setAttribute('aria-busy','true');}synchronizeBusyActions();
  const pending=host.querySelector<HTMLElement>('[data-ask-pending]');if(pending)pending.hidden=false;
  try{await work();}catch(issue){fail(issue);}finally{busy=false;if(!signal.aborted){if(property?.isConnected)property.disabled=wasDisabled??false;if(button?.isConnected){button.disabled=buttonDisabled??false;button.removeAttribute('aria-busy');}synchronizeBusyActions();const pending=host.querySelector<HTMLElement>('[data-ask-pending]');if(pending)pending.hidden=true;if(pendingContext){const next=pendingContext;pendingContext=null;updateContext(next.context,next.reportScopeLabel);}}}
 };
 const open=async()=>{
  const [nextOptions,rows]=await Promise.all([loadOptions(),history()]);if(signal.aborted)return;
  options=nextOptions;const first=!mounted;
  patch(()=>{mount();renderContext();renderHistory(rows);renderMessages();});
  if(first&&dialog.open){host.querySelector<HTMLTextAreaElement>('#ask-question')?.focus({preventScroll:true});scroll.scrollTop=scroll.scrollHeight;}
 };
 const switchThread=async(next:AskThreadDetail|null,nextContext:AskContext,rows:Paginated<AskThread>,nextOptions:AiOptions,clearNew=false)=>{
  saveDraft();context={...nextContext,...(nextContext.report?{report:{...nextContext.report}}:{})};thread=next;options=nextOptions;activeDraftKey=thread?.thread.id??'new:'+JSON.stringify(context);if(clearNew)drafts.delete(activeDraftKey);
  patch(()=>{renderContext();renderHistory(rows);renderMessages();restoreDraft();setFeedback('');});
 };
 const adoptMutation=async(saved:AskThreadDetail,update:MessageUpdate)=>{
  // POST responses contain the first 50 messages. Keep a reader's current page,
  // or load the latest page for someone who is following the conversation.
  const previous=thread,following=nearBottom(),pageSize=previous?.messages.pageSize??saved.messages.pageSize,totalPages=Math.max(1,Math.ceil(saved.messages.total/pageSize));
  const targetPage=update==='incoming'&&following?totalPages:Math.min(previous?.messages.page??1,totalPages);
  let next=saved,loadFailed=false;
  if(saved.messages.page!==targetPage||saved.messages.pageSize!==pageSize){
   try{next=await messagePage(saved.thread.id,targetPage,pageSize);}catch(issue){loadFailed=true;error.textContent='Your change was saved. '+productError(issue);if(previous)next={...saved,messages:{...previous.messages,total:saved.messages.total,totalPages,items:previous.messages.items.map(message=>saved.messages.items.find(item=>item.id===message.id)??message)}};}
  }
  if(signal.aborted)return;
  latestMessagePage=Math.max(1,Math.ceil(next.messages.total/next.messages.pageSize));
  const notify=update==='incoming'&&(loadFailed||!nearBottom());
  patch(()=>{thread=next;renderMessages();const notice=host.querySelector<HTMLElement>('[data-ask-new-message-actions]')!;notice.hidden=!notify;},update==='incoming'?'if-near':false);
  if(notify)setFeedback('New messages are available. Your reading position has been kept.');
 };
 entry.addEventListener('click',()=>{
  if(dialog.open)return;dialog.showModal();entry.setAttribute('aria-expanded','true');
  if(!mounted)host.innerHTML='<p role="status">Loading your permitted context...</p>';
  void operate(open);
 },{signal});
 dialog.addEventListener('close',()=>{saveDraft();entry.setAttribute('aria-expanded','false');if(!signal.aborted)entry.focus({preventScroll:true});},{signal});
 dialog.addEventListener('click',event=>{
  if(!(event.target instanceof Element))return;
  if(event.target.closest('[data-ask-close]')){dialog.close();return;}
  const retry=event.target.closest<HTMLButtonElement>('[data-ask-retry]');if(retry){void operate(open,retry);return;}
  const prompt=event.target.closest<HTMLButtonElement>('[data-ask-prompt]');if(prompt){const input=host.querySelector<HTMLTextAreaElement>('#ask-question');if(input){input.value=prompt.dataset.askPrompt!;input.focus({preventScroll:true});}if(prompt.dataset.askPrompt?.startsWith('Create a follow-up'))host.querySelector<HTMLDetailsElement>('[data-ask-task-details]')!.open=true;return;}
  if(busy)return;
  const threadButton=event.target.closest<HTMLButtonElement>('[data-ask-thread]');if(threadButton){void operate(async()=>{const next=await api<AskThreadDetail>(base+'/'+encodeURIComponent(threadButton.dataset.askThread!),{signal}),nextContext=next.thread.context,[nextOptions,rows]=await Promise.all([loadOptions('',nextContext),history(nextContext)]);if(!signal.aborted)await switchThread(next,nextContext,rows,nextOptions);},threadButton);return;}
  const page=event.target.closest<HTMLButtonElement>('[data-ask-message-page]');if(page&&thread){const id=thread.thread.id;void operate(async()=>{const next=await messagePage(id,Number(page.dataset.askMessagePage));if(!signal.aborted)patch(()=>{thread=next;renderMessages();setFeedback('Conversation page '+next.messages.page+' loaded.');});},page);return;}
  const listPage=event.target.closest<HTMLButtonElement>('[data-ask-history]');if(listPage){const nextPage=Math.max(1,historyPage+Number(listPage.dataset.askHistory));void operate(async()=>{const rows=await history(context,nextPage);if(!signal.aborted)patch(()=>{historyPage=nextPage;renderHistory(rows);});},listPage);return;}
  const fresh=event.target.closest<HTMLButtonElement>('[data-ask-new]');if(fresh){void operate(async()=>{const rows=await history();if(!signal.aborted)await switchThread(null,context,rows,options!,true);},fresh);return;}
  const latest=event.target.closest<HTMLButtonElement>('[data-ask-new-messages]');if(latest&&thread){const id=thread.thread.id,size=thread.messages.pageSize;void operate(async()=>{const next=await messagePage(id,latestMessagePage,size);if(!signal.aborted)patch(()=>{thread=next;renderMessages('latest');setFeedback('Latest messages loaded.');},'latest');},latest);return;}
  const confirm=event.target.closest<HTMLButtonElement>('[data-ask-confirm]');if(confirm&&thread){const id=thread.thread.id,actionId=confirm.dataset.askConfirm!;if(!confirmationKeys.has(actionId))confirmationKeys.set(actionId,crypto.randomUUID());void operate(async()=>{const saved=await post<AskThreadDetail>(base+'/'+encodeURIComponent(id)+'/actions/'+encodeURIComponent(actionId)+'/confirm',{requestKey:confirmationKeys.get(actionId),confirm:true});setFeedback(saved.messages.items.some(message=>message.action?.id===actionId&&message.action.status==='completed')?'Task saved.':'Task result updated. Review its current status.');await adoptMutation(saved,'preserve');await refreshHistory();},confirm);}
 },{signal});
 dialog.addEventListener('change',event=>{
  if(!(event.target instanceof HTMLSelectElement)||!event.target.hasAttribute('data-ask-property'))return;
  if(busy){event.target.value=context.propertyId??'';return;}
  const select=event.target,report=context.report,nextContext:AskContext={page:initialContext.page,...(select.value?{propertyId:select.value}:{}),...(report?{report:{from:report.from,to:report.to}}:{})};
  void operate(async()=>{try{const [nextOptions,rows]=await Promise.all([loadOptions('',nextContext),history(nextContext,1)]);if(!signal.aborted){historyPage=1;await switchThread(null,nextContext,rows,nextOptions);}}catch(issue){select.value=context.propertyId??'';throw issue;}});
 },{signal});
 dialog.addEventListener('submit',event=>{
  const form=event.target;if(!(form instanceof HTMLFormElement))return;event.preventDefault();if(busy||!form.reportValidity())return;
  const data=new FormData(form),button=event.submitter instanceof HTMLButtonElement?event.submitter:form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if(form.hasAttribute('data-ask-search')){void operate(async()=>{const next=await loadOptions(String(data.get('q')??''));if(!signal.aborted)patch(()=>{options=next;renderContext();setFeedback('Property choices updated. Your conversation is unchanged.');});},button);return;}
  if(!form.hasAttribute('data-ask-question'))return;
  const body:Record<string,unknown>={message:String(data.get('message')??'').trim()},title=String(data.get('taskTitle')??'').trim(),due=String(data.get('taskDue')??'');
  if(title||due){if(!title||!due){fail(new Error('Provide both a title and due date for the task preview.'));return;}const instant=new Date(due);if(!Number.isFinite(instant.getTime())){fail(new Error('Choose a valid due date.'));return;}body.task={title,dueAt:instant.toISOString(),priority:String(data.get('taskPriority')??'normal')};}
  const payload=JSON.stringify(body);if(form.dataset.payload!==payload){form.dataset.payload=payload;form.dataset.requestKey=crypto.randomUUID();}body.requestKey=form.dataset.requestKey;
  const submitted={message:String(data.get('message')??''),title:String(data.get('taskTitle')??''),due:String(data.get('taskDue')??''),priority:String(data.get('taskPriority')??'normal')};
  void operate(async()=>{
   if(!thread){form.dataset.threadKey??=crypto.randomUUID();thread=await post<AskThreadDetail>(base,{requestKey:form.dataset.threadKey,context});activeDraftKey=thread.thread.id;}
   const saved=await post<AskThreadDetail>(base+'/'+encodeURIComponent(thread.thread.id)+'/messages',body);
   if(signal.aborted)return;
   // Leave text typed while the request was in flight alone. A failed request
   // never reaches this point, so its values and retry identifier stay intact.
   for(const [name,value]of [['message',submitted.message],['taskTitle',submitted.title],['taskDue',submitted.due]]){const input=form.elements.namedItem(name!) as HTMLInputElement|HTMLTextAreaElement;if(input.value===value)input.value='';}
   delete form.dataset.payload;delete form.dataset.requestKey;delete form.dataset.threadKey;drafts.delete(activeDraftKey);
   setFeedback(saved.messages.items.some(message=>message.role==='assistant'&&message.status==='failed')?'Question saved. Review the assistant response for the next step.':'Conversation updated.');
   await adoptMutation(saved,'incoming');await refreshHistory();
  },button);
 },{signal});
 function updateContext(nextContext:AskContext,label?:string):void{
  if(signal.aborted)return;
  // A page filter must never retarget a question or confirmation already in flight.
  if(busy){pendingContext={context:copyContext(nextContext),reportScopeLabel:label};return;}
  const changed=contextKey(initialContext)!==contextKey(nextContext);
  initialContext=copyContext(nextContext);reportScopeLabel=label;
  if(!changed){if(mounted)patch(renderContext);return;}
  saveDraft();const draft=drafts.get(activeDraftKey);
  context=copyContext(nextContext);thread=null;options=null;historyPage=1;latestMessagePage=1;activeDraftKey='new:'+JSON.stringify(context);
  // Keep unsent text while starting a conversation in the newly selected scope.
  // Idempotency keys belong to the old scope and must not be reused for this one.
  if(draft)drafts.set(activeDraftKey,{...draft,payload:undefined,requestKey:undefined,threadKey:undefined});
  if(mounted)patch(()=>{
   renderContext();renderMessages();restoreDraft();
   host.querySelector<HTMLElement>('[data-ask-history-title]')!.textContent='Your conversations';
   replaceMarkup(host.querySelector<HTMLElement>('[data-ask-history-content]')!,'<p class="cv-hint">Conversation history will load for the selected context.</p>');
   setFeedback('Context updated. Your unsent question has been kept.');
  });
  if(dialog.open)void operate(open);
 }
 signal.addEventListener('abort',()=>{dialog.remove();},{once:true});
 return{updateContext};
}
