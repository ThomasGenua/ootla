import {resolveUserTimeZone} from './user-time';
import {api,ApiError} from './api';
import {productError} from './product-copy';
import {patchLocalHtml} from './local-update';
import {aiChatMessages} from '../pages/ai-assistant';
import type {AiConfiguration,AiOptions,AiResponse} from '../../shared/ai-contracts';
import type {AskContext,AskThreadDetail} from '../../shared/conversation-contracts';
export type AiWorkspace={kind:'ready';configuration:AiConfiguration;options:AiOptions;thread:AskThreadDetail|null;result:AiResponse|null}|{kind:'restricted';message:string};
type Navigate=(path:string,replace?:boolean,focusSelector?:string)=>void;
const threads='/api/ask/threads';
async function latestThread(id:string,signal:AbortSignal,initial?:AskThreadDetail):Promise<AskThreadDetail>{
 const first=initial??await api<AskThreadDetail>(threads+'/'+encodeURIComponent(id),{signal});
 const page=Math.max(1,Math.ceil(first.messages.total/25));
 return first.messages.page===page&&first.messages.pageSize===25?first:api<AskThreadDetail>(threads+'/'+encodeURIComponent(id)+'?'+new URLSearchParams({page:String(page),pageSize:'25'}),{signal});
}
export async function loadAiWorkspace(query:URLSearchParams,signal:AbortSignal):Promise<AiWorkspace>{
 try{
  const[configuration,thread,result]=await Promise.all([api<AiConfiguration>('/api/ai/config',{signal}),query.get('thread')?latestThread(query.get('thread')!,signal):null,query.get('request')?api<AiResponse>('/api/ai/requests/'+encodeURIComponent(query.get('request')!),{signal}):null]);
  const params=new URLSearchParams({pageSize:'25'});
  const propertyId=query.get('propertyId')??thread?.thread.context.propertyId;if(propertyId)params.set('propertyId',propertyId);
  if(query.get('propertySearch'))params.set('propertySearch',query.get('propertySearch')!);
  const options=await api<AiOptions>('/api/ai/options?'+params,{signal});
  return{kind:'ready',configuration,options,thread,result};
 }catch(issue){if(issue instanceof ApiError&&issue.status===403)return{kind:'restricted',message:productError(issue)};throw issue;}
}
export function initializeAiAssistant(signal:AbortSignal,navigate:Navigate,data:AiWorkspace):void{
 const workspace=document.querySelector<HTMLElement>('[data-ai-workspace]');if(!workspace||data.kind!=='ready')return;
 const form=workspace.querySelector<HTMLFormElement>('[data-ai-request]')!,input=form.querySelector<HTMLTextAreaElement>('[name=message]')!,select=workspace.querySelector<HTMLSelectElement>('[data-ai-property]')!,messages=workspace.querySelector<HTMLElement>('[data-ai-messages]')!,scroll=workspace.querySelector<HTMLElement>('[data-ai-scroll]')!,error=form.querySelector<HTMLElement>('[data-ai-error]')!,feedback=form.querySelector<HTMLElement>('[data-ai-feedback]')!,pending=workspace.querySelector<HTMLElement>('[data-ai-pending]')!,local=workspace.querySelector<HTMLElement>('[data-ai-local-turn]')!,starters=form.querySelector<HTMLElement>('[data-ai-starters]')!,greeting=workspace.querySelector<HTMLElement>('[data-ai-greeting]')!,finder=workspace.querySelector<HTMLFormElement>('[data-ai-property-search]')!;
 let mutationVersion=0;
 let thread=data.thread,propertyId=data.options.selectedProperty?.id??'',busy=false,follow=true,createKey=crypto.randomUUID(),optionsPage=1,optionsPages=data.options.properties.totalPages,optionsSearch='',choiceBusy=false;
 let failed:{key:string;payload:string;body:Record<string,unknown>;text:string}|null=null;
 const confirmKeys=new Map<string,string>(),loaded=new Map((thread?.messages.items??[]).map(message=>[message.id,message]));let firstLoadedPage=thread?.messages.page??1;
 const alive=()=>!signal.aborted&&workspace.isConnected;
 const fail=(issue:unknown)=>{if(!alive())return;error.textContent=productError(issue);if(issue instanceof ApiError&&issue.status===401)navigate('/admin/login?returnTo='+encodeURIComponent(location.pathname+location.search),true);};
 const url=()=>{const next=new URL(location.href);for(const key of ['request','recordSearch','applicationId','leadId','knowledgeSearch','knowledgePage','propertySearch','page','pageSize'])next.searchParams.delete(key);if(propertyId)next.searchParams.set('propertyId',propertyId);else next.searchParams.delete('propertyId');if(thread)next.searchParams.set('thread',thread.thread.id);else next.searchParams.delete('thread');history.replaceState(history.state,'',next.pathname+next.search+next.hash);};
 const near=()=>scroll.scrollHeight-scroll.clientHeight-scroll.scrollTop<65;
 const latest=()=>{scroll.scrollTop=scroll.scrollHeight;follow=true;form.querySelector<HTMLElement>('[data-ai-latest]')!.hidden=true;};
 const controls=()=>{form.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled=busy||!propertyId||!data.configuration.access.canRun;select.disabled=busy;workspace.querySelector<HTMLButtonElement>('[data-ai-new]')!.disabled=busy;pending.hidden=!busy;form.setAttribute('aria-busy',String(busy));};
 const pages=()=>{const host=workspace.querySelector<HTMLElement>('[data-ai-history-pages]')!;patchLocalHtml(host,thread&&firstLoadedPage>1?'<button type="button" class="ai-text-button" data-ai-earlier>Earlier messages</button>':'');};
 const render=(reveal=false)=>{const position=scroll.scrollTop;patchLocalHtml(messages,aiChatMessages(thread?{...thread,messages:{...thread.messages,items:[...loaded.values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))}}:null));greeting.hidden=Boolean(loaded.size||busy);if(loaded.size)starters.hidden=true;pages();if(reveal||follow)latest();else{scroll.scrollTop=position;form.querySelector<HTMLElement>('[data-ai-latest]')!.hidden=false;}};
 const adopt=async(saved:AskThreadDetail)=>{const value=await latestThread(saved.thread.id,signal,saved);if(!alive())return;thread=value;for(const message of value.messages.items)loaded.set(message.id,message);if(!loaded.size||firstLoadedPage===1)firstLoadedPage=value.messages.page;url();render();};
 const send=async(text:string,choiceToken?:string,retry=false)=>{
  if(busy||!propertyId||!text.trim()||!data.configuration.access.canRun)return;
  const context:AskContext={page:'/admin/ai',propertyId};
  const body:Record<string,unknown>={message:text.trim(),pageContext:context,timeZone:resolveUserTimeZone(),...(choiceToken?{choiceToken}:{})},payload=JSON.stringify(body);
  const turn=retry&&failed?failed:failed?.payload===payload?failed:{key:crypto.randomUUID(),payload,body,text:text.trim()};
  mutationVersion++;busy=true;controls();error.textContent='';feedback.textContent='';follow=true;starters.hidden=true;greeting.hidden=true;
  const question=document.createElement('article');question.className='ask-message';question.dataset.role='staff';const title=document.createElement('strong'),content=document.createElement('p');title.textContent='You';content.className='ask-message-body';content.textContent=turn.text;question.append(title,content);local.replaceChildren(question);latest();
  try{
   if(!thread){thread=await api<AskThreadDetail>(threads,{method:'POST',body:JSON.stringify({requestKey:createKey,context}),signal});if(!alive())return;url();}
   const saved=await api<AskThreadDetail>(threads+'/'+encodeURIComponent(thread.thread.id)+'/messages',{method:'POST',body:JSON.stringify({...turn.body,requestKey:turn.key}),signal});
   if(!alive())return;await adopt(saved);if(!alive())return;failed=null;local.replaceChildren();if(input.value.trim()===turn.text)input.value='';feedback.textContent='Reply ready.';render();
  }catch(issue){if(alive()){failed=turn;fail(issue);const retryButton=document.createElement('button');retryButton.type='button';retryButton.className='ai-text-button';retryButton.dataset.aiRetry='';retryButton.textContent='Retry this question';local.append(retryButton);feedback.textContent='Your question is kept. Retry to recover its result.';}}
  finally{if(alive()){busy=false;controls();if(follow)latest();}}
 };
 scroll.addEventListener('scroll',()=>{follow=near();form.querySelector<HTMLElement>('[data-ai-latest]')!.hidden=follow;},{signal,passive:true});
 const findProperties=async(page=1)=>{
  if(choiceBusy)return;choiceBusy=true;finder.setAttribute('aria-busy','true');const buttons=[...finder.querySelectorAll<HTMLButtonElement>('button')];for(const button of buttons)button.disabled=true;
  try{const params=new URLSearchParams({propertySearch:optionsSearch,page:String(page),pageSize:'25',...(propertyId?{propertyId}:{})}),result=await api<AiOptions>('/api/ai/options?'+params,{signal});if(!alive())return;
   const prior=select.selectedOptions[0],selectedName=prior?.textContent??'',items=result.properties.items;select.replaceChildren(new Option('Choose a property',''),...items.map(property=>new Option(property.name,property.id)),...(!items.some(property=>property.id===propertyId)&&propertyId?[new Option(selectedName,propertyId)]:[]),new Option('Find another property…','__find__'));select.value=propertyId;
   optionsPage=result.properties.page;optionsPages=result.properties.totalPages;finder.querySelector<HTMLElement>('[data-ai-property-count]')!.textContent=items.length+' of '+result.properties.total+' properties';
   finder.querySelector<HTMLButtonElement>('[data-ai-property-page="-1"]')!.hidden=optionsPage<=1;finder.querySelector<HTMLButtonElement>('[data-ai-property-page="1"]')!.hidden=optionsPage>=optionsPages;
  }catch(issue){fail(issue);}finally{choiceBusy=false;if(alive()){finder.removeAttribute('aria-busy');for(const button of buttons)button.disabled=false;}}
 };
 select.addEventListener('change',()=>{
  if(select.value==='__find__'){select.value=propertyId;finder.hidden=false;finder.querySelector<HTMLInputElement>('input')!.focus({preventScroll:true});return;}
  propertyId=select.value;failed=null;url();controls();finder.hidden=true;feedback.textContent='';
 },{signal});
 workspace.addEventListener('click',event=>{
  const button=event.target instanceof Element?event.target.closest<HTMLButtonElement>('button'):null;if(!button)return;
  if(button.hasAttribute('data-ai-property-close')){finder.hidden=true;select.focus({preventScroll:true});return;}
  if(button.dataset.aiPropertyPage){void findProperties(optionsPage+Number(button.dataset.aiPropertyPage));return;}
  if(button.dataset.aiPrompt){input.value=button.dataset.aiPrompt;input.focus({preventScroll:true});return;}
  if(button.hasAttribute('data-ai-show-suggestions')){starters.hidden=!starters.hidden;button.setAttribute('aria-expanded',String(!starters.hidden));return;}
  if(button.hasAttribute('data-ai-latest')){latest();return;}
  if(button.hasAttribute('data-ai-new')&&!busy){thread=null;loaded.clear();failed=null;firstLoadedPage=1;createKey=crypto.randomUUID();input.value='';local.replaceChildren();messages.replaceChildren();starters.hidden=false;greeting.hidden=false;feedback.textContent='';error.textContent='';url();pages();controls();input.focus({preventScroll:true});return;}
  if(button.hasAttribute('data-ai-retry')&&failed){void send(failed.text,undefined,true);return;}
  if(button.dataset.askChoice&&button.dataset.askChoiceLabel){void send(button.dataset.askChoiceLabel,button.dataset.askChoice);return;}
  if(button.hasAttribute('data-ai-earlier')&&thread&&!busy){const id=thread.thread.id,page=firstLoadedPage-1,version=mutationVersion;button.disabled=true;void(async()=>{try{const older=await api<AskThreadDetail>(threads+'/'+encodeURIComponent(id)+'?'+new URLSearchParams({page:String(page),pageSize:'25'}),{signal});if(!alive()||thread?.thread.id!==id||version!==mutationVersion)return;const height=scroll.scrollHeight,top=scroll.scrollTop;for(const message of older.messages.items)loaded.set(message.id,message);firstLoadedPage=page;follow=false;render();scroll.scrollTop=top+scroll.scrollHeight-height;}catch(issue){fail(issue);}finally{if(button.isConnected)button.disabled=false;}})();return;}
  if(button.dataset.askConfirm&&thread&&!busy){const actionId=button.dataset.askConfirm,id=thread.thread.id,key=confirmKeys.get(actionId)??crypto.randomUUID();confirmKeys.set(actionId,key);mutationVersion++;busy=true;controls();button.disabled=true;error.textContent='';void(async()=>{try{const saved=await api<AskThreadDetail>(threads+'/'+encodeURIComponent(id)+'/actions/'+encodeURIComponent(actionId)+'/confirm',{method:'POST',body:JSON.stringify({requestKey:key,confirm:true}),signal});if(alive()&&thread?.thread.id===id){await adopt(saved);feedback.textContent='Action result updated.';}}catch(issue){fail(issue);}finally{if(alive()){busy=false;controls();if(button.isConnected)button.disabled=false;}}})();return;}
 },{signal});
 workspace.addEventListener('submit',event=>{const target=event.target;if(!(target instanceof HTMLFormElement))return;if(target===finder){event.preventDefault();optionsSearch=String(new FormData(finder).get('propertySearch')??'').trim();void findProperties();return;}if(target!==form)return;event.preventDefault();if(form.reportValidity())void send(input.value);},{signal});
 input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229){event.preventDefault();if(form.reportValidity())void send(input.value);}},{signal});
 pages();controls();latest();
}
