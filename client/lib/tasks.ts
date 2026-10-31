import {initializeTaskFollowups}from'./task-followups';
import { api, ApiError } from './api';
import { presentRecordText } from './presentation';
import type { TaskSuggestions, TaskSuggestionResult } from '../../shared/task-suggestion-contracts';
import {productError} from './product-copy';
import { escapeHtml as e } from './ui';
import type { Paginated, PropertySummary, ContactRecord } from '../../shared/property-contracts';
import type { LeadDirectory, LeadDetail } from '../../shared/lead-contracts';
import type { TaskDirectory, TaskDetail, TaskOptions, TaskRecord, TaskReminder } from '../../shared/task-contracts';

export const tasksApi = '/api/tasks';
export interface TaskRelatedChoices { tours: { id: string; leadId: string; startsAt: string; status: string }[]; applications: { id: string; leadId: string | null; contactId: string; status: string }[]; }
interface TaskBase { options: TaskOptions; properties: Paginated<PropertySummary>; }
export type TasksWorkspacePayload =
  | (TaskBase & { kind: 'directory'; directory: TaskDirectory; selectedPropertyName?: string })
  | (TaskBase & { kind: 'new'; property: PropertySummary | null; leads: LeadDirectory | null; contacts: Paginated<ContactRecord> | null; related: TaskRelatedChoices; selectedLeadId: string | null })
  | (TaskBase & { kind: 'detail'; detail: TaskDetail })
  | (TaskBase & { kind: 'routing' })
  | (TaskBase & { kind: 'reminders'; reminders: Paginated<TaskReminder> });
