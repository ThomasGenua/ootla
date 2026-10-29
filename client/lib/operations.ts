import {api,ApiError,errorMessage} from './api';
import {nameFormControls} from './form-labels';
import {auditQuerySchema} from '../../shared/operational-contracts';
import type {IntegrationHealth,AuditDirectory} from '../../shared/operational-contracts';
import type {OperationsWorkspace} from '../pages/operations';
type Navigate=(path:string,replace?:boolean,focusSelector?:string)=>void;
function auditParams(q:URLSearchParams):string{
 const raw:Record<string,string>={q:q.get('q')??'',action:q.get('action')??'',page:q.get('page')??'1',pageSize:q.get('pageSize')??'25'};for(const key of ['from','to'])if(q.get(key))raw[key]=q.get(key)!;
 const result=auditQuerySchema.safeParse(raw);if(!result.success)throw new Error('Choose a valid audit date range, search and page.');
 return new URLSearchParams(Object.entries(result.data).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)])).toString();
}
export async function loadOperationsWorkspace(path:string,q:URLSearchParams,signal:AbortSignal):Promise<OperationsWorkspace>{
 const page=path==='/admin/audit'?'audit':'health';
 try{return page==='audit'?{kind:'audit',audit:await api<AuditDirectory>('/api/operations/audit?'+auditParams(q),{signal})}:{kind:'health',health:await api<IntegrationHealth>('/api/operations/health',{signal})};}catch(issue){if(issue instanceof ApiError&&issue.status===403)return{kind:'restricted',page,message:errorMessage(issue)};throw issue;}
}
export function initializeOperationsWorkspace(signal:AbortSignal,navigate:Navigate):void{
 const host=document.querySelector<HTMLElement>('[data-operations-workspace]');if(!host)return;nameFormControls(host);
 host.addEventListener('submit',event=>{const form=event.target;if(!(form instanceof HTMLFormElement)||!form.hasAttribute('data-operations-audit-filter'))return;event.preventDefault();if(!form.reportValidity())return;try{const q=new URLSearchParams();for(const[key,value]of new FormData(form))if(typeof value==='string'&&value.trim())q.set(key,value.trim());auditParams(q);navigate('/admin/audit?'+q,false,'[data-operations-workspace]');}catch(issue){const output=form.querySelector<HTMLElement>('[data-operations-error]');if(output){output.textContent=errorMessage(issue);output.tabIndex=-1;output.focus({preventScroll:true});}}},{signal});
}
