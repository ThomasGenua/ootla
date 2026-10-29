import {maintenanceDetailMarkup} from '../pages/maintenance';
import type {MaintenanceWorkspace} from '../pages/maintenance';
import type {MaintenanceDetail} from '../../shared/resident-contracts';
import {nameFormControls} from './form-labels';

type Ready=Extract<MaintenanceWorkspace,{kind:'ready'}>;
type Control=HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement;
type ControlValue={value:string;checked:boolean};
type Values=Map<string,ControlValue>;
const controls=(form:HTMLFormElement)=>[...form.querySelectorAll<Control>('input,select,textarea')];
const key=(control:Control,index:number)=>index+':'+control.name;
const values=(form:HTMLFormElement):Values=>new Map(controls(form).map((control,index)=>[key(control,index),{value:control.value,checked:control instanceof HTMLInputElement&&control.checked}]));
const equal=(a:ControlValue|undefined,b:ControlValue|undefined)=>a?.value===b?.value&&a?.checked===b?.checked;

/** Only request facts change. The conversation, forms, details state and their scroll containers stay mounted. */
export function maintenanceDetailUpdates(host:HTMLElement,data:Ready):{snapshot:(form:HTMLFormElement)=>Values;apply:(detail:MaintenanceDetail,submitted:HTMLFormElement,snapshot:Values)=>void}{
 const baselines=new WeakMap<HTMLFormElement,Values>();
 for(const form of host.querySelectorAll<HTMLFormElement>('[data-maintenance-action]'))baselines.set(form,values(form));
 return {snapshot:values,apply(detail,submitted,snapshot){
  data.detail=detail;
  const template=document.createElement('template');template.innerHTML=maintenanceDetailMarkup(data);
  // Anchor the still-mounted initiating form in its real scrolling container, once, only if changed facts move it.
  const before=submitted.getBoundingClientRect().top;
  let scroller:HTMLElement|null=submitted.parentElement;
  while(scroller&&scroller!==document.body){const style=getComputedStyle(scroller);if(/auto|scroll/.test(style.overflowY)&&scroller.scrollHeight>scroller.clientHeight)break;scroller=scroller.parentElement;}
  if(!scroller||scroller===document.body)scroller=document.scrollingElement as HTMLElement|null;
  const scrollBefore=scroller?.scrollTop??0;
  for(const selector of ['[data-maintenance-request-summary]','[data-maintenance-note-items]','[data-maintenance-note-navigation]','[data-maintenance-history-items]','[data-maintenance-confirmed-appointment]']){
   const current=host.querySelector<HTMLElement>(selector),fresh=template.content.querySelector<HTMLElement>(selector);
   if(current&&fresh&&current.innerHTML!==fresh.innerHTML)current.replaceChildren(...fresh.childNodes);
  }
  for(const form of host.querySelectorAll<HTMLFormElement>('[data-maintenance-action]')){
   const fresh=template.content.querySelector<HTMLFormElement>('[data-maintenance-action="'+CSS.escape(form.dataset.maintenanceAction??'')+'"]');
   if(!fresh){form.hidden=true;continue;}
   form.hidden=false;
   const old=baselines.get(form)??values(form),next=values(fresh),freshControls=controls(fresh);
   controls(form).forEach((control,index)=>{
    const id=key(control,index),current={value:control.value,checked:control instanceof HTMLInputElement&&control.checked},source=freshControls[index];
    if(!source)return;
    // Preserve unrelated edits, and text typed during the outstanding operation.
    if(equal(current,old.get(id)!)||form===submitted&&equal(current,snapshot.get(id)!)){
     if(control instanceof HTMLSelectElement&&source instanceof HTMLSelectElement&&control.innerHTML!==source.innerHTML)control.innerHTML=source.innerHTML;
     control.value=source.value;
     if(control instanceof HTMLInputElement&&source instanceof HTMLInputElement)control.checked=source.checked;
    }
   });
   baselines.set(form,next);
   const status=form.querySelector<HTMLSelectElement>('[data-maintenance-status]'),appointment=form.querySelector<HTMLElement>('[data-maintenance-appointment]');
   if(status&&appointment){const active=status.value==='appointment_scheduled';appointment.hidden=!active;for(const input of appointment.querySelectorAll<HTMLInputElement>('input')){input.disabled=!active;input.required=active;}}
  }
  nameFormControls(host);
  const delta=submitted.getBoundingClientRect().top-before;
  if(scroller&&Math.abs(delta)>.5&&Math.abs(scroller.scrollTop-scrollBefore)<.5)scroller.scrollTop+=delta;
 }};
}
