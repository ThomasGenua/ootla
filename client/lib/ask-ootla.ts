import {formatAssistantDateTime,formatAssistantTextDates} from '../../shared/assistant-dates';
import {resolveUserTimeZone,userInstant} from './user-time';
import {containDialogFocus} from './dialog-focus';
import {askHistoryGroups} from './ask-history-presentation';
import {patchLocalHtml} from './local-update';
import {api,type AuthUser} from './api';
import {productError,productNotice,businessStatus,assistantReply} from './product-copy';
import {escapeHtml as e,icon,link} from './ui';
import type {AskContext,AskThread,AskThreadDetail,AskMessage,AskAction} from '../../shared/conversation-contracts';
import type {Paginated} from '../../shared/property-contracts';

const base='/api/ask/threads';
const when=(value:string|null):string=>formatAssistantDateTime(value,resolveUserTimeZone());
const copyContext=(context:AskContext):AskContext=>({...context,...(context.report?{report:{...context.report}}:{})});
const organizationContext=():AskContext=>({page:'/admin'});
function safeSource(url:string,label:string):string{return /^\/admin(?:[/?#]|$)/.test(url)?link(url,e(label)):e(label);}
export function actionContent(action:AskAction):string{
 const updating=action.kind==='update_task',pending=action.status==='proposed'||action.status==='failed',details=updating?(action.preview.status?'<dt>Status</dt><dd>'+e(businessStatus(action.preview.status))+'</dd>':'')+(Object.hasOwn(action.preview,'ownerMembershipId')?'<dt>Assigned to</dt><dd>'+e(action.preview.ownerName??'Unassigned')+'</dd>':'')+(action.preview.completionComment?'<dt>Comment</dt><dd>'+e(action.preview.completionComment)+'</dd>':'')+(!action.preview.status&&!Object.hasOwn(action.preview,'ownerMembershipId')?'<dt>Priority</dt><dd>'+e(action.preview.priority)+'</dd>':''):'<dt>Due</dt><dd>'+e(when(action.preview.dueAt))+'</dd><dt>Priority</dt><dd>'+e(action.preview.priority)+'</dd>';
 return '<section class="ask-task-preview"><h3>'+(updating?'Task change':'Follow-up task')+' | '+e(businessStatus(action.status))+'</h3><dl><dt>Task</dt><dd>'+e(action.preview.title)+'</dd>'+details+'</dl>'+(pending?'<p class="cv-hint">'+(action.status==='failed'?'The change could not be saved. Review the details before trying again.':updating?'Review this change, then confirm to save it.':'Review these details, then confirm to create the task.')+'</p><button type="button" class="cv-button cv-primary" data-ask-confirm="'+e(action.id)+'">'+(updating?action.status==='failed'?'Retry change':'Confirm change':action.status==='failed'?'Retry task creation':'Confirm task creation')+'</button>':action.status==='completed'&&action.url?safeSource(action.url,'Open task'):'<p class="cv-hint">No successful change is confirmed.</p>')+'</section>';
}
export function messageContent(message:AskMessage):string{
 const references=message.references?.length?'<div class="ask-record-links" aria-label="Related records">'+message.references.map(reference=>safeSource(reference.url,reference.label)).join('')+'</div>':'',choices=message.choices?.length?'<div class="ask-choice-list" role="group" aria-label="Choose a record">'+message.choices.map(choice=>'<button type="button" data-ask-choice="'+e(choice.token)+'" data-ask-choice-label="'+e(choice.label)+'">'+e(choice.label)+'</button>').join('')+'</div>':'';
 return '<article class="ask-message" data-ask-message-id="'+e(message.id)+'" data-role="'+e(message.role)+'"><div class="ask-message-head"><strong>'+e(message.role==='staff'?'You':'OotlaAI')+'</strong><span>'+e(businessStatus(message.status))+'</span></div><p class="ask-message-body">'+e(message.role==='assistant'?formatAssistantTextDates(productNotice(assistantReply(message.body),'This answer could not be completed. Try again or ask staff for help.'),resolveUserTimeZone()):message.body)+'</p>'+references+choices+(message.sources.length?'<details class="ask-sources"><summary>Sources and freshness ('+message.sources.length+')</summary><ul>'+message.sources.map(source=>'<li>'+safeSource(source.url,source.title)+'<p>'+e(formatAssistantTextDates(source.excerpt,resolveUserTimeZone()))+'</p><p>Checked: '+e(when(source.verifiedAt))+'</p></li>').join('')+'</ul></details>':'')+'<div data-ask-action>'+(message.action?actionContent(message.action):'')+'</div><p class="cv-hint">'+e(when(message.createdAt))+'</p></article>';
}
const starters=[['What needs my attention today?','What needs attention?'],['Show available viewing options.','Viewing options'],['Which applications need follow-up?','Application follow-up']]as const;
interface ComposerDraft{message:string;title:string;due:string;priority:string;detailsOpen:boolean;payload?:string;requestKey?:string;threadKey?:string;pageContext?:string;}
interface AskTurn{key:string;originKey:string;threadId:string|null;threadKey:string;body:Record<string,unknown>;message:string;createdAt:string;status:'pending'|'failed'|'done';error?:string;baselineStaffIds:string[];submitted:{message:string;title:string;due:string}}
interface AskReading{top:number;left:number;page:number;pageSize:number;follow:boolean}
export interface AskOotlaController{updateContext(context:AskContext,reportScopeLabel?:string):void;}

/** One staff-session chat stays outside the changing page root. Domain services recheck every read and action. */
export function initializeAskOotla(signal:AbortSignal,initialContext:AskContext,_user:AuthUser,_reportScopeLabel?:string):AskOotlaController|undefined{
 if(signal.aborted)return;
 let defaultContext=copyContext(initialContext),context=organizationContext(),thread:AskThreadDetail|null=null,busy=false,historyOpen=false,historyPage=1,historyStale=true,historyRows:Paginated<AskThread>|null=null;
 let activeDraftKey='new:'+crypto.randomUUID(),chatFollow=true,pendingRevealKey:string|null=null,viewTargetId:string|null=null,latestMessagePage=1,chatPosition=0,historyPosition=0,chatRevision=0,historyRevision=0,historyBusy=false,programmaticTop:number|null=null,removalConfirmation:string|null=null,focusGuard:AbortController|null=null;
 const drafts=new Map<string,ComposerDraft>(),messageValues=new Map<string,AskMessage>(),confirmationKeys=new Map<string,string>(),choiceRequests=new Map<string,Record<string,unknown>>(),removedThreads=new Set<string>(),removingThreads=new Set<string>(),turns=new Map<string,AskTurn>(),reading=new Map<string,AskReading>(),unreadThreads=new Set<string>(),replyVersions=new Map<string,number>();
 const launcher=document.createElement('button');launcher.type='button';launcher.className='ask-floating-launcher';launcher.setAttribute('data-ask-ootla','');launcher.setAttribute('aria-label','Ask Ootla');launcher.setAttribute('aria-haspopup','dialog');launcher.setAttribute('aria-expanded','false');launcher.setAttribute('aria-controls','ask-ootla-dialog');launcher.title='Ask Ootla';launcher.innerHTML=icon('sparkles')+'<span class="sr-only">Ask Ootla</span>';
 const dialog=document.createElement('dialog');dialog.className='ask-chat';dialog.id='ask-ootla-dialog';dialog.setAttribute('aria-labelledby','ask-ootla-title');
 dialog.innerHTML='<header class="ask-chat-head"><h2 id="ask-ootla-title">Ask Ootla</h2><div class="ask-chat-actions"><button type="button" data-ask-new aria-label="New conversation" title="New conversation">'+icon('plus')+'<span>New</span></button><button type="button" data-ask-history-toggle aria-label="Conversation history" title="History" aria-expanded="false" aria-controls="ask-chat-history">'+icon('clock')+'</button><button type="button" data-ask-close aria-label="Close Ask Ootla" title="Close">'+icon('close')+'</button></div></header><div class="ask-chat-scroll" data-ask-scroll><div class="ask-chat-content" data-ask-content><section class="ask-chat-greeting" data-ask-greeting><h3>How can I help today?</h3><div class="ask-quick-actions" aria-label="Suggested questions">'+starters.map(([prompt,label])=>'<button type="button" data-ask-prompt="'+e(prompt)+'">'+e(label)+'</button>').join('')+'</div></section><div class="ask-messages" data-ask-messages aria-label="Conversation"></div><div data-ask-message-pagination></div><section id="ask-chat-history" class="ask-chat-history" data-ask-history-panel hidden><div class="ask-chat-history-head"><h3 data-ask-history-title>Conversations</h3><button type="button" class="cv-button" data-ask-back>Back to chat</button></div><p class="cv-hint" data-ask-history-status role="status"></p><div data-ask-history-content></div><p class="cv-error" data-ask-history-error role="alert"></p></section></div></div><form class="ask-chat-composer" data-ask-question><label for="ask-question" class="sr-only">Message Ootla</label><div class="ask-chat-compose-row"><textarea id="ask-question" name="message" maxlength="1500" rows="2" required placeholder="Message Ootla..."></textarea><button type="submit" class="cv-button cv-primary" aria-label="Send message" title="Send message">'+icon('arrow-up')+'</button></div><details class="ask-task-details" data-ask-task-details><summary>Task details</summary><label>Task title<input name="taskTitle" maxlength="300" /></label><label>Task due date<input name="taskDue" type="datetime-local" /></label><label>Task priority<select name="taskPriority"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select></label></details><p class="ask-pending" data-ask-pending hidden role="status">Ootla is responding...</p><p class="cv-error" data-ask-error role="alert"></p><p class="cv-hint" data-ask-feedback role="status" aria-live="polite"></p><div data-ask-new-message-actions hidden><button type="button" class="cv-button" data-ask-new-messages>Jump to latest</button></div></form>';
 document.body.append(launcher,dialog);
 const host=dialog.querySelector<HTMLElement>('[data-ask-content]')!,scroll=dialog.querySelector<HTMLElement>('[data-ask-scroll]')!,form=dialog.querySelector<HTMLFormElement>('[data-ask-question]')!,error=dialog.querySelector<HTMLElement>('[data-ask-error]')!,historyError=dialog.querySelector<HTMLElement>('[data-ask-history-error]')!,historyStatus=dialog.querySelector<HTMLElement>('[data-ask-history-status]')!,mobile=matchMedia('(max-width:600px)');
 // Native form association keeps optional business fields in the one content scroller.
 form.id='ask-question-form';
 const taskDetails=form.querySelector<HTMLDetailsElement>('[data-ask-task-details]')!,pending=dialog.querySelector<HTMLElement>('[data-ask-pending]')!,localTurns=document.createElement('div');localTurns.dataset.askLocalTurns='';localTurns.className='ask-local-turns';
 for(const control of taskDetails.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select'))control.setAttribute('form',form.id);
 const historyPanel=host.querySelector<HTMLElement>('[data-ask-history-panel]')!,messagesHost=host.querySelector<HTMLElement>('[data-ask-messages]')!,messagePagination=host.querySelector<HTMLElement>('[data-ask-message-pagination]')!;
 host.insertBefore(messagePagination,messagesHost);host.insertBefore(localTurns,historyPanel);host.insertBefore(pending,historyPanel);host.insertBefore(taskDetails,historyPanel);
 scroll.style.overflowAnchor='none';
 const visualViewport=window.visualViewport;
 const adjustViewport=()=>{
  const names=['--ask-visual-height','--ask-covered-bottom','--ask-window-gap'];
  if(!mobile.matches||!dialog.open){for(const name of names)if(dialog.style.getPropertyValue(name))dialog.style.removeProperty(name);return;}
  const height=Math.max(0,visualViewport?.height??innerHeight),covered=Math.max(0,innerHeight-(visualViewport?.offsetTop??0)-height),values=[height+'px',covered+'px',covered>0?'12px':'84px'];
  for(let index=0;index<names.length;index++)if(dialog.style.getPropertyValue(names[index]!)!==values[index])dialog.style.setProperty(names[index]!,values[index]!);
 };
 visualViewport?.addEventListener('resize',adjustViewport,{signal});
 visualViewport?.addEventListener('scroll',adjustViewport,{signal});
 window.addEventListener('resize',adjustViewport,{signal});
 const turnIsActive=(turn:AskTurn)=>!removedThreads.has(turn.threadId??'')&&!viewTargetId&&(turn.threadId?thread?.thread.id===turn.threadId:activeDraftKey===turn.originKey);
 const activeTurns=()=>[...turns.values()].filter(turn=>turn.status!=='done'&&turnIsActive(turn));
 const chatBusy=()=>busy||activeTurns().some(turn=>turn.status==='pending');
 const nearBottom=()=>dialog.open&&!historyOpen&&scroll.scrollHeight-scroll.clientHeight-scroll.scrollTop<=64;
 const setLocalScroll=(top:number,left=scroll.scrollLeft)=>{scroll.scrollTop=top;scroll.scrollLeft=left;programmaticTop=scroll.scrollTop;};
 const rememberPosition=()=>{if(!dialog.open)return;if(historyOpen){historyPosition=scroll.scrollTop;return;}chatPosition=scroll.scrollTop;if(thread)reading.set(thread.thread.id,{top:scroll.scrollTop,left:scroll.scrollLeft,page:thread.messages.page,pageSize:thread.messages.pageSize,follow:chatFollow});};
 const syncLatestButton=()=>{dialog.querySelector<HTMLElement>('[data-ask-new-message-actions]')!.hidden=historyOpen||!thread&&activeTurns().length===0||nearBottom()&&(!thread||thread.messages.page===thread.messages.totalPages)&&(!thread||!unreadThreads.has(thread.thread.id));};
 scroll.addEventListener('scroll',()=>{const programmed=programmaticTop!==null&&Math.abs(scroll.scrollTop-programmaticTop)<1;programmaticTop=null;if(!historyOpen&&!programmed){const atBottom=nearBottom();if(!atBottom)pendingRevealKey=null;chatFollow=atBottom&&(!thread||thread.messages.page===thread.messages.totalPages||activeTurns().some(turn=>turn.status==='pending'&&turn.key===pendingRevealKey));}syncLatestButton();rememberPosition();},{signal});
 const revealLatest=(readable=false)=>{
  if(!dialog.open||historyOpen)return;
  const last=[...host.querySelectorAll<HTMLElement>('[data-ask-message-id],[data-ask-local-turn]')].filter(node=>node.getClientRects().length>0).at(-1),bounds=scroll.getBoundingClientRect();
  if(readable&&last?.dataset.role==='assistant'&&last.getBoundingClientRect().height>scroll.clientHeight*.8){setLocalScroll(scroll.scrollTop+last.getBoundingClientRect().top-bounds.top-12);chatFollow=false;}
  else{setLocalScroll(scroll.scrollHeight);chatFollow=true;}
  rememberPosition();syncLatestButton();
 };
 const patch=(work:()=>void,follow:false|'if-near'|'latest'=false)=>{
  if(!dialog.open){work();return;}
  const top=scroll.scrollTop,left=scroll.scrollLeft,following=chatFollow&&!historyOpen,bounds=scroll.getBoundingClientRect(),anchor=[...host.querySelectorAll<HTMLElement>('[data-ask-message-id],[data-ask-local-turn],[data-ask-history-row],[data-ask-greeting]')].find(node=>{const rect=node.getBoundingClientRect();return rect.bottom>bounds.top&&rect.top<bounds.bottom;}),offset=anchor?.getBoundingClientRect().top;
  work();
  if(!historyOpen&&(follow==='latest'||follow==='if-near'&&following))revealLatest(true);
  else if(anchor?.isConnected&&offset!==undefined)setLocalScroll(top+anchor.getBoundingClientRect().top-offset);
  else setLocalScroll(top);
  scroll.scrollLeft=left;programmaticTop=scroll.scrollTop;rememberPosition();syncLatestButton();
 };
 const replaceMarkup=(node:HTMLElement,markup:string)=>{if(node.dataset.askMarkup!==markup){node.innerHTML=markup;node.dataset.askMarkup=markup;}};
 const setFeedback=(message:string)=>{dialog.querySelector<HTMLElement>('[data-ask-feedback]')!.textContent=message;};
 const fail=(issue:unknown)=>{if(!signal.aborted)(historyOpen?historyError:error).textContent=productError(issue);};
 const post=<T>(path:string,body:unknown)=>api<T>(path,{method:'POST',body:JSON.stringify(body),signal});
 const synchronizeBusyActions=()=>{
  for(const button of dialog.querySelectorAll<HTMLButtonElement>('[data-ask-confirm],[data-ask-choice],[data-ask-retry-turn],[data-ask-question] button[type="submit"]')){
   if(chatBusy()&&!button.disabled){button.dataset.askBusyDisabled='true';button.disabled=true;button.setAttribute('aria-busy','true');}
   else if(!chatBusy()&&button.dataset.askBusyDisabled==='true'){delete button.dataset.askBusyDisabled;button.disabled=false;button.removeAttribute('aria-busy');}
  }
 };
 const renderLocalTurns=()=>{
  const items=activeTurns(),lastStaff=thread?.messages.items.filter(message=>message.role==='staff').at(-1);
  replaceMarkup(localTurns,items.map(turn=>{
   const alreadyVisible=lastStaff?.body===turn.message&&!turn.baselineStaffIds.includes(lastStaff.id);
   return '<section data-ask-local-turn="'+e(turn.key)+'" data-role="staff">'+(!alreadyVisible?'<article class="ask-message" data-role="staff"><div class="ask-message-head"><strong>You</strong><span>'+(turn.status==='pending'?'Sending':'Not completed')+'</span></div><p class="ask-message-body">'+e(turn.message)+'</p></article>':'')+(turn.status==='failed'?'<div class="ask-turn-error" role="group" aria-label="Message could not complete"><p role="alert">'+e(turn.error??'This request could not complete.')+'</p><button type="button" class="cv-button" data-ask-retry-turn="'+e(turn.key)+'">Retry message</button></div>':'')+'</section>';
  }).join(''));
  pending.hidden=historyOpen||!items.some(turn=>turn.status==='pending');
 };
 const visibility=()=>{
  host.querySelector<HTMLElement>('[data-ask-greeting]')!.hidden=historyOpen||Boolean(thread);
  host.querySelector<HTMLElement>('[data-ask-messages]')!.hidden=historyOpen;
  host.querySelector<HTMLElement>('[data-ask-message-pagination]')!.hidden=historyOpen;
  host.querySelector<HTMLElement>('[data-ask-history-panel]')!.hidden=!historyOpen;form.hidden=historyOpen;taskDetails.hidden=historyOpen;localTurns.hidden=historyOpen;pending.hidden=historyOpen||!activeTurns().some(turn=>turn.status==='pending');
  dialog.querySelector<HTMLElement>('[data-ask-history-toggle]')!.setAttribute('aria-expanded',String(historyOpen));dialog.dataset.view=historyOpen?'history':'chat';
  if(thread)dialog.dataset.askThreadId=thread.thread.id;else delete dialog.dataset.askThreadId;
  dialog.dataset.askContextPage=context.page;
 };
 const renderHistory=(rows:Paginated<AskThread>)=>{
  host.querySelector<HTMLElement>('[data-ask-history-title]')!.textContent='Conversations';
  const items=rows.items.filter(item=>!removedThreads.has(item.id)),groups=askHistoryGroups(items,resolveUserTimeZone());
  const markup=groups.length?groups.map(group=>'<section class="ask-history-group" data-ask-history-group="'+e(group.key)+'"><h4>'+e(group.label)+'</h4><ul>'+group.items.map(item=>{
   const title=item.title.trim()||'Untitled conversation',removing=removingThreads.has(item.id),confirming=removalConfirmation===item.id;
   return '<li data-ask-history-row="'+e(item.id)+'"><div class="ask-history-row"><button type="button" data-ask-thread="'+e(item.id)+'"'+(thread?.thread.id===item.id?' aria-current="true"':'')+'><strong>'+e(title)+'</strong><small>'+e(item.timeLabel)+'</small></button><button type="button" class="ask-history-remove" data-ask-remove="'+e(item.id)+'" aria-label="'+e('Delete conversation: '+title)+'" aria-expanded="'+confirming+'"'+(removing?' disabled':'')+'>Delete</button></div>'+(confirming?'<div class="ask-history-confirm" role="group" aria-label="Delete conversation confirmation"><p>Remove <strong>'+e(title)+'</strong> from your history?</p><p class="cv-hint">Business records stay. Conversation records may be retained under your organization’s retention policy.</p><div class="cv-actions"><button type="button" class="cv-button" data-ask-remove-cancel="'+e(item.id)+'"'+(removing?' disabled':'')+'>Cancel</button><button type="button" class="cv-button ask-history-delete-confirm" data-ask-remove-confirm="'+e(item.id)+'"'+(removing?' disabled aria-busy="true"':'')+'>'+(removing?'Deleting...':'Delete conversation')+'</button></div></div>':'')+'</li>';
  }).join('')+'</ul></section>').join('')+'<div class="cv-actions">'+(rows.page>1?'<button type="button" class="cv-button" data-ask-history="-1"'+(historyBusy?' disabled':'')+'>Newer</button>':'')+(rows.page<rows.totalPages?'<button type="button" class="cv-button" data-ask-history="1"'+(historyBusy?' disabled':'')+'>Older</button>':'')+'</div>':'<p class="cv-hint">No conversations yet. Start a new chat when you need a hand.</p>';
  const historyContent=host.querySelector<HTMLElement>('[data-ask-history-content]')!;if(historyContent.dataset.askMarkup!==markup){patchLocalHtml(historyContent,markup);historyContent.dataset.askMarkup=markup;}
  historyStatus.textContent=historyBusy?'Loading conversations...':rows.total?'Page '+rows.page+' of '+Math.max(1,rows.totalPages):'';synchronizeBusyActions();
 };
 const renderMessages=()=>{
  const messages=host.querySelector<HTMLElement>('[data-ask-messages]')!,items=thread?.messages.items??[],existing=new Map([...messages.querySelectorAll<HTMLElement>('[data-ask-message-id]')].map(node=>[node.dataset.askMessageId!,node])),ids=new Set(items.map(message=>message.id));let previous:Element|null=null;
  for(const message of items){
   let node=existing.get(message.id);const prior=messageValues.get(message.id);
   if(!node){const template=document.createElement('template');template.innerHTML=messageContent(message);node=template.content.firstElementChild as HTMLElement;}
   else if(JSON.stringify(prior)!==JSON.stringify(message)){
    if(prior&&JSON.stringify({...prior,action:null})===JSON.stringify({...message,action:null}))replaceMarkup(node.querySelector<HTMLElement>('[data-ask-action]')!,message.action?actionContent(message.action):'');
    else{const sourcesOpen=node.querySelector<HTMLDetailsElement>('.ask-sources')?.open??false,template=document.createElement('template');template.innerHTML=messageContent(message);node.innerHTML=template.content.firstElementChild!.innerHTML;node.dataset.role=message.role;const details=node.querySelector<HTMLDetailsElement>('.ask-sources');if(details)details.open=sourcesOpen;}
   }
   if(previous?previous.nextElementSibling!==node:messages.firstElementChild!==node){if(previous)previous.after(node);else messages.prepend(node);}
   previous=node;messageValues.set(message.id,message);
  }
  for(const[id,node]of existing)if(!ids.has(id)){node.remove();messageValues.delete(id);}
  replaceMarkup(host.querySelector<HTMLElement>('[data-ask-message-pagination]')!,thread&&thread.messages.totalPages>1?'<div class="cv-actions">'+(thread.messages.page>1?'<button type="button" class="cv-button" data-ask-message-page="'+(thread.messages.page-1)+'">Previous messages</button>':'')+(thread.messages.page<thread.messages.totalPages?'<button type="button" class="cv-button" data-ask-message-page="'+(thread.messages.page+1)+'">More messages</button>':'')+'</div>':'');
  renderLocalTurns();visibility();synchronizeBusyActions();syncLatestButton();
 };
 const saveDraft=()=>{const values=new FormData(form);drafts.set(activeDraftKey,{message:String(values.get('message')??''),title:String(values.get('taskTitle')??''),due:String(values.get('taskDue')??''),priority:String(values.get('taskPriority')??'normal'),detailsOpen:taskDetails.open,payload:form.dataset.payload,requestKey:form.dataset.requestKey,threadKey:form.dataset.threadKey,pageContext:form.dataset.pageContext});};
 const restoreDraft=()=>{
  const draft=drafts.get(activeDraftKey);
  for(const[name,value]of [['message',draft?.message??''],['taskTitle',draft?.title??''],['taskDue',draft?.due??''],['taskPriority',draft?.priority??'normal']]){const input=form.elements.namedItem(name!)as HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement;input.value=value!;}
  taskDetails.open=draft?.detailsOpen??false;
  for(const key of ['payload','requestKey','threadKey','pageContext']as const){if(draft?.[key])form.dataset[key]=draft[key];else delete form.dataset[key];}
 };
 const history=(page=historyPage)=>api<Paginated<AskThread>>(base+'?'+new URLSearchParams({page:String(page),pageSize:'10'}),{signal});
 const messagePage=(id:string,page:number,pageSize=25)=>api<AskThreadDetail>(base+'/'+encodeURIComponent(id)+'?'+new URLSearchParams({page:String(page),pageSize:String(pageSize)}),{signal});
 const setHistoryView=(open:boolean)=>{rememberPosition();historyOpen=open;visibility();setLocalScroll(open?historyPosition:chatPosition);if(!open&&chatFollow)revealLatest(true);syncLatestButton();};
 const operate=async(work:(current:()=>boolean)=>Promise<void>,button?:HTMLButtonElement|null)=>{
  if(busy||signal.aborted)return;const revision=chatRevision,current=()=>!signal.aborted&&revision===chatRevision;busy=true;error.textContent='';const wasDisabled=button?.disabled;
  if(button){if(!button.disabled)button.dataset.askBusyDisabled='true';button.disabled=true;button.setAttribute('aria-busy','true');}synchronizeBusyActions();
  try{await work(current);}catch(issue){if(current()){const card=button?.closest<HTMLElement>('.ask-task-preview');if(card){let feedback=card.querySelector<HTMLElement>('[data-ask-action-error]');if(!feedback){feedback=document.createElement('p');feedback.dataset.askActionError='';feedback.className='cv-error';feedback.setAttribute('role','alert');card.append(feedback);}feedback.textContent=productError(issue);if(button)button.textContent='Retry confirmation';}else fail(issue);}}finally{if(button?.isConnected&&button.hasAttribute('data-ask-thread')){button.disabled=wasDisabled??false;button.removeAttribute('aria-busy');delete button.dataset.askBusyDisabled;}if(current()){busy=false;if(button?.isConnected){button.disabled=wasDisabled??false;button.removeAttribute('aria-busy');}synchronizeBusyActions();renderLocalTurns();}}
 };
 const loadHistory=async(page=historyPage)=>{
  const revision=++historyRevision;historyBusy=true;historyError.textContent='';historyStatus.textContent='Loading conversations...';if(historyRows)patch(()=>renderHistory(historyRows!));
  try{let rows=await history(page);if(signal.aborted||revision!==historyRevision)return;if(rows.total&&rows.page>rows.totalPages)rows=await history(Math.max(1,rows.totalPages));if(signal.aborted||revision!==historyRevision)return;historyBusy=false;patch(()=>{historyRows=rows;historyPage=rows.page;historyStale=false;renderHistory(rows);});}
  catch(issue){if(!signal.aborted&&revision===historyRevision){historyBusy=false;historyStale=true;historyStatus.textContent='';historyError.textContent=productError(issue);if(historyRows)patch(()=>renderHistory(historyRows!));}}
 };
 const adoptMutation=async(saved:AskThreadDetail,incoming=false,current:()=>boolean=()=>!signal.aborted)=>{
  if(!current()||removedThreads.has(saved.thread.id))return;
  const previous=thread,following=chatFollow,pageSize=previous?.messages.pageSize??saved.messages.pageSize,totalPages=Math.max(1,Math.ceil(saved.messages.total/pageSize)),targetPage=incoming&&following?totalPages:Math.min(previous?.messages.page??1,totalPages);let next=saved,loadFailed=false;
  if(saved.messages.page!==targetPage||saved.messages.pageSize!==pageSize){try{next=await messagePage(saved.thread.id,targetPage,pageSize);}catch(issue){if(!current()||removedThreads.has(saved.thread.id))return;loadFailed=true;error.textContent='Your change was saved. '+productError(issue);if(previous)next={...saved,messages:{...previous.messages,total:saved.messages.total,totalPages,items:previous.messages.items.map(message=>saved.messages.items.find(item=>item.id===message.id)??message)}};}}
  if(!current()||removedThreads.has(next.thread.id))return;if(incoming&&following&&!chatFollow&&next.messages.page!==previous?.messages.page){unreadThreads.add(next.thread.id);syncLatestButton();setFeedback('Reply ready. Your reading position has been kept.');return;}latestMessagePage=Math.max(1,Math.ceil(next.messages.total/next.messages.pageSize));const notify=incoming&&(loadFailed||!chatFollow);if(loadFailed)unreadThreads.add(next.thread.id);else unreadThreads.delete(next.thread.id);
  patch(()=>{thread=next;context=copyContext(next.thread.context);renderMessages();syncLatestButton();},incoming&&!historyOpen?'if-near':false);historyStale=true;
  if(notify)setFeedback('Reply ready. Your reading position has been kept.');else if(incoming)setFeedback('Reply ready.');
 };
 const clearSubmittedDraft=(turn:AskTurn)=>{
  if(turnIsActive(turn)){
   for(const[name,value]of [['message',turn.submitted.message],['taskTitle',turn.submitted.title],['taskDue',turn.submitted.due]]){const input=form.elements.namedItem(name!)as HTMLInputElement|HTMLTextAreaElement;if(input.value===value)input.value='';}
   if(form.dataset.requestKey===turn.key)for(const key of ['payload','requestKey','threadKey','pageContext'])delete form.dataset[key];saveDraft();
  }else{const key=turn.threadId??turn.originKey,draft=drafts.get(key);if(draft?.requestKey===turn.key)drafts.set(key,{...draft,message:draft.message===turn.submitted.message?'':draft.message,title:draft.title===turn.submitted.title?'':draft.title,due:draft.due===turn.submitted.due?'':draft.due,payload:undefined,requestKey:undefined,threadKey:undefined,pageContext:undefined});}
 };
 const executeTurn=async(turn:AskTurn)=>{
  if(turn.status==='pending'&&turns.has(turn.key)||signal.aborted||removedThreads.has(turn.threadId??''))return;
  turns.set(turn.key,turn);turn.status='pending';turn.error=undefined;
  if(turnIsActive(turn)){pendingRevealKey=turn.key;chatFollow=true;error.textContent='';patch(()=>{renderLocalTurns();synchronizeBusyActions();},'latest');}
  try{
   if(!turn.threadId){const created=await post<AskThreadDetail>(base,{requestKey:turn.threadKey,context:organizationContext()});if(signal.aborted)return;turn.threadId=created.thread.id;if(removedThreads.has(turn.threadId)){turn.status='done';return;}
    const priorDraft=drafts.get(turn.originKey);if(priorDraft){drafts.set(turn.threadId,priorDraft);drafts.delete(turn.originKey);}historyStale=true;
    if(!viewTargetId&&activeDraftKey===turn.originKey){thread=created;context=copyContext(created.thread.context);activeDraftKey=created.thread.id;patch(renderMessages,'latest');}
    if(historyOpen)void loadHistory();
   }
   const saved=await post<AskThreadDetail>(base+'/'+encodeURIComponent(turn.threadId)+'/messages',turn.body);if(signal.aborted)return;turn.status='done';historyStale=true;if(removedThreads.has(turn.threadId))return;unreadThreads.add(turn.threadId);replyVersions.set(turn.threadId,(replyVersions.get(turn.threadId)??0)+1);
   clearSubmittedDraft(turn);
   if(turnIsActive(turn)){const revision=chatRevision;await adoptMutation(saved,true,()=>!signal.aborted&&revision===chatRevision&&turnIsActive(turn));}
  }catch(issue){if(signal.aborted||removedThreads.has(turn.threadId??''))return;turn.status='failed';turn.error=productError(issue);if(turnIsActive(turn))patch(()=>{renderLocalTurns();setFeedback('');});}
  finally{if(!signal.aborted&&turnIsActive(turn)){renderLocalTurns();synchronizeBusyActions();syncLatestButton();}}
 };
 const openThread=(id:string,button:HTMLButtonElement)=>{
  saveDraft();rememberPosition();chatRevision++;busy=false;pendingRevealKey=null;viewTargetId=id;synchronizeBusyActions();const savedReading=reading.get(id),replyVersion=replyVersions.get(id)??0;
  void operate(async current=>{
   try{let next=await api<AskThreadDetail>(base+'/'+encodeURIComponent(id),{signal});const target=savedReading&&!savedReading.follow?Math.min(savedReading.page,Math.max(1,next.messages.totalPages)):Math.max(1,next.messages.totalPages),size=savedReading?.pageSize??next.messages.pageSize;
    if(target!==next.messages.page||size!==next.messages.pageSize)next=await messagePage(id,target,size);
    if(!current()||removedThreads.has(id))return;viewTargetId=null;thread=next;if((replyVersions.get(id)??0)===replyVersion)unreadThreads.delete(id);context=copyContext(next.thread.context);activeDraftKey=id;latestMessagePage=Math.max(1,next.messages.totalPages);chatFollow=savedReading?.follow??true;chatPosition=savedReading?.top??0;setHistoryView(false);
    patch(()=>{renderMessages();restoreDraft();setFeedback('');error.textContent='';},chatFollow?'latest':false);if(!chatFollow){setLocalScroll(savedReading?.top??0,savedReading?.left??0);rememberPosition();syncLatestButton();}form.querySelector<HTMLTextAreaElement>('#ask-question')!.focus({preventScroll:true});
   }finally{if(current()){viewTargetId=null;renderLocalTurns();}}
  },button);
 };
 const newConversation=(deletedId?:string)=>{
  if(!deletedId)saveDraft();else drafts.delete(deletedId);
  chatRevision++;busy=false;pendingRevealKey=null;viewTargetId=null;thread=null;context=organizationContext();activeDraftKey='new:'+crypto.randomUUID();chatFollow=true;drafts.delete(activeDraftKey);chatPosition=0;setHistoryView(false);
  patch(()=>{restoreDraft();renderMessages();setFeedback(deletedId?'Conversation removed from your history.':'');error.textContent='';dialog.querySelector<HTMLElement>('[data-ask-pending]')!.hidden=true;dialog.querySelector<HTMLElement>('[data-ask-new-message-actions]')!.hidden=true;});setLocalScroll(0);form.querySelector<HTMLTextAreaElement>('#ask-question')!.focus({preventScroll:true});
 };
 const historyFocus=(selector:string)=>dialog.querySelector<HTMLElement>(selector)?.focus({preventScroll:true});
 const removeHistory=async(id:string)=>{
  if(removingThreads.has(id)||removedThreads.has(id)||signal.aborted)return;let failed=false;removingThreads.add(id);historyError.textContent='';if(historyRows)patch(()=>renderHistory(historyRows!));
  try{await api<{removed:true}>(base+'/'+encodeURIComponent(id),{method:'DELETE',signal});if(signal.aborted)return;removedThreads.add(id);drafts.delete(id);historyRevision++;historyBusy=false;removalConfirmation=null;historyStale=true;
   if(historyRows){const total=Math.max(0,historyRows.total-1);historyRows={...historyRows,items:historyRows.items.filter(item=>item.id!==id),total,totalPages:Math.ceil(total/historyRows.pageSize)};patch(()=>renderHistory(historyRows!));}
   for(const[key,turn]of turns)if(turn.threadId===id){turns.delete(key);drafts.delete(turn.originKey);}reading.delete(id);unreadThreads.delete(id);if(thread?.thread.id===id)newConversation(id);else{historyStatus.textContent='Conversation removed from your history.';historyFocus('[data-ask-thread], [data-ask-back]');}
   if(historyOpen)void loadHistory(historyPage);
  }catch(issue){if(!signal.aborted){failed=true;historyError.textContent=productError(issue);}}
  finally{removingThreads.delete(id);if(!signal.aborted&&historyRows&&removalConfirmation===id){patch(()=>renderHistory(historyRows!));if(failed)historyFocus('[data-ask-remove-confirm="'+CSS.escape(id)+'"]');}}
 };
 const syncLauncher=()=>launcher.setAttribute('aria-expanded',String(dialog.open));
 const showPanel=()=>{
  focusGuard?.abort();focusGuard=null;
  if(mobile.matches){dialog.setAttribute('aria-modal','true');dialog.showModal();focusGuard=new AbortController();containDialogFocus(dialog,AbortSignal.any([signal,focusGuard.signal]));}
  else{dialog.setAttribute('aria-modal','false');dialog.show();}
  adjustViewport();syncLauncher();setLocalScroll(historyOpen?historyPosition:chatPosition);if(!historyOpen&&chatFollow)revealLatest(true);syncLatestButton();
 };
 const closeChat=()=>{rememberPosition();saveDraft();dialog.close();adjustViewport();};
 document.addEventListener('click',event=>{
  if(!(event.target instanceof Element)||!event.target.closest('[data-ask-ootla]'))return;
  event.preventDefault();if(dialog.open){closeChat();return;}showPanel();
  if(!historyOpen)form.querySelector<HTMLTextAreaElement>('#ask-question')!.focus({preventScroll:true});
  else if(historyStale)void loadHistory();
 },{signal});
 dialog.addEventListener('close',()=>{if(dialog.open)return;adjustViewport();focusGuard?.abort();focusGuard=null;saveDraft();syncLauncher();if(!signal.aborted)launcher.focus({preventScroll:true});},{signal});
 dialog.addEventListener('cancel',event=>{event.preventDefault();closeChat();},{signal});
 dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeChat();}},{signal});
 mobile.addEventListener('change',()=>{if(!dialog.open)return;const focused=dialog.contains(document.activeElement)?document.activeElement as HTMLElement:null;rememberPosition();dialog.close();showPanel();focused?.focus({preventScroll:true});},{signal});
 dialog.addEventListener('click',event=>{
  if(!(event.target instanceof Element))return;
  if(event.target.closest('[data-ask-close]')){closeChat();return;}
  if(event.target.closest('[data-ask-back]')){setHistoryView(false);form.querySelector<HTMLTextAreaElement>('#ask-question')!.focus({preventScroll:true});return;}
  const prompt=event.target.closest<HTMLButtonElement>('[data-ask-prompt]');if(prompt){const input=form.querySelector<HTMLTextAreaElement>('#ask-question')!;input.value=prompt.dataset.askPrompt!;input.focus({preventScroll:true});return;}
  const toggle=event.target.closest<HTMLButtonElement>('[data-ask-history-toggle]');if(toggle){setHistoryView(!historyOpen);if(historyOpen&&(historyStale||!historyRows))void loadHistory();return;}
  const fresh=event.target.closest<HTMLButtonElement>('[data-ask-new]');if(fresh){newConversation();return;}
  const remove=event.target.closest<HTMLButtonElement>('[data-ask-remove]');if(remove){removalConfirmation=remove.dataset.askRemove!;historyError.textContent='';if(historyRows)patch(()=>renderHistory(historyRows!));historyFocus('[data-ask-remove-cancel="'+CSS.escape(removalConfirmation)+'"]');return;}
  const cancelRemoval=event.target.closest<HTMLButtonElement>('[data-ask-remove-cancel]');if(cancelRemoval){const id=cancelRemoval.dataset.askRemoveCancel!;removalConfirmation=null;historyError.textContent='';if(historyRows)patch(()=>renderHistory(historyRows!));historyFocus('[data-ask-remove="'+CSS.escape(id)+'"]');return;}
  const confirmRemoval=event.target.closest<HTMLButtonElement>('[data-ask-remove-confirm]');if(confirmRemoval){void removeHistory(confirmRemoval.dataset.askRemoveConfirm!);return;}
  const historyPageButton=event.target.closest<HTMLButtonElement>('[data-ask-history]');if(historyPageButton){if(!historyBusy)void loadHistory(Math.max(1,historyPage+Number(historyPageButton.dataset.askHistory)));return;}
  const threadButton=event.target.closest<HTMLButtonElement>('[data-ask-thread]');if(threadButton){openThread(threadButton.dataset.askThread!,threadButton);return;}
  const retry=event.target.closest<HTMLButtonElement>('[data-ask-retry-turn]');if(retry){const turn=turns.get(retry.dataset.askRetryTurn!);if(turn&&turn.status==='failed'&&!chatBusy())void executeTurn(turn);return;}
  if(busy)return;
  const page=event.target.closest<HTMLButtonElement>('[data-ask-message-page]');if(page&&thread){const id=thread.thread.id;chatRevision++;pendingRevealKey=null;chatFollow=false;viewTargetId=id;void operate(async current=>{try{const next=await messagePage(id,Number(page.dataset.askMessagePage));if(current()&&!removedThreads.has(id)){viewTargetId=null;patch(()=>{thread=next;renderMessages();setFeedback('Conversation page '+next.messages.page+' loaded.');});}}finally{if(current()){viewTargetId=null;renderLocalTurns();}}},page);return;}
  const latest=event.target.closest<HTMLButtonElement>('[data-ask-new-messages]');if(latest&&thread){const id=thread.thread.id,replyVersion=replyVersions.get(id)??0;chatRevision++;pendingRevealKey=null;viewTargetId=id;void operate(async current=>{try{let next=await messagePage(id,1,thread!.messages.pageSize);if(next.messages.totalPages>1)next=await messagePage(id,next.messages.totalPages,next.messages.pageSize);if(current()&&!removedThreads.has(id)){viewTargetId=null;chatFollow=true;if((replyVersions.get(id)??0)===replyVersion)unreadThreads.delete(id);patch(()=>{thread=next;renderMessages();setFeedback('');},'latest');}}finally{if(current()){viewTargetId=null;renderLocalTurns();}}},latest);return;}
  if(chatBusy())return;
  const choice=event.target.closest<HTMLButtonElement>('[data-ask-choice]');if(choice&&thread){
   const token=choice.dataset.askChoice!,id=thread.thread.id;
   if(!choiceRequests.has(token))choiceRequests.set(token,{requestKey:crypto.randomUUID(),message:choice.dataset.askChoiceLabel??choice.textContent??'Choose this record',choiceToken:token,pageContext:copyContext(defaultContext),timeZone:resolveUserTimeZone()});
   void operate(async current=>{const saved=await post<AskThreadDetail>(base+'/'+encodeURIComponent(id)+'/messages',choiceRequests.get(token));if(!current()||removedThreads.has(id))return;setFeedback('');await adoptMutation(saved,true,current);},choice);return;
  }
  const confirm=event.target.closest<HTMLButtonElement>('[data-ask-confirm]');if(confirm&&thread){const id=thread.thread.id,actionId=confirm.dataset.askConfirm!;if(!confirmationKeys.has(actionId))confirmationKeys.set(actionId,crypto.randomUUID());void operate(async current=>{const saved=await post<AskThreadDetail>(base+'/'+encodeURIComponent(id)+'/actions/'+encodeURIComponent(actionId)+'/confirm',{requestKey:confirmationKeys.get(actionId),confirm:true});if(!current()||removedThreads.has(id))return;setFeedback(saved.messages.items.some(message=>message.action?.id===actionId&&message.action.status==='completed')?'Task saved.':'Task result updated. Review its current status.');await adoptMutation(saved,false,current);},confirm);}
 },{signal});
 const input=form.querySelector<HTMLTextAreaElement>('#ask-question')!;let composing=false;
 input.addEventListener('compositionstart',()=>{composing=true;},{signal});input.addEventListener('compositionend',()=>{composing=false;},{signal});
 input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!event.isComposing&&!composing&&event.keyCode!==229){event.preventDefault();if(!event.repeat&&!chatBusy()&&input.value.trim())form.requestSubmit();}},{signal});
 form.addEventListener('input',saveDraft,{signal});taskDetails.addEventListener('input',saveDraft,{signal});taskDetails.addEventListener('toggle',saveDraft,{signal});
 form.addEventListener('submit',event=>{
  event.preventDefault();if(chatBusy()||historyOpen||!form.reportValidity())return;
  const data=new FormData(form),body:Record<string,unknown>={message:String(data.get('message')??'').trim()},title=String(data.get('taskTitle')??'').trim(),due=String(data.get('taskDue')??'');if(!body.message)return;
  if(title||due){if(!title||!due){fail(new Error('Provide both a title and due date for the task preview.'));return;}let dueAt:string|null;try{dueAt=userInstant(due,resolveUserTimeZone());}catch(issue){fail(issue);return;}if(!dueAt){fail(new Error('Choose a valid due date.'));return;}body.task={title,dueAt,priority:String(data.get('taskPriority')??'normal')};}
  body.timeZone=resolveUserTimeZone();const payload=JSON.stringify(body);if(form.dataset.payload!==payload){form.dataset.payload=payload;form.dataset.requestKey=crypto.randomUUID();form.dataset.pageContext=JSON.stringify(defaultContext);}body.pageContext=JSON.parse(form.dataset.pageContext??JSON.stringify(defaultContext));body.requestKey=form.dataset.requestKey;form.dataset.threadKey??=crypto.randomUUID();saveDraft();
  const key=String(body.requestKey),prior=turns.get(key),turn:AskTurn=prior??{key,originKey:activeDraftKey,threadId:thread?.thread.id??null,threadKey:form.dataset.threadKey,body,message:String(body.message),createdAt:new Date().toISOString(),status:'failed',baselineStaffIds:thread?.messages.items.filter(message=>message.role==='staff').map(message=>message.id)??[],submitted:{message:String(data.get('message')??''),title:String(data.get('taskTitle')??''),due:String(data.get('taskDue')??'')}};
  void executeTurn(turn);
 },{signal});
 // Observe only this fixed panel. Keyboard/responsive resizes follow the latest turn
 // only while the reader has not chosen older messages; the document is untouched.
 let lastHeight=0;const resize=new ResizeObserver(()=>{const height=scroll.clientHeight;if(height!==lastHeight){lastHeight=height;if(dialog.open&&!historyOpen&&chatFollow)revealLatest(true);else syncLatestButton();}});resize.observe(scroll);
 signal.addEventListener('abort',()=>resize.disconnect(),{once:true});
 function updateContext(nextContext:AskContext,_label?:string):void{if(signal.aborted)return;defaultContext=copyContext(nextContext);}
 visibility();
 signal.addEventListener('abort',()=>{focusGuard?.abort();dialog.remove();launcher.remove();},{once:true});
 return{updateContext};
}
