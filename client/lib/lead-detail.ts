import {initializeLeadAssistance} from './lead-assistance';
import { api } from './api';
import { productError } from './product-copy';
import type { ContactRecord } from '../../shared/property-contracts';

type Navigate = (path: string, replace?: boolean, focusSelector?: string) => void;
export function initializeLeadDetail(signal: AbortSignal, navigate: Navigate): void {
  const workspace = document.querySelector<HTMLElement>('[data-lead-detail]');
  if (!workspace) return;
  initializeLeadAssistance(workspace,signal,navigate);
  const dialogs = [...workspace.querySelectorAll<HTMLDialogElement>('dialog.ld-dialog')];
  const returnFocus = new WeakMap<HTMLDialogElement, HTMLElement>();
  const urlFlag = (dialog: HTMLDialogElement): string | null => dialog.id === 'lead-ai-dialog' ? 'assistant' : dialog.id === 'lead-edit-dialog' ? 'editor' : null;
  const changeFlag = (dialog: HTMLDialogElement, open: boolean): void => {
    const flag = urlFlag(dialog); if (!flag || signal.aborted) return;
    const url = new URL(location.href); if (open) url.searchParams.set(flag, '1'); else url.searchParams.delete(flag);
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  };
  const openDialog = (dialog: HTMLDialogElement | null, opener?: HTMLElement): void => {
    if (!dialog || dialog.open) return;
    for (const item of dialogs) if (item.open) item.close();
    if (opener) returnFocus.set(dialog, opener);
    dialog.showModal(); changeFlag(dialog, true);
    const target = dialog.querySelector<HTMLElement>('input:not([disabled]),textarea:not([disabled]),button[data-dialog-close]');
    target?.focus({ preventScroll: true });
  };
  for (const dialog of dialogs) {
    dialog.addEventListener('close', () => {
      changeFlag(dialog, false);
      const opener = returnFocus.get(dialog); if (opener?.isConnected && !signal.aborted) opener.focus({ preventScroll: true });
    }, { signal });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    }, { signal });
  }
  signal.addEventListener('abort', () => { for (const dialog of dialogs) if (dialog.open) dialog.close(); }, { once: true });
  workspace.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-lead-tab],[data-lead-ai-open],[data-lead-edit-open],[data-lead-dialog-open],[data-dialog-close]') : null;
    if (!target) return;
    if (target.hasAttribute('data-lead-tab')) {
      if (event instanceof MouseEvent && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0)) return;
      event.preventDefault(); event.stopPropagation();
      const anchor = target as HTMLAnchorElement;
      navigate(anchor.pathname + anchor.search, false, '#lead-tab-' + target.dataset.leadTab);
      return;
    }
    event.preventDefault();
    if (target.hasAttribute('data-dialog-close')) { target.closest<HTMLDialogElement>('dialog')?.close(); return; }
    const id = target.hasAttribute('data-lead-ai-open') ? 'lead-ai-dialog' : target.hasAttribute('data-lead-edit-open') ? 'lead-edit-dialog' : target.dataset.leadDialogOpen!;
    openDialog(workspace.querySelector<HTMLDialogElement>('#' + id), target);
  }, { signal });
  workspace.addEventListener('keydown', event => {
    const tab = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('[data-lead-tab]') : null;
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...workspace.querySelectorAll<HTMLAnchorElement>('[data-lead-tab]')], index = tabs.indexOf(tab);
    const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    if (next) navigate(next.pathname + next.search, false, '#lead-tab-' + next.dataset.leadTab);
  }, { signal });
  workspace.addEventListener('submit', async event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || (!form.hasAttribute('data-contact-edit') && !form.hasAttribute('data-lead-household-create'))) return;
    event.preventDefault();
    const submit = form.querySelector<HTMLButtonElement>('button[type=submit]'); if (submit?.disabled) return;
    const isContact = form.hasAttribute('data-contact-edit');
    const error = form.querySelector<HTMLElement>(isContact ? '[data-contact-error]' : '[data-household-error]');
    const status = form.querySelector<HTMLElement>('[data-contact-status]');
    if (error) error.textContent = ''; if (status) status.textContent = '';
    const data = new FormData(form);
    const body: Record<string, unknown> = {};
    if (isContact) {
      const original = JSON.parse(form.dataset.original ?? '{}') as Record<string, string>;
      for (const key of ['displayName', 'email', 'phone']) {
        const value = data.get(key); if (typeof value === 'string' && value.trim() !== original[key]) body[key] = value.trim();
      }
      if (!Object.keys(body).length) { if (status) status.textContent = 'No contact changes to save.'; return; }
    } else {
      body.name = String(data.get('name') ?? '').trim(); body.propertyIds = [String(data.get('propertyId') ?? '')];
      body.members = [{ contactId: form.dataset.contactId, relationship: 'member' }];
    }
    if (submit) { submit.disabled = true; submit.setAttribute('aria-busy', 'true'); }
    try {
      if (isContact) {
        const result = await api<{ contact: ContactRecord }>('/api/property-foundation/contacts/' + encodeURIComponent(form.dataset.contactId!), { method: 'PATCH', body: JSON.stringify(body), signal });
        if (signal.aborted) return;
        const contact = result.contact;
        form.dataset.original = JSON.stringify({ displayName: contact.displayName, email: contact.email, phone: contact.phone });
        for (const key of ['displayName', 'email', 'phone'] as const) {
          const control = form.elements.namedItem(key); if (control instanceof HTMLInputElement) control.value = contact[key];
        }
        workspace.querySelectorAll<HTMLElement>('[data-lead-contact-name]').forEach(item => { item.textContent = contact.displayName; });
        workspace.querySelectorAll<HTMLElement>('[data-lead-contact-email]').forEach(item => { item.textContent = contact.email || 'Email not supplied'; });
        workspace.querySelectorAll<HTMLElement>('[data-lead-contact-phone]').forEach(item => { item.textContent = contact.phone || 'Phone not supplied'; });
        if (status) status.textContent = 'Contact saved. Opportunity changes are saved separately below.';
      } else {
        await api('/api/property-foundation/households', { method: 'POST', body: JSON.stringify(body), signal });
        if (signal.aborted) return;
        const query = new URLSearchParams(location.search); query.set('leadTab', 'activity'); query.set('editor','1'); query.set('saved08', 'household');
        navigate('/admin/leads?' + query + '#lead08-contact', true, '#lead08-contact');
      }
    } catch (issue) {
      if (!signal.aborted && error) { error.textContent = productError(issue); error.tabIndex = -1; error.focus({preventScroll:true}); }
    } finally {
      if (!signal.aborted && submit) { submit.disabled = false; submit.removeAttribute('aria-busy'); }
    }
  }, { signal });
  const query = new URLSearchParams(location.search);
  if (query.get('editor') === '1' || location.hash === '#lead-editor') openDialog(workspace.querySelector<HTMLDialogElement>('#lead-edit-dialog'), workspace.querySelector<HTMLElement>('[data-lead-edit-open]') ?? undefined);
  else if (query.get('assistant') === '1' || ['#lead08-assistant', '#lead08-suggestions'].includes(location.hash)) openDialog(workspace.querySelector<HTMLDialogElement>('#lead-ai-dialog'), workspace.querySelector<HTMLElement>('[data-lead-ai-open]') ?? undefined);
}
