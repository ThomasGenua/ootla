import {containDialogFocus} from './dialog-focus';
import {presentRecordText} from './presentation';
import { api} from './api';
import {productError} from './product-copy';
import type { ContactDetail, ContactRecord, FoundationAccess, Paginated, PropertyDetail, PropertyGroup, PropertySummary } from '../../shared/property-contracts';

export const foundationApi = '/api/property-foundation';
export type PropertyWorkspacePayload =
  | { kind: 'properties'; directory: Paginated<PropertySummary> & { access: FoundationAccess }; groups: PropertyGroup[] }
  | { kind: 'property'; detail: PropertyDetail; groups: PropertyGroup[] }
  | { kind: 'contacts'; directory: Paginated<ContactRecord> & { access: FoundationAccess }; properties: Paginated<PropertySummary> }
  | { kind: 'contact'; detail: ContactDetail };
const only = (query: URLSearchParams, names: string[]): URLSearchParams => new URLSearchParams(names.filter(name => query.has(name)).map(name => [name, query.get(name)!]));
export async function loadPropertyWorkspace(path: string, query: URLSearchParams, signal: AbortSignal): Promise<PropertyWorkspacePayload> {
  if (path === '/admin/contacts') {
    const contactId = query.get('contact');
    if (contactId) {
      const detail = await api<ContactDetail>(`${foundationApi}/contacts/${encodeURIComponent(contactId)}`, { signal });
      if (query.has('historyPage') || query.has('historyPageSize')) detail.history = await api(`${foundationApi}/contacts/${encodeURIComponent(contactId)}/history?${new URLSearchParams({ page: query.get('historyPage') ?? '1', pageSize: query.get('historyPageSize') ?? '25' })}`, { signal });
      return { kind: 'contact', detail };
    }
    const [directory, properties] = await Promise.all([
      api<Paginated<ContactRecord> & { access: FoundationAccess }>(`${foundationApi}/contacts?${only(query, ['q', 'propertyId', 'page', 'pageSize'])}`, { signal }),
      api<Paginated<PropertySummary>>(`${foundationApi}/properties?${new URLSearchParams({ q: query.get('propertySearch') ?? '', pageSize: '25' })}`, { signal }),
    ]);
    return { kind: 'contacts', directory, properties };
  }
  const propertyId = query.get('property');
  if (propertyId) {
    const [detail, groups] = await Promise.all([
      api<PropertyDetail>(`${foundationApi}/properties/${encodeURIComponent(propertyId)}`, { signal }),
      api<{ items: PropertyGroup[] }>(`${foundationApi}/groups`, { signal }),
    ]);
    if (query.has('unitsPage') || query.has('unitsPageSize')) detail.units = await api(`${foundationApi}/properties/${encodeURIComponent(propertyId)}/units?${new URLSearchParams({ page: query.get('unitsPage') ?? '1', pageSize: query.get('unitsPageSize') ?? '25' })}`, { signal });
    if (query.has('leadsPage') || query.has('leadsPageSize')) detail.leads = await api(`${foundationApi}/properties/${encodeURIComponent(propertyId)}/leads?${new URLSearchParams({ page: query.get('leadsPage') ?? '1', pageSize: query.get('leadsPageSize') ?? '25' })}`, { signal });
    return { kind: 'property', detail, groups: groups.items };
  }
  const [directory, groups] = await Promise.all([
    api<Paginated<PropertySummary> & { access: FoundationAccess }>(`${foundationApi}/properties?${only(query, ['q', 'city', 'groupId', 'type', 'source', 'availability', 'sort', 'page', 'pageSize'])}`, { signal }),
    api<{ items: PropertyGroup[] }>(`${foundationApi}/groups`, { signal }),
  ]);
  return { kind: 'properties', directory, groups: groups.items };
}

