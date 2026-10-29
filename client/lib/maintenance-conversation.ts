import {api,ApiError} from './api';
import {productError} from './product-copy';
import {presentRecordText} from './presentation';
import {formatUserTime} from './user-time';
import {escapeHtml as e} from './ui';
import type {MaintenanceConversation,MaintenanceConversationDraft,MaintenanceConversationMessage,MaintenanceConversationReplyResult} from '../../shared/maintenance-conversation-contracts';

type Channel=MaintenanceConversationDraft['channel'];
type ReplyBody={requestKey:string;body:string;channel:Channel;draftVersion:number;retryMessageId?:string};
const pollInterval=8000;
const stateLabel:Record<MaintenanceConversationMessage['state'],string>={received:'Received',queued:'Queued',available_in_portal:'Available in resident portal',failed:'Failed',sent:'Sent',delivered:'Delivered',cancelled:'Cancelled'};

export function maintenanceConversationMessage(item:MaintenanceConversationMessage,zone:string):string{
 const actor=item.actorKind==='resident'?'Resident':item.actorKind==='staff'?'Staff':'System';
 const name=presentRecordText(item.actorName),channel=item.channel==='email'?'Email':'Resident portal';
 return '<li class="mc-message" data-message-id="'+e(item.id)+'" data-actor="'+e(item.actorKind)+'"><div class="mc-message-meta"><strong>'+e(actor)+(name?' · '+e(name):'')+'</strong><time datetime="'+e(item.createdAt)+'">'+e(formatUserTime(item.createdAt,zone))+'</time></div><p class="mc-message-body">'+e(presentRecordText(item.body))+'</p><div class="mc-message-state" data-state="'+e(item.state)+'">'+e(channel)+' · '+e(stateLabel[item.state])+(item.canRetry?'<button type="button" class="mc-message-retry" data-maintenance-conversation-retry-message="'+e(item.id)+'">Retry message</button>':'')+'</div></li>';
}


function confirmDraftReplacement(host:HTMLElement,saved:MaintenanceConversationDraft|null,current:{body:string;channel:Channel},signal:AbortSignal):Promise<boolean>{
 if(signal.aborted)return Promise.resolve(false);
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog'),previousFocus=document.activeElement;
  dialog.className='mc-draft-dialog';dialog.dataset.maintenanceConversationConflict='';dialog.setAttribute('aria-labelledby','maintenance-draft-conflict-title');dialog.setAttribute('aria-describedby','maintenance-draft-conflict-copy');
  dialog.innerHTML='<form method="dialog"><h3 id="maintenance-draft-conflict-title">Review your saved draft</h3><p id="maintenance-draft-conflict-copy">Save your current message in place of the latest private draft? Nothing is sent.</p><h4>Currently saved · '+e(saved?.channel==='email'?'Email draft':'Resident portal')+'</h4><pre>'+e(saved?.body||'No saved message.')+'</pre><h4>Your current message · '+e(current.channel==='email'?'Email draft':'Resident portal')+'</h4><pre>'+e(current.body||'Empty draft.')+'</pre><div class="mc-dialog-actions"><button type="button" class="cv-button" data-maintenance-conflict-cancel>Keep unchanged</button><button type="submit" class="cv-button cv-primary" data-maintenance-conflict-confirm>Replace saved draft</button></div></form>';
  let finished=false;
  const finish=(confirmed:boolean)=>{if(finished)return;finished=true;signal.removeEventListener('abort',abort);if(dialog.open)dialog.close();dialog.remove();if(!signal.aborted&&previousFocus instanceof HTMLElement&&previousFocus.isConnected)previousFocus.focus({preventScroll:true});resolve(confirmed);};
  const abort=()=>finish(false);
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});dialog.addEventListener('close',()=>finish(false));
  dialog.querySelector('[data-maintenance-conflict-cancel]')?.addEventListener('click',()=>finish(false));
  dialog.querySelector('form')?.addEventListener('submit',event=>{event.preventDefault();event.stopPropagation();finish(true);});
  signal.addEventListener('abort',abort,{once:true});host.append(dialog);dialog.showModal();dialog.querySelector<HTMLButtonElement>('[data-maintenance-conflict-cancel]')?.focus();
 });
}

