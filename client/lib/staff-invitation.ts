import type {StaffInvitationResolution,StaffInvitationAcceptance} from '../../shared/organization-provisioning-contracts';
import {api,ApiError} from './api';
import {customerError} from './customer-copy';
import {staffInvitationContent,type StaffInvitationView} from '../pages/staff-invitation';

/** Invitation secrets are removed synchronously and never written to browser storage. */
export function takeStaffInvitation():string|null{
 const fragment=location.hash,queryPresent=Boolean(location.search);
 history.replaceState(history.state,'',location.pathname);
 return !queryPresent&&/^#token=[a-f0-9]{64}$/.test(fragment)?fragment.slice(7):null;
}

export function initializeStaffInvitation(signal:AbortSignal,initialToken:string|null):void{
 const host=document.querySelector<HTMLElement>('[data-staff-invitation]');if(!host||!initialToken)return;
 let token:string|null=initialToken,invitation:StaffInvitationResolution|null=null,busy=false;
 const show=(view:StaffInvitationView,focus=true)=>{if(signal.aborted)return;host.innerHTML=staffInvitationContent(view);if(focus)host.querySelector<HTMLElement>('[data-staff-invitation-title]')?.focus({preventScroll:true});};
 const showError=(issue:unknown)=>{if(signal.aborted)return;const node=host.querySelector<HTMLElement>('[data-staff-invitation-error]');if(node){node.textContent=customerError(issue,'This action could not be completed. Try again, sign in if your account is ready, or ask the person who invited you for help.');node.hidden=false;node.tabIndex=-1;node.focus();}};
 const terminal=(issue:unknown)=>issue instanceof ApiError&&[404,409,410].includes(issue.status);
 const load=async()=>{
  if(busy||!token||signal.aborted)return;busy=true;host.setAttribute('aria-busy','true');show({kind:'loading'},false);
  try{
   const result=await api<StaffInvitationResolution>('/api/staff-onboarding/resolve',{method:'POST',body:JSON.stringify({token}),signal});
   if(signal.aborted)return;
   if(result.state!=='pending'||!result.organization?.name||!result.administrator?.name||!result.administrator.email||!Number.isFinite(Date.parse(result.expiresAt))||Date.parse(result.expiresAt)<=Date.now()){token=null;show({kind:'unavailable'});return;}
   invitation=result;show({kind:'ready',invitation});
  }catch(issue){if(signal.aborted)return;if(terminal(issue)){token=null;show({kind:'unavailable'});}else show({kind:'error',message:customerError(issue,'Your invitation could not be opened. Please try again or ask the person who invited you for help.')});}
  finally{busy=false;if(!signal.aborted)host.removeAttribute('aria-busy');}
 };
 host.addEventListener('input',event=>{if(event.target instanceof HTMLInputElement){host.querySelector<HTMLInputElement>('[name=confirmation]')?.setCustomValidity('');const error=host.querySelector<HTMLElement>('[data-staff-invitation-error]');if(error)error.hidden=true;}},{signal});
 host.addEventListener('click',event=>{if(event.target instanceof Element&&event.target.closest('[data-staff-invitation-retry]'))void load();},{signal});
 host.addEventListener('submit',async event=>{
  const form=event.target;if(!(form instanceof HTMLFormElement)||!form.hasAttribute('data-staff-invitation-form'))return;event.preventDefault();if(busy||!token||!invitation)return;
  const password=form.querySelector<HTMLInputElement>('[name=password]')!,confirmation=form.querySelector<HTMLInputElement>('[name=confirmation]')!;
  confirmation.setCustomValidity(password.value===confirmation.value?'':'The passwords do not match.');
  if(!form.reportValidity()){if(password.value!==confirmation.value)showError(new Error('The passwords do not match. Enter the same password in both fields.'));return;}
  if(Date.parse(invitation.expiresAt)<=Date.now()){token=null;form.reset();show({kind:'unavailable'});return;}
  const body={token,password:password.value},fieldset=form.querySelector<HTMLFieldSetElement>('fieldset')!;
  busy=true;fieldset.disabled=true;form.setAttribute('aria-busy','true');const error=form.querySelector<HTMLElement>('[data-staff-invitation-error]');if(error)error.hidden=true;
  try{
   const result=await api<StaffInvitationAcceptance>('/api/staff-onboarding/accept',{method:'POST',body:JSON.stringify(body),signal});
   if(signal.aborted)return;
   if(result.accepted!==true)throw new Error('Your account could not be confirmed. Try signing in or ask the person who invited you for help.');
   token=null;invitation=null;form.reset();show({kind:'accepted'});
  }catch(issue){if(signal.aborted)return;if(terminal(issue)){token=null;invitation=null;form.reset();show({kind:'unavailable'});}else showError(issue);}
  finally{busy=false;if(!signal.aborted&&form.isConnected){fieldset.disabled=false;form.removeAttribute('aria-busy');}}
 },{signal});
 signal.addEventListener('abort',()=>{token=null;invitation=null;host.querySelector<HTMLFormElement>('form')?.reset();},{once:true});
 void load();
}
