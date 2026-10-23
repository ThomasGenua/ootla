import { icon, link, wordmark } from '../lib/ui';
import { homePage } from './home';
import { platformPage } from './platform';
import { integrationsPage } from './integrations';
import { contactPage, privacyPage } from './public-information';
import { aiWorkflowsPage } from './ai-workflows';
import { leasingPage, residentSupportPage } from './workflows';

export function publicHeader(path: string): string {
  const workflowPage = path.startsWith('/workflows/');
  return `<header class="site-header"><div class="site-header-inner">${link('/', wordmark(), 'brand-link')}<button class="site-menu-toggle icon-button" type="button" data-action="public-menu" aria-expanded="false" aria-controls="public-navigation" aria-label="Open navigation">${icon('menu')}</button><nav id="public-navigation" class="site-navigation" aria-label="Main navigation"><a href="/platform" data-link ${path==='/platform'?'aria-current="page"':''}>Platform</a><a href="/ai-workflows" data-link ${path==='/ai-workflows'?'aria-current="page"':''}>AI workflows</a><details class="public-workflow-menu ${workflowPage?'is-current':''}"><summary>Workflows ${icon('chevron-down')}</summary><div class="public-workflow-dropdown">${link('/workflows/leasing','<strong>Leasing</strong><small>From inquiry to staff review</small>','workflow-menu-link')}${link('/workflows/resident-support','<strong>Resident support</strong><small>Requests, updates and renewals</small>','workflow-menu-link')}</div></details><a href="/integrations" data-link ${path==='/integrations'?'aria-current="page"':''}>Integrations</a><span class="nav-separator"></span>${link('/admin/login','Sign in','public-sign-in')}${link('/admin/login',`Explore demo ${icon('arrow')}`,'button button-header')}</nav></div></header>`;
}
export function publicFooter(): string {
  return `<footer class="site-footer"><div class="container footer-top"><div>${link('/', wordmark(true), 'brand-link')}<p>People. Property.<br>A little more connected.</p></div><div class="footer-navigation"><span>EXPLORE OOTLAAI</span>${link('/platform', 'The platform')}${link('/ai-workflows', 'AI workflows')}${link('/workflows/leasing','Leasing workflow')}${link('/workflows/resident-support','Resident support workflow')}${link('/integrations', 'Integrations')}${link('/admin/login', 'Staff workspace')}</div><div class="footer-note"><span class="eyebrow">MADE FOR THE NEXT CHAPTER</span><p>OotlaAI connects your pipeline, conversations and daily property work.</p><span class="badge badge-dark">Explore the workspace</span></div></div><div class="container footer-bottom"><span>© ${new Date().getFullYear()} Ootla</span><span>A place for possibilities.</span><div class="public-footer-links">${link('/contact', 'Contact')}${link('/privacy', 'Privacy')}</div><a href="#main-content">Back to top ↑</a></div></footer>`;
}
export function publicPage(path: string): string {
  const content = path === '/platform' ? platformPage() : path === '/ai-workflows' ? aiWorkflowsPage() : path === '/workflows/leasing' ? leasingPage() : path === '/workflows/resident-support' ? residentSupportPage() : path === '/integrations' ? integrationsPage() : path === '/contact' ? contactPage() : path === '/privacy' ? privacyPage() : homePage();
  return publicHeader(path) + content + publicFooter();
}
export function notFoundPage(): string {
  return publicHeader('') + `<main id="main-content" class="not-found"><div class="container"><span class="eyebrow">404 · A DIFFERENT DIRECTION</span><h1>This page hasn’t<br>found its home.</h1><p>The address may have changed. Let’s take you somewhere familiar.</p>${link('/', `Back to Ootla ${icon('arrow')}`, 'button button-primary')}</div></main>` + publicFooter();
}
