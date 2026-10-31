import {api,ApiError,type AuthUser,type Overview} from './api';
import {productError} from './product-copy';
import {loadCalendarWorkspace,initializeCalendarWorkspace,type CalendarWorkspacePayload} from './calendar';
import {calendarWorkspacePage} from '../pages/calendar';
import {adminShell} from '../pages/admin';
import {initializeTablePagination} from './table-pagination-controller';
import {patchLocalElement,captureLocalScroll} from './local-update';
import type {AskContext} from '../../shared/conversation-contracts';
import type {AdminPageSummary} from '../../shared/admin-summary-contracts';

type Navigate=(path:string,replace?:boolean,focusSelector?:string)=>void;
export type CalendarNavigator=(url:URL,replace?:boolean,focusSelector?:string,fromHistory?:boolean)=>void;

/** Calendar period, settings and booking updates retain the shared shell and current reading position. */
export function createCalendarNavigation(signal:AbortSignal,navigate:Navigate,initial:CalendarWorkspacePayload,user:AuthUser,overview:Overview,updateAssistant:(context:AskContext,label?:string)=>void):CalendarNavigator{
 let current=initial,revision=0,request:AbortController|null=null,controls=new AbortController();
 const active=(controller:AbortController)=>AbortSignal.any([signal,controller.signal]);
 const bind=()=>{
  initializeTablePagination(active(controls),navigate);initializeCalendarWorkspace(active(controls),navigate);
  const context:AskContext={page:'/admin/calendar'};
  if(current.kind==='detail'){context.propertyId=current.detail.viewing.property.id;context.viewingId=current.detail.viewing.id;context.leadId=current.detail.viewing.lead.id;if(current.detail.viewing.unit)context.unitId=current.detail.viewing.unit.id;}
  else if(current.kind!=='google'&&current.kind!=='restricted'&&current.options.selectedProperty)context.propertyId=current.options.selectedProperty.id;
  updateAssistant(context);
 };
 bind();signal.addEventListener('abort',()=>{request?.abort();controls.abort();},{once:true});
 return(url,replace=false,focusSelector,fromHistory=false)=>{
  if(signal.aborted)return;const host=document.querySelector<HTMLElement>('[data-calendar-workspace]');if(!host)return;
  request?.abort();request=new AbortController();const requestSignal=active(request),generation=++revision;host.setAttribute('aria-busy','true');
  const oldError=host.querySelector<HTMLElement>('[data-calendar-refresh-error]');if(oldError)oldError.textContent='';
  void(async()=>{try{
   const query=new URLSearchParams(url.search),[data,summary]=await Promise.all([loadCalendarWorkspace(query,requestSignal),api<AdminPageSummary>('/api/admin/summary?'+new URLSearchParams({page:'calendar',period:query.get('period')??'month'}),{signal:requestSignal})]);
   if(requestSignal.aborted||generation!==revision)return;const restore=captureLocalScroll(host);
   const template=document.createElement('template');template.innerHTML=calendarWorkspacePage(data,user,query);
   const fresh=template.content.querySelector<HTMLElement>('[data-calendar-workspace]');
   controls.abort();controls=new AbortController();
   if(fresh)patchLocalElement(host,fresh);else{host.replaceChildren(...template.content.childNodes);host.removeAttribute('aria-busy');}
   if(!fromHistory){if(replace)history.replaceState({},'',url.pathname+url.search+url.hash);else history.pushState({},'',url.pathname+url.search+url.hash);}
   current=data;
   // Reuse the shared metric renderer so the explicit preview setting remains presentation-only.
   const header=document.createElement('template');header.innerHTML=adminShell('/admin/calendar',user,overview,false,undefined,query,'',undefined,{...summary,scopeLabel:'Your viewing schedule'});
   const metrics=document.querySelector('.summary-metrics'),newMetrics=header.content.querySelector('.summary-metrics');if(metrics&&newMetrics)metrics.replaceChildren(...newMetrics.childNodes);
   const context=document.querySelector('.header-summary-context'),newContext=header.content.querySelector('.header-summary-context');if(context&&newContext)context.textContent=newContext.textContent;
   bind();const workspace=document.querySelector<HTMLElement>('[data-calendar-workspace]');workspace?.removeAttribute('aria-busy');
   const target=(focusSelector?document.querySelector<HTMLElement>(focusSelector):null)??workspace;if(target&&(!document.activeElement||document.activeElement===document.body)){if(!target.hasAttribute('tabindex'))target.tabIndex=-1;target.focus({preventScroll:true});}
   restore();
  }catch(issue){
   if(requestSignal.aborted||generation!==revision)return;
   if(issue instanceof ApiError&&issue.status===401){navigate('/admin/login?returnTo='+encodeURIComponent(url.pathname+url.search),true);return;}
   let error=host.querySelector<HTMLElement>('[data-calendar-refresh-error]');if(!error){error=document.createElement('p');error.className='vc-error';error.dataset.calendarRefreshError='';error.setAttribute('role','alert');host.append(error);}error.textContent=productError(issue);
  }finally{if(!requestSignal.aborted&&generation===revision)document.querySelector('[data-calendar-workspace]')?.removeAttribute('aria-busy');}})();
 };
}
