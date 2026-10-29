import {ApiError,type AuthUser,type Overview} from './api';
import {productError} from './product-copy';
import {loadPortfolioWorkspace,initializePortfolioWorkspace} from './portfolio-reports';
import {portfolioReportsPage,portfolioHeaderSummary,portfolioScopeLabel,type PortfolioWorkspace} from '../pages/portfolio-reports';
import {adminShell} from '../pages/admin';
import {initializeTablePagination} from './table-pagination-controller';
import {initializeAskOotla,type AskOotlaController} from './ask-ootla';
import {patchLocalElement,captureLocalScroll} from './local-update';
import type {AskContext} from '../../shared/conversation-contracts';

type Navigate=(path:string,replace?:boolean,focusSelector?:string)=>void;
export type ReportNavigator=(url:URL,replace?:boolean,focusSelector?:string,fromHistory?:boolean)=>void;
const scopeKeys=['from','to','propertyId','groupId','region','agentMembershipId','teamId'];

/** Same-route report interactions retain the shell and replace only the report region that changed. */
export function createPortfolioNavigation(signal:AbortSignal,navigate:Navigate,initial:PortfolioWorkspace,user:AuthUser,overview:Overview):ReportNavigator{
 let assistantHandle:AskOotlaController|undefined;
 let current=initial,appliedQuery=new URLSearchParams(location.search),revision=0;
 let request:AbortController|null=null,controls=new AbortController(),assistant=new AbortController();
 const activeSignal=(controller:AbortController)=>AbortSignal.any([signal,controller.signal]);
 const bindControls=()=>{const controlSignal=activeSignal(controls);initializeTablePagination(controlSignal,navigate);initializePortfolioWorkspace(controlSignal,navigate,current);};
 const bindAssistant=()=>{
  const context:AskContext={page:'/admin/reports'};
  if(current.kind==='ready'&&current.report){const q=current.report.query;context.report={from:q.from,to:q.to,attention:q.attention,q:q.q,...(q.groupId?{groupId:q.groupId}:{}),...(q.region?{region:q.region}:{}),...(q.agentMembershipId?{agentMembershipId:q.agentMembershipId}:{}),...(q.teamId?{teamId:q.teamId}:{})};if(q.propertyId)context.propertyId=q.propertyId;}
  if(assistantHandle)assistantHandle.updateContext(context,portfolioScopeLabel(current));else assistantHandle=initializeAskOotla(activeSignal(assistant),context,user,portfolioScopeLabel(current));
 };
 const refreshHeader=()=>{
  const template=document.createElement('template');template.innerHTML=adminShell('/admin/reports',user,overview,false,undefined,appliedQuery,'',undefined,portfolioHeaderSummary(current));
  const metrics=document.querySelector('.summary-metrics'),fresh=template.content.querySelector('.summary-metrics');if(metrics&&fresh)metrics.replaceChildren(...fresh.childNodes);
  const context=document.querySelector('.header-summary-context'),freshContext=template.content.querySelector('.header-summary-context');if(context&&freshContext)context.textContent=freshContext.textContent;
 };
 bindControls();bindAssistant();
 signal.addEventListener('abort',()=>{request?.abort();controls.abort();assistant.abort();},{once:true});
 return(url,replace=false,focusSelector,fromHistory=false)=>{
  if(signal.aborted)return;
  request?.abort();request=new AbortController();const controller=request,requestSignal=activeSignal(controller),generation=++revision;
  const oldHost=document.querySelector<HTMLElement>('[data-portfolio-reports]');if(!oldHost)return;
  oldHost.setAttribute('aria-busy','true');
  const error=oldHost.querySelector<HTMLElement>('[data-report-global-error]');if(error)error.textContent='';
  void(async()=>{
   try{
    const query=new URLSearchParams(url.search),data=await loadPortfolioWorkspace(query,requestSignal);
    if(requestSignal.aborted||generation!==revision)return;
    // A failed query keeps both the selected controls and their last valid report. No counts are invented.
    if(data.kind==='ready'&&data.reportError)throw new Error(data.reportError);
    const aggregatesChanged=current.kind!=='ready'||data.kind!=='ready'||JSON.stringify(current.report&&{counts:current.report.periodCounts,cohorts:current.report.cohorts,followUp:current.report.followUp,provenance:current.report.provenance})!==JSON.stringify(data.report&&{counts:data.report.periodCounts,cohorts:data.report.cohorts,followUp:data.report.followUp,provenance:data.report.provenance});
    const restore=captureLocalScroll(oldHost);
    const template=document.createElement('template');template.innerHTML=portfolioReportsPage(data,query);
    const fresh=template.content.querySelector<HTMLElement>('[data-portfolio-reports]');
    const scopeChanged=current.kind!=='ready'||data.kind!=='ready'||scopeKeys.some(key=>current.kind==='ready'&&data.kind==='ready'&&String(current.query[key as keyof typeof current.query]??'')!==String(data.query[key as keyof typeof data.query]??''));
    const results=oldHost.querySelector<HTMLElement>('[data-report-results]'),freshResults=fresh?.querySelector<HTMLElement>('[data-report-results]');
    controls.abort();controls=new AbortController();
    if(!scopeChanged&&results&&freshResults){patchLocalElement(results,freshResults);const chips=oldHost.querySelector('.pr-filter-chips'),freshChips=fresh?.querySelector('.pr-filter-chips');if(chips&&freshChips)patchLocalElement(chips,freshChips);if(aggregatesChanged){const scope=oldHost.querySelector('[data-report-scope-results]'),freshScope=fresh?.querySelector('[data-report-scope-results]');if(scope&&freshScope)patchLocalElement(scope,freshScope);}}
    else if(fresh)patchLocalElement(oldHost,fresh);
    else{oldHost.replaceChildren(...template.content.childNodes);oldHost.removeAttribute('aria-busy');}
    if(!fromHistory){if(replace)history.replaceState({},'',url.pathname+url.search+url.hash);else history.pushState({},'',url.pathname+url.search+url.hash);}
    current=data;appliedQuery=query;
    const selectedView=document.querySelector<HTMLInputElement>('[data-report-filters] input[name=view]');if(selectedView&&current.kind==='ready'){selectedView.value=current.query.view;selectedView.defaultValue=current.query.view;}
    if(scopeChanged||aggregatesChanged)refreshHeader();
    for(const panel of document.querySelectorAll<HTMLDetailsElement>('[data-portfolio-reports] [data-report-filter-panel]'))panel.open=false;
    bindControls();bindAssistant();
    const host=document.querySelector<HTMLElement>('[data-portfolio-reports]');host?.removeAttribute('aria-busy');
    const target=focusSelector?document.querySelector<HTMLElement>(focusSelector):host?.querySelector<HTMLElement>('#report-results')??host;
    if(target&&(!document.activeElement||document.activeElement===document.body)){if(!target.hasAttribute('tabindex'))target.tabIndex=-1;target.focus({preventScroll:true});}
    restore();
   }catch(issue){
    if(requestSignal.aborted||generation!==revision)return;
    if(issue instanceof ApiError&&issue.status===401){navigate('/admin/login?returnTo='+encodeURIComponent(url.pathname+url.search),true);return;}
    if(error){error.textContent=productError(issue);error.setAttribute('role','alert');}
   }finally{if(!requestSignal.aborted&&generation===revision)document.querySelector('[data-portfolio-reports]')?.removeAttribute('aria-busy');}
  })();
 };
}
