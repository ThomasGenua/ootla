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
  workspace.addEventListener('submit', async event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || (!form.hasAttribute('data-foundation-filter') && !form.hasAttribute('data-foundation-form'))) return;
    event.preventDefault();
    const data = new FormData(form);
    if (form.hasAttribute('data-foundation-filter')) {
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
    if (form.dataset.householdContact) body.members = [{ contactId: form.dataset.householdContact, relationship: 'member' }];
    if (submit) { submit.disabled = true; submit.setAttribute('aria-busy', 'true'); }
    try {
      const result = await api<{ property?: { id: string }; contact?: { id: string } }>(form.dataset.endpoint!, { method: form.dataset.method ?? 'POST', body: JSON.stringify(body), signal });
      if (signal.aborted) return;
      let destination = form.dataset.success ?? location.pathname + location.search;
      if (form.dataset.created === 'property' && result.property) destination = '/admin/properties?property=' + encodeURIComponent(result.property.id) + '&saved=property';
      else if (form.dataset.created === 'contact' && result.contact) destination = '/admin/contacts?contact=' + encodeURIComponent(result.contact.id) + '&saved=contact';
      navigate(destination, true, '[data-property-results]');
    } catch (error) {
      if (signal.aborted) return;
      if (errorNode) { errorNode.textContent = productError(error); errorNode.tabIndex = -1; errorNode.focus(); }
    } finally {
      if (!signal.aborted && submit) { submit.disabled = false; submit.removeAttribute('aria-busy'); }
    }
  }, { signal });
}