export function initializePropertyWorkspace(signal: AbortSignal, navigate: (path: string, replace?: boolean, focusSelector?: string) => void): void {
  const workspace = document.querySelector<HTMLElement>('[data-property-workspace]');
  if (!workspace) return;
  const returnFocus = new WeakMap<HTMLDialogElement, HTMLElement>();
  const dialogs = [...workspace.querySelectorAll<HTMLDialogElement>('[data-foundation-dialog]')];
  for (const dialog of dialogs) {
    containDialogFocus(dialog, signal);
    dialog.addEventListener('close', () => {
      const opener = returnFocus.get(dialog);
      if (!signal.aborted && opener?.isConnected) opener.focus({preventScroll:true});
    }, {signal});
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    }, {signal});
  }
  const openFoundationDialog = (dialog: HTMLDialogElement, opener: HTMLElement): void => {
    if (dialog.open) return;
    for (const item of dialogs) if (item.open) item.close();
    returnFocus.set(dialog, opener); dialog.showModal();
    dialog.querySelector<HTMLElement>('h3')?.focus({preventScroll:true});
  };
  const filters = workspace.querySelector<HTMLDetailsElement>('[data-property-filters]');
  const placeFilters = (): void => {
    const panel = filters?.querySelector<HTMLElement>('.pw-filter-popover');
    if (!filters?.open || !panel) return;
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop ?? 0, viewportHeight = viewport?.height ?? innerHeight;
    const anchor = (panel.offsetParent ?? filters).getBoundingClientRect();
    const below = viewportTop + viewportHeight - anchor.bottom - 21, above = anchor.top - viewportTop - 21;
    const openAbove = below < Math.min(300, above);
    panel.style.top = openAbove ? 'auto' : 'calc(100% + 9px)';
    panel.style.bottom = openAbove ? 'calc(100% + 9px)' : 'auto';
    panel.style.maxHeight = Math.max(64, Math.min(viewportHeight * (matchMedia('(max-width:700px)').matches ? .65 : .7), openAbove ? above : below)) + 'px';
  };
  filters?.addEventListener('toggle', placeFilters, {signal});
  window.addEventListener('resize', placeFilters, {signal});
  window.addEventListener('scroll', placeFilters, {signal,passive:true,capture:true});
  window.visualViewport?.addEventListener('resize', placeFilters, {signal});
  const closeFilters = (restoreFocus: boolean, reset = false): void => {
    if (!filters) return;
    if (reset) filters.querySelector<HTMLFormElement>('form')?.reset();
    filters.open = false;
    if (restoreFocus) filters.querySelector<HTMLElement>('summary')?.focus({preventScroll:true});
  };
  workspace.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-foundation-dialog-open],[data-foundation-dialog-close],[data-property-filters-close],[data-contact-property-select]') : null;
    if (!target) return;
    if (target.hasAttribute('data-contact-property-select')) {
      const select = workspace.querySelector<HTMLSelectElement>('#contact-property');
      const dialog = dialogs.find(item => item.id === 'contact-create-dialog');
      const opener = workspace.querySelector<HTMLElement>('[data-foundation-dialog-open="contact-create-dialog"]');
      if (!select || !dialog || !opener || !target.dataset.contactPropertySelect) return;
      const id = target.dataset.contactPropertySelect, name = target.querySelector('strong')?.textContent ?? 'Selected property';
      if (![...select.options].some(option => option.value === id)) select.add(new Option(name,id));
      select.disabled = false; select.value = id;
      const save = dialog.querySelector<HTMLButtonElement>('button[type=submit]'); if (save) save.disabled = false;
      const hint = dialog.querySelector<HTMLElement>('[data-contact-property-required]'); if (hint) hint.hidden = true;
      openFoundationDialog(dialog,opener); return;
    }
    if (target.hasAttribute('data-property-filters-close')) { closeFilters(true, true); return; }
    if (target.hasAttribute('data-foundation-dialog-close')) { target.closest<HTMLDialogElement>('dialog')?.close(); return; }
    const dialog = dialogs.find(item => item.id === target.dataset.foundationDialogOpen);
    if (dialog) openFoundationDialog(dialog,target);
  }, {signal});
  workspace.addEventListener('keydown', event => {
    if (event.key === 'Escape' && filters?.open) { event.preventDefault(); closeFilters(true, true); }
  }, {signal});
  document.addEventListener('click', event => { if (filters?.open && event.target instanceof Node && !filters.contains(event.target)) closeFilters(false); }, {signal});
  signal.addEventListener('abort', () => { for (const dialog of dialogs) if (dialog.open) dialog.close(); }, {once:true});
  workspace.addEventListener('submit', async event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || (!form.hasAttribute('data-foundation-filter') && !form.hasAttribute('data-foundation-form') && !form.hasAttribute('data-contact-property-search'))) return;
    event.preventDefault();
    const data = new FormData(form);
    if (form.hasAttribute('data-contact-property-search')) {
      const submit = form.querySelector<HTMLButtonElement>('button[type=submit]');
      if (submit?.disabled) return;
      const error = form.querySelector<HTMLElement>('[data-form-error]');
      const status = form.querySelector<HTMLElement>('[data-contact-property-status]');
      if (error) error.textContent = '';
      if (submit) { submit.disabled = true; submit.setAttribute('aria-busy','true'); }
      try {
        const query = new URLSearchParams({q:String(data.get('propertySearch') ?? '').trim(),pageSize:'25'});
        const result = await api<Paginated<PropertySummary>>(foundationApi + '/properties?' + query,{signal});
        if (signal.aborted) return;
        const choices = workspace.querySelector<HTMLElement>('[data-contact-property-choices]');
        if (choices) choices.replaceChildren(...result.items.map(property => {
          const button = document.createElement('button'), name = document.createElement('strong'), address = document.createElement('span');
          button.type = 'button'; button.className = 'pw-property-choice'; button.dataset.contactPropertySelect = property.id;
          name.textContent = presentRecordText(property.name); address.textContent = [property.address,property.city].filter(Boolean).map(presentRecordText).join(', ');
          button.append(name,address); return button;
        }));
        if (status) status.textContent = result.items.length ? result.items.length + ' of ' + result.total + ' properties' : 'No properties found. Try another search.';
      } catch (issue) { if (!signal.aborted && error) { error.textContent = productError(issue); error.tabIndex = -1; error.focus({preventScroll:true}); } }
      finally { if (!signal.aborted && submit) { submit.disabled = false; submit.removeAttribute('aria-busy'); } }
      return;
    }
    if (form.hasAttribute('data-foundation-filter')) {
      if (form.dataset.foundationDirectoryForm === 'contacts') {
        const search = new URLSearchParams(location.search); for (const key of ['page','saved','propertySearch']) search.delete(key);
        const q = String(data.get('q') ?? '').trim(); if (q) search.set('q',q); else search.delete('q');
        navigate('/admin/contacts' + (search.size ? '?' + search : ''),false,'[data-property-results]'); return;
      }
      if (form.dataset.foundationDirectoryForm) {
        const search = new URLSearchParams(location.search);
        search.delete('saved'); search.delete('page');
        if (form.dataset.foundationDirectoryForm === 'filters') {
          for (const key of ['city','groupId','type','source','availability','sort','pageSize']) {
            const value = String(data.get(key) ?? '').trim(); if (value) search.set(key,value); else search.delete(key);
          }
        }
        const q = workspace.querySelector<HTMLInputElement>('#property-search')?.value.trim() ?? '';
        if (q) search.set('q',q); else search.delete('q');
        closeFilters(false);
        navigate('/admin/properties' + (search.size ? '?' + search : ''),false,'[data-property-results]');
        return;
      }
      const search = new URLSearchParams();
      for (const [name, value] of data) if (typeof value === 'string' && value.trim()) search.append(name, value.trim());
      navigate(`${form.dataset.path ?? location.pathname}${search.size ? '?' + search : ''}`, false, '[data-property-results]');
      return;
    }
    if (!form.hasAttribute('data-foundation-form')) return;
    const errorNode = form.querySelector<HTMLElement>('[data-form-error]');
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit?.disabled) return;
    if (errorNode) errorNode.textContent = '';
    const body: Record<string, unknown> = {};
    for (const [name, value] of data) {
      if (typeof value !== 'string' || name === 'verifyAvailability') continue;
      if (name === 'propertyIds') body[name] = data.getAll(name).filter(item => typeof item === 'string' && item);
      else if (name === 'bedrooms' || name === 'monthlyRent') body[name] = Number(value);
      else if (name === 'groupId') body[name] = value || null;
      else body[name] = value.trim();
    }
    if (data.get('verifyAvailability') === 'yes') body.lastVerifiedAt = new Date().toISOString();
    if (submit) { submit.disabled = true; submit.setAttribute('aria-busy', 'true'); }
    try {
      const result = await api<{ property?: { id: string }; contact?: { id: string } }>(form.dataset.endpoint!, { method: form.dataset.method ?? 'POST', body: JSON.stringify(body), signal });
      if (signal.aborted) return;
      let destination = form.dataset.success ?? location.pathname + location.search;
      if (form.dataset.created === 'property' && result.property) destination = '/admin/properties?property=' + encodeURIComponent(result.property.id) + '&saved=property';
      else if (form.dataset.created === 'contact' && result.contact) destination = '/admin/contacts?contact=' + encodeURIComponent(result.contact.id) + '&saved=contact';
      const dialog = form.closest<HTMLDialogElement>('[data-foundation-dialog]');
      if (dialog && !form.dataset.created) {
        const target = new URL(destination,location.origin);
        if (target.pathname === location.pathname) { const query = new URLSearchParams(location.search); query.set('saved',target.searchParams.get('saved') ?? 'property'); destination = target.pathname + '?' + query; }
      }
      dialog?.close();
      navigate(destination, true, '[data-property-results]');
    } catch (error) {
      if (signal.aborted) return;
      if (errorNode) { errorNode.textContent = productError(error); errorNode.tabIndex = -1; errorNode.focus({preventScroll:true}); }
    } finally {
      if (!signal.aborted && submit) { submit.disabled = false; submit.removeAttribute('aria-busy'); }
    }
  }, { signal });
}