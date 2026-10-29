import {customerError} from './customer-copy';
import { api,errorMessage } from './api';
type Navigate=(path:string,replace?:boolean,focusSelector?:string)=>void;
/** Resolve civil property time, refusing DST gaps/overlaps rather than guessing a browser zone. */
export function propertyMoveInInstant(local:string,timeZone:string):string {
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))throw new Error('Choose a complete move-in date and time.');
 const naive=Date.parse(local+':00Z');if(!Number.isFinite(naive))throw new Error('Choose a valid move-in date and time.');
 const display=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const civil=(instant:number):string=>{const parts=display.formatToParts(new Date(instant));const get=(key:string)=>parts.find(part=>part.type===key)?.value??'';return get('year')+'-'+get('month')+'-'+get('day')+'T'+get('hour')+':'+get('minute');};
 const offsets=new Set<number>();
 for(let hours=-36;hours<=36;hours+=6){const instant=naive+hours*3600000,zoneCivil=civil(instant);offsets.add(Date.parse(zoneCivil+':00Z')-instant);}
 const candidates=[...offsets].map(offset=>naive-offset).filter(instant=>civil(instant)===local);
 if(candidates.length!==1)throw new Error(candidates.length?'This time occurs twice during a timezone change. Choose another unambiguous property time.':'This time does not exist in the property timezone. Choose another time.');
 return new Date(candidates[0]!).toISOString();
}
function errorIn(form:HTMLElement,issue:unknown):void {const output=form.querySelector<HTMLElement>('[data-lease-error]');if(output){output.textContent=customerError(issue);output.tabIndex=-1;output.focus({preventScroll:true});}}
export function initializeLeaseWorkflow(signal:AbortSignal,navigate:Navigate):void {
 const workspace=document.querySelector<HTMLElement>('[data-lease-workspace]');if(!workspace)return;
 workspace.addEventListener('click',event=>{
  if(!(event.target instanceof Element))return;
  if(event.target.closest('[data-lease-task-add]')){
   const list=workspace.querySelector<HTMLElement>('[data-lease-task-rows]'),template=workspace.querySelector<HTMLTemplateElement>('[data-lease-task-template]');if(!list||!template||list.children.length>=12)return;
   const fragment=template.content.cloneNode(true)as DocumentFragment,index=crypto.randomUUID();fragment.querySelectorAll<HTMLElement>('[id],[for]').forEach(element=>{if(element.id)element.id=element.id.replace('TEMPLATE',index);if(element.hasAttribute('for'))element.setAttribute('for',element.getAttribute('for')!.replace('TEMPLATE',index));});const key=fragment.querySelector<HTMLInputElement>('[data-lease-task-key]');if(key)key.value='move_in_'+index.slice(0,8);list.append(fragment);
  }
  const remove=event.target.closest('[data-lease-task-remove]');if(remove){const row=remove.closest('[data-lease-task-row]');if(row?.parentElement&&row.parentElement.children.length>1)row.remove();}
 },{signal});
 workspace.addEventListener('submit',async event=>{
  const form=event.target;if(!(form instanceof HTMLFormElement)||!form.hasAttribute('data-lease-action'))return;event.preventDefault();if(!form.reportValidity())return;
  const button=form.querySelector<HTMLButtonElement>('button[type=submit]');if(button?.disabled)return;
  const id=workspace.dataset.applicationId!,action=form.dataset.leaseAction!,data=new FormData(form);
  let endpoint='/api/application-leases/'+encodeURIComponent(id)+'/'+action,body:Record<string,unknown>={};
  try{
   if(action==='create')body={startsOn:String(data.get('startsOn')??''),endsOn:String(data.get('endsOn')??'')||null};
   else if(action==='transition'){body={stage:String(data.get('stage')??''),evidence:{kind:String(data.get('evidenceKind')??''),reference:String(data.get('reference')??'').trim()}};if(data.get('moveInLocal'))body.moveInAt=propertyMoveInInstant(String(data.get('moveInLocal')),workspace.dataset.propertyTimeZone!);}
   else if(action==='settings'){endpoint='/api/application-leases/settings';body={leasedMilestone:String(data.get('leasedMilestone')??''),moveInTasks:[...form.querySelectorAll<HTMLElement>('[data-lease-task-row]')].map(row=>({key:row.querySelector<HTMLInputElement>('[data-lease-task-key]')!.value.trim(),title:row.querySelector<HTMLInputElement>('[data-lease-task-title]')!.value.trim(),dayOffset:Number(row.querySelector<HTMLInputElement>('[data-lease-task-offset]')!.value),priority:row.querySelector<HTMLSelectElement>('[data-lease-task-priority]')!.value}))};}
   else if(action!=='reopen')return;
   const payload=JSON.stringify(body);if(!form.dataset.requestKey||form.dataset.requestPayload!==payload){form.dataset.requestKey=crypto.randomUUID();form.dataset.requestPayload=payload;}body.requestKey=form.dataset.requestKey;
   if(button)button.disabled=true;form.setAttribute('aria-busy','true');const error=form.querySelector<HTMLElement>('[data-lease-error]');if(error)error.textContent='';
   await api(endpoint,{method:'POST',body:JSON.stringify(body),signal});
   if(!signal.aborted){const query=new URLSearchParams({application:id,leaseSaved:action});navigate('/admin/applications?'+query,true,'[data-lease-success]');}
  }catch(issue){if(!signal.aborted)errorIn(form,issue);}
  finally{if(!signal.aborted){if(button)button.disabled=false;form.removeAttribute('aria-busy');}}
 },{signal});
 if(new URLSearchParams(location.search).has('leaseSaved')){const success=workspace.querySelector<HTMLElement>('[data-lease-success]');if(success){success.hidden=false;success.tabIndex=-1;success.textContent='Lease workflow action saved. Current records and linked tasks are shown below.';}}
}
