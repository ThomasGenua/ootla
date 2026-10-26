import type {StaffInvitationResolution} from '../../shared/organization-provisioning-contracts';
import {escapeHtml as e,icon,link,wordmark} from '../lib/ui';

export type StaffInvitationView=
 |{kind:'loading'}
 |{kind:'missing'}
 |{kind:'ready';invitation:StaffInvitationResolution}
 |{kind:'unavailable'}
 |{kind:'error';message:string}
 |{kind:'accepted'};

export function staffInvitationContent(view:StaffInvitationView):string{
 if(view.kind==='loading')return '<span class="eyebrow">YOUR OOTLA INVITATION</span><h1 data-staff-invitation-title tabindex="-1">A place for<br>your team.</h1><p class="notice notice-neutral" role="status"><span class="spinner spinner-small" aria-hidden="true"></span>Opening your private invitation...</p>';
 if(view.kind==='accepted')return '<span class="eyebrow">YOU ARE READY</span><h1 data-staff-invitation-title tabindex="-1">Welcome to Ootla.</h1><p class="login-intro" role="status">Your account is ready. Sign in with your email and new password to open your organization\'s workspace.</p>'+link('/admin/login','Continue to sign in '+icon('arrow'),'button button-primary')+'<p class="login-intro">Accepting this invitation has not signed you in.</p>';
 if(view.kind==='ready'){
  const info=view.invitation,expires=new Date(info.expiresAt).toLocaleString();
  return '<span class="eyebrow">YOUR PRIVATE INVITATION</span><h1 data-staff-invitation-title tabindex="-1">Join '+e(info.organization.name)+'.</h1><p class="login-intro">Create your password to manage this organization\'s workspace.</p><div class="notice notice-neutral"><div><strong>'+e(info.administrator.name)+'</strong><p>'+e(info.administrator.email)+'</p><p>Invitation expires '+e(expires)+'.</p></div></div><form method="post" data-staff-invitation-form><fieldset style="border:0;padding:0;margin:0;min-width:0"><legend class="sr-only">Create your account password</legend><div class="form-field"><label for="staff-invite-password">Create password</label><div class="input-wrap">'+icon('lock')+'<input id="staff-invite-password" name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required aria-describedby="staff-password-hint"/></div></div><div class="form-field"><label for="staff-invite-confirmation">Confirm password</label><div class="input-wrap">'+icon('lock')+'<input id="staff-invite-confirmation" name="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="128" required/></div></div><p id="staff-password-hint" class="login-intro">Use 12 to 128 characters. Choose a password you do not use elsewhere.</p><p class="form-error" data-staff-invitation-error role="alert" hidden></p><button type="submit" class="button button-primary login-submit">Accept invitation '+icon('arrow')+'</button></fieldset></form><p class="login-intro">'+link('/admin/login','Already accepted? Sign in','text-link')+'</p>';
 }
 const missing=view.kind==='missing',transient=view.kind==='error';
 return '<span class="eyebrow">YOUR OOTLA INVITATION</span><h1 data-staff-invitation-title tabindex="-1">'+(transient?'We could not open<br>your invitation.':missing?'Open your<br>private invitation.':'This invitation<br>is no longer available.')+'</h1><p class="notice notice-warning" '+(transient?'role="alert"':'role="status"')+'>'+e(transient?view.message:missing?'Open the complete private link supplied by the person who invited you.':'It may have expired, been accepted or been replaced. Ask the person who invited you for a new link.')+'</p>'+(transient?'<button type="button" class="button button-primary" data-staff-invitation-retry>Try again</button>':'')+'<p class="login-intro">'+link('/admin/login','Staff sign in','text-link')+'</p>';
}

export function staffInvitationPage(hasToken:boolean):string{
 return '<main id="main-content" class="login-layout"><section class="login-brand-panel">'+link('/',wordmark(true),'brand-link')+'<div class="login-brand-copy"><span class="eyebrow">PEOPLE. PROPERTY. POSSIBILITY.</span><h2>Your team.<br>Your next<br> <span>good chapter.</span></h2><p>A clearer place for your properties, people and daily work.</p></div><div class="login-brand-bottom"><span class="small-line"></span> Thoughtfully connected.</div><div class="login-decoration" aria-hidden="true"></div></section><section class="login-form-panel"><div class="login-top-link">'+link('/',icon('arrow-left')+' Back to Ootla','text-link')+'</div><div class="login-form-wrap" data-staff-invitation>'+staffInvitationContent({kind:hasToken?'loading':'missing'})+'</div><div class="login-bottom"><span>Your organization. Your workspace.</span><span>Ootla</span></div></section></main>';
}