/** Updates only this request's conversation; the rest of the detail stays mounted. */
export function initializeMaintenanceConversation(signal:AbortSignal,requestId:string,zone:string):void{
 const host=document.querySelector<HTMLElement>('[data-maintenance-conversation]');
 if(!host||host.dataset.requestId!==requestId)return;
 const find=<T extends Element>(selector:string)=>host.querySelector<T>(selector)!;
 const form=find<HTMLFormElement>('[data-maintenance-conversation-form]');
 const body=find<HTMLTextAreaElement>('[data-maintenance-conversation-body]');
 const channel=find<HTMLSelectElement>('[data-maintenance-conversation-channel]');
 const send=find<HTMLButtonElement>('[data-maintenance-conversation-send]');
 const save=find<HTMLButtonElement>('[data-maintenance-conversation-save]');
 const stream=find<HTMLOListElement>('[data-maintenance-conversation-stream]');
 const viewport=find<HTMLDivElement>('[data-maintenance-conversation-viewport]');
 const error=find<HTMLElement>('[data-maintenance-conversation-error]');
 const connection=find<HTMLElement>('[data-maintenance-conversation-connection]');
 const draftState=find<HTMLElement>('[data-maintenance-conversation-draft-state]');
 const older=find<HTMLButtonElement>('[data-maintenance-conversation-older]');
 const olderState=find<HTMLElement>('[data-maintenance-conversation-older-state]');
 const fresh=find<HTMLButtonElement>('[data-maintenance-conversation-new]');
 const retry=find<HTMLButtonElement>('[data-maintenance-conversation-retry]');
 const recover=find<HTMLButtonElement>('[data-maintenance-conversation-recover]');
 const announce=find<HTMLElement>('[data-maintenance-conversation-announcement]');
 const base='/api/maintenance/'+encodeURIComponent(requestId)+'/conversation';
 const messages=new Map<string,MaintenanceConversationMessage>();
 const rendered=new Map<string,string>();
 const unseen=new Set<string>();
 let detail:MaintenanceConversation|null=null,initialized=false,loading=false,loadingOlder=false,sending=false,preparingReply=false;
 let olderCursor:string|null=null,newerCursor:string|null=null,hasOlder=false;
 let draftVersion=0,savedFingerprint='',saveWork:Promise<boolean>|null=null,draftBlocked=false,recovering=false;
 let pollTimer:ReturnType<typeof setTimeout>|undefined,draftTimer:ReturnType<typeof setTimeout>|undefined;
 let failures=0,pendingReply:{fingerprint:string;payload:ReplyBody}|null=null;
 let lastFailed:MaintenanceConversationMessage|null=null;
 let savePayload:{fingerprint:string;requestKey:string}|null=null;
 const compositionFingerprint=(text:string,selected:string)=>JSON.stringify({body:text,channel:selected});
 const fingerprint=()=>compositionFingerprint(body.value,channel.value);
 const nearBottom=()=>viewport.scrollHeight-viewport.scrollTop-viewport.clientHeight<64;
 const isDraftDirty=()=>fingerprint()!==savedFingerprint;
 const showError=(issue:unknown)=>{error.textContent=productError(issue);};
 const clearError=()=>{error.textContent='';};
 const setDraft=(draft:MaintenanceConversationDraft|null,fill:boolean)=>{
  if(draft)draftVersion=draft.version;else if(fill)draftVersion=0;
  if(fill){body.value=draft?.body??'';channel.value=draft?.channel??'resident_portal';savedFingerprint=fingerprint();draftState.textContent=body.value?'Draft saved.':'Drafts are private to you.';}
 };
 const currentTransport=()=>channel.value==='email'?detail?.transport.email:detail?.transport.portal;
 const updateControls=()=>{
  const allowed=Boolean(detail?.access.canReply),transport=currentTransport();
  form.hidden=!allowed;find<HTMLElement>('[data-maintenance-conversation-readonly]').hidden=allowed;
  const email=channel.querySelector<HTMLOptionElement>('option[value=email]');if(email)email.disabled=!detail?.resident.email;
  send.disabled=sending||preparingReply||draftBlocked||!allowed||!transport?.available||!body.value.trim();
  save.disabled=Boolean(saveWork)||sending||preparingReply||draftBlocked||!allowed;
  find<HTMLElement>('[data-maintenance-conversation-channel-hint]').textContent=channel.value==='email'
   ?detail?.transport.email.reason??'Email delivery is not configured. You can save a private draft.'
   :detail?.transport.portal.available?'Messages are available in the resident portal.':detail?.transport.portal.reason??'Resident portal messaging is unavailable.';
 };
 const blockDraft=(issue:unknown)=>{draftBlocked=true;clearTimeout(draftTimer);recover.hidden=false;draftState.textContent='Newer draft saved · text kept here';showError(issue);updateControls();};
 const updateNewIndicator=()=>{fresh.hidden=unseen.size===0;fresh.textContent=unseen.size===1?'1 new message':unseen.size+' new messages';};
 const jumpToLatest=(focus=false)=>{viewport.scrollTop=viewport.scrollHeight;unseen.clear();updateNewIndicator();if(focus)viewport.focus({preventScroll:true});};
 function merge(items:MaintenanceConversationMessage[],mode:'initial'|'older'|'new'):void{
  const wasAtBottom=nearBottom(),oldTop=viewport.scrollTop,oldHeight=viewport.scrollHeight;
  let added=0;
  for(const item of items){if(!messages.has(item.id)){added++;if(mode==='new'&&!wasAtBottom)unseen.add(item.id);}messages.set(item.id,item);}
  const ordered=[...messages.values()].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)||a.id.localeCompare(b.id));
  const existing=new Map([...stream.querySelectorAll<HTMLElement>('[data-message-id]')].map(node=>[node.dataset.messageId!,node]));
  for(const item of ordered){
   const html=maintenanceConversationMessage(item,zone),node=existing.get(item.id);
   if(node){if(rendered.get(item.id)!==html){const template=document.createElement('template');template.innerHTML=html;node.replaceWith(template.content.firstElementChild!);}}
   else{const template=document.createElement('template');template.innerHTML=html;const after=ordered.slice(ordered.indexOf(item)+1).find(next=>stream.querySelector('[data-message-id="'+CSS.escape(next.id)+'"]'));const reference=after?stream.querySelector('[data-message-id="'+CSS.escape(after.id)+'"]'):null;stream.insertBefore(template.content.firstElementChild!,reference);}
   rendered.set(item.id,html);
  }
  find<HTMLElement>('[data-maintenance-conversation-empty]').hidden=messages.size>0;
  if(mode==='initial'||mode==='new'&&wasAtBottom)jumpToLatest();
  else if(mode==='older')viewport.scrollTop=oldTop+(viewport.scrollHeight-oldHeight);
  else viewport.scrollTop=oldTop;
  if(added&&mode==='new')announce.textContent=added===1?'New conversation message.':added+' new conversation messages.';
  updateNewIndicator();
 }
 const apply=(result:MaintenanceConversation,mode:'initial'|'older'|'new')=>{
  detail=result;
  if(mode!=='older')newerCursor=result.messages.newerCursor??newerCursor;
  if(mode==='initial'||mode==='older'){olderCursor=result.messages.olderCursor;hasOlder=result.messages.hasOlder;older.hidden=!hasOlder;}
  find<HTMLElement>('[data-maintenance-conversation-content]').hidden=false;
  const changed=result.messages.stateUpdates.filter(item=>messages.has(item.id)||result.messages.items.some(message=>message.id===item.id));
  merge([...result.messages.items,...changed],mode);
  const resident=find<HTMLElement>('[data-maintenance-conversation-resident]');resident.hidden=false;resident.textContent=presentRecordText(result.resident.name)+(result.resident.email?' · '+result.resident.email:' · No email recorded');
  if(mode==='initial')setDraft(result.draft,true);
  find<HTMLElement>('[data-maintenance-conversation-content]').hidden=false;
  retry.hidden=true;updateControls();
 };
 const schedulePoll=(delay=pollInterval)=>{clearTimeout(pollTimer);if(!signal.aborted)pollTimer=setTimeout(()=>{void poll();},delay);};
 const load=async()=>{
  if(loading||signal.aborted)return;loading=true;retry.disabled=true;connection.textContent='Loading conversation…';
  try{const result=await api<MaintenanceConversation>(base,{signal});if(signal.aborted)return;apply(result,initialized?'new':'initial');initialized=true;failures=0;connection.textContent='Up to date';clearError();schedulePoll();}
  catch(issue){if(!signal.aborted){connection.textContent='Unable to load';showError(issue);retry.hidden=false;}}
  finally{loading=false;if(!signal.aborted)retry.disabled=false;}
 };
 async function poll():Promise<void>{
  if(signal.aborted||!initialized)return;
  if(document.visibilityState==='hidden'){schedulePoll();return;}
  if(loading||loadingOlder){schedulePoll();return;}loading=true;
  try{
   const params=new URLSearchParams();if(newerCursor)params.set('after',newerCursor);
   const result=await api<MaintenanceConversation>(base+(params.size?'?'+params:''),{signal});if(signal.aborted)return;
   apply(result,'new');failures=0;connection.textContent='Up to date';schedulePoll(result.messages.hasNewer?250:pollInterval);
  }catch(issue){if(!signal.aborted){if(issue instanceof ApiError&&(issue.status===401||issue.status===403||issue.status===404)){detail=null;find<HTMLElement>('[data-maintenance-conversation-content]').hidden=true;connection.textContent='Access unavailable';showError(issue);retry.hidden=false;updateControls();}else{failures++;connection.textContent='Updates paused · retrying';schedulePoll(Math.min(60000,pollInterval*2**Math.min(failures,3)));}}}
  finally{loading=false;}
 }
 const saveDraft=async():Promise<boolean>=>{
  clearTimeout(draftTimer);
  if(signal.aborted||!detail?.access.canReply||sending||draftBlocked)return false;
  if(saveWork){await saveWork;if(signal.aborted)return false;if(!isDraftDirty())return true;return saveDraft();}
  if(!isDraftDirty()){draftState.textContent=body.value?'Draft saved.':'Drafts are private to you.';return true;}
  const saveFocus=document.activeElement;
  const snapshot={body:body.value,channel:channel.value as Channel,version:draftVersion};
  const snapshotFingerprint=compositionFingerprint(snapshot.body,snapshot.channel),payloadFingerprint=JSON.stringify(snapshot);
  if(savePayload?.fingerprint!==payloadFingerprint)savePayload={fingerprint:payloadFingerprint,requestKey:crypto.randomUUID()};
  draftState.textContent='Saving draft…';
  const work=(async()=>{
   try{const result=await api<{draft:MaintenanceConversationDraft}>(base+'/draft',{method:'PUT',body:JSON.stringify({...snapshot,requestKey:savePayload!.requestKey}),signal});if(signal.aborted)return false;setDraft(result.draft,false);savedFingerprint=snapshotFingerprint;draftState.textContent=isDraftDirty()?'Unsaved changes':'Draft saved.';clearError();return true;}
   catch(issue){if(!signal.aborted){if(issue instanceof ApiError&&issue.status===409)blockDraft(issue);else{draftState.textContent='Draft not saved · text kept here';showError(issue);}}return false;}
  })();
  saveWork=work;updateControls();
  try{return await work;}finally{saveWork=null;if(!signal.aborted){updateControls();if(isDraftDirty()&&fingerprint()!==snapshotFingerprint)queueDraft();if(document.activeElement===document.body&&saveFocus===save)save.focus({preventScroll:true});}}
 };
 const queueDraft=()=>{clearTimeout(draftTimer);if(draftBlocked){draftState.textContent='Newer draft saved · text kept here';return;}draftState.textContent='Unsaved changes';if(!sending)draftTimer=setTimeout(()=>{void saveDraft();},800);};
 const performReply=async(retryItem?:MaintenanceConversationMessage)=>{
  if(!detail?.access.canReply||sending||preparingReply||draftBlocked||signal.aborted)return;
  const initiatingFocus=document.activeElement;
  const snapshot={body:retryItem?.body??body.value,channel:retryItem?.channel??channel.value as Channel};
  if(!snapshot.body.trim()||snapshot.body.length>4000)return;
  const transport=snapshot.channel==='email'?detail.transport.email:detail.transport.portal;if(!transport.available){error.textContent=transport.reason??'This delivery channel is unavailable.';return;}
  clearTimeout(draftTimer);
  const snapshotFingerprint=compositionFingerprint(snapshot.body,snapshot.channel);
  preparingReply=true;updateControls();
  if(saveWork)await saveWork;
  if(!retryItem&&(!pendingReply||pendingReply.fingerprint!==snapshotFingerprint)&&!(await saveDraft())){preparingReply=false;updateControls();if(document.activeElement===document.body&&initiatingFocus===send)body.focus({preventScroll:true});return;}
  if(signal.aborted){preparingReply=false;return;}
  const failed=retryItem??(lastFailed?.body===snapshot.body&&lastFailed.channel===snapshot.channel?lastFailed:undefined);
  if(pendingReply?.fingerprint!==snapshotFingerprint||failed&&pendingReply.payload.retryMessageId!==failed.id){pendingReply={fingerprint:snapshotFingerprint,payload:{...snapshot,requestKey:crypto.randomUUID(),draftVersion,...(failed?{retryMessageId:failed.id}:{})}};}
  const payload={...pendingReply.payload};sending=true;preparingReply=false;updateControls();form.setAttribute('aria-busy','true');clearError();
  const retryButton=retryItem?stream.querySelector<HTMLButtonElement>('[data-maintenance-conversation-retry-message="'+CSS.escape(retryItem.id)+'"]'):null;
  if(retryButton)retryButton.disabled=true;
  try{
   const result=await api<MaintenanceConversationReplyResult>(base+'/replies',{method:'POST',body:JSON.stringify(payload),signal});if(signal.aborted)return;
   merge([result.message],'new');setDraft(result.draft,false);pendingReply=null;
   if(result.message.state==='failed'){lastFailed=result.message;draftState.textContent='Draft saved · delivery failed';error.textContent='The message could not be made available in the resident portal. Retry the failed message when ready.';}
   else{
    lastFailed=null;
    if(fingerprint()===snapshotFingerprint&&result.draft?.body===''&&result.draft.channel===snapshot.channel){body.value='';savedFingerprint=fingerprint();draftState.textContent='Drafts are private to you.';}
    else{savedFingerprint=compositionFingerprint(result.draft?.body??'',result.draft?.channel??channel.value);draftState.textContent=isDraftDirty()?'Unsaved changes':body.value?'Draft saved.':'Drafts are private to you.';}
    announce.textContent=stateLabel[result.message.state]+'.';
   }
   connection.textContent='Up to date';schedulePoll(250);
  }catch(issue){if(!signal.aborted){if(issue instanceof ApiError&&issue.status===409){pendingReply=null;blockDraft(issue);}else{showError(issue);draftState.textContent='Not confirmed · text kept here';}}}
  finally{sending=false;if(!signal.aborted){form.removeAttribute('aria-busy');updateControls();if(retryButton?.isConnected)retryButton.disabled=false;if(isDraftDirty()&&(!pendingReply||fingerprint()!==pendingReply.fingerprint))queueDraft();if(document.activeElement===document.body&&(initiatingFocus===send||initiatingFocus===retryButton))body.focus({preventScroll:true});}}
 };
 body.addEventListener('input',()=>{updateControls();queueDraft();},{signal});
 channel.addEventListener('change',()=>{updateControls();queueDraft();},{signal});
 form.addEventListener('submit',event=>{event.preventDefault();event.stopPropagation();if(form.reportValidity())void performReply();},{signal});
 save.addEventListener('click',()=>{void saveDraft();},{signal});
 retry.addEventListener('click',()=>{void load();},{signal});
 recover.addEventListener('click',()=>{
  if(recovering||!draftBlocked||signal.aborted)return;recovering=true;recover.disabled=true;
  void(async()=>{try{const latest=await api<MaintenanceConversation>(base,{signal});if(signal.aborted)return;apply(latest,'new');const confirmed=await confirmDraftReplacement(host,latest.draft,{body:body.value,channel:channel.value as Channel},signal);if(!confirmed||signal.aborted)return;draftVersion=latest.draft?.version??0;savedFingerprint=compositionFingerprint(latest.draft?.body??'',latest.draft?.channel??'resident_portal');draftBlocked=false;recover.hidden=true;clearError();await saveDraft();}catch(issue){if(!signal.aborted)showError(issue);}finally{recovering=false;if(!signal.aborted){recover.disabled=false;updateControls();if(document.activeElement===document.body){if(!recover.hidden)recover.focus({preventScroll:true});else body.focus({preventScroll:true});}}}})();
 },{signal});
 fresh.addEventListener('click',()=>{jumpToLatest(true);},{signal});
 viewport.addEventListener('scroll',()=>{if(nearBottom()){unseen.clear();updateNewIndicator();}},{signal,passive:true});
 older.addEventListener('click',()=>{
  if(loadingOlder||loading||!hasOlder||!olderCursor||signal.aborted)return;loadingOlder=true;older.disabled=true;olderState.textContent='Loading…';
  void(async()=>{try{const result=await api<MaintenanceConversation>(base+'?'+new URLSearchParams({before:olderCursor!}),{signal});if(signal.aborted)return;apply(result,'older');olderState.textContent='';}catch(issue){if(!signal.aborted){olderState.textContent='Earlier messages could not load.';showError(issue);}}finally{loadingOlder=false;if(!signal.aborted)older.disabled=false;}})();
 },{signal});
 stream.addEventListener('click',event=>{const button=event.target instanceof Element?event.target.closest<HTMLButtonElement>('[data-maintenance-conversation-retry-message]'):null;if(!button||button.disabled)return;const item=messages.get(button.dataset.maintenanceConversationRetryMessage??'');if(item?.canRetry)void performReply(item);},{signal});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&initialized&&!loading)schedulePoll(250);},{signal});
 signal.addEventListener('abort',()=>{clearTimeout(pollTimer);clearTimeout(draftTimer);},{once:true});
 void load();
}
