import {api,ApiError} from './api';
import {productError} from './product-copy';
import type {ConversationWorkspace} from '../pages/conversations';
import type {ConversationConfiguration,ConversationDirectory,ConversationDetail} from '../../shared/conversation-contracts';
import type {AiOptions} from '../../shared/ai-contracts';
type Navigate=(path:string,replace?:boolean,focusSelector?:string)=>void;
export async function loadConversationWorkspace(query:URLSearchParams,signal:AbortSignal):Promise<ConversationWorkspace>{
 try{
  const params=new URLSearchParams({page:query.get('page')??'1',pageSize:query.get('pageSize')??'20',ownership:query.get('ownership')??'all',q:query.get('q')??''});if(query.get('propertyId'))params.set('propertyId',query.get('propertyId')!);
  const[configuration,directory,detail]=await Promise.all([api<ConversationConfiguration>('/api/conversations/config',{signal}),api<ConversationDirectory>('/api/conversations?'+params,{signal}),query.get('conversation')?api<ConversationDetail>('/api/conversations/'+encodeURIComponent(query.get('conversation')!)+'?'+new URLSearchParams({page:query.get('messagesPage')??'1',pageSize:query.get('messagesPageSize')??'25'}),{signal}):null]);
  const options=configuration.canConfigure&&!detail?await api<AiOptions>('/api/ai/options?'+new URLSearchParams({propertySearch:query.get('propertySearch')??'',pageSize:'25'}),{signal}):null;
  return{kind:'ready',configuration,directory,detail,options};
 }catch(issue){if(issue instanceof ApiError&&issue.status===403)return{kind:'restricted',message:productError(issue)};throw issue;}
}
export function initializeConversationWorkspace(signal:AbortSignal,navigate:Navigate):void{
 const host=document.querySelector<HTMLElement>('[data-conversation-workspace]');if(!host)return;
 const error=(issue:unknown,scope:HTMLElement=host)=>{const node=scope.querySelector<HTMLElement>('[data-conversation-error]')??host.querySelector<HTMLElement>('[data-conversation-global-error]');if(node){node.textContent=productError(issue);node.tabIndex=-1;node.focus();}};
 const id=host.querySelector<HTMLElement>('[data-conversation-detail]')?.dataset.conversationId;
 const perform=async(button:HTMLButtonElement,endpoint:string,body:Record<string,unknown>,scope:HTMLElement=host)=>{if(button.disabled)return;const payload=JSON.stringify(body);if(button.dataset.payload!==payload){button.dataset.payload=payload;button.dataset.requestKey=crypto.randomUUID();}button.disabled=true;scope.setAttribute('aria-busy','true');try{const result=await api<ConversationDetail|ConversationConfiguration|{detail:ConversationDetail}>(endpoint,{method:'POST',body:JSON.stringify({...body,requestKey:button.dataset.requestKey}),signal});if(signal.aborted)return;const next=id??('detail'in result?result.detail.conversation.id:'conversation'in result?result.conversation.id:undefined);navigate('/admin/conversations?'+new URLSearchParams({...(next?{conversation:next}:{}),saved:'1'}),true,'[data-conversation-saved]');}catch(issue){if(!signal.aborted)error(issue,scope);}finally{if(!signal.aborted){button.disabled=false;scope.removeAttribute('aria-busy');}}};
 host.addEventListener('click',event=>{const button=event.target instanceof Element?event.target.closest<HTMLButtonElement>('button'):null;if(!button)return;
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
  else return;
  void perform(button,endpoint,body,form);
 },{signal});
}
