import type { AuthUser } from './api';

// Store only presentation state, scoped to the signed-in user and organization.
let preferenceKey: string | undefined;
const memory = new Map<string, boolean>();
export function readHeaderCollapsed(user: AuthUser): boolean {
  preferenceKey = 'ootla:header-collapsed:' + user.id + ':' + user.organization.id;
  try {
    const stored = sessionStorage.getItem(preferenceKey);
    if (stored !== null) return stored === 'true';
  } catch { /* The header still works when browser storage is unavailable. */ }
  return memory.get(preferenceKey) ?? false;
}
export function toggleHeaderSummary(button: HTMLButtonElement): void {
  const panel = document.getElementById(button.getAttribute('aria-controls') ?? '');
  const header = button.closest('.admin-header');
  if (!panel || !header) return;
  const collapsed = button.getAttribute('aria-expanded') === 'true';
  panel.hidden = collapsed;
  header.classList.toggle('is-collapsed', collapsed);
  button.setAttribute('aria-expanded', String(!collapsed));
  const label = collapsed ? 'Expand page summary' : 'Collapse page summary';
  button.setAttribute('aria-label', label);
  button.title = label;
  if (preferenceKey) {
    memory.set(preferenceKey, collapsed);
    try { sessionStorage.setItem(preferenceKey, String(collapsed)); } catch { /* Use memory for this page session. */ }
  }
}
export function clearHeaderPreference(): void {
  if (!preferenceKey) return;
  memory.delete(preferenceKey);
  try { sessionStorage.removeItem(preferenceKey); } catch { /* Browser storage may be disabled. */ }
  preferenceKey = undefined;
}
