import { api, ApiError } from './api';
import { productError } from './product-copy';
import type { GoogleCalendarStatus, GoogleCalendarBusy, GoogleCalendarChoices, GoogleCalendarChoice } from '../../shared/google-calendar-contracts';
import { escapeHtml as e } from './ui';
export interface GoogleCalendarWorkspace { status: GoogleCalendarStatus | null; busy: GoogleCalendarBusy | null; error?: string }
export async function loadGoogleCalendar(signal: AbortSignal): Promise<GoogleCalendarWorkspace> {
 let status: GoogleCalendarStatus;
 try { status = await api<GoogleCalendarStatus>('/api/google-calendar', { signal }); } catch (issue) { if (signal.aborted || issue instanceof ApiError && issue.status === 401) throw issue; return { status: null, busy: null, error: productError(issue) }; }
 let busy: GoogleCalendarBusy | null = null;
 if (status.selectedCalendars.length) {
  const from = new Date(); from.setUTCHours(0, 0, 0, 0); const until = new Date(from.getTime() + 7 * 86400000);
  try { busy = await api<GoogleCalendarBusy>('/api/google-calendar/busy?' + new URLSearchParams({ from: from.toISOString(), until: until.toISOString() }), { signal }); } catch (issue) { if (signal.aborted || issue instanceof ApiError && issue.status === 401) throw issue; return { status, busy: null, error: 'Google busy times are temporarily unavailable. ' + productError(issue) }; }
 }
 return { status, busy };
}
export function initializeGoogleCalendar(signal: AbortSignal, navigate: (path: string, replace?: boolean, focusSelector?: string) => void): void {
 const host = document.querySelector<HTMLElement>('[data-google-calendar]'); if (!host) return;
 const error = host.querySelector<HTMLElement>('[data-google-error]'), message = host.querySelector<HTMLElement>('[data-google-message]'), selection = host.querySelector<HTMLElement>('[data-google-selection]');
 if (!error || !message || !selection) return;
 const dialog = host.querySelector<HTMLDialogElement>('[data-google-connect-dialog]'), dialogError = host.querySelector<HTMLElement>('[data-google-dialog-error]');
 let choices: GoogleCalendarChoice[] = [], nextPageToken: string | null = null, writeTarget = host.dataset.googleWriteTarget ?? '', invoker: HTMLElement | null = null;
 const closeDialog = () => { dialog?.close(); invoker?.focus({ preventScroll: true }); };
 signal.addEventListener('abort', () => dialog?.close(), { once: true });
 const render = () => {
  selection.innerHTML = '<form data-google-selection-form><h4 tabindex="-1">Choose your calendars</h4><p>Choose calendars for checking busy times, plus one writable calendar for your assigned Ootla viewings.</p><fieldset class="vc-slots"><legend>Calendars in your Google account</legend>' + choices.map(c => '<label class="vc-check"><input type="checkbox" name="calendarIds" value="' + e(c.id) + '" ' + (c.selected ? 'checked' : '') + '/> ' + e(c.name) + (c.writable ? '' : ' (read only)') + '</label>').join('') + '</fieldset><div class="vc-field"><label for="google-write-target">Save Ootla viewings to</label><select id="google-write-target" name="writeCalendarId" required><option value="">Choose a writable calendar</option>' + choices.filter(c => c.writable).map(c => '<option value="' + e(c.id) + '" ' + (c.id === writeTarget ? 'selected' : '') + '>' + e(c.name) + '</option>').join('') + '</select></div><p class="vc-hint">Other events stay private and appear only as busy times. No calendar invitations are sent.</p><div class="vc-actions"><button type="submit" class="vc-button vc-primary">Save and sync selected calendars</button>' + (nextPageToken ? '<button type="button" class="vc-button" data-google-action="more">Load more calendars</button>' : '') + '</div></form>';
 };
 const loadCalendars = async (more = false, focus = true) => {
  if (more) {
   const form = selection.querySelector<HTMLFormElement>('[data-google-selection-form]');
   if (form) { const data = new FormData(form), selected = new Set(data.getAll('calendarIds')); choices = choices.map(c => ({ ...c, selected: selected.has(c.id) })); writeTarget = String(data.get('writeCalendarId') ?? ''); }
  }
  const result = await api<GoogleCalendarChoices>('/api/google-calendar/calendars' + (more && nextPageToken ? '?' + new URLSearchParams({ pageToken: nextPageToken }) : ''), { signal });
  choices = more ? [...choices, ...result.items.filter(c => !choices.some(old => old.id === c.id))] : result.items; nextPageToken = result.nextPageToken; render();
  if (focus) selection.querySelector<HTMLElement>('h4')?.focus({ preventScroll: true });
 };
 host.addEventListener('click', async event => {
  const element = event.target instanceof Element ? event.target : null;
  if (element?.closest('[data-google-close]')) { closeDialog(); return; }
  const target = element?.closest<HTMLButtonElement>('[data-google-action]'); if (!target || target.disabled) return;
  target.disabled = true; error.textContent = ''; message.textContent = ''; if (dialogError) dialogError.textContent = '';
  try {
   const action = target.dataset.googleAction;
   if (action === 'open') {
    if (host.dataset.googleConnected === 'true' && host.dataset.googleCanManage === 'true') await loadCalendars();
    else { invoker = target; dialog?.showModal(); }
    return;
   }
   if (action === 'connect') {
    // The server independently rejects demo/disabled connections; never substitute a simulated OAuth success.
    if (host.dataset.googleCanConnect !== 'true') throw new Error('Google Calendar is not available for this account yet.');
    const result = await api<{ authorizationUrl: string }>('/api/google-calendar/oauth/start', { method: 'POST', body: '{}', signal });
    const url = new URL(result.authorizationUrl); if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com') throw new Error('Authorization destination is invalid.'); location.assign(url.href); return;
   }
   if (action === 'calendars' || action === 'more') { await loadCalendars(action === 'more'); return; }
   if (!['disconnect', 'sync', 'retry'].includes(action ?? '')) return;
   if (action === 'disconnect' && !window.confirm('Disconnect your Google Calendar? Ootla bookings and existing Google events will be retained.')) return;
   await api('/api/google-calendar/' + action, { method: 'POST', body: '{}', signal });
   message.textContent = action === 'disconnect' ? 'Google disconnected. Your Ootla bookings are still available.' : 'Google sync queued. Your Ootla bookings are already saved.';
   if (action === 'disconnect') navigate('/admin/calendar?view=google', true, '[data-google-calendar]');
  } catch (issue) { if (!signal.aborted) { const text = productError(issue); error.textContent = text; if (dialog?.open && dialogError) dialogError.textContent = text; } } finally { if (!signal.aborted) target.disabled = false; }
 }, { signal });
 host.addEventListener('submit', async event => {
  const form = event.target; if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-google-selection-form')) return; event.preventDefault();
  const data = new FormData(form), button = form.querySelector<HTMLButtonElement>('button[type=submit]')!; if (button.disabled) return; button.disabled = true; error.textContent = '';
  const calendarIds = data.getAll('calendarIds').map(String), writeCalendarId = String(data.get('writeCalendarId') ?? '');
  try {
   if (!calendarIds.length || calendarIds.length > 10 || !calendarIds.includes(writeCalendarId)) throw new Error('Choose up to ten calendars and include the calendar where Ootla viewings will be saved.');
   await api('/api/google-calendar/selection', { method: 'PUT', body: JSON.stringify({ calendarIds, writeCalendarId }), signal });
   navigate('/admin/calendar?view=google', true, '[data-google-calendar]');
  } catch (issue) { if (!signal.aborted) error.textContent = productError(issue); } finally { if (!signal.aborted) button.disabled = false; }
 }, { signal });
 const callback = new URLSearchParams(location.search).get('google');
 if (callback === 'denied') error.textContent = 'Google authorization was cancelled. Your Ootla bookings are unchanged.';
 if (callback === 'failed') error.textContent = 'Google authorization could not be completed. Try connecting again.';
 if (host.dataset.googleConnected === 'true' && host.dataset.googleCanManage === 'true' && (callback === 'connected' || host.dataset.googleHasSelection === 'false')) {
  message.textContent = 'Choose your calendars to start syncing.';
  void loadCalendars(false, false).catch(issue => { if (!signal.aborted) error.textContent = productError(issue); });
 }
}