const only = (query: URLSearchParams, names: string[]): URLSearchParams => new URLSearchParams(names.filter(name => query.get(name)).map(name => [name, query.get(name)!]));
const propertiesFor = (query: URLSearchParams, signal: AbortSignal): Promise<Paginated<PropertySummary>> => api('/api/property-foundation/properties?' + new URLSearchParams({ q: query.get('propertySearch') ?? '', pageSize: '25' }), { signal });
const optionsFor = (propertyId: string | null, query: URLSearchParams, signal: AbortSignal, leadId?: string | null): Promise<TaskOptions> => api(tasksApi + '/options?' + new URLSearchParams({ ...(propertyId ? { propertyId } : {}), ...(leadId ? { leadId } : {}), ...(query.get('ownerSearch') ? { q: query.get('ownerSearch')! } : {}) }), { signal });
export async function loadTasksWorkspace(query: URLSearchParams, signal: AbortSignal): Promise<TasksWorkspacePayload> {
  const taskId = query.get('task');
  if (taskId) {
    const detail = await api<TaskDetail>(tasksApi + '/' + encodeURIComponent(taskId) + '?' + new URLSearchParams({ page: query.get('historyPage') ?? '1', pageSize: query.get('historyPageSize') ?? '25' }), { signal });
    const [options, properties] = await Promise.all([optionsFor(detail.task.propertyId, query, signal, detail.task.leadId), propertiesFor(query, signal)]);
    return { kind: 'detail', detail, options, properties };
  }
  if (query.get('view') === 'new') {
    let propertyId = query.get('propertyId');
    const selectedLeadId = query.get('leadId');
    const selectedLead = selectedLeadId ? await api<LeadDetail>('/api/leads/' + encodeURIComponent(selectedLeadId), { signal }) : null;
    if (selectedLead) {
      if (propertyId && propertyId !== selectedLead.lead.propertyId) throw new Error('The selected lead belongs to a different property. Open the task from its correct property context.');
      propertyId = selectedLead.lead.propertyId;
    }
    const [options, properties, propertyDetail, leads, contacts, related] = await Promise.all([
      optionsFor(propertyId, query, signal, selectedLeadId), propertiesFor(query, signal),
      propertyId ? api<{ property: PropertySummary }>('/api/property-foundation/properties/' + encodeURIComponent(propertyId), { signal }) : Promise.resolve(null),
      propertyId ? api<LeadDirectory>('/api/leads?' + new URLSearchParams({ propertyId, q: query.get('recordSearch') ?? '', pageSize: '25' }), { signal }) : Promise.resolve(null),
      propertyId ? api<Paginated<ContactRecord>>('/api/property-foundation/contacts?' + new URLSearchParams({ propertyId, q: query.get('recordSearch') ?? '', pageSize: '25' }), { signal }) : Promise.resolve(null),
      propertyId ? api<TaskRelatedChoices>(tasksApi + '/related-options?' + new URLSearchParams({ propertyId, ...(selectedLeadId ? { leadId: selectedLeadId } : {}), ...(query.get('recordSearch') ? { q: query.get('recordSearch')! } : {}) }), { signal }) : Promise.resolve({ tours: [], applications: [] }),
    ]);
    if (selectedLead && leads && !leads.items.some(lead => lead.id === selectedLead.lead.id)) leads.items.unshift(selectedLead.lead);
    return { kind: 'new', options, properties, property: propertyDetail?.property ?? null, leads, contacts, related, selectedLeadId };
  }
  const view = query.get('view');
  if (view === 'routing' || view === 'reminders') {
    const [options, properties] = await Promise.all([optionsFor(null, query, signal), propertiesFor(query, signal)]);
    if (view === 'routing') {
      const selectedPropertyId = query.get('propertyId') ?? properties.items[0]?.id;
      if (selectedPropertyId) {
        const scopedOptions = await optionsFor(selectedPropertyId, query, signal);
        const selectedRules = scopedOptions.rules.filter(rule => rule.propertyId === selectedPropertyId);
        // Global choices stay bounded, but the selected property must retain its own saved rule.
        const rules = [...selectedRules, ...options.rules.filter(rule => rule.propertyId !== selectedPropertyId)];
        options.rules = [...new Map(rules.map(rule => [rule.propertyId, rule])).values()].slice(0, 100);
      }
      return { kind: 'routing', options, properties };
    }
    const reminders = await api<Paginated<TaskReminder>>(tasksApi + '/reminders?' + only(query, ['page', 'pageSize']), { signal });
    return { kind: 'reminders', reminders, options, properties };
  }
  const search = only(query, ['q', 'propertyId', 'ownerMembershipId', 'teamId', 'status', 'priority', 'overdue', 'sort', 'page', 'pageSize']);
  search.set('view', view === 'team' || view === 'unassigned' ? view : 'my');
  const [directory, options, properties] = await Promise.all([api<TaskDirectory>(tasksApi + '?' + search, { signal }), optionsFor(query.get('propertyId'), new URLSearchParams(), signal), propertiesFor(new URLSearchParams(), signal)]);
  const selectedPropertyId = query.get('propertyId');
  let selectedPropertyName = properties.items.find(property => property.id === selectedPropertyId)?.name || directory.items.find(task => task.propertyId === selectedPropertyId)?.propertyName || '';
  if (selectedPropertyId && !selectedPropertyName) {
    try { selectedPropertyName = (await api<{ property: PropertySummary }>('/api/property-foundation/properties/' + encodeURIComponent(selectedPropertyId), { signal })).property.name; }
    catch (error) { if (!(error instanceof ApiError && [403, 404].includes(error.status))) throw error; }
  }
  return { kind: 'directory', directory, options, properties, selectedPropertyName };
}
const value = (data: FormData, key: string): string => String(data.get(key) ?? '').trim();
function initializeTaskDirectoryFilters(workspace: HTMLElement, signal: AbortSignal): void {
  const filters = workspace.querySelector<HTMLDetailsElement>('[data-task-directory-filters]');
  if (!filters) return;
  const pending = new Map<string, { timer?: ReturnType<typeof setTimeout>; request?: AbortController; version: number }>();
  const initialSelections = [...filters.querySelectorAll<HTMLSelectElement>('select')].map(select => ({ select, value: select.value, name: select.selectedOptions[0]?.textContent ?? '' }));
  const initialStatuses = [...filters.querySelectorAll<HTMLElement>('[data-task-picker-status]')].map(node => ({ node, text: node.textContent }));
  const close = (focus: boolean): void => { filters.open = false; if (focus) filters.querySelector<HTMLElement>('summary')?.focus(); };
  workspace.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('[data-close-task-filters]') : null;
    if (!target) return;
    for (const state of pending.values()) { if (state.timer) clearTimeout(state.timer); state.request?.abort(); }
    pending.clear(); filters.querySelector<HTMLFormElement>('form')?.reset();
    for (const initial of initialSelections) {
      if (![...initial.select.options].some(option => option.value === initial.value)) initial.select.add(new Option(initial.name, initial.value));
      initial.select.value = initial.value;
    }
    for (const initial of initialStatuses) initial.node.textContent = initial.text;
    for (const group of filters.querySelectorAll('[data-task-picker]')) group.removeAttribute('aria-busy');
    close(true);
  }, { signal });
  document.addEventListener('click', event => { if (filters.open && event.target instanceof Node && !filters.contains(event.target)) close(false); }, { signal });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && filters.open) { event.preventDefault(); close(true); } }, { signal });
  const searchPicker = (kind: 'property' | 'owner', immediate = false): void => {
    const group = filters.querySelector<HTMLElement>('[data-task-picker="' + kind + '"]');
    const input = group?.querySelector<HTMLInputElement>('[data-task-picker-search]');
    const select = group?.querySelector<HTMLSelectElement>('select');
    const status = group?.querySelector<HTMLElement>('[data-task-picker-status]');
    if (!group || !input || !select || !status) return;
    const previous = pending.get(kind); if (previous?.timer) clearTimeout(previous.timer); previous?.request?.abort();
    const state = { version: (previous?.version ?? 0) + 1, request: new AbortController(), timer: undefined as ReturnType<typeof setTimeout> | undefined }; pending.set(kind, state);
    const version = state.version;
    const run = async (): Promise<void> => {
      if (signal.aborted) return;
      group.setAttribute('aria-busy', 'true'); status.textContent = 'Searching…';
      const search = new URLSearchParams({ ...(kind === 'property' ? { pageSize: '25' } : {}), q: input.value.trim() });
      const propertyId = filters.querySelector<HTMLSelectElement>('#task-property-filter')?.value;
      if (kind === 'owner' && propertyId) search.set('propertyId', propertyId);
      try {
        const result = kind === 'property'
          ? await api<Paginated<PropertySummary>>('/api/property-foundation/properties?' + search, { signal: state.request.signal })
          : await api<TaskOptions>(tasksApi + '/options?' + search, { signal: state.request.signal });
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
    if (input.dataset.taskPickerSearch === 'property') searchPicker('property');
    if (input.dataset.taskPickerSearch === 'owner') searchPicker('owner');
  }, { signal });
  workspace.addEventListener('change', event => {
    const control = event.target;
    if (!(control instanceof HTMLSelectElement)) return;
    if (control.id === 'task-property-filter') searchPicker('owner', true);
    const form = control.closest<HTMLFormElement>('[data-task-directory-form="sort"]');
    if (form) form.requestSubmit();
  }, { signal });
  signal.addEventListener('abort', () => { for (const state of pending.values()) { if (state.timer) clearTimeout(state.timer); state.request?.abort(); } pending.clear(); }, { once: true });
}
interface TaskConfirmation { title: string; message: string; button: string; comment?: boolean; commentRequired?: boolean }
function confirmTaskAction(host: HTMLElement, config: TaskConfirmation, signal: AbortSignal): Promise<{ comment: string } | null> {
  if (signal.aborted) return Promise.resolve(null);
  return new Promise(resolve => {
    const previousFocus = document.activeElement, dialog = document.createElement('dialog');
    dialog.className = 'tw-confirm-dialog'; dialog.dataset.taskConfirmation = ''; dialog.setAttribute('aria-labelledby', 'task-confirmation-title'); dialog.setAttribute('aria-describedby', 'task-confirmation-copy');
    dialog.innerHTML = '<form method="dialog"><h3 id="task-confirmation-title">' + e(config.title) + '</h3><p id="task-confirmation-copy">' + e(config.message) + '</p>' + (config.comment ? '<div class="tw-field"><label for="task-completion-comment">Completion comment' + (config.commentRequired ? '' : ' (optional)') + '</label><textarea id="task-completion-comment" name="comment" maxlength="2000" rows="4" ' + (config.commentRequired ? 'required' : '') + ' placeholder="Record the outcome for your team"></textarea></div>' : '') + '<div class="tw-actions"><button type="button" class="tw-button" data-cancel-task-action>Keep unchanged</button><button type="submit" class="tw-button tw-primary" data-confirm-task-action>' + e(config.button) + '</button></div></form>';
    let finished = false;
    const finish = (value: { comment: string } | null): void => {
      if (finished) return; finished = true; signal.removeEventListener('abort', abort); if (dialog.open) dialog.close(); dialog.remove();
      if (!signal.aborted && previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus(); resolve(value);
    };
    const abort = (): void => finish(null);
    dialog.addEventListener('close', () => finish(null), { once: true });
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
    dialog.querySelector('[data-cancel-task-action]')?.addEventListener('click', () => finish(null));
    const commentField = dialog.querySelector<HTMLTextAreaElement>('[name=comment]');
    commentField?.addEventListener('input', () => commentField.setCustomValidity(''));
    dialog.querySelector('form')?.addEventListener('submit', event => {
      event.preventDefault(); const comment = commentField?.value.trim() ?? '';
      if (config.commentRequired && !comment) { commentField?.setCustomValidity('Record a completion comment before confirming.'); commentField?.reportValidity(); return; }
      finish({ comment });
    });
    signal.addEventListener('abort', abort, { once: true }); host.append(dialog); dialog.showModal(); dialog.querySelector<HTMLButtonElement>('[data-cancel-task-action]')?.focus();
  });
}
function safeTaskActionUrl(value: string | undefined): string | null {
  if (!value) return null;
  try { const url = new URL(value, location.origin); return url.origin === location.origin && !url.username && !url.password && ['/admin/calendar', '/admin/conversations', '/admin/leads', '/admin/tasks', '/admin/properties', '/admin/applications', '/admin/contacts', '/admin/maintenance'].includes(url.pathname) ? url.pathname + url.search + url.hash : null; } catch { return null; }
}
function initializeTaskSuggestions(host: HTMLElement, signal: AbortSignal, navigate: (path: string, replace?: boolean, focusSelector?: string) => void): void {
  const panel = host.querySelector<HTMLElement>('[data-task-suggestions]'); if (!panel) return;
  const button = panel.querySelector<HTMLButtonElement>('[data-load-task-suggestions]'), results = panel.querySelector<HTMLElement>('[data-task-suggestion-results]'), error = panel.querySelector<HTMLElement>('[data-task-suggestion-error]');
  if (!button || !results || !error) return;
  let current: TaskSuggestions | null = null, pending = false;
  panel.addEventListener('click', async event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-load-task-suggestions],[data-task-suggestion-action]') : null;
    if (!target || pending || target.disabled) return;
    let restoreFocus = false;
    pending = true; target.disabled = true; error.textContent = ''; target.setAttribute('aria-busy', 'true');
    try {
      if (target.hasAttribute('data-load-task-suggestions')) {
        current = await api<TaskSuggestions>(tasksApi + '/' + encodeURIComponent(panel.dataset.taskId!) + '/suggestions', { signal });
        if (signal.aborted) return;
        results.innerHTML = '<p class="tw-suggestion-summary">' + e(presentRecordText(current.summary)) + '</p>' + (current.context.length ? '<details class="tw-editor"><summary>Records considered</summary><ul class="tw-suggestion-context">' + current.context.map(line => '<li>' + e(presentRecordText(line)) + '</li>').join('') + '</ul></details>' : '') + '<div class="tw-suggestion-actions">' + current.actions.map(action => '<article><h4>' + e(presentRecordText(action.label)) + '</h4><p>' + e(presentRecordText(action.description)) + '</p><button type="button" class="tw-button" data-task-suggestion-action="' + e(action.id) + '"' + (!current!.canManage && action.kind !== 'open' ? ' disabled' : '') + '>' + e(presentRecordText(action.label)) + '</button></article>').join('') + '</div>';
        button.textContent = 'Refresh suggestions'; return;
      }
      const action = current?.actions.find(action => action.id === target.dataset.taskSuggestionAction); if (!action) return;
      if (action.kind === 'open') { const path = safeTaskActionUrl(action.url); if (path) navigate(path); return; }
      if (!current?.canManage) return;
      const messages: Record<string, string> = { assign: 'Update this task’s assignment using the suggested eligible owner?', complete: 'Mark this task complete and cancel its active reminders?', email_draft: 'Prepare an email draft for staff review? Nothing will be sent.', viewing: 'Open native viewing scheduling for this task? You will choose a time and confirm any booking there.' };
      const confirmation = await confirmTaskAction(host, { title: presentRecordText(action.label), message: messages[action.kind] ?? action.description, button: presentRecordText(action.label), comment: action.kind === 'complete', commentRequired: action.kind === 'complete' }, signal); if (!confirmation || signal.aborted) { restoreFocus = !signal.aborted; return; }
      const result = await api<TaskSuggestionResult>(tasksApi + '/' + encodeURIComponent(panel.dataset.taskId!) + '/suggestions/confirm', { method: 'POST', body: JSON.stringify({ action: action.kind, version: current.version, confirm: true, ...(action.ownerMembershipId ? { ownerMembershipId: action.ownerMembershipId } : {}), ...(confirmation.comment ? { comment: confirmation.comment } : {}) }), signal });
      if (signal.aborted) return;
      if (result.draft) {
        // The draft is the only task change. Advance only forms still based on this exact version.
        if(result.version===current.version+1){const previousVersion=current.version;host.querySelectorAll<HTMLElement>('[data-version]').forEach(form=>{if(Number(form.dataset.version)===previousVersion)form.dataset.version=String(result.version);});current.version=result.version;}
        const draftUrl = safeTaskActionUrl(result.draft.url);
        results.innerHTML = '<div class="tw-email-draft"><h4>Email draft</h4><p class="tw-hint">Saved for staff review. Nothing has been sent.</p><div class="tw-field"><label for="task-email-subject">Subject</label><input id="task-email-subject" readonly value="' + e(result.draft.subject) + '" /></div><div class="tw-field"><label for="task-email-body">Message</label><textarea id="task-email-body" rows="7" readonly>' + e(result.draft.body) + '</textarea></div>' + (draftUrl ? '<a href="' + e(draftUrl) + '" data-link class="tw-button">Open saved draft</a>' : '') + '</div>'; return;
      }
      const destination = safeTaskActionUrl(result.url); if (destination) { navigate(destination); return; }
      if (result.task) { const query = new URLSearchParams(location.search); query.set('saved', 'suggestion'); navigate('/admin/tasks?' + query, true, '[data-task-results]'); return; }
      results.innerHTML = '<p class="tw-notice" role="status">' + e(result.message) + '</p>';
    } catch (issue) { if (!signal.aborted) { error.textContent = productError(issue); error.tabIndex = -1; error.focus({preventScroll:true}); } }
    finally { pending = false; if (!signal.aborted) { target.disabled = false; target.removeAttribute('aria-busy'); if (restoreFocus && target.isConnected) target.focus(); } }
  }, { signal });
}
export function initializeTasksWorkspace(signal: AbortSignal, navigate: (path: string, replace?: boolean, focusSelector?: string) => void): void {
  const workspace = document.querySelector<HTMLElement>('[data-task-workspace]');
  if (!workspace) return;
  initializeTaskDirectoryFilters(workspace, signal);
  initializeTaskFollowups(workspace, signal, navigate);
  function updateRelated(): void {
    const kind = workspace!.querySelector<HTMLSelectElement>('#task-related-kind')?.value;
    for (const section of workspace!.querySelectorAll<HTMLElement>('[data-task-related]')) {
      const active = section.dataset.taskRelated === kind;
      section.hidden = !active;
      for (const select of section.querySelectorAll<HTMLSelectElement>('select')) { select.disabled = !active; select.required = active; }
    }
  }
  function updateAssignment(): void {
    for (const form of workspace!.querySelectorAll<HTMLFormElement>('[data-task-form="create"],[data-task-form="edit"]')) {
      const route = form.querySelector<HTMLSelectElement>('[name="assignment"]')?.value === 'routing';
      const owner = form.querySelector<HTMLSelectElement>('[name="ownerMembershipId"]');
      if (owner) owner.disabled = route;
      const notice = form.querySelector<HTMLElement>('[data-routing-hint]');
      if (notice) notice.hidden = !route;
      const reroute = form.querySelector<HTMLElement>('[data-reroute-control]');
      if (reroute) { reroute.hidden = !route; const checkbox = reroute.querySelector<HTMLInputElement>('input'); if (checkbox) checkbox.disabled = !route; }
    }
  }
  let ownerRequest = 0;
  async function updateEligibleOwners(): Promise<void> {
    const form = workspace!.querySelector<HTMLFormElement>('[data-task-form="create"]');
    const owner = form?.querySelector<HTMLSelectElement>('[name="ownerMembershipId"]');
    if (!form || !owner) return;
    const kind = form.querySelector<HTMLSelectElement>('#task-related-kind')?.value;
    const selected = kind === 'lead' ? form.querySelector<HTMLSelectElement>('[name="leadId"]') : kind === 'application' ? form.querySelector<HTMLSelectElement>('[name="applicationId"]') : kind === 'tour' ? form.querySelector<HTMLSelectElement>('[name="tourId"]') : null;
    const leadId = kind === 'lead' ? selected?.value : selected?.selectedOptions[0]?.dataset.leadId;
    const propertyId = form.querySelector<HTMLInputElement>('[name="propertyId"]')?.value;
    if (!propertyId) return;
    const request = ++ownerRequest;
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const status = form.querySelector<HTMLElement>('[data-task-owner-status]');
    const error = form.querySelector<HTMLElement>('[data-task-error]');
    const previousOwner = owner.value;
    owner.disabled = true;
    if (submit) submit.disabled = true;
    if (status) status.textContent = 'Checking eligible owners for this record...';
    try {
      const params = new URLSearchParams({ propertyId, ...(leadId ? { leadId } : {}), ...(new URLSearchParams(location.search).get('ownerSearch') ? { q: new URLSearchParams(location.search).get('ownerSearch')! } : {}) });
      const options = await api<TaskOptions>(tasksApi + '/options?' + params, { signal });
      if (signal.aborted || request !== ownerRequest) return;
      const stillEligible = options.owners.some(item => item.membershipId === previousOwner);
      owner.innerHTML = '<option value="">Unassigned</option>' + options.owners.map(item => '<option value="' + e(item.membershipId) + '">' + e(item.name + ' / ' + item.role.replaceAll('_', ' ')) + '</option>').join('');
      owner.value = stillEligible ? previousOwner : '';
      const count = form.querySelector<HTMLElement>('[data-task-owner-count]');
      if (count) count.textContent = options.owners.length + ' of ' + options.ownerTotal + ' matching eligible owners shown. The server validates assignment again when saved.';
      if (status) status.textContent = previousOwner && !stillEligible ? 'The previous owner is not eligible for this record. The task is now Unassigned; choose an eligible owner if needed.' : 'Eligible owners checked for the selected property and record.';
    } catch (issue) {
      if (!signal.aborted && request === ownerRequest) {
        owner.innerHTML = '<option value="">Unassigned</option>';
        if (status) status.textContent = 'Owner choices could not be checked. Work is Unassigned until an eligible owner is chosen.';
        if (error) error.textContent = productError(issue);
      }
    } finally {
      if (!signal.aborted && request === ownerRequest) { updateAssignment(); if (submit) submit.disabled = form.dataset.taskPending === 'true'; }
    }
  }
  updateRelated(); updateAssignment();
  workspace.addEventListener('change', event => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    target.closest<HTMLFormElement>('[data-task-page-size]')?.requestSubmit();
    if (target.id === 'task-related-kind') updateRelated();
    if (target.id === 'task-related-kind' || ['leadId', 'applicationId', 'tourId'].includes(target.name)) void updateEligibleOwners();
    if (target.name === 'assignment') updateAssignment();
  }, { signal });
  workspace.addEventListener('submit', async event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('[data-task-filter],[data-task-form],[data-task-directory-form],[data-task-page-size]')) return;
    event.preventDefault();
    const data = new FormData(form);
    if (form.hasAttribute('data-task-directory-form') || form.hasAttribute('data-task-page-size')) {
      const query = new URLSearchParams(location.search);
      if (form.hasAttribute('data-task-page-size')) {
        const history = form.dataset.taskPageSize === 'history', key = history ? 'historyPageSize' : 'pageSize'; query.delete(history ? 'historyPage' : 'page'); query.delete('saved'); query.set(key, value(data, key));
      } else {
        const kind = form.dataset.taskDirectoryForm, keys = kind === 'search' ? ['q'] : kind === 'sort' ? ['sort'] : ['propertyId', 'ownerMembershipId', 'teamId', 'status', 'priority', 'overdue'];
        for (const key of ['page', 'saved', 'propertySearch', 'ownerSearch']) query.delete(key);
        for (const key of keys) { query.delete(key); const selected = value(data, key); if (selected) query.set(key, selected); }
      }
      navigate('/admin/tasks?' + query, false, '[data-task-results]'); return;
    }
    if (form.hasAttribute('data-task-filter')) {
      const search = new URLSearchParams();
      for (const [name, item] of data) if (typeof item === 'string' && item.trim()) search.append(name, item.trim());
      navigate('/admin/tasks' + (search.size ? '?' + search : ''), false, '[data-task-results]');
      return;
    }
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const errorNode = form.querySelector<HTMLElement>('[data-task-error]');
    if (submit?.disabled) return;
    if (errorNode) errorNode.textContent = '';
    let restoreFocus = false;
    form.dataset.taskPending = 'true';
    if (submit) { submit.disabled = true; submit.setAttribute('aria-busy', 'true'); }
    try {
      const action = form.dataset.taskForm;
      let path = tasksApi, method = 'POST', body: Record<string, unknown>;
      let result: { task?: TaskRecord } | undefined;
      if (action === 'create' || action === 'edit') {
        const assignment = value(data, 'assignment');
        const owner = assignment === 'routing' ? '' : value(data, 'ownerMembershipId');
        const unchangedDue = action === 'edit' && value(data, 'dueAt') === form.dataset.dueInput;
        body = { title: value(data, 'title'), details: value(data, 'details'), dueAt: unchangedDue ? form.dataset.dueAt : new Date(value(data, 'dueAt')).toISOString(), priority: value(data, 'priority') };
        if (action === 'create' || assignment !== form.dataset.assignment || (assignment === 'manual' && owner !== form.dataset.ownerId) || data.get('reroute') === 'on') {
          body.assignment = assignment;
          body.ownerMembershipId = owner || null;
        }
        if (action === 'create') {
          const kind = value(data, 'relatedKind');
          body = { ...body, propertyId: value(data, 'propertyId'), leadId: kind === 'lead' ? value(data, 'leadId') : null, contactId: kind === 'contact' ? value(data, 'contactId') : null, applicationId: kind === 'application' ? value(data, 'applicationId') : null, tourId: kind === 'tour' ? value(data, 'tourId') : null };
        } else { method = 'PATCH'; path += '/' + encodeURIComponent(form.dataset.taskId!); body.version = Number(form.dataset.version); }
      } else if (action === 'status') {
        path += '/' + encodeURIComponent(form.dataset.taskId!); method = 'PATCH';
        body = { version: Number(form.dataset.version), status: form.dataset.status };
      } else if (action === 'reminder-complete') {
        path += '/' + encodeURIComponent(form.dataset.taskId!); method = 'PATCH';
        const current = await api<TaskDetail>(path, { signal });
        body = { version: current.task.version, status: 'completed' };
      } else if (action === 'snooze') {
        path += '/reminders/' + encodeURIComponent(form.dataset.reminderId!) + '/snooze'; body = { minutes: Number(value(data, 'minutes')) };
      } else if (action === 'team') {
        path += '/teams' + (form.dataset.teamId ? '/' + encodeURIComponent(form.dataset.teamId) : ''); method = form.dataset.teamId ? 'PUT' : 'POST';
        body = { name: value(data, 'name'), membershipIds: [...new Set(data.getAll('membershipIds').map(String))] };
      } else if (action === 'routing') {
        path += '/routing-rules'; body = { propertyId: value(data, 'propertyId'), teamId: value(data, 'teamId') || null, enabled: data.get('enabled') === 'on' };
      } else throw new Error('This task action is not available.');
      if (action === 'status' || action === 'reminder-complete') {
        const status = action === 'reminder-complete' ? 'completed' : form.dataset.status, title = presentRecordText(form.dataset.taskTitle || 'this task');
        const text = status === 'completed' ? 'Complete task' : status === 'cancelled' ? 'Cancel task' : 'Reopen task';
        const confirmation = await confirmTaskAction(workspace, { title: text, message: text + ': ' + title + '? ' + (status === 'completed' || status === 'cancelled' ? 'Active reminders will stop.' : 'This returns the work to the open queue.'), button: 'Confirm ' + (status === 'completed' ? 'completion' : status === 'cancelled' ? 'cancellation' : 'reopening'), comment: status === 'completed' }, signal);
        if (!confirmation || signal.aborted) { restoreFocus = !signal.aborted; return; }
        if (status === 'completed' && confirmation.comment) body.completionComment = confirmation.comment;
      } else if (action === 'edit' && Object.hasOwn(body, 'assignment')) {
        const owner = form.querySelector<HTMLSelectElement>('[name=ownerMembershipId]');
        const description = body.assignment === 'routing' ? 'Re-evaluate eligible staff using this property’s routing rule.' : 'New owner: ' + (owner?.selectedOptions[0]?.textContent ?? 'Unassigned') + '.';
        const confirmation = await confirmTaskAction(workspace, { title: 'Change task assignment', message: description + ' Other changes in this form will also be saved.', button: 'Confirm assignment' }, signal); if (!confirmation || signal.aborted) { restoreFocus = !signal.aborted; return; }
      }
      result = await api(path, { method, body: JSON.stringify(body), signal });
      if (signal.aborted) return;
      let destination = '/admin/tasks?' + new URLSearchParams(location.search);
      if (action === 'create' && result?.task) destination = '/admin/tasks?task=' + encodeURIComponent(result.task.id) + '&saved=created';
      else {
        const query = new URLSearchParams(location.search); query.set('saved', action ?? 'task'); destination = '/admin/tasks?' + query;
      }
      navigate(destination, true, '[data-task-results]');
    } catch (error) {
      if (!signal.aborted && errorNode) { errorNode.textContent = productError(error); errorNode.tabIndex = -1; errorNode.focus(); }
    } finally {
      if (!signal.aborted) form.dataset.taskPending = 'false';
      if (!signal.aborted && submit) { submit.disabled = false; submit.removeAttribute('aria-busy'); if (restoreFocus && submit.isConnected) submit.focus(); }
    }
  }, { signal });
}