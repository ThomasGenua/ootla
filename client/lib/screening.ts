import { api, errorMessage } from './api';
export type ScreeningNavigate=(path:string,replace?:boolean,focusSelector?:string)=>void;
function errorIn(form:HTMLElement,issue:unknown):void {
 const output=form.querySelector<HTMLElement>('[data-screening-error]')??document.querySelector<HTMLElement>('[data-screening-global-error]');
 if(output){output.textContent=errorMessage(issue);output.tabIndex=-1;output.focus();}
}
/** Stable per-attempt keys survive network errors; navigation reloads the committed state. */
export function initializeScreeningWorkspace(signal:AbortSignal,navigate:ScreeningNavigate):void {
 const workspace=document.querySelector<HTMLElement>('[data-screening-workspace]');
 workspace?.addEventListener('submit',async event=>{
  const form=event.target;if(!(form instanceof HTMLFormElement)||!form.hasAttribute('data-screening-action'))return;
  event.preventDefault();if(!form.reportValidity())return;
  const button=form.querySelector<HTMLButtonElement>('button[type=submit]');if(button?.disabled)return;
  const applicationId=workspace.dataset.applicationId!,action=form.dataset.screeningAction!,data=new FormData(form);
  const payload=JSON.stringify({action,participantId:form.dataset.participantId,decision:data.get('decision'),reason:data.get('reason')});
  if(!form.dataset.requestKey||form.dataset.requestPayload!==payload){form.dataset.requestKey=crypto.randomUUID();form.dataset.requestPayload=payload;}
  const requestKey=form.dataset.requestKey,base='/api/application-journey/'+encodeURIComponent(applicationId);
  let route=base+'/screening/',body:Record<string,unknown>={requestKey};
  if(action==='request'){route+='requests';body.participantId=form.dataset.participantId;}
  else if(action==='process'||action==='fail'){route+='process';if(action==='fail')body.simulateFailure=true;}
  else if(action==='retry'||action==='review')route+=action;
  else if(action==='decision'){route=base+'/decisions';body={requestKey,decision:String(data.get('decision')??''),reason:String(data.get('reason')??'').trim()};}
  else return;
  if(button)button.disabled=true;form.setAttribute('aria-busy','true');
  const error=form.querySelector<HTMLElement>('[data-screening-error]');if(error)error.textContent='';
  try{await api(route,{method:'POST',body:JSON.stringify(body),signal});if(!signal.aborted)navigate('/admin/applications?'+new URLSearchParams({application:applicationId,screeningSaved:action}),true,'[data-screening-success]');}
  catch(issue){if(!signal.aborted)errorIn(form,issue);}
  finally{if(!signal.aborted){if(button)button.disabled=false;form.removeAttribute('aria-busy');}}
 },{signal});
 const saved=new URLSearchParams(location.search).get('screeningSaved');
 if(workspace&&saved){const success=workspace.querySelector<HTMLElement>('[data-screening-success]');if(success){success.hidden=false;success.tabIndex=-1;success.textContent=saved==='decision'?'The staff decision was saved with its audit history.':'Screening action saved. The status below is loaded from the application records.';}}
}
export function initializeScreeningConsent(signal:AbortSignal,navigate:ScreeningNavigate):void {
 const workspace=document.querySelector<HTMLElement>('[data-screening-consent-workspace]'),form=workspace?.querySelector<HTMLFormElement>('[data-screening-consent]');
 form?.addEventListener('submit',async event=>{
  event.preventDefault();if(!workspace||!form.reportValidity())return;
  const button=form.querySelector<HTMLButtonElement>('button[type=submit]');if(button?.disabled)return;
  if(button)button.disabled=true;form.setAttribute('aria-busy','true');
  try{await api('/api/applicant/application-journey/'+encodeURIComponent(workspace.dataset.applicationId!)+'/screening-consent',{method:'POST',body:JSON.stringify({version:form.dataset.consentVersion,accepted:true}),signal});if(!signal.aborted)navigate('/applicant?'+new URLSearchParams({application:workspace.dataset.applicationId!,screeningSaved:'consent'}),true,'[data-screening-consent-workspace]');}
  catch(issue){if(!signal.aborted)errorIn(form,issue);}
  finally{if(!signal.aborted){if(button)button.disabled=false;form.removeAttribute('aria-busy');}}
 },{signal});
}
