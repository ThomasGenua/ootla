import { api, errorMessage } from './api';
import { escapeHtml as e } from './ui';
import type { Paginated, PropertySummary, ContactRecord } from '../../shared/property-contracts';
import type { LeadDirectory, LeadDetail } from '../../shared/lead-contracts';
import type { TaskDirectory, TaskDetail, TaskOptions, TaskRecord, TaskReminder } from '../../shared/task-contracts';

export const tasksApi = '/api/tasks';
export interface TaskRelatedChoices { tours: { id: string; leadId: string; startsAt: string; status: string }[]; applications: { id: string; leadId: string | null; contactId: string; status: string }[]; }
interface TaskBase { options: TaskOptions; properties: Paginated<PropertySummary>; }
export type TasksWorkspacePayload =
  | (TaskBase & { kind: 'directory'; directory: TaskDirectory })
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
    const detail = await api<TaskDetail>(tasksApi + '/' + encodeURIComponent(taskId) + '?' + new URLSearchParams({ page: query.get('historyPage') ?? '1', pageSize: '25' }), { signal });
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
  const [directory, options, properties] = await Promise.all([api<TaskDirectory>(tasksApi + '?' + search, { signal }), optionsFor(query.get('propertyId'), query, signal), propertiesFor(query, signal)]);
  return { kind: 'directory', directory, options, properties };
}
const value = (data: FormData, key: string): string => String(data.get(key) ?? '').trim();
export function initializeTasksWorkspace(signal: AbortSignal, navigate: (path: string, replace?: boolean, focusSelector?: string) => void): void {
  const workspace = document.querySelector<HTMLElement>('[data-task-workspace]');
  if (!workspace) return;
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
        if (error) error.textContent = errorMessage(issue);
      }
    } finally {
      if (!signal.aborted && request === ownerRequest) { updateAssignment(); if (submit) submit.disabled = form.dataset.taskPending === 'true'; }
    }
  }
  updateRelated(); updateAssignment();
  workspace.addEventListener('change', event => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.id === 'task-related-kind') updateRelated();
    if (target.id === 'task-related-kind' || ['leadId', 'applicationId', 'tourId'].includes(target.name)) void updateEligibleOwners();
    if (target.name === 'assignment') updateAssignment();
  }, { signal });
  workspace.addEventListener('submit', async event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || (!form.hasAttribute('data-task-filter') && !form.hasAttribute('data-task-form'))) return;
    event.preventDefault();
    const data = new FormData(form);
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
      result = await api(path, { method, body: JSON.stringify(body), signal });
      if (signal.aborted) return;
      let destination = '/admin/tasks?' + new URLSearchParams(location.search);
      if (action === 'create' && result?.task) destination = '/admin/tasks?task=' + encodeURIComponent(result.task.id) + '&saved=created';
      else {
        const query = new URLSearchParams(location.search); query.set('saved', action ?? 'task'); destination = '/admin/tasks?' + query;
      }
      navigate(destination, true, '[data-task-results]');
    } catch (error) {
      if (!signal.aborted && errorNode) { errorNode.textContent = errorMessage(error); errorNode.tabIndex = -1; errorNode.focus(); }
    } finally {
      if (!signal.aborted) form.dataset.taskPending = 'false';
      if (!signal.aborted && submit) { submit.disabled = false; submit.removeAttribute('aria-busy'); }
    }
  }, { signal });
}