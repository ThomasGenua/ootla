import {customerError} from './customer-copy';
import { api, ApiError, errorMessage } from './api';
import type { AccountSnapshot, AccountProfile, AccountPreferences } from '../../shared/account-contracts';

export type AccountWorkspacePayload = { kind: 'profile' | 'settings'; account: AccountSnapshot };
export async function loadAccountWorkspace(path: string, _query: URLSearchParams, signal: AbortSignal): Promise<AccountWorkspacePayload> {
  const account = await api<AccountSnapshot>('/api/account', { signal });
  return { kind: path === '/admin/settings' ? 'settings' : 'profile', account };
}
const text = (data: FormData, key: string): string => String(data.get(key) ?? '').trim();
export function initializeAccountWorkspace(signal: AbortSignal, navigate: (path: string, replace?: boolean, focusSelector?: string) => void): void {
  const workspace = document.querySelector<HTMLElement>('[data-account-workspace]');
  if (!workspace) return;
  workspace.addEventListener('submit', async event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-account-form')) return;
    event.preventDefault();
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit?.disabled) return;
    const error = form.querySelector<HTMLElement>('[data-account-error]');
    const recovery = form.querySelector<HTMLElement>('[data-account-reload]');
    if (error) error.textContent = '';
    if (recovery) recovery.hidden = true;
    const data = new FormData(form);
    const kind = form.dataset.accountForm;
    if (submit) { submit.disabled = true; submit.setAttribute('aria-busy', 'true'); }
    try {
      if (kind === 'profile') {
        await api<{ profile: AccountProfile }>('/api/account/profile', { method: 'PATCH', signal, body: JSON.stringify({ version: Number(form.dataset.version), displayName: text(data, 'displayName'), phone: text(data, 'phone') || null, jobTitle: text(data, 'jobTitle') || null }) });
        if (!signal.aborted) navigate('/admin/profile?saved=profile', true, '[data-account-result]');
      } else if (kind === 'preferences') {
        await api<{ preferences: AccountPreferences }>('/api/account/preferences', { method: 'PATCH', signal, body: JSON.stringify({ version: Number(form.dataset.version), defaultPage: text(data, 'defaultPage'), leadView: text(data, 'leadView'), motion: text(data, 'motion') }) });
        if (!signal.aborted) navigate('/admin/settings?saved=preferences', true, '[data-account-result]');
      } else if (kind === 'password') {
        // Passwords are never trimmed or retained in local storage. Normal authentication is required after a change.
        const currentPassword = String(data.get('currentPassword') ?? '');
        const newPassword = String(data.get('newPassword') ?? '');
        const confirmPassword = String(data.get('confirmPassword') ?? '');
        if (newPassword.length < 12 || newPassword.length > 128) throw new Error('Use a new password between 12 and 128 characters.');
        if (newPassword !== confirmPassword) throw new Error('The new passwords must match.');
        if (currentPassword === newPassword) throw new Error('Choose a different password.');
        await api<{ signedOut: true }>('/api/account/password', { method: 'POST', signal, body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) });
        form.reset();
        if (!signal.aborted) window.location.assign('/admin/login?passwordChanged=1');
      }
    } catch (issue) {
      if (signal.aborted) return;
      if (error) { error.textContent = customerError(issue); error.tabIndex = -1; error.focus({preventScroll:true}); }
      if (issue instanceof ApiError && issue.status === 409 && recovery) recovery.hidden = false;
      if (issue instanceof ApiError && issue.status === 401 && recovery) { recovery.hidden = false; recovery.textContent = 'Sign in again'; recovery.setAttribute('href', '/admin/login?returnTo=' + encodeURIComponent(location.pathname + location.search)); }
      if (kind === 'password') form.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(input => { input.value = ''; });
    } finally {
      if (!signal.aborted && submit) { submit.disabled = false; submit.removeAttribute('aria-busy'); }
    }
  }, { signal });
}