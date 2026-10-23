import type { DemoData, Overview } from '../lib/api';
import { icon } from '../lib/ui';
import { adminShell } from './admin';

// Public, invented examples only. This renderer never loads a user, session or API record.
const exampleWorkspace: DemoData = {
  demo: true,
  integrationsMode: 'simulation',
  outboundMode: 'simulation',
  properties: [
    { id: 'example-willow', name: 'Willow House', address: '12 Example Lane', city: 'Example City', type: 'apartments' },
    { id: 'example-maple', name: 'Maple Court', address: '24 Example Lane', city: 'Example City', type: 'apartments' },
    { id: 'example-river', name: 'River Lofts', address: '36 Example Lane', city: 'Example City', type: 'apartments' },
  ],
  units: [
    { id: 'example-unit-a', propertyId: 'example-willow', label: 'A2', bedrooms: 2, status: 'available', monthlyRent: 0 },
    { id: 'example-unit-b', propertyId: 'example-maple', label: 'B1', bedrooms: 1, status: 'available', monthlyRent: 0 },
    { id: 'example-unit-c', propertyId: 'example-river', label: 'C2', bedrooms: 2, status: 'available', monthlyRent: 0 },
  ],
  leads: [
    { id: 'example-alex', name: 'Alex Morgan', email: 'alex@example.test', status: 'new', intent: 'leasing', propertyId: 'example-willow', unitId: 'example-unit-a', notes: 'Public example: interested in a two-bedroom apartment.' },
    { id: 'example-casey', name: 'Casey Taylor', email: 'casey@example.test', status: 'viewing_scheduled', intent: 'leasing', propertyId: 'example-maple', unitId: 'example-unit-b', notes: 'Public example: a viewing has been arranged.' },
    { id: 'example-robin', name: 'Robin Lane', email: 'robin@example.test', status: 'qualified', intent: 'leasing', propertyId: 'example-river', unitId: 'example-unit-c', notes: 'Public example: staff are reviewing the next step.' },
  ],
  tasks: [
    { id: 'example-task-a', leadId: 'example-alex', propertyId: 'example-willow', title: 'Arrange a viewing', dueAt: '2026-10-22T09:00:00.000Z', status: 'open' },
    { id: 'example-task-b', leadId: 'example-casey', propertyId: 'example-maple', title: 'Confirm the viewing details', dueAt: '2026-10-22T10:00:00.000Z', status: 'open' },
    { id: 'example-task-c', leadId: 'example-robin', propertyId: 'example-river', title: 'Review the requested documents', dueAt: '2026-10-22T11:00:00.000Z', status: 'open' },
  ],
  viewings: [
    { id: 'example-viewing-a', leadId: 'example-casey', propertyId: 'example-maple', unitId: 'example-unit-b', startsAt: '2026-10-23T13:30:00.000Z', status: 'scheduled' },
    { id: 'example-viewing-b', leadId: 'example-robin', propertyId: 'example-river', unitId: 'example-unit-c', startsAt: '2026-10-23T15:00:00.000Z', status: 'scheduled' },
  ],
  activities: [],
};

const exampleOverview: Overview = {
  organization: { id: 'example-organization', name: 'Example workspace', role: 'organization_admin' },
  dashboard: {
    period: 'month',
    timeZone: 'Africa/Lagos',
    metrics: {
      newLeads: exampleWorkspace.leads.length,
      toursBooked: exampleWorkspace.viewings.filter(viewing => viewing.status === 'scheduled').length,
      applications: null,
      leasesSigned: null,
    },
  },
  counts: {
    leads: exampleWorkspace.leads.length,
    properties: exampleWorkspace.properties.length,
    applications: 0,
    tasks: exampleWorkspace.tasks.length,
  },
  modulesReady: false,
  demoEnabled: true,
  integrationsMode: 'simulation',
  outboundMode: 'simulation',
};

export function homeDashboardPreview(): string {
  const dashboard = adminShell('/admin', undefined, exampleOverview, true, exampleWorkspace)
    .replace('admin-app is-preview', 'admin-app homepage-preview-app')
    .replace(/<main\b/g, '<div')
    .replaceAll('</main>', '</div>')
    .replace(/<h1\b/g, '<h2')
    .replaceAll('</h1>', '</h2>')
    .replace('Ootla · Demo workspace · Synthetic data', 'Ootla · Public example · Invented records')
    .replace('Design preview</span>', 'Example workspace</span>');

  return `<div class="home-dashboard-preview dashboard-preview" data-example-preview="true" aria-hidden="true" inert><div class="preview-chrome"><span class="preview-chrome-dots"><i></i><i></i><i></i></span><span>${icon('lock')} Example Ootla workspace</span><span class="preview-chrome-tag">EXAMPLE DATA</span></div>${dashboard}</div>`;
}
