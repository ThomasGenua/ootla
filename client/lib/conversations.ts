import {api,ApiError} from './api';
import {productError} from './product-copy';
import {patchLocalHtml} from './local-update';
import {conversationChatMessages,type ConversationWorkspace} from '../pages/conversations';
import type {ConversationConfiguration,ConversationDirectory,ConversationDetail} from '../../shared/conversation-contracts';
import type {AiOptions} from '../../shared/ai-contracts';
type Navigate=(path:string,replace?:boolean,focusSelector?:string)=>void;
async function latestConversation(id:string,signal:AbortSignal,initial?:ConversationDetail):Promise<ConversationDetail>{
 const first=initial??await api<ConversationDetail>('/api/conversations/'+encodeURIComponent(id),{signal}),page=Math.max(1,Math.ceil(first.messages.total/25));
 return first.messages.page===page&&first.messages.pageSize===25?first:api<ConversationDetail>('/api/conversations/'+encodeURIComponent(id)+'?'+new URLSearchParams({page:String(page),pageSize:'25'}),{signal});
}
export async function loadConversationWorkspace(query:URLSearchParams,signal:AbortSignal):Promise<ConversationWorkspace>{
 try{
  const params=new URLSearchParams({page:query.get('page')??'1',pageSize:query.get('pageSize')??'20',ownership:query.get('ownership')??'all',q:query.get('q')??''});if(query.get('propertyId'))params.set('propertyId',query.get('propertyId')!);
  const id=query.get('conversation'),explicit=query.get('messagesPage');
  const[configuration,directory,detail]=await Promise.all([api<ConversationConfiguration>('/api/conversations/config',{signal}),id?{items:[],total:0,page:1,pageSize:20,totalPages:0}:api<ConversationDirectory>('/api/conversations?'+params,{signal}),id?(explicit?api<ConversationDetail>('/api/conversations/'+encodeURIComponent(id)+'?'+new URLSearchParams({page:explicit,pageSize:query.get('messagesPageSize')??'25'}),{signal}):latestConversation(id,signal)):null]);
  const options=configuration.canConfigure&&!detail?await api<AiOptions>('/api/ai/options?'+new URLSearchParams({propertySearch:query.get('propertySearch')??'',pageSize:'25'}),{signal}):null;
  return{kind:'ready',configuration,directory,detail,options};
 }catch(issue){if(issue instanceof ApiError&&issue.status===403)return{kind:'restricted',message:productError(issue)};throw issue;}
}
export function initializeConversationWorkspace(signal:AbortSignal,navigate:Navigate,initial:ConversationWorkspace):void{
 const host=document.querySelector<HTMLElement>('[data-conversation-workspace]');if(!host||initial.kind!=='ready')return;
 let mutationVersion=0;
 let detail=initial.detail,busy=false,follow=true,firstPage=detail?.messages.page??1;
 const id=detail?.conversation.id,scroll=host.querySelector<HTMLElement>('[data-conversation-scroll]'),stream=host.querySelector<HTMLElement>('[data-conversation-messages]');
 const loaded=new Map((detail?.messages.items??[]).map(message=>[message.id,message]));
 const alive=()=>!signal.aborted&&host.isConnected;
 const error=(issue:unknown,scope:HTMLElement=host)=>{const node=scope.querySelector<HTMLElement>('[data-conversation-error]')??host.querySelector<HTMLElement>('[data-conversation-global-error]');if(node)node.textContent=productError(issue);if(issue instanceof ApiError&&issue.status===401)navigate('/admin/login?returnTo='+encodeURIComponent(location.pathname+location.search),true);};
 const latest=()=>{if(scroll){scroll.scrollTop=scroll.scrollHeight;follow=true;}const button=host.querySelector<HTMLElement>('[data-conversation-latest]');if(button)button.hidden=true;};
 const pages=()=>{const node=host.querySelector<HTMLElement>('[data-conversation-pages]');if(node)patchLocalHtml(node,firstPage>1?'<button type="button" class="cv-chat-latest" data-conversation-earlier>Earlier messages</button>':'');};
 const render=()=>{if(!detail||!stream)return;const position=scroll?.scrollTop??0;patchLocalHtml(stream,conversationChatMessages({...detail,messages:{...detail.messages,items:[...loaded.values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))}}));host.querySelector('[data-conversation-empty]')?.remove();pages();
  for(const button of host.querySelectorAll<HTMLButtonElement>('[data-conversation-ownership]'))button.hidden=button.dataset.conversationOwnership===detail.conversation.ownership;
  if(follow)latest();else if(scroll){scroll.scrollTop=position;const button=host.querySelector<HTMLElement>('[data-conversation-latest]');if(button)button.hidden=false;}
 };
 const adopt=async(saved:ConversationDetail,version=mutationVersion)=>{const next=await latestConversation(saved.conversation.id,signal,saved);if(!alive()||next.conversation.id!==id||version!==mutationVersion)return;
  for(const item of saved.messages.items)if(loaded.has(item.id))loaded.set(item.id,item);
  for(const item of next.messages.items)loaded.set(item.id,item);detail=next;render();
 };
 const perform=async(button:HTMLButtonElement,endpoint:string,body:Record<string,unknown>,scope:HTMLElement=host)=>{
  if(button.disabled||busy)return;const payload=JSON.stringify(body);if(button.dataset.payload!==payload){button.dataset.payload=payload;button.dataset.requestKey=crypto.randomUUID();}
  mutationVersion++;busy=true;button.disabled=true;button.setAttribute('aria-busy','true');const output=scope.querySelector<HTMLElement>('[data-conversation-error]');if(output)output.textContent='';
  const feedback=host.querySelector<HTMLElement>('[data-conversation-saved]');if(feedback)feedback.textContent='Saving…';if(scope.matches('[data-conversation-form="reply"]'))latest();
  try{
   const result=await api<ConversationDetail|ConversationConfiguration|{detail:ConversationDetail}>(endpoint,{method:'POST',body:JSON.stringify({...body,requestKey:button.dataset.requestKey}),signal});if(!alive())return;
   if(id&&'conversation'in result){await adopt(result);if(!alive())return;
    const input=scope.querySelector<HTMLTextAreaElement>('[name=body]');if(input&&input.value.trim()===body.body)input.value='';
    if(feedback)feedback.textContent=body.kind==='staff'?'Reply saved. Check its message status.':'Updated.';
    host.querySelectorAll<HTMLDetailsElement>('.cv-chat-menu').forEach(menu=>menu.open=false);
   }else{const next='detail'in result?result.detail.conversation.id:'conversation'in result?result.conversation.id:undefined;navigate('/admin/conversations?'+new URLSearchParams({...(next?{conversation:next}:{}),saved:'1'}),true,'[data-conversation-saved]');}
  }catch(issue){if(alive()){error(issue,scope);if(feedback)feedback.textContent='Your message is kept. Try again.';}}
  finally{busy=false;if(alive()){button.disabled=false;button.removeAttribute('aria-busy');}}
 };
 scroll?.addEventListener('scroll',()=>{follow=scroll.scrollHeight-scroll.clientHeight-scroll.scrollTop<=64;const button=host.querySelector<HTMLElement>('[data-conversation-latest]');if(button&&follow)button.hidden=true;},{signal,passive:true});
 host.addEventListener('click',event=>{const button=event.target instanceof Element?event.target.closest<HTMLButtonElement>('button'):null;if(!button)return;
  if(button.hasAttribute('data-conversation-latest')){latest();return;}
  if(button.hasAttribute('data-conversation-earlier')&&id&&!busy){const version=mutationVersion;button.disabled=true;void(async()=>{try{const next=await api<ConversationDetail>('/api/conversations/'+encodeURIComponent(id)+'?'+new URLSearchParams({page:String(firstPage-1),pageSize:'25'}),{signal});if(!alive()||version!==mutationVersion)return;const height=scroll?.scrollHeight??0,top=scroll?.scrollTop??0;for(const item of next.messages.items)loaded.set(item.id,item);firstPage=next.messages.page;follow=false;render();if(scroll)scroll.scrollTop=top+scroll.scrollHeight-height;}catch(issue){error(issue);}finally{if(button.isConnected)button.disabled=false;}})();return;}
  if(button.hasAttribute('data-conversation-refresh')&&id&&!busy){const version=mutationVersion;button.disabled=true;void(async()=>{try{await adopt(await api<ConversationDetail>('/api/conversations/'+encodeURIComponent(id),{signal}),version);}catch(issue){if(alive())error(issue);}finally{if(button.isConnected)button.disabled=false;}})();return;}
  if(button.hasAttribute('data-conversation-ownership')&&id){void perform(button,'/api/conversations/'+encodeURIComponent(id)+'/ownership',{ownership:button.dataset.conversationOwnership});return;}
  if(button.hasAttribute('data-conversation-channel'))void perform(button,'/api/conversations/channels',{propertyId:button.dataset.propertyId,label:button.dataset.label,enabled:button.dataset.enabled!=='true',timeZone:button.dataset.timeZone,quietStart:Number(button.dataset.quietStart),quietEnd:Number(button.dataset.quietEnd)});
 },{signal});
 host.addEventListener('submit',event=>{const form=event.target;if(!(form instanceof HTMLFormElement))return;
  if(form.hasAttribute('data-conversation-filter')){event.preventDefault();const query=new URLSearchParams();for(const[key,value]of new FormData(form))if(typeof value==='string'&&value.trim())query.set(key,value.trim());navigate('/admin/conversations?'+query);return;}
  if(!form.hasAttribute('data-conversation-form'))return;event.preventDefault();if(!form.reportValidity())return;const data=new FormData(form),value=(key:string)=>String(data.get(key)??'').trim(),button=form.querySelector<HTMLButtonElement>('button[type=submit]');if(!button||button.disabled)return;
  const action=form.dataset.conversationForm;let endpoint='/api/conversations',body:Record<string,unknown>={};
  if(action==='publish'){endpoint+='/channels';body={propertyId:value('propertyId'),label:value('label'),enabled:true,timeZone:value('timeZone'),quietStart:Number(value('quietStart')),quietEnd:Number(value('quietEnd'))};}
  else if(action==='simulate'){endpoint+='/simulate';body={channelId:value('channelId'),name:value('name'),message:value('message'),consent:data.get('consent')==='on'};}
  else if(id){endpoint+='/'+encodeURIComponent(id);if(action==='reply'){endpoint+='/messages';body={body:value('body'),kind:value('kind')};}else if(action==='approve'){endpoint+='/drafts/'+encodeURIComponent(form.dataset.messageId!)+'/approve';body={body:value('body')};}else if(action==='process'){endpoint+='/process';body={outcome:value('outcome')};}else if(action==='inbound'){endpoint+='/simulate-inbound';body={message:value('message')};}else return;}
  else return;void perform(button,endpoint,body,form);
 },{signal});
 host.querySelector<HTMLTextAreaElement>('#conversation-reply')?.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229){event.preventDefault();host.querySelector<HTMLFormElement>('[data-conversation-form="reply"]')?.requestSubmit();}},{signal});
 pages();latest();
}
