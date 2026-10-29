import {patchLocalElement,captureLocalScroll} from './local-update';
import {renewalWorkspacePage,renewalHeaderSummary} from '../pages/renewals';
import type {AdminPageSummary} from '../../shared/admin-summary-contracts';
import {api,ApiError} from './api';
import {productError} from './product-copy';
import {presentRecordText} from './presentation';
import {nameFormControls} from './form-labels';
import {resolveUserTimeZone,userInstant} from './user-time';
import {escapeHtml as e} from './ui';
import {renewalDirectorySchema,renewalDetailSchema} from '../../shared/renewal-contracts';
import type {RenewalDirectory,RenewalDetail,RenewalOptions} from '../../shared/renewal-contracts';
export type RecordNavigate=(path:string,replace?:boolean,focusSelector?:string)=>void;
export type RenewalWorkspace={kind:'restricted';message:string}|{kind:'ready';directory:RenewalDirectory|null;detail:RenewalDetail|null;options:RenewalOptions;query:URLSearchParams;userTimeZone:string};
const only=(q:URLSearchParams,keys:string[])=>Object.fromEntries(keys.filter(key=>q.has(key)).map(key=>[key,q.get(key)!]));
export async function loadRenewalWorkspace(query:URLSearchParams,signal:AbortSignal):Promise<RenewalWorkspace>{
 try{
  const relationship=query.get('relationship');let directory:RenewalDirectory|null=null,detail:RenewalDetail|null=null;
  if(relationship){const parsed=renewalDetailSchema.safeParse(only(query,['offerPage','taskPage','pageSize']));if(!parsed.success)throw new Error('Choose valid renewal history pages.');detail=await api('/api/renewals/'+encodeURIComponent(relationship)+'?'+new URLSearchParams(Object.entries(parsed.data).map(([key,value])=>[key,String(value)])),{signal});}
  else{const parsed=renewalDirectorySchema.safeParse(only(query,['q','propertyId','status','dueWindow','sort','page','pageSize']));if(!parsed.success)throw new Error('Choose valid renewal filters.');directory=await api('/api/renewals?'+new URLSearchParams(Object.entries(parsed.data).map(([key,value])=>[key,String(value)])),{signal});}
  const selected=detail?.record.property.id??query.get('propertyId'),params=new URLSearchParams({page:'1',pageSize:'25'});if(selected)params.set('propertyId',selected);
  const options=await api<RenewalOptions>('/api/renewals/options?'+params,{signal});return{kind:'ready',directory,detail,options,query,userTimeZone:resolveUserTimeZone()};
 }catch(issue){if(issue instanceof ApiError&&issue.status===403)return{kind:'restricted',message:productError(issue)};throw issue;}
}
export function initializeRenewalDirectoryControls(host:HTMLElement,path:string,optionBase:string,signal:AbortSignal,navigate:RecordNavigate):void{
 const resultId=path==='/admin/renewals'?'#renewal-results':'#resident-access-results';
 const filters=host.querySelector<HTMLDetailsElement>('[data-rw-filter-panel]');
 const close=(focus=false,reset=false)=>{if(!filters)return;if(reset)filters.querySelector<HTMLFormElement>('form')?.reset();filters.open=false;if(focus)filters.querySelector<HTMLElement>('summary')?.focus({preventScroll:true});};
 host.addEventListener('click',event=>{const element=event.target instanceof Element?event.target:null;if(element?.closest('[data-rw-close-filters]')){close(true,true);return;}const link=element?.closest<HTMLAnchorElement>('[data-table-pagination] a,a[data-rw-results-link]');if(!link||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||link.target&&link.target!=='_self')return;const url=new URL(link.href,location.origin);if(url.origin!==location.origin||url.pathname!==path)return;event.preventDefault();event.stopPropagation();const pager=link.closest('[data-table-pagination]');navigate(url.pathname+url.search,false,pager?.id?'#'+pager.id:resultId);},{signal});
 document.addEventListener('click',event=>{if(filters?.open&&event.target instanceof Node&&!filters.contains(event.target))close();},{signal});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&filters?.open){event.preventDefault();close(true);}},{signal});
 host.addEventListener('change',event=>{const target=event.target;if(!(target instanceof HTMLSelectElement))return;if(target.closest('[data-page-size-control]')||target.closest('[data-rw-sort]')){event.stopPropagation();target.form?.requestSubmit();}},{signal});
 host.addEventListener('submit',event=>{
  const form=event.target;if(!(form instanceof HTMLFormElement)||!form.matches('[data-rw-search],[data-rw-filter],[data-rw-sort],[data-page-size-control]'))return;
  event.preventDefault();event.stopPropagation();if(!form.reportValidity())return;
  let query=new URLSearchParams(location.search);query.delete('saved');const values=new FormData(form);
  if(form.hasAttribute('data-page-size-control')){query=new URLSearchParams();for(const[key,value]of values)if(typeof value==='string')query.append(key,value);if(query.has('relationship'))for(const key of ['offerPage','taskPage','grantPage','invitationPage'])query.delete(key);}
  else{const keys=form.hasAttribute('data-rw-search')?['q']:form.hasAttribute('data-rw-sort')?['sort']:['propertyId','status',...(path==='/admin/renewals'?['dueWindow']:[])];for(const key of keys){const value=String(values.get(key)??'').trim();if(value)query.set(key,value);else query.delete(key);}query.delete('page');}
  close();const pager=form.closest('[data-table-pagination]');navigate(path+(query.size?'?'+query:''),false,pager?.id?'#'+pager.id:resultId);
 },{signal});
 const picker=filters?.querySelector<HTMLInputElement>('[data-rw-property-search]'),select=filters?.querySelector<HTMLSelectElement>('[data-rw-property-options]');
 if(!picker||!select)return;
 const status=filters!.querySelector<HTMLElement>('[data-rw-property-state]')!,previous=filters!.querySelector<HTMLButtonElement>('[data-rw-property-previous]')!,next=filters!.querySelector<HTMLButtonElement>('[data-rw-property-next]')!;
 const appliedProperty=new URLSearchParams(location.search).get('propertyId')??'',appliedPropertyName=[...select.options].find(item=>item.value===appliedProperty)?.textContent??'Selected property';
 let timer:ReturnType<typeof setTimeout>|undefined,request:AbortController|null=null,sequence=0,page=1;
 const fetchOptions=async(targetPage=1)=>{
  request?.abort();request=new AbortController();const active=request,revision=++sequence;status.textContent='Loading…';previous.disabled=true;next.disabled=true;
  try{const result=await api<RenewalOptions>(optionBase+'/options?'+new URLSearchParams({q:picker.value.trim(),page:String(targetPage),pageSize:'25'}),{signal:AbortSignal.any([signal,active.signal])});if(signal.aborted||active.signal.aborted||revision!==sequence)return;
   const selected=select.value,selectedName=select.selectedOptions[0]?.textContent??'Selected property';select.innerHTML='<option value="">All permitted properties</option>'+result.properties.items.map(item=>'<option value="'+e(item.id)+'">'+e(presentRecordText(item.name))+'</option>').join('');if(selected&&!result.properties.items.some(item=>item.id===selected)){const retained=new Option(selectedName,selected);select.append(retained);}if(appliedProperty&&![...select.options].some(item=>item.value===appliedProperty))select.append(new Option(appliedPropertyName,appliedProperty));for(const item of select.options)item.defaultSelected=item.value===appliedProperty;select.value=selected;page=result.properties.page;previous.hidden=page<=1;next.hidden=page>=result.properties.totalPages;status.textContent=result.properties.total.toLocaleString()+' matching properties';
  }catch(issue){if(!signal.aborted&&!active.signal.aborted&&revision===sequence)status.textContent=productError(issue);}
  finally{if(!signal.aborted&&revision===sequence){previous.disabled=false;next.disabled=false;}}
 };
 picker.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();clearTimeout(timer);void fetchOptions(1);}},{signal});
 picker.addEventListener('input',()=>{clearTimeout(timer);request?.abort();timer=setTimeout(()=>{void fetchOptions(1);},250);},{signal});
 previous.addEventListener('click',()=>{void fetchOptions(Math.max(1,page-1));},{signal});next.addEventListener('click',()=>{void fetchOptions(page+1);},{signal});
 signal.addEventListener('abort',()=>{clearTimeout(timer);request?.abort();},{once:true});
}
export function confirmRenewalAction(host:HTMLElement,title:string,message:string,button:string,signal:AbortSignal):Promise<boolean>{
 if(signal.aborted)return Promise.resolve(false);return new Promise(resolve=>{const dialog=document.createElement('dialog'),opener=document.activeElement;dialog.className='rw-dialog';dialog.dataset.residentAccessConfirmation='';dialog.setAttribute('aria-labelledby','resident-access-confirm-title');dialog.innerHTML='<form method="dialog"><h3 id="resident-access-confirm-title">'+e(title)+'</h3><p class="rw-muted">'+e(message)+'</p><div class="rw-actions"><button type="button" class="cv-button" data-rw-confirm-cancel>Keep unchanged</button><button type="submit" class="cv-button cv-primary" data-rw-confirm>'+e(button)+'</button></div></form>';let finished=false;const finish=(value:boolean)=>{if(finished)return;finished=true;signal.removeEventListener('abort',abort);if(dialog.open)dialog.close();dialog.remove();if(opener instanceof HTMLElement&&opener.isConnected&&!signal.aborted)opener.focus({preventScroll:true});resolve(value);},abort=()=>finish(false);dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});dialog.addEventListener('close',()=>finish(false));dialog.querySelector('[data-rw-confirm-cancel]')?.addEventListener('click',()=>finish(false));dialog.querySelector('form')?.addEventListener('submit',event=>{event.preventDefault();event.stopPropagation();finish(true);});signal.addEventListener('abort',abort,{once:true});host.append(dialog);dialog.showModal();dialog.querySelector<HTMLButtonElement>('[data-rw-confirm-cancel]')?.focus();});
}
export function initializeRenewalWorkspace(signal:AbortSignal,navigate:RecordNavigate,data:RenewalWorkspace,onSummary?:(summary:AdminPageSummary)=>void):void{
 const host=document.querySelector<HTMLElement>('[data-renewal-workspace]');if(!host||data.kind!=='ready')return;nameFormControls(host);initializeRenewalDirectoryControls(host,'/admin/renewals','/api/renewals',signal,navigate);
 const dialog=host.querySelector<HTMLDialogElement>('[data-renewal-terms-dialog]'),opener=host.querySelector<HTMLButtonElement>('[data-renewal-prepare]');if(!dialog||!opener||!data.detail)return;
 const form=dialog.querySelector<HTMLFormElement>('[data-renewal-terms]')!,output=form.querySelector<HTMLElement>('[data-rw-error]')!,submit=form.querySelector<HTMLButtonElement>('button[type=submit]')!;let busy=false;
 opener.addEventListener('click',()=>{if(dialog.open)return;dialog.showModal();form.querySelector<HTMLTextAreaElement>('textarea')?.focus();},{signal});
 const close=()=>{if(!busy)dialog.close();};dialog.querySelectorAll('[data-renewal-dialog-close]').forEach(button=>button.addEventListener('click',close,{signal}));dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();},{signal});dialog.addEventListener('close',()=>{if(!signal.aborted)opener.focus({preventScroll:true});},{signal});
 form.addEventListener('submit',event=>{event.preventDefault();event.stopPropagation();if(busy||!form.reportValidity())return;const values=new FormData(form);if(values.get('confirmed')!=='on')return;let payload:Record<string,unknown>;try{payload={terms:String(values.get('terms')??'').trim(),evidence:String(values.get('evidence')??'').trim(),validUntil:userInstant(String(values.get('validUntil')??''),data.userTimeZone)};}catch(issue){output.textContent=productError(issue);return;}
  const fingerprint=JSON.stringify(payload);if(form.dataset.payload!==fingerprint){form.dataset.payload=fingerprint;form.dataset.requestKey=crypto.randomUUID();}busy=true;submit.disabled=true;form.setAttribute('aria-busy','true');output.textContent='';
  void(async()=>{try{await api('/api/renewals/'+encodeURIComponent(data.detail!.record.relationshipId)+'/terms',{method:'POST',body:JSON.stringify({...payload,requestKey:form.dataset.requestKey}),signal});if(signal.aborted)return;const next=new URLSearchParams(location.search);next.set('saved','terms');
   const params=new URLSearchParams(only(next,['offerPage','taskPage','pageSize']));
   const detail=await api<RenewalDetail>('/api/renewals/'+encodeURIComponent(data.detail!.record.relationshipId)+'?'+params,{signal});if(signal.aborted)return;
   data.detail=detail;data.query=next;
   const template=document.createElement('template');template.innerHTML=renewalWorkspacePage(data);const restore=captureLocalScroll(host);
   for(const selector of ['[data-renewal-summary]','[data-renewal-current]','[data-renewal-offer-history]']){const current=host.querySelector(selector),fresh=template.content.querySelector(selector);if(current&&fresh)patchLocalElement(current,fresh,{preserveEditors:true});}
   let feedback=host.querySelector<HTMLElement>('[data-renewal-saved]');if(!feedback){feedback=document.createElement('p');feedback.className='rw-saved';feedback.dataset.renewalSaved='';feedback.setAttribute('role','status');host.prepend(feedback);}feedback.textContent='Approved terms saved.';
   history.replaceState({},'','/admin/renewals?'+next);onSummary?.(renewalHeaderSummary(data));
   form.reset();const terms=form.querySelector<HTMLTextAreaElement>('[name=terms]');if(terms){terms.defaultValue=detail.record.currentOffer?.terms??'';terms.value=terms.defaultValue;}
   delete form.dataset.payload;delete form.dataset.requestKey;dialog.close();restore();}catch(issue){if(!signal.aborted)output.textContent=productError(issue);}finally{busy=false;if(!signal.aborted){submit.disabled=false;form.removeAttribute('aria-busy');}}})();
 },{signal});signal.addEventListener('abort',()=>{if(dialog.open)dialog.close();},{once:true});
}
