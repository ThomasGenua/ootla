import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// Stage 05a public-only checks: no sign-in, database writes, seed/reset,
// provider actions, model requests, uploads or saved visitor data.
const base = new URL(process.env.OOTLA_CHECK_URL || 'http://127.0.0.1:5173');
const browser = await chromium.launch({ headless: true, channel: process.env.OOTLA_BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 1586, height: 992 }, reducedMotion: 'no-preference' });
const page = await context.newPage();
page.setDefaultTimeout(10000);
const pageErrors = [];
const externalRequests = [];
const publicApiRequests = [];
const outboundRequests = [];
let publicPhase = true;
page.on('pageerror', error => pageErrors.push(error.message));
page.on('request', request => {
  const url = new URL(request.url());
  if (/^https?:$/.test(url.protocol) && url.origin !== base.origin) externalRequests.push(url.origin + url.pathname);
  if (publicPhase && url.pathname.startsWith('/api/')) publicApiRequests.push(url.pathname);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) outboundRequests.push(request.method() + ' ' + url.pathname);
});
const routes = [
  { path: '/ai-workflows', slug: 'ai', words: [/conversation/i, /service request/i, /staff/i, /history/i, /prospect|viewing/i] },
  { path: '/workflows/leasing', slug: 'leasing', words: [/inquiry|enquiry/i, /viewing/i, /application/i, /staff review/i] },
  { path: '/workflows/resident-support', slug: 'resident-support', words: [/request/i, /assign/i, /update/i, /renewal/i, /payment/i, /provider/i] },
];
const demo = () => page.locator('#ai-demonstrations.ai-demo');
const scenario = name => demo().locator('[data-demo-scenario="' + name + '"]');
const next = () => demo().locator('[data-demo-next]');
const replay = () => demo().locator('[data-demo-replay]');
async function go(path) {
  const response = await page.goto(new URL(path, base).href);
  assert.equal(response?.status(), 200, 'Direct navigation loads ' + path);
  await expect(page.locator('#main-content h1')).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
}
async function noOverflow(width, path) {
  const geometry = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: innerWidth,
    offending: [...document.querySelectorAll('#main-content *')].filter(element => {
      if (!(element instanceof HTMLElement) || element.closest('[hidden],[aria-hidden="true"],.sr-only,.visually-hidden')) return false;
      const style = getComputedStyle(element);
      if (style.clip !== 'auto' || style.clipPath !== 'none') return false;
      const bounds = element.getBoundingClientRect();
      return bounds.width > 0 && (bounds.right > innerWidth + 1 || bounds.left < -1);
    }).slice(0, 5).map(element => element.className || element.tagName),
  }));
  assert(geometry.document <= geometry.viewport + 1, path + ' overflows at ' + width + 'px: ' + JSON.stringify(geometry));
  assert.deepEqual(geometry.offending, [], path + ' has clipped or off-screen public content at ' + width + 'px.');
}
async function focusedOutline(locator) {
  const result = await locator.evaluate(element => {
    const style = getComputedStyle(element);
    return { width: parseFloat(style.outlineWidth), style: style.outlineStyle, color: style.outlineColor };
  });
  assert(result.width >= 2 && result.style !== 'none' && result.color !== 'rgba(0, 0, 0, 0)', 'A visible keyboard focus indicator is present.');
}
async function renderedContrast() {
  return page.evaluate(() => {
    const rgba = value => {
      const channels = value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
      return [channels[0], channels[1], channels[2], channels[3] ?? 1];
    };
    const composite = (foreground, background) => [
      ...foreground.slice(0, 3).map((channel, index) => channel * foreground[3] + background[index] * (1 - foreground[3])), 1,
    ];
    const luminance = color => color.slice(0, 3).map(channel => channel / 255)
      .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    return [...document.querySelectorAll('.public-detail-page *')].filter(element => {
      if (!(element instanceof HTMLElement) || element.closest('[hidden],[aria-hidden="true"]')) return false;
      const bounds = element.getBoundingClientRect();
      return bounds.width > 1 && bounds.height > 1 && element.getClientRects().length > 0
        && [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    }).map(element => {
      const ancestry = [];
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) ancestry.unshift(ancestor);
      const background = ancestry.reduce((color, ancestor) => composite(rgba(getComputedStyle(ancestor).backgroundColor), color), [255, 255, 255, 1]);
      const style = getComputedStyle(element);
      const foreground = composite(rgba(style.color), background);
      const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      const size = parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.67 && Number(style.fontWeight) >= 700);
      return {
        selector: element.className || element.tagName.toLowerCase(),
        text: element.textContent.trim().replace(/\s+/g, ' ').slice(0, 65),
        ratio: (values[0] + 0.05) / (values[1] + 0.05), minimum: large ? 3 : 4.5,
      };
    });
  });
}
function expectContrast(rows, label) {
  assert(rows.length >= 30, label + ' has a useful rendered-text sample.');
  const failures = rows.filter(row => row.ratio < row.minimum);
  assert.equal(failures.length, 0, label + ' text contrast failures: ' + failures.map(row => row.selector + ': ' + row.text + ' (' + row.ratio.toFixed(2) + ':1)').join('; '));
}
async function checkPublicStructure(route) {
  await go(route.path);
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('.public-detail-page')).toHaveCount(1);
  await expect(page.locator('.dashboard-preview,.home-dashboard-preview,.admin-dashboard')).toHaveCount(0);
  const text = await page.locator('#main-content').innerText();
  for (const word of route.words) assert.match(text, word, route.path + ' explains ' + word);
  assert.match(text, /example|illustrat|scripted/i, route.path + ' labels its public examples.');
  assert.match(text, /no live|not connected|not.*live|awaiting.*configuration|scripted/i, route.path + ' explains its implementation boundary.');
  for (const name of ['Maya Chen', 'Jordan Ellis', 'Priya Shah']) await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  const headingWeight = await page.locator('#main-content h1').evaluate(element => getComputedStyle(element).fontWeight);
  assert.equal(headingWeight, '500', 'Public heading stays at the approved lighter weight.');
  const links = await page.locator('a[href]').evaluateAll(elements => elements.map(element => ({ href: element.getAttribute('href'), text: element.textContent.trim() })));
  for (const link of links) {
    assert(link.href && link.href !== '#', 'Every public link has a useful destination: ' + link.text);
    const target = new URL(link.href, base);
    assert.equal(target.origin, base.origin, 'No public example links to an external action.');
    if (target.pathname === route.path && target.hash) assert(await page.locator(target.hash).count() === 1, 'Local anchor target exists: ' + target.hash);
  }
  await expect(page.locator('.site-header').getByRole('link', { name: /^Sign in$/i })).toHaveAttribute('href', '/admin/login');
  await expect(page.locator('.site-header').getByRole('link', { name: /^Explore demo\b/i })).toHaveAttribute('href', '/admin/login');
  const ids = await page.locator('[id]').evaluateAll(elements => elements.map(element => element.id));
  assert.equal(new Set(ids).size, ids.length, route.path + ' does not duplicate DOM IDs.');
}
await mkdir('.local/screenshots', { recursive: true });
try {
  for (const route of routes) {
    await checkPublicStructure(route);
    await page.reload();
    await expect(page.locator('.public-detail-page h1')).toBeVisible();
  }
  console.log('PASS three complete public routes, direct refresh, lighter headings, distinct labeled examples, honest boundaries and real login links');

  await go('/ai-workflows');
  const workflowMenu = page.locator('.site-header .public-workflow-menu');
  const summary = workflowMenu.locator('summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(workflowMenu).toHaveAttribute('open', '');
  await summary.press('Tab');
  await expect(workflowMenu.getByRole('link', { name: /^Leasing\b/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new URL('/workflows/leasing', base).href);
  await expect(page.locator('#main-content')).toBeFocused();
  await page.locator('.site-header .public-workflow-menu summary').focus();
  await page.keyboard.press('Space');
  await expect(workflowMenu).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(workflowMenu).not.toHaveAttribute('open', '');
  await expect(page.locator('.site-header .public-workflow-menu summary')).toBeFocused();
  await page.locator('#main-content a[href="/workflows/resident-support"]').first().click();
  await expect(page).toHaveURL(new URL('/workflows/resident-support', base).href);
  await page.locator('.site-header a[href="/ai-workflows"]').click();
  await expect(page).toHaveURL(new URL('/ai-workflows', base).href);
  await page.setViewportSize({ width: 390, height: 844 });
  await go('/ai-workflows');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#public-navigation')).toBeVisible();
  await summary.focus();
  await page.keyboard.press('Space');
  await expect(workflowMenu).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(workflowMenu).not.toHaveAttribute('open', '');
  await expect(summary).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#public-navigation')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 1586, height: 992 });
  for (const name of [/^Sign in$/i, /^Explore demo\b/i]) {
    await go('/ai-workflows');
    publicPhase = false;
    const configResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/config');
    await page.locator('.site-header').getByRole('link', { name }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new URL('/admin/login', base).href);
    await expect(page.locator('#login-form')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
    assert.equal((await configResponse).status(), 200, 'The real login loads backend configuration without sign-in.');
    publicPhase = true;
  }
  await go('/workflows/leasing');
  await page.locator('#main-content a[href="/ai-workflows#ai-demonstrations"]').click();
  await expect(page).toHaveURL(new URL('/ai-workflows#ai-demonstrations', base).href);
  await expect(demo()).toBeFocused();
  await expect.poll(async () => Math.abs((await demo().boundingBox())?.y ?? Infinity)).toBeLessThan(130);
  await go('/workflows/resident-support');
  await go('/ai-workflows#ai-demonstrations');
  await expect.poll(async () => Math.abs((await demo().boundingBox())?.y ?? Infinity)).toBeLessThan(130);
  console.log('PASS desktop/mobile native workflow navigation, keyboard links, Escape focus return, cross-page fragment focus, direct fragment scroll and real masked-password login destinations');

  await page.setViewportSize({ width: 1586, height: 992 });
  await go('/ai-workflows');
  await expect(demo()).toHaveAttribute('data-demo-total', '5');
  await expect(demo()).toContainText(/scripted public|public demonstration/i);
  await expect(demo()).toContainText(/no.*(?:outbound|real|live)/i);
  await expect(demo().locator('input,textarea,form')).toHaveCount(0);
  const record = () => demo().locator('[data-demo-record]');
  const task = () => demo().locator('[data-demo-task]');
  const history = () => demo().locator('[data-demo-history] li');
  const conversation = () => demo().locator('[data-demo-conversation]');
  async function active(name, step) {
    await expect(demo()).toHaveAttribute('data-demo-scenario', name);
    await expect(demo()).toHaveAttribute('data-demo-step', String(step));
    for (const key of ['resident', 'reminders', 'viewing']) {
      await expect(scenario(key)).toHaveAttribute('aria-pressed', String(key === name));
    }
    await expect(history()).toHaveCount(step + 1);
    await expect(record()).toHaveCount(step >= 3 ? 1 : 0);
    await expect(task()).toHaveCount(step === 4 ? 1 : 0);
    if (step === 4) await expect(next()).toBeDisabled();
    else await expect(next()).toBeEnabled();
    await expect(replay()).toBeEnabled();
  }
  async function completed(name) {
    await scenario(name).click();
    await active(name, 0);
    const initial = await demo().locator('[data-demo-content]').innerText();
    let previousHistory = await history().allTextContents();
    for (let step = 1; step < 5; step += 1) {
      await next().click();
      await active(name, step);
      const currentHistory = await history().allTextContents();
      assert.deepEqual(currentHistory.slice(0, step), previousHistory, name + ' retains prior history without adding future steps.');
      previousHistory = currentHistory;
      if (name === 'resident') {
        await expect(conversation()).toContainText('My bathroom fan has stopped working.');
        await expect(conversation()).toContainText(/which room/i);
        if (step >= 2) {
          await expect(conversation()).toContainText(/Thursday/);
          await expect(conversation()).toContainText(/14:00.*16:00/);
        }
        if (step >= 3) {
          await expect(record()).toContainText('Awaiting assignment');
          await expect(record()).toContainText('Unassigned');
          await expect(record()).toContainText('Not scheduled');
          await expect(record()).toContainText(/requested access/i);
        }
      }
      if (name === 'viewing' && step >= 3) {
        await expect(record()).toContainText(/awaiting staff confirmation/i);
        await expect(demo()).toContainText(/no calendar invite sent/i);
      }
    }
    if (name !== 'resident') await expect(conversation()).not.toContainText('My bathroom fan has stopped working.');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: '.local/screenshots/stage05a-scenario-' + name + '-complete.png', fullPage: true, animations: 'disabled' });
    expectContrast(await renderedContrast(), 'Completed ' + name + ' scenario');
    await replay().click();
    await active(name, 0);
    assert.equal(await demo().locator('[data-demo-content]').innerText(), initial, name + ' replay resets conversation, record, task and history together.');
  }
  for (const name of ['resident', 'reminders', 'viewing']) await completed(name);
  await scenario('resident').click();
  await next().click();
  await next().click();
  await next().click();
  await next().click();
  await active('resident', 4);
  await scenario('reminders').click();
  await active('reminders', 0);
  await expect(conversation()).not.toContainText('My bathroom fan has stopped working.');
  console.log('PASS all fifteen scripted states, cumulative action history, record/task timing, requested access without technician appointment, pending viewing and clean replay/switch');

  await scenario('resident').focus();
  await page.keyboard.press('ArrowRight');
  await active('reminders', 0);
  await expect(scenario('reminders')).toBeFocused();
  await focusedOutline(scenario('reminders'));
  await page.keyboard.press('End');
  await active('viewing', 0);
  await expect(scenario('viewing')).toBeFocused();
  await page.keyboard.press('Home');
  await active('resident', 0);
  await expect(scenario('resident')).toBeFocused();
  await scenario('reminders').focus();
  await page.keyboard.press('Space');
  await active('reminders', 0);
  await next().focus();
  await page.keyboard.press('Enter');
  await active('reminders', 1);
  await expect(next()).toBeFocused();
  await focusedOutline(next());
  await page.keyboard.press('Space');
  await active('reminders', 2);
  await page.keyboard.press('Enter');
  await active('reminders', 3);
  await page.keyboard.press('Space');
  await active('reminders', 4);
  await expect(replay()).toBeFocused();
  await page.keyboard.press('Enter');
  await active('reminders', 0);
  await expect(replay()).toBeFocused();
  await expect(demo().locator('[data-demo-announcement]')).toHaveAttribute('role', 'status');
  await expect(demo().locator('[data-demo-announcement]')).not.toBeEmpty();
  await expect(demo().locator('[data-demo-content]')).not.toHaveAttribute('aria-live', 'assertive');
  console.log('PASS native Space/Enter, selector arrow/Home/End keys, retained/completion focus and concise non-assertive screen-reader status');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), 'Runtime reduced-motion emulation is active.');
  await scenario('resident').click();
  await next().click();
  await active('resident', 1);
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await active('resident', 1);
  await next().click();
  await active('resident', 2);
  await replay().click();
  await active('resident', 0);
  const animation = await demo().locator('*').evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element);
    return { duration: style.animationDuration, transition: style.transitionDuration };
  }));
  assert(animation.every(value => [value.duration, value.transition].every(durations => durations.split(',').every(duration => parseFloat(duration) <= 0.001))), 'Reduced motion removes scenario animation and transition durations.');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await next().click();
  await active('resident', 1);
  console.log('PASS runtime reduced motion, manual advancement/replay and stable scenarios while scrolling');


  const contrastSamples = [];
  for (const route of routes) {
    for (const width of [320, 390, 768, 1280, 1586]) {
      await page.setViewportSize({ width, height: width <= 768 ? 844 : 992 });
      await go(route.path);
      await noOverflow(width, route.path);
      if (route.path === '/ai-workflows' && width <= 390) {
        await scenario('resident').click();
        for (let step = 1; step < 5; step += 1) await next().click();
        await active('resident', 4);
        await noOverflow(width, route.path + ' completed resident scenario');
        const conversationBounds = await conversation().boundingBox();
        const recordBounds = await record().boundingBox();
        assert(conversationBounds && recordBounds && recordBounds.y >= conversationBounds.y + conversationBounds.height - 1, 'The resident request stacks below its conversation on mobile.');
      }
      if (width === 390 || width === 1586) {
        const rows = await renderedContrast();
        expectContrast(rows, route.path + ' at ' + width + 'px');
        contrastSamples.push(...rows);
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.screenshot({ path: '.local/screenshots/stage05a-' + route.slug + '-' + (width === 390 ? 'mobile' : 'desktop') + '.png', fullPage: true, animations: 'disabled' });
      }
    }
  }
  console.log('PASS all three pages at 320/390/768/1280/1586px without overflow; desktop/mobile screenshots and ' + contrastSamples.length + ' rendered contrast samples');

  await go('/ai-workflows');
  await scenario('resident').click();
  await next().click();
  await page.locator('#main-content a[href="/workflows/leasing"]').first().click();
  await expect(page).toHaveURL(new URL('/workflows/leasing', base).href);
  await page.locator('.site-header a[href="/ai-workflows"]').click();
  await expect(page).toHaveURL(new URL('/ai-workflows', base).href);
  await expect(demo()).toHaveAttribute('data-demo-step', '0');
  await next().click();
  await expect(demo()).toHaveAttribute('data-demo-step', '1');
  const storage = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
  assert.deepEqual(storage, { local: [], session: [] }, 'Public scripts do not persist visitor/demo data in browser storage.');
  assert.deepEqual(await context.cookies(), [], 'Public scripts do not create session cookies.');
  assert.deepEqual(pageErrors, [], 'No browser JavaScript errors occurred.');
  assert.deepEqual(externalRequests, [], 'No remote asset, provider or model call occurred.');
  assert.deepEqual(publicApiRequests, [], 'Public pages and scenario controls never request staff or backend data.');
  assert.deepEqual(outboundRequests, [], 'No form, communication, upload or mutating request occurred.');
  console.log('PASS SPA scenario cleanup/remount, no browser errors, saved visitor state, cookies, private API calls, provider requests or outbound actions');
  console.log('Stage 05a public workflow checks completed.');
} finally {
  await browser.close();
}

