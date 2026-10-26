import {escapeHtml as e,link} from '../lib/ui';
export const organizationTabs=[['profile','Profile'],['members','Staff & access'],['groups','Property groups'],['routing','Assignment rules'],['notifications','Notifications'],['ai','AI policy'],['knowledge','Knowledge'],['documents','Property documents'],['retention','Retention'],['demo','Preview access']]as const;
export type OrganizationTab=typeof organizationTabs[number][0];
export function organizationNavigation(selected:string):string{
 const entries=[...organizationTabs.map(([key,label])=>({key,label,href:'/admin/organization?tab='+key})),{key:'health',label:'Integration health',href:'/admin/integration-health'},{key:'audit',label:'Audit history',href:'/admin/audit'}];
 return'<nav class="oa-tabs" aria-label="Owner administration">'+entries.map(item=>link(item.href,e(item.label),selected===item.key?'is-active':'').replace('<a ','<a '+(selected===item.key?'aria-current="page" ':''))).join('')+'</nav>';
}
