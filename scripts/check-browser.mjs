import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const base = process.env.OOTLA_CHECK_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true, ...(process.env.OOTLA_BROWSER_CHANNEL ? { channel: process.env.OOTLA_BROWSER_CHANNEL } : {}) });
const context = await browser.newContext({ viewport: { width: 1586, height: 992 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const pageErrors = [];
const externalRequests = [];
let loginRequests = 0;
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('request', (request) => {
  if (new URL(request.url()).origin !== new URL(base).origin) externalRequests.push(request.url());
  if (new URL(request.url()).pathname === '/api/auth/login') loginRequests += 1;
});
await mkdir('.local/screenshots', { recursive: true });
const title = () => page.locator('.admin-header-body h1');
const metricValues = (overview) => ['newLeads', 'toursBooked', 'applications', 'leasesSigned'].map((key) => overview.dashboard.metrics[key] === null ? '—' : Number(overview.dashboard.metrics[key]).toLocaleString());
async function readOverview(period = 'month') {
  const response = await page.request.get(`${base}/api/admin/overview?period=${period}`);
  assert.equal(response.status(), 200);
  return response.json();
}
async function expectMetrics(period = 'month') {
  const overview = await readOverview(period);
  await expect(page.locator('.summary-metric')).toHaveCount(4);
  await expect(page.locator('.summary-metric strong')).toHaveText(metricValues(overview));
  assert.equal(overview.dashboard.period, period);
  return overview;
}
async function expectNoOverflow(route, width) {
  await expect(page.locator('#main-content')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert(overflow <= 1, `Horizontal overflow ${overflow}px on ${route} at ${width}px.`);
}
async function openAccountMenu() {
  const button = page.getByRole('button', { name: 'Account menu', exact: true });
  if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
}
try {
  await page.goto(base + '/');
  await expect(page.locator('.hero-copy h1')).toBeVisible();
  const preview = await page.locator('.dashboard-preview').boundingBox();
  assert(preview && preview.width >= 1000 && preview.x >= 600 && preview.x + preview.width > 1586, 'Dashboard must remain full-size and be clipped at the far right.');
  assert.equal(await page.getByText('Maya Chen', { exact: true }).count(), 0, 'Public preview must not expose private demo lead data.');
  await page.screenshot({ path: '.local/screenshots/home-desktop.png', fullPage: true });
  for (const route of ['/platform', '/ai-workflows', '/integrations']) {
    await page.goto(base + route);
    await expect(page.locator('#main-content h1')).toBeVisible();
    assert.equal(await page.locator('main').count(), 1);
  }
  console.log('PASS public routes, clipped homepage dashboard and no private demo lead data');

  await page.goto(base + '/admin/properties');
  await expect(page).toHaveURL(/\/admin\/login\?returnTo=/);
  await expect(page.getByRole('button', { name: /Fill demo credentials/ })).toBeVisible();
  const countBefore = loginRequests;
  await page.getByRole('button', { name: /Fill demo credentials/ }).click();
  await expect(page.getByLabel('Email address')).toHaveValue('admin@demo.ootla.test');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('OotlaDemo!2026');
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  assert.equal(loginRequests, countBefore, 'Autofill must not call login.');
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: /Sign in to your workspace/ }).click();
  await expect(page.locator('#login-error')).toContainText('incorrect');
  await page.getByRole('button', { name: /Fill demo credentials/ }).click();
  await page.getByRole('button', { name: /Sign in to your workspace/ }).click();
  await expect(page).toHaveURL(base + '/admin/properties');
  await expect(title()).toHaveText('Properties');
  console.log('PASS protected navigation, masked fill without bypass, invalid credentials and normal sign-in');

  for (const [route, heading] of [['/admin', 'Overview'], ['/admin/leads', 'Leads'], ['/admin/properties', 'Properties'], ['/admin/applications', 'Applications'], ['/admin/calendar', 'Calendar'], ['/admin/tasks', 'Tasks'], ['/admin/analytics', 'Analytics'], ['/admin/ai', 'AI assistant'], ['/admin/integrations', 'Integrations']]) {
    await page.goto(base + route);
    await expect(title()).toHaveText(heading);
    await expect(page.locator('h1')).toHaveCount(1);
    await expectMetrics();
    if (route === '/admin' || route === '/admin/leads') {
      await expect(page.locator('[data-demo-lead]')).toHaveCount(3);
      await expect(page.locator('.followup-lead-name')).toHaveText(['Maya Chen', 'Jordan Ellis', 'Priya Shah']);
    }
    if (route === '/admin/properties') {
      await expect(page.locator('.demo-property-card')).toHaveCount(3);
      await expect(page.locator('.demo-unit')).toHaveCount(6);
    }
    if (route === '/admin/tasks') await expect(page.locator('.demo-list-item')).toHaveCount(3);
    if (route === '/admin/calendar') {
      await expect(page.locator('.demo-list-item')).toHaveCount(2);
      await expect(page.locator('.demo-list-item').first()).toContainText('no invitation sent');
    }
    if (route === '/admin/integrations') {
      await expect(page.locator('.module-detail')).toHaveCount(4);
      await expect(page.locator('.module-detail').filter({ hasText: 'Simulation' })).toHaveCount(3);
    }
    await page.reload();
    await expect(title()).toHaveText(heading);
  }
  console.log('PASS reusable shell across nine protected routes, record-backed metrics and direct refresh');

  await page.goto(base + '/admin');
  await expect(title()).toHaveText('Overview');
  await expect(page.locator('.admin-top-nav a')).toHaveText(['Overview', 'Leads', 'Properties', 'Applications', 'Calendar']);
  await expect(page.locator('.admin-sidebar .admin-nav a')).toHaveText(['My leads', 'Tasks', 'Analytics', 'AI assistant', 'Integrations']);
  await expect(page.locator('.summary-metric .metric-label')).toHaveText(['New leads', 'Tours booked', 'Applications', 'Leases signed']);
  await page.locator('.admin-top-nav a').first().focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('.admin-top-nav a').nth(1)).toBeFocused();
  assert.notEqual(await page.locator('.admin-top-nav a').nth(1).evaluate(element => getComputedStyle(element).outlineStyle), 'none', 'Keyboard navigation has a visible focus indicator.');
  await expect(page.locator('.summary-metric').nth(2)).toContainText('Not configured');
  await expect(page.locator('.summary-metric').nth(3)).toContainText('Not configured');
  await expect(page.locator('.workspace-content h2')).toHaveText('Leads to follow up');
  await expect(page.locator('.workspace-content canvas, .workspace-content .module-detail, .workspace-content .demo-record-section')).toHaveCount(0);
  const header = await page.locator('.admin-header').boundingBox();
  const sidebar = await page.locator('.admin-sidebar').boundingBox();
  assert(header && sidebar && sidebar.y >= header.y + header.height, 'Sidebar starts beneath the full-width header.');
  assert(header.width >= 1506 && header.x <= 40, 'Desktop header uses the full application width.');
  const headerStyle = await page.locator('.admin-header').evaluate((element) => ({ borderRadius: parseFloat(getComputedStyle(element).borderTopLeftRadius), background: getComputedStyle(element).backgroundColor }));
  assert(headerStyle.borderRadius >= 20, 'Desktop header has substantial rounded corners.');
  const channels = headerStyle.background.match(/\d+/g)?.slice(0, 3).map(Number);
  assert(channels && channels.every(value => value < 60), 'Header has a dark charcoal background.');
  const cards = await page.locator('.followup-card').all();
  const boxes = await Promise.all(cards.map(card => card.boundingBox()));
  assert(boxes.length === 3 && boxes.every(box => box && box.width >= 300 && box.height >= 320), 'Three spacious desktop lead cards are present.');
  assert(boxes.every(box => Math.abs(box.y - boxes[0].y) <= 1), 'Desktop lead cards form one row.');
  const demoResponse = await page.request.get(base + '/api/demo/data');
  assert.equal(demoResponse.status(), 200);
  const demo = await demoResponse.json();
  for (const card of cards) {
    const name = await card.locator('.followup-lead-name').textContent();
    const lead = demo.leads.find(record => record.name === name);
    assert(lead, 'Every displayed follow-up lead must come from persisted demo data.');
    await expect(card.locator('.followup-property h4')).toHaveText(demo.properties.find(property => property.id === lead.propertyId).name);
    const task = demo.tasks.filter(record => record.leadId === lead.id && record.propertyId === lead.propertyId && record.status === 'open').sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id))[0];
    await expect(card.locator('.followup-next-step p')).toHaveText(task?.title ?? 'No open follow-up task');
    await expect(card.getByRole('link', { name: 'View lead', exact: true })).toHaveAttribute('href', '/admin/leads?lead=' + lead.id);
  }
  assert.equal(await page.locator('.admin-header, .workspace-content').evaluateAll(elements => elements.some(element => getComputedStyle(element).backgroundImage.includes('url('))), false, 'Dashboard is live HTML/CSS, with no screenshot background.');
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.screenshot({ path: '.local/screenshots/stage04-admin-desktop.png', fullPage: true });
  console.log('PASS approved dashboard structure, exact navigation/four metrics, spacious persisted lead cards and desktop screenshot');

  for (const period of ['week', 'all', 'month']) {
    await page.getByLabel('Metric period').selectOption(period);
    await expect(page).toHaveURL(new RegExp('[?&]period=' + period + '(?:&|$)'));
    await expect(page.getByLabel('Metric period')).toHaveValue(period);
    await expectMetrics(period);
    await page.reload();
    await expect(page.getByLabel('Metric period')).toHaveValue(period);
    await expectMetrics(period);
  }
  const inquiry = page.getByRole('checkbox', { name: 'New inquiry', exact: true });
  await inquiry.focus();
  await page.keyboard.press('Space');
  await expect(page).toHaveURL(/[?&]stages=new(?:&|$)/);
  await expect(page.getByRole('checkbox', { name: 'New inquiry', exact: true })).toBeChecked();
  const newLeads = demo.leads.filter(lead => lead.status === 'new');
  await expect(page.locator('.followup-card')).toHaveCount(Math.min(3, newLeads.length));
  await expect(page.locator('.followup-card .lead-stage')).toHaveText(newLeads.slice(0, 3).map(() => 'New inquiry'));
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'New inquiry', exact: true })).toBeChecked();
  await expect(page.locator('.followup-card')).toHaveCount(Math.min(3, newLeads.length));
  await page.getByRole('checkbox', { name: 'New inquiry', exact: true }).uncheck();
  await expect(page.locator('.followup-card')).toHaveCount(3);
  const savedStage = demo.leads.find(lead => lead.status !== 'new').status;
  await page.locator('input[name=stage][value=' + savedStage + ']').check();
  await expect(page.locator('.followup-card')).toHaveCount(Math.min(3, demo.leads.filter(lead => lead.status === savedStage).length));
  assert.deepEqual((await page.locator('.followup-lead-name').allTextContents()).sort(), demo.leads.filter(lead => lead.status === savedStage).map(lead => lead.name).sort());
  await page.locator('input[name=stage][value=' + savedStage + ']').uncheck();
  await expect(page.locator('.followup-card')).toHaveCount(3);
  console.log('PASS record-backed period changes and keyboard stage filters persist in URLs and survive refresh');

  const firstLead = demo.leads.find(lead => lead.name === 'Maya Chen');
  await page.locator('.followup-card').filter({ hasText: firstLead.name }).getByRole('link', { name: 'View lead', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(base + '/admin/leads?lead=' + firstLead.id);
  await expect(title()).toHaveText('Leads');
  await expect(page.locator('.workspace-content')).toContainText(firstLead.name);
  await expect(page.locator('.workspace-content')).toContainText(firstLead.email);
  await expect(page.locator('.workspace-content')).toContainText(/read.only/i);
  await page.reload();
  await expect(page.locator('.workspace-content')).toContainText(firstLead.email);
  await page.goto(base + '/admin/leads?lead=00000000-0000-4000-8000-000000000000');
  await expect(page.locator('.workspace-content')).toContainText(/not found|not available/i);
  await page.goto(base + '/admin');
  await expect(title()).toHaveText('Overview');
  await page.getByRole('link', { name: 'Add lead', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(base + '/admin/leads?view=new');
  await expect(page.locator('.workspace-content')).toContainText(/pending/i);
  await expect(page.locator('.workspace-content form')).toHaveCount(0);
  await page.goto(base + '/admin');
  await expect(title()).toHaveText('Overview');
  await page.getByRole('link', { name: 'View all leads', exact: true }).click();
  await expect(page).toHaveURL(base + '/admin/leads');
  await expect(page.locator('.followup-card')).toHaveCount(demo.leads.length);
  await page.getByRole('button', { name: 'Search leads', exact: true }).click();
  await expect(page.locator('#lead-search-input')).toBeVisible();
  await page.locator('#lead-search-input').fill('Maya');
  await page.locator('#lead-search-input').press('Enter');
  await expect(page).toHaveURL(/\/admin\/leads\?q=Maya$/);
  await expect(page.locator('.followup-card')).toHaveCount(1);
  await expect(page.locator('.followup-lead-name')).toHaveText('Maya Chen');
  console.log('PASS keyboard View lead and Add lead, read-only detail/missing-record state, full list and functional lead search');

  await page.goto(base + '/admin');
  await expect(title()).toHaveText('Overview');
  const account = page.getByRole('button', { name: 'Account menu', exact: true });
  await account.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#account-menu')).toBeVisible();
  await expect(page.locator('#account-menu')).toContainText('Organization admin');
  await page.keyboard.press('Escape');
  await expect(page.locator('#account-menu')).toBeHidden();
  await expect(account).toBeFocused();
  await page.getByRole('button', { name: 'Search leads', exact: true }).click();
  await expect(page.locator('#lead-search-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#lead-search-panel')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Search leads', exact: true })).toBeFocused();
  console.log('PASS keyboard account/search panels, Escape dismissal and returned focus');

  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ['/', '/platform', '/admin/login', '/admin', '/admin/leads', '/admin/properties']) {
      await page.goto(base + route);
      await expectNoOverflow(route, width);
      if (route.startsWith('/admin') && route !== '/admin/login') await expect(title()).toBeVisible();
    }
    await page.goto(base + '/admin');
    await expect(title()).toHaveText('Overview');
    await expect(page.getByLabel('Metric period')).toBeVisible();
    await expect(page.locator('.followup-card')).toHaveCount(3);
    await page.screenshot({ path: `.local/screenshots/stage04-admin-${width === 390 ? 'mobile' : 'tablet'}.png`, fullPage: true });
    await page.locator('.admin-top-nav').getByRole('link', { name: 'Properties', exact: true }).click();
    await expect(title()).toHaveText('Properties');
    await expectNoOverflow('/admin/properties', width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + '/');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.locator('#public-navigation')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#public-navigation')).toBeHidden();
  await page.screenshot({ path: '.local/screenshots/home-mobile.png', fullPage: true });
  const animation = await page.locator('.floating-calendar').evaluate((element) => getComputedStyle(element).animationDuration);
  assert(['1e-05s', '0.00001s', '0s'].includes(animation), `Reduced motion ignored: ${animation}`);
  await page.goto(base + '/admin');
  await expect(title()).toHaveText('Overview');
  const menu = page.getByRole('button', { name: 'Workspace menu', exact: true });
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#admin-sidebar-nav')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'New inquiry', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'New inquiry', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('checkbox', { name: 'New inquiry', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'New inquiry', exact: true })).toBeFocused();
  await expect(page.locator('#admin-sidebar-nav')).toBeVisible();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page.getByLabel('Metric period').selectOption('week');
  await expect(page.getByLabel('Metric period')).toHaveValue('week');
  await expect(page.getByLabel('Metric period')).toBeFocused();
  await expect(page.locator('#admin-sidebar-nav')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'New inquiry', exact: true })).toBeChecked();
  await page.getByRole('checkbox', { name: 'New inquiry', exact: true }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'New inquiry', exact: true })).toBeFocused();
  await page.getByLabel('Metric period').selectOption('month');
  await expect(page.getByLabel('Metric period')).toHaveValue('month');
  await expect(page.locator('#admin-sidebar-nav')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#admin-sidebar-nav')).toBeHidden();
  await expect(menu).toBeFocused();
  await openAccountMenu();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(base + '/admin/login');
  await page.goto(base + '/admin');
  await expect(page).toHaveURL(/\/admin\/login/);
  console.log('PASS 390px/768px layouts, persistent keyboard mobile filters/period, screenshots, reduced motion and normal logout');

  const deepLink = '/admin/leads?lead=' + firstLead.id;
  for (const requestedReturn of [deepLink, 'https://example.invalid/admin/leads']) {
    await page.goto(base + (requestedReturn === deepLink ? deepLink : '/admin/login?returnTo=' + encodeURIComponent(requestedReturn)));
    await expect(page).toHaveURL(/\/admin\/login\?returnTo=/);
    const loginCountBefore = loginRequests;
    await page.getByRole('button', { name: 'Fill demo credentials', exact: true }).click();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
    assert.equal(loginRequests, loginCountBefore, 'Deep-link autofill still requires normal sign-in.');
    await page.getByRole('button', { name: 'Sign in to your workspace', exact: true }).click();
    await expect(page).toHaveURL(base + (requestedReturn === deepLink ? deepLink : '/admin'));
    if (requestedReturn === deepLink) await expect(page.locator('[data-lead-detail]')).toContainText(firstLead.email);
    else await expect(title()).toHaveText('Overview');
    await openAccountMenu();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(base + '/admin/login');
  }
  console.log('PASS masked normal sign-in preserves authorized deep-link queries and rejects external return URLs');

  // Public setup response is simulated only for this frontend error-state assertion.
  await page.route('**/api/config', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ databaseReady: false, demoEnabled: false, setupMessage: 'PostgreSQL is not configured. Set DATABASE_URL.' }) }));
  await page.goto(base + '/admin/login');
  await expect(page.locator('#login-setup')).toBeVisible();
  await expect(page.getByRole('button', { name: /Fill demo credentials/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Sign in to your workspace/ })).toBeDisabled();
  await page.unroute('**/api/config');
  await page.goto(base + '/admin/login');
  await expect(page.getByRole('button', { name: /Fill demo credentials/ })).toBeVisible();
  await page.screenshot({ path: '.local/screenshots/login-mobile.png', fullPage: true });
  assert.deepEqual(pageErrors, [], 'No browser JavaScript errors.');
  assert.deepEqual(externalRequests, [], 'Browser actions must not contact external services.');
  console.log('PASS honest setup/login state, no JavaScript errors and no external requests');
} finally {
  await context.close();
  await browser.close();
}
