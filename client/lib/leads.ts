import { api, ApiError } from './api';
import {productError} from './product-copy';
import { loadLeadWorkspace08 } from './lead-workspace';
import type { LeadWorkspace } from '../../shared/lead-workspace-contracts';
import { escapeHtml as e } from './ui';
import { leasingStages, salesStages } from '../../shared/lead-contracts';
import type { LeadDetail, LeadDirectory, LeadOptions, LeadRecord } from '../../shared/lead-contracts';
import type { Paginated, PropertySummary } from '../../shared/property-contracts';

export const leadsApi = '/api/leads';
export type LeadWorkspacePayload =
  | { kind: 'directory'; directory: LeadDirectory; options: LeadOptions; properties: Paginated<PropertySummary>; selectedPropertyName?: string }
  | { kind: 'new'; options: LeadOptions; properties: Paginated<PropertySummary>; property: { id: string; name: string } | null }
  | { kind: 'detail'; detail: LeadDetail; options: LeadOptions; properties: Paginated<PropertySummary>; workspace08: LeadWorkspace | null };
const only = (query: URLSearchParams, names: string[]): URLSearchParams => new URLSearchParams(names.filter(name => query.has(name) && query.get(name)).map(name => [name, query.get(name)!]));
async function propertyChoices(query: URLSearchParams, signal: AbortSignal): Promise<Paginated<PropertySummary>> {
  return api('/api/property-foundation/properties?' + new URLSearchParams({ q: query.get('propertySearch') ?? '', pageSize: '25' }), { signal });
}
async function optionsFor(propertyId: string | null, query: URLSearchParams, signal: AbortSignal): Promise<LeadOptions> {
  const search = new URLSearchParams({ pageSize: '25' });
  if (propertyId) search.set('propertyId', propertyId);
  if (query.get('optionSearch')) search.set('q', query.get('optionSearch')!);
  return api(leadsApi + '/options?' + search, { signal });
}
export async function loadLeadWorkspace(query: URLSearchParams, signal: AbortSignal): Promise<LeadWorkspacePayload> {
  const leadId = query.get('lead');
  if (leadId) {
    const eventQuery = new URLSearchParams({ page: query.get('eventsPage') ?? '1', pageSize: '25' });
    const detail = await api<LeadDetail>(leadsApi + '/' + encodeURIComponent(leadId) + '?' + eventQuery, { signal });
    const [options, properties, workspace08] = await Promise.all([optionsFor(detail.lead.propertyId, query, signal), propertyChoices(query, signal), loadLeadWorkspace08(leadId, query, signal)]);
    return { kind: 'detail', detail: workspace08?.leadDetail ?? detail, options, properties, workspace08 };
  }
  if (query.get('view') === 'new') {
    const propertyId = query.get('propertyId');
    const [options, properties, propertyDetail] = await Promise.all([
      optionsFor(propertyId, query, signal), propertyChoices(query, signal),
      propertyId ? api<{ property: PropertySummary }>('/api/property-foundation/properties/' + encodeURIComponent(propertyId), { signal }) : Promise.resolve(null),
    ]);
    return { kind: 'new', options, properties, property: propertyDetail?.property ?? null };
  }
  const search = only(query, ['q', 'intent', 'stage', 'propertyId', 'ownerMembershipId', 'source', 'nextAction', 'sort', 'page', 'pageSize']);
  search.set('view', query.get('view') === 'board' ? 'board' : 'list');
  const [directory, options, properties] = await Promise.all([
    api<LeadDirectory>(leadsApi + '?' + search, { signal }),
    optionsFor(query.get('propertyId'), new URLSearchParams(), signal), propertyChoices(new URLSearchParams(), signal),
  ]);
  const selectedProperty = query.get('propertyId');
  let selectedPropertyName = properties.items.find(property => property.id === selectedProperty)?.name || directory.items.find(lead => lead.propertyId === selectedProperty)?.propertyName || '';
  if (selectedProperty && !selectedPropertyName) {
    try {
      const selected = await api<{ property: PropertySummary }>('/api/property-foundation/properties/' + encodeURIComponent(selectedProperty), { signal });
      selectedPropertyName = selected.property.name;
    } catch (error) {
      if (!(error instanceof ApiError && [403, 404].includes(error.status))) throw error;
    }
  }
  return { kind: 'directory', directory, options, properties, selectedPropertyName };
}
const nullableNumber = (value: FormDataEntryValue | null): number | null => typeof value === 'string' && value.trim() ? Number(value) : null;
const text = (data: FormData, name: string): string => String(data.get(name) ?? '').trim();
function preferences(data: FormData): LeadRecord['preferences'] {
  return { bedrooms: nullableNumber(data.get('bedrooms')), budgetMin: nullableNumber(data.get('budgetMin')), budgetMax: nullableNumber(data.get('budgetMax')), moveInOn: text(data, 'moveInOn') || null, locations: text(data, 'locations').split(',').map(item => item.trim()).filter(Boolean), requirements: text(data, 'requirements') };
}
function opportunityBody(data: FormData): Record<string, unknown> {
  const nextAction = text(data, 'nextActionAt');
  return {
    unitId: text(data, 'unitId') || null, ownerMembershipId: text(data, 'ownerMembershipId') || null,
    source: text(data, 'source'), interestPropertyIds: data.getAll('interestPropertyIds').map(String),
    preferences: preferences(data), nextActionAt: nextAction ? new Date(nextAction).toISOString() : null,
    nextAction: text(data, 'nextAction'), notes: text(data, 'notes'),
  };
}
function initializeDirectoryFilters(workspace: HTMLElement, signal: AbortSignal): void {
  const filters = workspace.querySelector<HTMLDetailsElement>('[data-directory-filters]');
  if (!filters) return;
  const pending = new Map<string, { timer?: ReturnType<typeof setTimeout>; request?: AbortController; version: number }>();
  const initialSelections = [...filters.querySelectorAll<HTMLSelectElement>('select')].map(select => ({ select, value: select.value, name: select.selectedOptions[0]?.textContent ?? '' }));
  const initialStatuses = [...filters.querySelectorAll<HTMLElement>('[data-picker-status]')].map(node => ({ node, text: node.textContent }));
  const close = (focus: boolean): void => { filters.open = false; if (focus) filters.querySelector<HTMLElement>('summary')?.focus(); };
  workspace.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('[data-close-lead-filters]') : null;
    if (!target) return;
    for (const state of pending.values()) { if (state.timer) clearTimeout(state.timer); state.request?.abort(); }
    pending.clear(); filters.querySelector<HTMLFormElement>('form')?.reset();
    for (const initial of initialSelections) {
      if (![...initial.select.options].some(option => option.value === initial.value)) initial.select.add(new Option(initial.name, initial.value));
      initial.select.value = initial.value;
    }
    filters.querySelector<HTMLSelectElement>('#lead-intent')?.dispatchEvent(new Event('change', { bubbles: true }));
    const initialStage = initialSelections.find(initial => initial.select.id === 'lead-stage-filter');
    if (initialStage) initialStage.select.value = initialStage.value;
    for (const initial of initialStatuses) initial.node.textContent = initial.text;
    for (const group of filters.querySelectorAll('[data-directory-picker]')) group.removeAttribute('aria-busy');
    close(true);
  }, { signal });
  document.addEventListener('click', event => { if (filters.open && event.target instanceof Node && !filters.contains(event.target)) close(false); }, { signal });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && filters.open) { event.preventDefault(); close(true); } }, { signal });
  const searchPicker = (kind: 'property' | 'owner', immediate = false): void => {
    const group = filters.querySelector<HTMLElement>('[data-directory-picker="' + kind + '"]');
    const input = group?.querySelector<HTMLInputElement>('[data-directory-picker-search]');
    const select = group?.querySelector<HTMLSelectElement>('select');
    const status = group?.querySelector<HTMLElement>('[data-picker-status]');
    if (!group || !input || !select || !status) return;
    const previous = pending.get(kind); if (previous?.timer) clearTimeout(previous.timer); previous?.request?.abort();
    const state = { version: (previous?.version ?? 0) + 1, request: new AbortController(), timer: undefined as ReturnType<typeof setTimeout> | undefined }; pending.set(kind, state);
    const version = state.version;
    const run = async (): Promise<void> => {
      if (signal.aborted) return;
      group.setAttribute('aria-busy', 'true'); status.textContent = 'Searching…';
      const search = new URLSearchParams({ pageSize: '25', q: input.value.trim() });
      const propertyId = filters.querySelector<HTMLSelectElement>('#lead-property-filter')?.value;
      if (kind === 'owner' && propertyId) search.set('propertyId', propertyId);
      try {
        const result = kind === 'property'
          ? await api<Paginated<PropertySummary>>('/api/property-foundation/properties?' + search, { signal: state.request.signal })
          : await api<LeadOptions>(leadsApi + '/options?' + search, { signal: state.request.signal });
        if (signal.aborted || state.request.signal.aborted || pending.get(kind)?.version !== version || !group.isConnected) return;
        const currentId = select.value, currentName = select.selectedOptions[0]?.textContent || (kind === 'property' ? 'Selected property' : 'Selected owner');
        const choices: { id: string; name: string }[] = 'items' in result ? result.items.map(property => ({ id: property.id, name: property.name })) : result.owners.map(owner => ({ id: owner.membershipId, name: owner.name }));
        const total = 'items' in result ? result.total : result.ownerTotal;
        const fixed = [{ id: '', name: kind === 'property' ? 'All properties' : 'All owners' }, ...(kind === 'owner' ? [{ id: 'unassigned', name: 'Unassigned' }] : [])];
        if (currentId && !fixed.some(choice => choice.id === currentId) && !choices.some(choice => choice.id === currentId)) choices.unshift({ id: currentId, name: currentName });
        select.innerHTML = [...fixed, ...choices].map(choice => '<option value="' + e(choice.id) + '"' + (choice.id === currentId ? ' selected' : '') + '>' + e(choice.name) + '</option>').join('');
        const resultCount = 'items' in result ? result.items.length : result.owners.length;
        status.textContent = Number(resultCount).toLocaleString() + ' of ' + Number(total).toLocaleString() + (kind === 'property' ? ' properties' : ' owners') + (total > resultCount ? ' · Refine your search' : '');
      } catch (error) {
        if (!signal.aborted && !state.request.signal.aborted && pending.get(kind)?.version === version) status.textContent = productError(error);
      } finally {
        if (!signal.aborted && pending.get(kind) === state) group.removeAttribute('aria-busy');
      }
    };
    if (immediate) void run(); else state.timer = setTimeout(() => { void run(); }, 250);
  };
  filters.addEventListener('input', event => {
    const input = event.target; if (!(input instanceof HTMLInputElement)) return;
    if (input.dataset.directoryPickerSearch === 'property') searchPicker('property');
    if (input.dataset.directoryPickerSearch === 'owner') searchPicker('owner');
  }, { signal });
  workspace.addEventListener('change', event => {
    const control = event.target;
    if (!(control instanceof HTMLSelectElement)) return;
    if (control.id === 'lead-property-filter') searchPicker('owner', true);
    const form = control.closest<HTMLFormElement>('[data-lead-directory-form="results"]');
    if (form) form.requestSubmit();
  }, { signal });
  signal.addEventListener('abort', () => { for (const state of pending.values()) { if (state.timer) clearTimeout(state.timer); state.request?.abort(); } pending.clear(); }, { once: true });
}
export function initializeLeadWorkspace(signal: AbortSignal, navigate: (path: string, replace?: boolean, focusSelector?: string) => void): void {
  const workspace = document.querySelector<HTMLElement>('[data-lead-workspace]');
  if (!workspace) return;
  initializeDirectoryFilters(workspace, signal);
  let duplicateRequest = 0;
  workspace.addEventListener('change', event => {
    const control = event.target;
    if (!(control instanceof HTMLSelectElement) || control.id !== 'lead-intent') return;
    const stageSelect = workspace.querySelector<HTMLSelectElement>('#lead-stage-filter');
    if (!stageSelect) return;
    const previous = stageSelect.value;
    const choices = control.value === 'sales' ? [...salesStages] : control.value === 'leasing' ? [...leasingStages] : [...new Map([...leasingStages, ...salesStages].map(stage => [stage.key, stage])).values()];
    stageSelect.innerHTML = '<option value="">All stages</option>' + choices.map(stage => '<option value="' + e(stage.key) + '">' + e(stage.label) + '</option>').join('');
    stageSelect.value = choices.some(stage => stage.key === previous) ? previous : '';
  }, { signal });
  workspace.addEventListener('submit', async event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('[data-lead-filter],[data-lead-form],[data-lead-directory-form]')) return;
    event.preventDefault();
    const data = new FormData(form);
    if (form.hasAttribute('data-lead-directory-form')) {
      const search = new URLSearchParams(location.search);
      for (const name of ['page', 'saved', 'propertySearch', 'optionSearch', 'lead', 'leadTab', 'editor', 'eventsPage']) search.delete(name);
      const kind = form.dataset.leadDirectoryForm;
      const names = kind === 'search' ? ['q'] : kind === 'results' ? ['sort', 'pageSize'] : ['intent', 'stage', 'propertyId', 'ownerMembershipId', 'source', 'nextAction'];
      for (const name of names) { search.delete(name); const value = text(data, name); if (value) search.set(name, value); }
      navigate('/admin/leads' + (search.size ? '?' + search : ''), false, '[data-lead-results]');
      return;
    }
    if (form.hasAttribute('data-lead-filter')) {
      const search = new URLSearchParams(form.hasAttribute('data-lead-preserve-query') || data.has('lead') ? location.search : '');
      for (const [name, value] of data) if (typeof value === 'string') { search.delete(name); if (value.trim()) search.append(name, value.trim()); }
      navigate('/admin/leads' + (search.size ? '?' + search : ''), false, form.dataset.focus ?? '[data-lead-results]');
      return;
    }
    if (!form.hasAttribute('data-lead-form')) return;
    const errorNode = form.querySelector<HTMLElement>('[data-form-error]');
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit?.disabled) return;
    if (errorNode) errorNode.textContent = '';
    if (submit) { submit.disabled = true; submit.setAttribute('aria-busy', 'true'); }
    try {
      const action = form.dataset.leadForm;
      let body: Record<string, unknown>;
      if (action === 'stage') body = { version: Number(form.dataset.version), stage: text(data, 'stage'), reason: text(data, 'reason') };
      else {
        body = opportunityBody(data);
        if (action === 'create') {
          const contactId = text(data, 'contactId');
          body = { ...body, propertyId: text(data, 'propertyId'), intent: text(data, 'intent'), contactId: contactId || null, newContact: contactId ? null : { displayName: text(data, 'displayName'), email: text(data, 'email'), phone: text(data, 'phone') } };
        } else body.version = Number(form.dataset.version);
      }
      const result = await api<{ lead: LeadRecord }>(form.dataset.endpoint!, { method: form.dataset.method ?? 'POST', body: JSON.stringify(body), signal });
      if (signal.aborted) return;
      const returnQuery = new URLSearchParams(action === 'create' ? '' : location.search);
      returnQuery.set('saved', action === 'stage' ? 'stage' : 'lead');
      if (form.dataset.return !== 'board') returnQuery.set('lead', result.lead.id);
      const destination = '/admin/leads?' + returnQuery;
      navigate(destination, true, '[data-lead-results]');
    } catch (error) {
      if (signal.aborted) return;
      if (errorNode) { errorNode.textContent = productError(error); errorNode.tabIndex = -1; errorNode.focus(); }
    } finally {
      if (!signal.aborted && submit) { submit.disabled = false; submit.removeAttribute('aria-busy'); }
    }
  }, { signal });
  workspace.addEventListener('click', async event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-check-duplicates],[data-use-contact],[data-clear-contact],[data-associate-properties]') : null;
    if (!target) return;
    if (target.hasAttribute('data-associate-properties')) {
      const ownerForm = target.closest<HTMLFormElement>('form');
      if (!ownerForm) return;
      const data = new FormData(ownerForm);
      const id = ownerForm.dataset.contactId || text(data, 'contactId');
      const ids = [...new Set(data.getAll('interestPropertyIds').map(String))];
      const status = ownerForm.querySelector<HTMLElement>('[data-association-status]');
      if (!id || !ids.length) { if (status) status.textContent = 'Select an existing contact and at least one property first.'; return; }
      const button = target as HTMLButtonElement;
      button.disabled = true;
      let saved = 0;
      try {
        for (const propertyId of ids) {
          await api('/api/property-foundation/contacts/' + encodeURIComponent(id) + '/properties', { method: 'POST', body: JSON.stringify({ propertyId }), signal });
          saved += 1;
        }
        if (signal.aborted) return;
        if (status) status.textContent = 'Contact relationships saved for ' + saved + ' selected properties. Save the lead separately to update its interests.';
      } catch (error) {
        if (!signal.aborted && status) { status.textContent = (saved ? saved + ' relationships saved. ' : '') + productError(error); status.tabIndex = -1; status.focus(); }
      } finally { if (!signal.aborted) button.disabled = false; }
      return;
    }
    const form = workspace.querySelector<HTMLFormElement>('[data-lead-form="create"]');
    if (!form) return;
    const contactId = form.elements.namedItem('contactId') as HTMLInputElement;
    const fields = [...form.querySelectorAll<HTMLInputElement>('[data-new-contact] input')];
    const selected = form.querySelector<HTMLElement>('[data-selected-contact]')!;
    const suggestions = form.querySelector<HTMLElement>('[data-duplicate-results]')!;
    if (target.hasAttribute('data-clear-contact')) {
      duplicateRequest += 1; contactId.value = ''; fields.forEach(field => { field.disabled = false; });
      selected.hidden = true; selected.innerHTML = ''; suggestions.innerHTML = ''; fields[0]?.focus(); return;
    }
    if (target.hasAttribute('data-use-contact')) {
      contactId.value = target.dataset.useContact!; fields.forEach(field => { field.disabled = true; });
      selected.hidden = false;
      selected.innerHTML = '<strong>Existing contact selected: ' + e(target.dataset.contactName) + '</strong><p>This lead will use that contact identity and its history. No people are merged. For a new property interest, explicitly save its contact relationship with the action below before creating the lead.</p><button type="button" class="lw-button" data-clear-contact>Use a new contact instead</button><button type="button" class="lw-button" data-associate-properties>Associate contact with selected properties</button><p class="lw-hint" data-association-status role="status"></p>';
      suggestions.innerHTML = ''; selected.tabIndex = -1; selected.focus(); return;
    }
    const currentRequest = ++duplicateRequest;
    const search = new URLSearchParams();
    for (const [name, key] of [['displayName', 'name'], ['email', 'email'], ['phone', 'phone']]) {
      const control = form.elements.namedItem(name!) as HTMLInputElement | null;
      if (control?.value.trim()) search.set(key!, control.value.trim());
    }
    if (!search.size) { suggestions.innerHTML = '<p class="lw-notice" role="status">Enter a name, email or phone number to check accessible contacts.</p>'; return; }
    const button = target as HTMLButtonElement; button.disabled = true; suggestions.innerHTML = '<p class="lw-muted" role="status">Checking accessible contact identities...</p>';
    try {
      const result = await api<{ items: { contactId: string; name: string; email: string; phone: string; reasons: string[]; leadCount: number }[] }>(leadsApi + '/duplicate-suggestions?' + search, { signal });
      if (signal.aborted || currentRequest !== duplicateRequest) return;
      suggestions.innerHTML = '<p class="lw-hint" role="status">' + result.items.length + ' possible matches. Suggestions never merge identities. Review each person before explicitly using an existing contact.</p>' + result.items.map(item => '<article class="lw-suggestion"><h4>' + e(item.name) + '</h4><p>' + e([item.email, item.phone].filter(Boolean).join(' / ') || 'No email or phone supplied') + '</p><p>Match reasons: ' + e(item.reasons.join(', ')) + '. Existing leads: ' + Number(item.leadCount) + '.</p><button type="button" class="lw-button" data-use-contact="' + e(item.contactId) + '" data-contact-name="' + e(item.name) + '">Use this existing contact</button></article>').join('');
    } catch (error) {
      if (!signal.aborted && currentRequest === duplicateRequest) suggestions.innerHTML = '<p class="lw-error" role="alert">' + e(productError(error)) + '</p>';
    } finally { if (!signal.aborted) button.disabled = false; }
  }, { signal });
}