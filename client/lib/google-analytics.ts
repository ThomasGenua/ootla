import {api,ApiError} from './api';
import {productError} from './product-copy';
import {nameFormControls} from './form-labels';
import {calendarDay,shiftCalendarDate} from './calendar-time';
import {analyticsKinds,analyticsQuerySchema} from '../../shared/google-analytics-contracts';
import type {AnalyticsStatus,AnalyticsProperties,AnalyticsReport,AnalyticsKind,AnalyticsKeyEvents} from '../../shared/google-analytics-contracts';
import type {Paginated} from '../../shared/property-contracts';
import type {AnalyticsWorkspace} from '../pages/google-analytics';
type Navigate=(path:string,replace?:boolean,focusSelector?:string)=>void;
const base='/api/google-analytics';
export async function loadGoogleAnalyticsWorkspace(query:URLSearchParams,signal:AbortSignal):Promise<AnalyticsWorkspace>{
 try{
  const status=await api<AnalyticsStatus>(base,{signal}),zone=status.selectedProperty?.timeZone??'UTC',to=query.get('to')??calendarDay(new Date(),zone),from=query.get('from')??shiftCalendarDate(/^\d{4}-\d{2}-\d{2}$/.test(to)&&Number.isFinite(Date.parse(to+'T00:00:00Z'))?to:calendarDay(new Date(),zone),-29),reportKind=analyticsKinds.includes(query.get('kind')as AnalyticsKind)?query.get('kind')as AnalyticsKind:'summary',comparison=query.get('comparison')==='none'?'none':'previous';
  const parsed=analyticsQuerySchema.safeParse({from,to,kind:reportKind,comparison,page:query.get('page')??'1',pageSize:query.get('pageSize')??'10',refresh:query.get('refresh')==='true'?'true':'false'});
  let report:AnalyticsReport|null=null,reportError:string|null=null,properties:AnalyticsProperties|null=null,propertiesError:string|null=null,crmProperties:Paginated<{id:string;name:string}>|null=null,keyEvents:AnalyticsKeyEvents|null=null,keyEventsError:string|null=null;
  if(!parsed.success)reportError='Choose valid inclusive dates, a range of at most 366 days and valid report pagination.';
  else if(status.canReadReports){try{report=await api<AnalyticsReport>(base+'/report?'+new URLSearchParams(Object.entries(parsed.data).map(([key,value])=>[key,String(value)])),{signal});}catch(issue){if(signal.aborted||issue instanceof ApiError&&issue.status===401)throw issue;reportError=productError(issue);}}
  if(reportKind==='events'&&status.canReadReports){try{keyEvents=await api<AnalyticsKeyEvents>(base+'/key-events'+(query.get('keyEventToken')?'?'+new URLSearchParams({pageToken:query.get('keyEventToken')!}):''),{signal});}catch(issue){if(signal.aborted||issue instanceof ApiError&&issue.status===401)throw issue;keyEventsError=productError(issue);}}
  if(status.canManage&&query.get('configuration')==='1'){
   try{[properties,crmProperties]=await Promise.all([api<AnalyticsProperties>(base+'/properties'+(query.get('propertyToken')?'?'+new URLSearchParams({pageToken:query.get('propertyToken')!}):''),{signal}),api<Paginated<{id:string;name:string}>>(base+'/crm-properties?'+new URLSearchParams({q:query.get('crmSearch')??'',page:query.get('crmPage')??'1',pageSize:'25'}),{signal})]);}catch(issue){if(signal.aborted||issue instanceof ApiError&&issue.status===401)throw issue;propertiesError=productError(issue);}
  }
  return{kind:'ready',status,report,reportError,range:report?.range??{from,to},comparison,reportKind,properties,propertiesError,crmProperties,keyEvents,keyEventsError};
 }catch(issue){if(issue instanceof ApiError&&issue.status===403)return{kind:'restricted',message:productError(issue)};throw issue;}
}
export function initializeGoogleAnalyticsWorkspace(signal:AbortSignal,navigate:Navigate):void{
 const host=document.querySelector<HTMLElement>('[data-analytics-workspace]');if(!host)return;nameFormControls(host);
 const showError=(scope:HTMLElement,issue:unknown)=>{const output=scope.querySelector<HTMLElement>('[data-analytics-error]')??host.querySelector<HTMLElement>('[data-analytics-global-error]');if(output){output.textContent=productError(issue);output.tabIndex=-1;output.focus();}};
 const run=async(button:HTMLButtonElement,action:'connect'|'disconnect'|'selection',body:Record<string,unknown>,scope:HTMLElement=host)=>{if(button.disabled)return;const fingerprint=JSON.stringify(body);if(button.dataset.payload!==fingerprint){button.dataset.payload=fingerprint;button.dataset.requestKey=crypto.randomUUID();}button.disabled=true;scope.setAttribute('aria-busy','true');try{const result=await api<AnalyticsStatus|{authorizationUrl:string}>(base+(action==='connect'?'/oauth/start':action==='selection'?'/selection':'/disconnect'),{method:action==='selection'?'PUT':'POST',body:JSON.stringify({...body,requestKey:button.dataset.requestKey}),signal});if(signal.aborted)return;
  if(action==='connect'){const destination=new URL((result as{authorizationUrl:string}).authorizationUrl);if(destination.protocol!=='https:'||destination.hostname!=='accounts.google.com'||destination.username||destination.password||destination.port)throw new Error('Google authorization destination could not be validated.');location.assign(destination.href);return;}
  const query=new URLSearchParams(location.search);for(const key of ['propertyToken','configuration','page','refresh','oauth','google','keyEventToken'])query.delete(key);query.set('saved',action);navigate('/admin/analytics?'+query,true,'[data-analytics-saved]');
 }catch(issue){if(!signal.aborted)showError(scope,issue);}finally{if(!signal.aborted){button.disabled=false;scope.removeAttribute('aria-busy');}}};
 host.addEventListener('click',event=>{const target=event.target instanceof Element?event.target:null;if(!target)return;
  const refresh=target.closest<HTMLAnchorElement>('[data-analytics-refresh]');if(refresh){event.preventDefault();const query=new URLSearchParams(location.search);query.set('refresh','true');query.delete('saved');navigate('/admin/analytics?'+query);return;}
  const button=target.closest<HTMLButtonElement>('[data-analytics-action]');if(button){const action=button.dataset.analyticsAction;if(action==='connect'||action==='disconnect')void run(button,action,{});}
 },{signal});
 host.addEventListener('submit',event=>{const form=event.target;if(!(form instanceof HTMLFormElement))return;
  if(form.hasAttribute('data-analytics-filter')){event.preventDefault();if(!form.reportValidity())return;const data=new FormData(form),from=String(data.get('from')??''),to=String(data.get('to')??'');if(from>to){showError(form,new Error('The start date must not be after the end date.'));return;}const query=new URLSearchParams();for(const[key,value]of data)if(typeof value==='string'&&value.trim())query.set(key,value.trim());navigate('/admin/analytics?'+query);return;}
  if(form.hasAttribute('data-analytics-scope')){event.preventDefault();const query=new URLSearchParams(location.search);query.set('configuration','1');query.set('crmSearch',String(new FormData(form).get('crmSearch')??'').trim());query.delete('crmPage');navigate('/admin/analytics?'+query);return;}
  if(!form.hasAttribute('data-analytics-selection'))return;event.preventDefault();if(!form.reportValidity())return;const data=new FormData(form),button=form.querySelector<HTMLButtonElement>('button[type=submit]');if(button)void run(button,'selection',{propertyId:String(data.get('propertyId')??''),crmPropertyId:String(data.get('crmPropertyId')??'')||null},form);
 },{signal});
}
