import {customerError} from './customer-copy';
import { api, errorMessage } from './api';
import type { PaymentHandoff, DemoPaymentHandoff } from '../../shared/payment-contracts';
type Navigate=(path:string,replace?:boolean,focusSelector?:string)=>void;
function errorIn(scope:HTMLElement,issue:unknown):void {
 const output=scope.querySelector<HTMLElement>('[data-payment-error]');if(output){output.textContent=customerError(issue);output.tabIndex=-1;output.focus({preventScroll:true});}
}
export function takePaymentDemoToken():string|null {
 const fragment=location.hash;history.replaceState(history.state,'',location.pathname);
 return /^#token=[a-f0-9]{64}$/.test(fragment)?fragment.slice(7):null;
}
export function initializePaymentWorkspace(signal:AbortSignal,navigate:Navigate):void {
 document.querySelectorAll<HTMLElement>('[data-payment-workspace]').forEach(workspace=>{
  workspace.addEventListener('submit',async event=>{
   const form=event.target;if(!(form instanceof HTMLFormElement)||!form.hasAttribute('data-payment-action'))return;
   event.preventDefault();if(!form.reportValidity())return;
   const button=form.querySelector<HTMLButtonElement>('button[type=submit]');if(button?.disabled)return;
   const action=form.dataset.paymentAction!,id=workspace.dataset.applicationId!,kind=workspace.dataset.paymentKind!,data=new FormData(form);
   const payload=JSON.stringify({action,name:data.get('name'),url:data.get('url'),enabled:data.get('enabled')});
   if(!form.dataset.requestKey||form.dataset.requestPayload!==payload){form.dataset.requestKey=crypto.randomUUID();form.dataset.requestPayload=payload;}
   const base=kind==='staff'?'/api/application-payments':'/api/applicant/application-payments';
   let endpoint=base+'/'+encodeURIComponent(id)+'/'+action,body:Record<string,unknown>={requestKey:form.dataset.requestKey};
   if(action==='destination'){endpoint='/api/application-payments/destinations';body={...body,name:String(data.get('name')??'').trim(),url:String(data.get('url')??'').trim(),enabled:data.get('enabled')==='on'};}
   if(button)button.disabled=true;form.setAttribute('aria-busy','true');const error=form.querySelector<HTMLElement>('[data-payment-error]');if(error)error.textContent='';
   try{
    const result=await api<PaymentHandoff>(endpoint,{method:'POST',body:JSON.stringify(body),signal});if(signal.aborted)return;
    if(action==='handoff'){
     const target=new URL(result.url,location.origin);
     if(result.mode==='demo'&&target.origin===location.origin&&target.pathname==='/payment-demo'&&!target.search&&/^#token=[a-f0-9]{64}$/.test(target.hash))navigate(target.pathname+target.hash);
     else if(result.mode==='external'&&target.protocol==='https:'&&!target.username&&!target.password&&!target.hash)location.assign(target.href);
     else throw new Error('The payment destination could not be validated. Ask your leasing team for help.');
     return;
    }
    const query=new URLSearchParams(location.search);query.set('application',id);query.set('paymentSaved',action);query.delete('saved');query.delete('screeningSaved');
    navigate((kind==='staff'?'/admin/applications':'/applicant')+'?'+query,true,'[data-payment-success]');
   }catch(issue){if(!signal.aborted)errorIn(form,issue);}
   finally{if(!signal.aborted){if(button)button.disabled=false;form.removeAttribute('aria-busy');}}
  },{signal});
  if(new URLSearchParams(location.search).has('paymentSaved')){const status=workspace.querySelector<HTMLElement>('[data-payment-success]');if(status){status.hidden=false;status.tabIndex=-1;status.textContent='The update was saved. Your current payment status is shown above.';}}
 });
}
/** Fragment secrets remain only in this page closure and protected POST bodies. */
export async function initializePaymentDemo(signal:AbortSignal,token:string|null):Promise<void> {
 const workspace=document.querySelector<HTMLElement>('[data-payment-demo]');if(!workspace)return;
 const button=workspace.querySelector<HTMLButtonElement>('[data-payment-demo-confirm]')!,status=workspace.querySelector<HTMLElement>('[data-payment-demo-status]')!,back=workspace.querySelector<HTMLAnchorElement>('[data-payment-demo-return]')!;
 let secret=token,requestKey=crypto.randomUUID();signal.addEventListener('abort',()=>{secret=null;},{once:true});
 function show(data:DemoPaymentHandoff):void {
  if(!/^\/applicant\?application=[a-f0-9-]{36}$/.test(data.returnUrl))throw new Error('The application return destination could not be validated.');
  back.href=data.returnUrl;status.textContent=(data.status==='confirmed'?'Example confirmation saved. ':'Awaiting example confirmation. ')+'No payment was taken.'+' Expires '+new Date(data.expiresAt).toLocaleString()+'.';
  button.disabled=data.status==='confirmed';if(data.status==='confirmed')button.textContent='Example confirmation saved';
 }
 button.addEventListener('click',async()=>{
  if(!secret||button.disabled)return;button.disabled=true;workspace.setAttribute('aria-busy','true');const error=workspace.querySelector<HTMLElement>('[data-payment-error]');if(error)error.textContent='';
  try{const data=await api<DemoPaymentHandoff>('/api/payment-demo/confirm',{method:'POST',body:JSON.stringify({token:secret,requestKey}),signal});if(!signal.aborted)show(data);}
  catch(issue){if(!signal.aborted){errorIn(workspace,issue);button.disabled=false;}}
  finally{if(!signal.aborted)workspace.removeAttribute('aria-busy');}
 },{signal});
 try{
  if(!secret)throw new Error('This secure handoff is missing. Return to your application and open a new payment example.');
  const data=await api<DemoPaymentHandoff>('/api/payment-demo/open',{method:'POST',body:JSON.stringify({token:secret}),signal});if(!signal.aborted)show(data);
 }catch(issue){if(!signal.aborted){status.hidden=true;errorIn(workspace,issue);button.disabled=true;}}
}
