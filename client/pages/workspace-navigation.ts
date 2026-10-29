import type { AuthUser } from '../lib/api';
import { escapeHtml } from '../lib/ui';

type SectionLink = { path: string; label: string; selected: boolean };
const pathname = (path: string): string => path.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
function sectionNavigation(label: string, kind: 'settings' | 'reports', links: SectionLink[]): string {
  return '<nav class="workspace-section-navigation" aria-label="' + escapeHtml(label) + '" data-workspace-navigation="' + kind + '">' + links.map(item => '<a href="' + escapeHtml(item.path) + '" data-link' + (item.selected ? ' aria-current="page"' : '') + '>' + escapeHtml(item.label) + '</a>').join('') + '</nav>';
}

/** Workspace links reflect existing server permissions; they never grant record access. */
export function settingsNavigation(path: string, user: AuthUser): string {
  const current = pathname(path);
  const organizationAdmin = user.organization.role === 'organization_admin';
  const links: SectionLink[] = [{ path: '/admin/settings', label: 'Personal', selected: ['/admin/settings', '/admin/profile'].includes(current) }];
  if (organizationAdmin) {
    links.push({ path: '/admin/organization', label: 'Organization', selected: ['/admin/organization', '/admin/audit'].includes(current) });
    links.push({ path: '/admin/integrations', label: 'Integrations', selected: ['/admin/integrations', '/admin/integration-health', '/admin/imports'].includes(current) });
  }
  if (user.permissions.includes('leasing.manage') && ['organization_admin','property_manager'].includes(user.organization.role)) links.push({path:'/admin/resident-access',label:'Resident access',selected:current==='/admin/resident-access'});
  if (user.permissions.includes('leasing.manage')) links.push({ path: '/admin/automations', label: 'Automations', selected: current === '/admin/automations' });
  return sectionNavigation('Settings sections', 'settings', links);
}

export function reportsNavigation(path: string): string {
  const current = pathname(path);
  return sectionNavigation('Reports sections', 'reports', [
    { path: '/admin/reports', label: 'CRM reports', selected: current === '/admin/reports' },
    { path: '/admin/analytics', label: 'Website analytics', selected: current === '/admin/analytics' },
  ]);
}
