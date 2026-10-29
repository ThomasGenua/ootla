import { api, ApiError} from './api';
import {productError} from './product-copy';
import type { ImportBatch, ImportBatchDetail, ImportOnboarding, ImportUndoPreview } from '../../shared/import-contracts';
import type { Paginated } from '../../shared/property-contracts';

export const importsApi = '/api/imports';
export type ImportsWorkspacePayload =
  | { kind: 'denied'; message: string }
  | { kind: 'restricted'; onboarding: ImportOnboarding }
  | { kind: 'directory'; onboarding: ImportOnboarding; batches: Paginated<ImportBatch> }
  | { kind: 'batch'; onboarding: ImportOnboarding; detail: ImportBatchDetail; undo: ImportUndoPreview | null };
export async function loadImportsWorkspace(query: URLSearchParams, signal: AbortSignal): Promise<ImportsWorkspacePayload> {
  let onboarding: ImportOnboarding;
  try { onboarding = await api<ImportOnboarding>(importsApi + '/onboarding', { signal }); }
  catch (issue) { if (issue instanceof ApiError && issue.status === 403) return { kind: 'denied', message: productError(issue) }; throw issue; }
  if (!onboarding.canImport || onboarding.organization.mode !== 'standalone') return { kind: 'restricted', onboarding };
  const batch = query.get('batch');
  if (!batch) return { kind: 'directory', onboarding, batches: await api<Paginated<ImportBatch>>(importsApi + '?' + new URLSearchParams({ page: query.get('page') ?? '1', pageSize: query.get('pageSize') ?? '25' }), { signal }) };
  const path = importsApi + '/' + encodeURIComponent(batch);
  const detail = await api<ImportBatchDetail>(path, { signal });
  if (query.get('rows') || query.get('page') || query.get('pageSize')) detail.rows = await api(path + '/rows?' + new URLSearchParams({ view: query.get('rows') ?? 'all', page: query.get('page') ?? '1', pageSize: query.get('pageSize') ?? '25' }), { signal });
  const undo = query.get('undo') === 'review' ? await api<ImportUndoPreview>(path + '/undo-preview?' + new URLSearchParams({ page: query.get('undoPage') ?? '1', pageSize: query.get('undoPageSize') ?? '25' }), { method: 'POST', body: '{}', signal }) : null;
  return { kind: 'batch', onboarding, detail, undo };
}
const value = (data: FormData, key: string): string => String(data.get(key) ?? '').trim();
const batchUrl = (id: string, step: string, extra?: Record<string, string>): string => '/admin/imports?' + new URLSearchParams({ batch: id, step, ...extra });
export function initializeImportsWorkspace(signal: AbortSignal, navigate: (path: string, replace?: boolean, focusSelector?: string) => void): void {
  const workspace = document.querySelector<HTMLElement>('[data-import-workspace]');
  if (!workspace) return;
  workspace.addEventListener('change', event => {
    const control = event.target;
    if (!(control instanceof HTMLSelectElement) || control.name !== 'action') return;
    const form = control.closest('form');
    const existing = form?.querySelector<HTMLSelectElement>('[name="existingContactId"]');
    if (existing) { existing.disabled = control.value !== 'use_existing'; existing.required = control.value === 'use_existing'; }
  }, { signal });
  workspace.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const refresh = target.closest<HTMLButtonElement>('[data-import-refresh]');
    if (refresh) { navigate(location.pathname + location.search, true, '[data-import-results]'); return; }
    const template = target.closest<HTMLButtonElement>('[data-import-template]');
    if (!template) return;
    const entity = template.dataset.importTemplate!;
    const samples: Record<string, string> = {
      properties: 'sourceId,name,address,city,type\r\nPROP-001,Cedar Example House,12 Example Road,Example City,apartment\r\n',
      units: 'sourceId,propertySourceId,label,bedrooms,monthlyRent,status\r\nUNIT-001,PROP-001,1A,2,1800,available\r\n',
      contacts: 'sourceId,displayName,email,phone,propertySourceId\r\nPERSON-001,Alex Example,alex@example.test,,PROP-001\r\n',
      leads: 'sourceId,propertySourceId,contactSourceId,unitSourceId,intent,stage,nextAction,nextActionAt\r\nLEAD-001,PROP-001,PERSON-001,UNIT-001,leasing,new_inquiry,Arrange a viewing,\r\n'
    };
    if (!samples[entity]) return;
    const objectUrl = URL.createObjectURL(new Blob([samples[entity]], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = 'ootla-' + entity + '-example.csv'; anchor.click();
    const timer = window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    signal.addEventListener('abort', () => { clearTimeout(timer); URL.revokeObjectURL(objectUrl); }, { once: true });
  }, { signal });
  workspace.addEventListener('submit', async event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-import-form')) return;
    event.preventDefault();
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit?.disabled) return;
    const error = form.querySelector<HTMLElement>('[data-import-error]');
    if (error) error.textContent = '';
    const data = new FormData(form), action = form.dataset.importForm!, id = form.dataset.batchId;
    if (submit) { submit.disabled = true; submit.setAttribute('aria-busy', 'true'); }
    try {
      let path = importsApi, body: Record<string, unknown>, next = 'results';
      if (action === 'upload') {
        const file = data.get('file');
        if (!(file instanceof File) || !file.size) throw new Error('Choose a nonempty CSV file.');
        const max = Number(form.dataset.maxBytes);
        if (!Number.isFinite(max) || file.size > max) throw new Error('The CSV file exceeds the ' + Math.floor(max / 1048576) + ' MiB limit. Split it into smaller batches.');
        if (!/\.csv$/i.test(file.name)) throw new Error('Save the spreadsheet as a UTF-8 .csv file before uploading.');
        let csv: string;
        try { csv = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
        catch { throw new Error('The file must use UTF-8 text encoding. Save it as CSV UTF-8 and try again.'); }
        path += '/upload'; body = { entity: value(data, 'entity'), filename: file.name, sourceName: value(data, 'sourceName'), csv }; next = 'map';
      } else {
        if (!id) throw new Error('Choose a saved import batch.');
        path += '/' + encodeURIComponent(id) + '/';
        if (action === 'map') { path += 'map'; const mapping: Record<string, string> = {}; for (const [key, item] of data) if (key.startsWith('map.') && typeof item === 'string' && item) mapping[key.slice(4)] = item; body = { mapping }; next = 'validate'; }
        else if (action === 'validate') { path += 'validate'; body = {}; next = 'duplicates'; }
        else if (action === 'decision') { path += 'decisions'; const decision = value(data, 'action'); body = { decisions: [{ rowId: form.dataset.rowId, action: decision, ...(decision === 'use_existing' ? { existingContactId: value(data, 'existingContactId') } : {}) }] }; next = 'duplicates'; }
        else if (action === 'confirm' || action === 'retry' || action === 'undo') { path += action; if (data.get('confirm') !== 'on') throw new Error('Review the confirmation and tick its checkbox first.'); body = { confirm: true }; }
        else throw new Error('This action is not available.');
      }
      const response = await api<ImportBatchDetail | ImportUndoPreview>(path, { method: 'POST', body: JSON.stringify(body), signal });
      if (signal.aborted) return;
      const savedId = 'batch' in response ? response.batch.id : id!;
      if (action === 'validate' && 'batch' in response && !response.batch.counts.needs_review) next = 'confirm';
      const extra: Record<string, string> | undefined = action === 'undo' ? { saved: 'undone' } : action === 'decision' ? { saved: 'decision', rows: 'duplicates', page: new URLSearchParams(location.search).get('page') ?? '1' } : undefined;
      navigate(batchUrl(savedId, next, extra), false, '[data-import-step]');
    } catch (issue) {
      if (!signal.aborted && error) error.textContent = issue instanceof ApiError && issue.status === 409 ? productError(issue) + ' Refresh the saved batch before trying again.' : productError(issue);
    } finally {
      if (!signal.aborted && submit) { submit.disabled = false; submit.removeAttribute('aria-busy'); }
    }
  }, { signal });
  const batchId = workspace.dataset.batchId;
  if (!batchId || !['queued', 'running'].includes(workspace.dataset.status ?? '')) return;
  let timer = 0, polls = 0;
  const status = workspace.querySelector<HTMLElement>('[data-import-poll-status]');
  async function poll(): Promise<void> {
    if (signal.aborted) return;
    polls += 1;
    try {
      const { batch } = await api<ImportBatchDetail>(importsApi + '/' + encodeURIComponent(batchId!), { signal });
      if (signal.aborted) return;
      if (!['queued', 'running'].includes(batch.status)) { navigate(batchUrl(batch.id, 'results'), true, '[data-import-results]'); return; }
      const completed = batch.counts.created + batch.counts.linked + batch.counts.skipped + batch.counts.failed;
      if (status) status.textContent = 'Background import: ' + completed + ' of ' + batch.rowCount + ' rows reconciled. You can leave this page and return to the saved batch.';
      if (polls >= 60) { if (status) status.textContent += ' Automatic refresh is paused. Use Refresh progress to check again.'; return; }
      timer = window.setTimeout(() => void poll(), 2000);
    } catch (issue) {
      if (!signal.aborted && status) status.textContent = 'Progress could not be loaded. Your saved batch is unchanged. Use Refresh progress to try again.';
    }
  }
  timer = window.setTimeout(() => void poll(), 1500);
  signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
}
