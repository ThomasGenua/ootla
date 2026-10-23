import type { DemoData } from '../lib/api';
import { escapeHtml, icon, link } from '../lib/ui';
import { dashboardOverview, filteredLeads, followupCards, leadPropertyName, leadStageLabel, leadUnitLabel, type LeadRecord } from './dashboard';

const humanize = (value: string): string => value.replace(/[_-]/g, ' ').replace(/^./, letter => letter.toUpperCase());

function heading(title: string, description: string): string {
  return `<div class="workspace-heading"><div><span class="eyebrow">YOUR DEMO WORKSPACE</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div><span class="badge badge-green">${icon('shield')} Isolated demo</span></div>`;
}
function notice(): string {
  return `<div class="foundation-note demo-notice">${icon('info')}<p>Synthetic demo records are saved in your database. This is a read-only sample; outbound communication and external integrations use simulation.</p></div>`;
}
function empty(copy: string): string {
  return `<p class="demo-empty">${escapeHtml(copy)}</p>`;
}
function propertyName(data: DemoData, id: string): string {
  return data.properties.find(property => property.id === id)?.name ?? 'Property not available';
}
function leadName(data: DemoData, id: string): string {
  return data.leads.find(lead => lead.id === id)?.name ?? 'Lead not available';
}
function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Time not available' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos', timeZoneName: 'short' }).format(date);
}
function leadActivity(data: DemoData, leadId?: string): string {
  const activities = data.activities.filter(activity => !leadId || activity.leadId === leadId).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  return `<section class="card demo-record-section"><div class="section-heading"><h2>Sample activity</h2><span class="badge badge-neutral">Simulation</span></div><div class="demo-list">${activities.map(activity => `<article class="demo-list-item"><span class="small-green-icon">${icon('message')}</span><div><h3>${escapeHtml(leadName(data, activity.leadId))}</h3><p>${escapeHtml(activity.summary)}</p><small>${escapeHtml(dateLabel(activity.occurredAt))} &middot; Simulated activity</small></div></article>`).join('') || empty('There is no saved demo activity.')}</div></section>`;
}
function newLeadPending(): string {
  return `${heading('Add lead', 'Lead creation is pending. You can browse saved records while this workflow awaits its own stage.')}<section class="card module-empty" data-lead-create-pending><span class="empty-icon">${icon('leads')}</span><h2>Lead creation is not available yet</h2><p>This route is reserved for the lead form. No lead is created and no message is sent from this page.</p><span class="badge badge-neutral">Pending workflow</span><div class="button-row">${link('/admin/leads', 'Back to leads', 'button button-secondary')}</div></section>${notice()}`;
}
function leadDetail(data: DemoData, lead: LeadRecord | undefined): string {
  if (!lead) return `${heading('Lead not found', 'This record is not available in your current workspace.')}<section class="card module-empty" data-lead-not-found><h2>Choose a saved lead to continue</h2><p>The link may be incomplete, or this workspace may not contain that record.</p>${link('/admin/leads', 'Back to leads', 'button button-secondary')}</section>`;
  const unit = data.units.find(record => record.id === lead.unitId && record.propertyId === lead.propertyId);
  const tasks = data.tasks.filter(task => task.leadId === lead.id && task.propertyId === lead.propertyId).sort((left, right) => left.dueAt.localeCompare(right.dueAt));
  const viewings = data.viewings.filter(viewing => viewing.leadId === lead.id && viewing.propertyId === lead.propertyId).sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  return `${link('/admin/leads', `${icon('arrow-left')} Back to leads`, 'text-link')}${heading(lead.name, 'Saved lead details and the next steps connected to this record.')}<section class="card demo-record-section lead-detail" data-lead-detail><div class="section-heading"><h2>Lead details</h2><span class="badge badge-neutral">Read-only demo record</span></div><dl class="lead-detail-fields"><div><dt>Email</dt><dd>${escapeHtml(lead.email)}</dd></div><div><dt>Stage</dt><dd>${escapeHtml(leadStageLabel(lead.status))}</dd></div><div><dt>Property</dt><dd>${escapeHtml(leadPropertyName(data, lead))}</dd></div><div><dt>Unit</dt><dd>${escapeHtml(unit ? `${unit.label} · ${leadUnitLabel(data, lead)}` : 'No unit selected')}</dd></div><div><dt>Opportunity</dt><dd>${escapeHtml(humanize(lead.intent))}</dd></div><div><dt>Notes</dt><dd>${escapeHtml(lead.notes)}</dd></div></dl></section><section class="card demo-record-section"><h2>Linked tasks</h2><div class="demo-list">${tasks.map(task => `<article class="demo-list-item"><span class="small-green-icon">${icon('tasks')}</span><div><h3>${escapeHtml(task.title)}</h3><small>Due ${escapeHtml(dateLabel(task.dueAt))}</small></div><span class="badge badge-neutral">${escapeHtml(humanize(task.status))}</span></article>`).join('') || empty('There are no tasks linked to this lead.')}</div></section><section class="card demo-record-section"><h2>Viewings</h2><div class="demo-list">${viewings.map(viewing => `<article class="demo-list-item"><span class="small-green-icon">${icon('calendar')}</span><div><h3>${escapeHtml(propertyName(data, viewing.propertyId))}</h3><small>${escapeHtml(dateLabel(viewing.startsAt))} &middot; Sample viewing; no invitation sent</small></div><span class="badge badge-neutral">${escapeHtml(humanize(viewing.status))}</span></article>`).join('') || empty('There are no saved viewings for this lead.')}</div></section>${leadActivity(data, lead.id)}${notice()}`;
}
function leads(data: DemoData, query: URLSearchParams): string {
  if (query.get('view') === 'new') return newLeadPending();
  if (query.has('lead')) return leadDetail(data, data.leads.find(lead => lead.id === query.get('lead')));
  const matches = filteredLeads(data, query);
  return `${heading('Leads', 'People, property context and a clear next step in your saved demo workspace.')}<div class="section-heading"><h2>All leads <span class="muted">(${matches.length})</span></h2>${link('/admin/leads?view=new', `${icon('plus')} Add lead`, 'button button-primary')}</div>${followupCards(data, matches)}${query.get('q') || query.get('stages') ? `<div class="followup-bottom">${link('/admin/leads', 'Clear search and stage filters', 'text-link')}</div>` : ''}${leadActivity(data)}${notice()}`;
}
function properties(data: DemoData): string {
  return `${heading('Properties', 'Property records and individual units stay distinct in your demo portfolio.')}<div class="demo-property-grid">${data.properties.map(property => {
    const units = data.units.filter(unit => unit.propertyId === property.id);
    return `<article class="card demo-property-card"><div class="demo-record-top"><span class="small-green-icon">${icon('building')}</span><span class="badge badge-neutral">${escapeHtml(humanize(property.type))}</span></div><h2>${escapeHtml(property.name)}</h2><p class="demo-record-copy">${escapeHtml(property.address)}, ${escapeHtml(property.city)}</p><div class="demo-unit-heading"><h3>Units</h3><span>${units.length} separate records</span></div><div class="demo-unit-list">${units.map(unit => `<div class="demo-unit"><div><strong>${escapeHtml(unit.label)}</strong><small>${Number(unit.bedrooms)} bedrooms</small></div><span class="badge badge-neutral">${escapeHtml(humanize(unit.status))}</span></div>`).join('') || empty('There are no saved units for this property.')}</div><span class="demo-record-label">Synthetic demo property</span></article>`;
  }).join('') || empty('There are no saved demo properties.')}</div>${notice()}`;
}
function tasks(data: DemoData): string {
  return `${heading('Tasks', 'Sample follow-ups stay connected to their lead and property.')}<section class="card demo-record-section"><div class="demo-list">${data.tasks.map(task => `<article class="demo-list-item"><span class="small-green-icon">${icon('tasks')}</span><div><h2>${escapeHtml(task.title)}</h2><p>${escapeHtml(leadName(data, task.leadId))} &middot; ${escapeHtml(propertyName(data, task.propertyId))}</p><small>Due ${escapeHtml(dateLabel(task.dueAt))} &middot; Synthetic demo task</small></div><span class="badge badge-neutral">${escapeHtml(humanize(task.status))}</span></article>`).join('') || empty('There are no saved demo tasks.')}</div></section>${notice()}`;
}
function calendar(data: DemoData): string {
  return `${heading('Calendar', 'Sample viewings help you explore the relationship between leads, properties and time.')}<section class="card demo-record-section"><div class="demo-list">${data.viewings.map(viewing => `<article class="demo-list-item"><span class="small-green-icon">${icon('calendar')}</span><div><h2>${escapeHtml(leadName(data, viewing.leadId))}</h2><p>${escapeHtml(propertyName(data, viewing.propertyId))}</p><small>${escapeHtml(dateLabel(viewing.startsAt))} &middot; Sample viewing; no invitation sent</small></div><span class="badge badge-neutral">${escapeHtml(humanize(viewing.status))}</span></article>`).join('') || empty('There are no saved demo viewings.')}</div></section>${notice()}`;
}
function connections(): string {
  return `${heading('Integrations', 'Explore safely while your real provider connections await configuration.')}<div class="module-detail-grid">${[
    ['Yardi', 'Simulation', 'Demo properties are synthetic. No Yardi service is connected; the exact interface still needs to be confirmed.'],
    ['Email and SMS', 'Simulation', 'Sample activity stays inside this workspace. No email or SMS is sent.'],
    ['Calendar', 'Simulation', 'Sample viewings are saved locally. No provider events or invitations are created.'],
    ['Payments and screening', 'Not configured', 'Payments remain with an approved provider. Screening will require consent, an approved provider and staff review.']
  ].map(([title, mode, copy]) => `<article class="card module-detail"><span class="small-green-icon">${icon('plug')}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(copy)}</p><span class="badge badge-neutral">${escapeHtml(mode)}</span></article>`).join('')}</div>${notice()}`;
}
export function demoView(path: string, data: DemoData, query = new URLSearchParams()): string | undefined {
  if (path === '/admin') return dashboardOverview(data, query);
  if (path === '/admin/leads') return leads(data, query);
  if (path === '/admin/properties') return properties(data);
  if (path === '/admin/tasks') return tasks(data);
  if (path === '/admin/calendar') return calendar(data);
  if (path === '/admin/integrations') return connections();
  return undefined;
}
