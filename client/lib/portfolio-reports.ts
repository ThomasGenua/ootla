import {api,ApiError} from './api';
import {productError} from './product-copy';
import {nameFormControls} from './form-labels';
import {presentRecordText} from './presentation';
import {calendarDay,shiftCalendarDate} from './calendar-time';
import {portfolioQuerySchema,portfolioViews} from '../../shared/reporting-contracts';
import type {PortfolioQuery,PortfolioReport,PortfolioView,ReportingOptions} from '../../shared/reporting-contracts';
import type {PortfolioWorkspace} from '../pages/portfolio-reports';

type Navigate=(path:string,replace?:boolean,focusSelector?:string)=>void;
const base='/api/portfolio-reporting';
export const portfolioQueryParams=(query:PortfolioQuery):URLSearchParams=>new URLSearchParams(Object.entries(query).filter(([,value])=>value!==undefined&&value!==null).map(([key,value])=>[key,String(value)]));
export async function loadPortfolioWorkspace(query:URLSearchParams,signal:AbortSignal):Promise<PortfolioWorkspace>{
 const today=calendarDay(new Date(),'UTC'),candidateTo=query.get('to')??today,validTo=/^\d{4}-\d{2}-\d{2}$/.test(candidateTo)&&Number.isFinite(Date.parse(candidateTo+'T00:00:00Z'))?candidateTo:today,from=query.get('from')??shiftCalendarDate(validTo,-29),view=portfolioViews.includes(query.get('view')as PortfolioView)?query.get('view')as PortfolioView:'properties';
 const requested:Record<string,string>={from,to:candidateTo,view,page:query.get('page')??'1',pageSize:query.get('pageSize')??'25',q:query.get('q')??'',sort:query.get('sort')??'name_asc',attention:query.get('attention')??'all'};
 for(const key of ['propertyId','groupId','region','agentMembershipId','teamId'])if(query.get(key))requested[key]=query.get(key)!;
 const parsed=portfolioQuerySchema.safeParse(requested),fallback=portfolioQuerySchema.parse({from:shiftCalendarDate(today,-29),to:today,view}),normalized=parsed.success?parsed.data:fallback;
 let report:PortfolioReport|null=null,reportError:string|null=parsed.success?null:'Choose valid inclusive dates, a range of at most three years and valid report filters.',options:ReportingOptions|null=null,optionsError:string|null=null;
 const optionParams=new URLSearchParams({page:query.get('optionsPage')??'1',pageSize:'25',q:query.get('propertySearch')??'',groupSearch:query.get('groupSearch')??'',regionSearch:query.get('regionSearch')??'',agentSearch:query.get('agentSearch')??'',teamSearch:query.get('teamSearch')??''});
 const results=await Promise.allSettled([parsed.success?api<PortfolioReport>(base+'?'+portfolioQueryParams(parsed.data),{signal}):Promise.resolve(null),api<ReportingOptions>(base+'/options?'+optionParams,{signal})]);
 for(const result of results)if(result.status==='rejected'&&(signal.aborted||result.reason instanceof ApiError&&result.reason.status===401))throw result.reason;
 const first=results[0]!,second=results[1]!;
 if(first.status==='fulfilled')report=first.value;else if(first.reason instanceof ApiError&&first.reason.status===403)return{kind:'restricted',message:productError(first.reason)};else reportError=productError(first.reason);
 if(second.status==='fulfilled')options=second.value;else optionsError=productError(second.reason);
 return{kind:'ready',query:report?.query??normalized,report,reportError,options,optionsError};
}
export function initializePortfolioWorkspace(signal:AbortSignal,navigate:Navigate,data:PortfolioWorkspace):void{
 const host=document.querySelector<HTMLElement>('[data-portfolio-reports]');if(!host||data.kind!=='ready')return;nameFormControls(host);
 const showError=(scope:HTMLElement,issue:unknown,selector='[data-report-error]')=>{const output=scope.querySelector<HTMLElement>(selector)??host.querySelector<HTMLElement>('[data-report-global-error]');if(output){output.textContent=productError(issue);output.tabIndex=-1;output.focus({preventScroll:true});}};
 const panels=[...host.querySelectorAll<HTMLDetailsElement>('[data-report-filter-panel]')];
 const close=(panel:HTMLDetailsElement,focus=false,reset=false)=>{if(reset)panel.querySelector<HTMLFormElement>('form')?.reset();panel.open=false;if(focus)panel.querySelector<HTMLElement>('summary')?.focus({preventScroll:true});};
 for(const panel of panels)panel.addEventListener('toggle',()=>{if(panel.open)for(const other of panels)if(other!==panel)close(other);},{signal});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){const panel=panels.find(item=>item.open);if(panel){event.preventDefault();close(panel,true,true);}}},{signal});
 document.addEventListener('click',event=>{const target=event.target;if(target instanceof Node)for(const panel of panels)if(panel.open&&!panel.contains(target))close(panel,false,true);},{signal});
 // A table-only refresh retains the scope picker DOM; retain its local choice cursor too.
 const choicePanel=host.querySelector<HTMLDetailsElement>('[data-report-filter-panel]');
 let choicePage=Math.max(1,Number(choicePanel?.dataset.choicePage)||data.options?.properties.page||1),choiceMax=Math.max(1,Number(choicePanel?.dataset.choiceMax)||(data.options?Math.max(data.options.properties.totalPages,data.options.groups.totalPages,data.options.regions.totalPages,data.options.agents.totalPages,data.options.teams.totalPages):1)),choiceSequence=0,choiceRequest:AbortController|undefined,choiceTimer:ReturnType<typeof setTimeout>|undefined;
 const choiceInput=host.querySelector<HTMLInputElement>('[data-report-choice-search]'),choiceStatus=host.querySelector<HTMLElement>('[data-report-choice-status]');
 const choiceKeys=['propertyId','groupId','region','agentMembershipId','teamId']as const;
 const initialChoiceNames=new Map(choiceKeys.map(key=>[key,host.querySelector<HTMLSelectElement>('[data-report-choice="'+key+'"]')?.selectedOptions[0]?.textContent??'Selected filter']));
 const choicePaging=()=>{if(choicePanel){choicePanel.dataset.choicePage=String(choicePage);choicePanel.dataset.choiceMax=String(choiceMax);}const previous=host.querySelector<HTMLButtonElement>('[data-report-choice-page="previous"]'),next=host.querySelector<HTMLButtonElement>('[data-report-choice-page="next"]');if(previous)previous.hidden=choicePage<=1;if(next)next.hidden=choicePage>=choiceMax;};
 choicePaging();
 const loadChoices=async(page:number)=>{page=Math.max(1,page);const sequence=++choiceSequence;choiceRequest?.abort();choiceRequest=new AbortController();if(signal.aborted)return;const search=choiceInput?.value.trim()??'',params=new URLSearchParams({page:String(page),pageSize:'25',q:search,groupSearch:search,regionSearch:search.slice(0,100),agentSearch:search,teamSearch:search});if(choiceStatus)choiceStatus.textContent='Finding permitted choices…';
  try{const options=await api<ReportingOptions>(base+'/options?'+params,{signal:choiceRequest.signal});if(signal.aborted||sequence!==choiceSequence)return;const values:Record<typeof choiceKeys[number],Array<{id:string;name:string}>>={propertyId:options.properties.items,groupId:options.groups.items,region:options.regions.items.map(item=>({id:item.name,name:item.name})),agentMembershipId:options.agents.items.map(item=>({id:item.membershipId,name:item.name})),teamId:options.teams.items};
   for(const key of choiceKeys){const select=host.querySelector<HTMLSelectElement>('[data-report-choice="'+key+'"]');if(!select)continue;const selected=select.value,selectedName=select.selectedOptions[0]?.textContent??'Selected filter',initial=data.query[key]??'',all=select.options[0]?.textContent??'All',items=[...values[key]];if(selected&&!items.some(item=>item.id===selected))items.push({id:selected,name:selectedName});if(initial&&!items.some(item=>item.id===initial))items.push({id:initial,name:initialChoiceNames.get(key)??'Selected filter'});select.replaceChildren(new Option(all,'',initial==='',selected===''),...items.map(item=>new Option(presentRecordText(item.name),item.id,item.id===initial,item.id===selected)));}
   choicePage=page;choiceMax=Math.max(options.properties.totalPages,options.groups.totalPages,options.regions.totalPages,options.agents.totalPages,options.teams.totalPages);choicePaging();if(choiceStatus)choiceStatus.textContent='Choice page '+page+' of '+Math.max(1,choiceMax)+'. Selected filters are kept.';
  }catch(issue){if(!signal.aborted&&sequence===choiceSequence&&!choiceRequest?.signal.aborted&&choiceStatus)choiceStatus.textContent=productError(issue);}
 };
 choiceInput?.addEventListener('input',()=>{clearTimeout(choiceTimer);choiceTimer=setTimeout(()=>void loadChoices(1),250);},{signal});
 choiceInput?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();clearTimeout(choiceTimer);void loadChoices(1);}},{signal});
 signal.addEventListener('abort',()=>{clearTimeout(choiceTimer);choiceRequest?.abort();},{once:true});
 host.addEventListener('click',event=>{const target=event.target instanceof Element?event.target:null;
  if(target?.closest('[data-close-report-filters]')){const panel=target.closest<HTMLDetailsElement>('[data-report-filter-panel]');if(panel)close(panel,true,true);return;}
  const choiceButton=target?.closest<HTMLButtonElement>('[data-report-choice-page]');if(choiceButton){void loadChoices(choicePage+(choiceButton.dataset.reportChoicePage==='next'?1:-1));return;}
  const reportLink=target?.closest<HTMLAnchorElement>('a[data-link]');if(reportLink&&event.button===0&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey&&(!reportLink.target||reportLink.target==='_self')){const url=new URL(reportLink.href,location.origin);if(url.origin===location.origin&&url.pathname==='/admin/reports'){event.preventDefault();event.stopPropagation();navigate(url.pathname+url.search,false,reportLink.closest('[data-report-results]')?'#report-results':'#report-scope-results');return;}}
  const button=target?.closest<HTMLButtonElement>('[data-report-export]');if(!button||button.disabled||!data.report)return;
  button.disabled=true;void(async()=>{try{const response=await fetch(base+'/export?'+portfolioQueryParams(data.report!.query),{credentials:'same-origin',signal,headers:{Accept:'text/csv'}});if(!response.ok){let message='The report could not be exported.';try{const body=await response.json()as{error?:string|{message?:string};message?:string};message=(typeof body.error==='string'?body.error:body.error?.message)??body.message??message;}catch{/* Preserve safe fallback. */}throw new Error(message);}if(!response.headers.get('content-type')?.toLowerCase().includes('text/csv'))throw new Error('The server did not return a CSV export.');const blob=await response.blob();if(signal.aborted)return;const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download='ootla-crm-'+data.report!.query.view+'-'+data.report!.query.from+'-'+data.report!.query.to+'.csv';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(issue){if(!signal.aborted)showError(host,issue,'[data-report-export-error]');}finally{if(!signal.aborted)button.disabled=false;}})();
 },{signal});
 host.addEventListener('submit',event=>{const form=event.target;if(!(form instanceof HTMLFormElement))return;if(!['data-report-filters','data-report-options','data-report-table','data-report-search','data-report-region'].some(name=>form.hasAttribute(name)))return;event.preventDefault();event.stopPropagation();if(!form.reportValidity())return;const values=new FormData(form),next=new URLSearchParams(location.search);next.delete('saved');
  if(form.hasAttribute('data-report-region')){const button=form.querySelector<HTMLButtonElement>('button[type=submit]');if(!button||button.disabled)return;const body={propertyId:String(values.get('propertyId')??''),region:String(values.get('region')??'').trim()||null},fingerprint=JSON.stringify(body);if(button.dataset.payload!==fingerprint){button.dataset.payload=fingerprint;button.dataset.requestKey=crypto.randomUUID();}button.disabled=true;void(async()=>{try{await api(base+'/regions',{method:'PUT',body:JSON.stringify({...body,requestKey:button.dataset.requestKey}),signal});if(!signal.aborted){next.set('saved','region');next.delete('optionsPage');next.delete('region');navigate('/admin/reports?'+next,true,'[data-report-saved]');}}catch(issue){if(!signal.aborted)showError(form,issue);}finally{if(!signal.aborted)button.disabled=false;}})();return;}
  if(form.hasAttribute('data-report-filters')){for(const key of ['from','to','propertyId','groupId','region','agentMembershipId','teamId','view']){const value=String(values.get(key)??'').trim();if(value)next.set(key,value);else next.delete(key);}next.delete('page');}
  // Kept for the reversible legacy option editor; no standalone lookup form is rendered.
  if(form.hasAttribute('data-report-options')){for(const[key,value]of values)if(typeof value==='string'){const name=key==='q'?'propertySearch':key;if(value.trim())next.set(name,value.trim());else next.delete(name);}next.delete('optionsPage');}
  if(form.hasAttribute('data-report-table')){for(const key of ['sort','attention']){const value=String(values.get(key)??'').trim();if(value)next.set(key,value);else next.delete(key);}next.delete('page');}
  if(form.hasAttribute('data-report-search')){const value=String(values.get('q')??'').trim();if(value)next.set('q',value);else next.delete('q');next.delete('page');}
  const parseInput=Object.fromEntries([...next].filter(([key])=>['from','to','propertyId','groupId','region','agentMembershipId','teamId','view','q','sort','pageSize','attention'].includes(key)));parseInput.from??=data.query.from;parseInput.to??=data.query.to;
  if(!portfolioQuerySchema.safeParse(parseInput).success){showError(form,new Error('Choose valid report filters and an ordered date range of at most three years.'));return;}
  navigate('/admin/reports?'+next,false,form.hasAttribute('data-report-filters')?'#report-scope-results':'#report-results');
 },{signal});
}
