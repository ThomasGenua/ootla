export function viewingNotificationChoice(mode:'preview'|'not_configured'='not_configured'):string{
 return '<fieldset class="vc-notification-choice"><legend>Send the client an email about this viewing?</legend><div class="vc-actions"><label class="vc-check"><input type="radio" name="notifyClient" value="yes" required/> Yes</label><label class="vc-check"><input type="radio" name="notifyClient" value="no" required/> No</label></div><p class="vc-hint" data-viewing-email-notice>'+notificationNotice(mode)+'</p></fieldset>';
}
export function notificationNotice(mode:'preview'|'not_configured'):string{
 return mode==='preview'?'Email is processed in this isolated preview. No external email is sent.':'Email delivery is not configured. Choosing Yes keeps a notification draft after booking.';
}
