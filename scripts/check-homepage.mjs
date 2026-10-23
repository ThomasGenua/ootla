import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// Stage 05 is public presentation work. These checks create no customer records,
// seed/reset no database, and revoke only the session opened by this browser.
const contrastOnly = process.argv.includes('--contrast-only');
const base = new URL(process.env.OOTLA_CHECK_URL || 'http://127.0.0.1:5173');
const browser = await chromium.launch({ headless: true, channel: process.env.OOTLA_BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 1586, height: 992 }, reducedMotion: 'no-preference' });
const page = await context.newPage();
const pageErrors = [];
const externalRequests = [];
const publicPrivateRequests = [];
let publicPhase = true;
let openedSession = false;
let loginRequests = 0;
page.on('pageerror', error => pageErrors.push(error.message));
page.on('request', request => {
  const url = new URL(request.url());
  if (url.origin !== base.origin && /^https?:$/.test(url.protocol)) externalRequests.push(url.origin + url.pathname);
  if (url.pathname === '/api/auth/login') loginRequests += 1;
  if (publicPhase && /^\/api\/(?:admin(?:\/|$)|demo(?:\/|$)|organizations(?:\/|$)|auth\/me(?:\/|$))/.test(url.pathname)) {
    publicPrivateRequests.push(url.pathname);
  }
});
const workflow = () => page.locator('#workflow');
const choose = index => page.locator(`[data-workflow-select="${index}"]`);
const step = index => page.locator(`[data-workflow-step="${index}"]`);
async function active(index) {
  await expect(workflow()).toHaveAttribute('data-workflow-active', String(index));
  for (let position = 0; position < 3; position += 1) {
    await expect(choose(position)).toHaveAttribute('aria-pressed', String(position === index));
    if (position === index) await expect(page.locator(`[data-workflow-panel="${position}"]`)).toBeVisible();
    else await expect(page.locator(`[data-workflow-panel="${position}"]`)).toBeHidden();
  }
}
async function scrollStep(index) {
  await step(index).evaluate(element => {
    const bounds = element.getBoundingClientRect();
    window.scrollBy({ top: bounds.top + bounds.height / 2 - innerHeight * 0.4, behavior: 'instant' });
  });
}
async function noOverflow(width) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1), `Homepage overflows horizontally at ${width}px.`);
}
async function geometry(width) {
  const result = await page.evaluate(() => {
    const preview = document.querySelector('.home-dashboard-preview.dashboard-preview');
    const copy = document.querySelector('.hero-copy');
    const area = document.querySelector('.hero-preview-area');
    if (!(preview instanceof HTMLElement) || !copy || !area) return null;
    const dashboard = preview.getBoundingClientRect();
    const text = copy.getBoundingClientRect();
    const frame = area.getBoundingClientRect();
    let clippingAncestor = false;
    for (let ancestor = preview.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const bounds = ancestor.getBoundingClientRect();
      if (['hidden', 'clip'].includes(getComputedStyle(ancestor).overflowX) && bounds.right <= innerWidth + 1) clippingAncestor = true;
    }
    return {
      dashboard: { x: dashboard.x, right: dashboard.right, y: dashboard.y, width: dashboard.width },
      text: { right: text.right, bottom: text.bottom },
      frame: { y: frame.y },
      renderedWidth: preview.offsetWidth,
      visibleShare: Math.max(0, Math.min(innerWidth, dashboard.right) - Math.max(0, dashboard.x)) / dashboard.width,
      clippingAncestor,
    };
  });
  assert(result, 'A coded, full-size public dashboard preview exists.');
  assert(result.dashboard.width >= 1450 && result.dashboard.width <= 1510, `Dashboard remains full size at ${width}px.`);
  assert(Math.abs(result.dashboard.width - result.renderedWidth) <= 1, `Dashboard is not scaled down at ${width}px.`);
  assert(result.dashboard.right > width, `Dashboard extends beyond the right edge at ${width}px.`);
  assert(result.clippingAncestor, `An actual clipping container contains the dashboard at ${width}px.`);
  if (width >= 1280) {
    assert(result.dashboard.x >= result.text.right + 10, `Desktop preview leaves the hero copy clear at ${width}px.`);
    assert(result.visibleShare >= 0.4 && result.visibleShare <= 0.6, `Approximately half the dashboard is visible at ${width}px (${Math.round(result.visibleShare * 100)}%).`);
  } else if (width <= 768) {
    assert(result.frame.y >= result.text.bottom - 1, `Mobile preview follows the hero copy at ${width}px.`);
  }
}
async function focusedOutline(locator) {
  const outline = await locator.evaluate(element => {
    const style = getComputedStyle(element);
    return { width: parseFloat(style.outlineWidth), style: style.outlineStyle, color: style.outlineColor };
  });
  assert(outline.width >= 2 && outline.style !== 'none' && outline.color !== 'rgba(0, 0, 0, 0)', 'Keyboard control has a visible focus indicator.');
}
async function publicTextContrast() {
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
    return [...document.querySelectorAll('.home-page *')].filter(element => {
      if (!(element instanceof HTMLElement) || element.closest('.home-dashboard-preview, [aria-hidden="true"]')) return false;
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
      return { selector: element.className || element.tagName.toLowerCase(), text: element.textContent.trim().replace(/\s+/g, ' ').slice(0, 70), ratio: (values[0] + 0.05) / (values[1] + 0.05), minimum: large ? 3 : 4.5, size, color: style.color, background: background.slice(0, 3).map(Math.round) };
    });
  });
}
function expectReadableText(rows) {
  assert(rows.length >= 100, 'The public examples and disclosures have been checked against their actual backgrounds.');
  const failures = rows.filter(row => row.ratio < row.minimum);
  const summary = [...new Set(failures.map(row => row.selector + ': ' + row.text + ' (' + row.ratio.toFixed(2) + ':1)'))].join('; ');
  assert.equal(failures.length, 0, 'Public text contrast failures: ' + summary);
}
await mkdir('.local/screenshots', { recursive: true });
try {
  if (contrastOnly) {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const results = [];
    for (const width of [1586, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 992 });
      await page.goto(base.href);
      await page.evaluate(() => document.fonts.ready);
      const rows = await publicTextContrast();
      results.push(...rows);
      console.log(JSON.stringify({ width, checked: rows.length, minimumSmallTextRatio: Number(Math.min(...rows.filter(row => row.minimum === 4.5).map(row => row.ratio)).toFixed(2)), failures: rows.filter(row => row.ratio < row.minimum) }));
      await page.screenshot({ path: '.local/screenshots/stage05-home-' + (width === 390 ? 'mobile' : 'desktop') + '.png', fullPage: true, animations: 'disabled' });
      await page.locator('.home-hero').screenshot({ path: '.local/screenshots/stage05-home-' + (width === 390 ? 'mobile' : 'desktop') + '-hero.png', animations: 'disabled' });
      await page.locator('#resident-ai').screenshot({ path: '.local/screenshots/stage05-home-' + (width === 390 ? 'mobile' : 'desktop') + '-resident.png', animations: 'disabled' });
      for (const index of [1, 2]) {
        await choose(index).click();
        await active(index);
        results.push(...await publicTextContrast());
      }
      if (width === 1586) {
        await page.locator('.home-workflow .workflow-stage').screenshot({ path: '.local/screenshots/stage05-home-workflow.png', animations: 'disabled' });
      }
    }
    expectReadableText(results);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(publicPrivateRequests, []);
    console.log('PASS focused public text contrast at desktop/mobile, all workflow panels and refreshed review captures; no sign-in or database changes.');
  } else {
  await page.goto(base.href);
  await expect(page.locator('.hero-copy h1')).toHaveText('Keep leads moving. Keep people informed.', { useInnerText: true });
  await expect(page.locator('.hero-copy > p')).toHaveText('Ootla brings your pipeline, AI assistance and daily property work into one clear workspace.');
  await expect(page.locator('.home-page')).toHaveCount(1);
  await expect(page.locator('.home-dashboard-preview')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.home-dashboard-preview')).toHaveAttribute('inert', '');
  const typography = await page.locator('.hero-copy').evaluate(element => ({
    heading: getComputedStyle(element.querySelector('h1')).fontWeight,
    body: getComputedStyle(element.querySelector('p')).fontWeight,
  }));
  assert.deepEqual(typography, { heading: '500', body: '400' });
  assert(await page.locator('.home-hero .floating-icon').count() <= 3, 'The hero has at most three restrained floating icons.');
  for (const id of ['resident-ai', 'staff-reminders', 'viewing-calendar', 'applicant-review', 'yardi-ready', 'standalone-import']) {
    const band = page.locator('#' + id);
    await expect(band).toHaveCount(1);
    await expect(band.locator('h2')).toHaveCount(1);
    assert(await band.locator('.example-label').count() > 0, `The ${id} visual is labeled as an example.`);
  }
  const bands = await page.locator('.home-band').evaluateAll(elements => elements.map(element => ({ id: element.id, color: getComputedStyle(element).backgroundColor })));
  assert(bands.length >= 6, 'The six feature examples have separate sections.');
  for (let index = 1; index < bands.length; index += 1) assert.notEqual(bands[index - 1].color, bands[index].color, `Section backgrounds alternate at ${bands[index].id}.`);
  for (const name of ['Maya Chen', 'Jordan Ellis', 'Priya Shah']) await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  await expect(page.locator('#applicant-review')).toContainText(/staff|human/i);
  await expect(page.locator('#yardi-ready')).toContainText(/authoritative|source of truth/i);
  await expect(page.locator('#viewing-calendar')).toContainText('Google Calendar');
  await expect(page.locator('#standalone-import')).toContainText(/import/i);
  expectReadableText(await publicTextContrast());
  console.log('PASS exact headline/copy, lighter typography, six alternating labeled examples and no private lead data');

  const links = await page.locator('a[href]').evaluateAll(elements => elements.map(element => ({ href: element.getAttribute('href'), text: element.textContent.trim() })));
  for (const link of links) {
    assert(link.href && link.href !== '#', `Link has a useful destination: ${link.text}`);
    const destination = new URL(link.href, base);
    if (destination.origin !== base.origin) continue;
    if (destination.pathname === '/' && destination.hash) await expect(page.locator(destination.hash)).toHaveCount(1);
  }
  const publicDestinations = [...new Set(links.map(link => new URL(link.href, base).pathname).filter(path => path !== '/' && !path.startsWith('/admin/')))].sort();
  for (const path of publicDestinations) {
    const response = await page.request.get(new URL(path, base).href);
    assert.equal(response.status(), 200, `Linked public destination ${path} is available.`);
  }
  const signIn = page.getByRole('link', { name: /^Sign in\b/i }).first();
  const explore = page.getByRole('link', { name: /^Explore demo\b/i }).first();
  await expect(signIn).toHaveAttribute('href', '/admin/login');
  await expect(explore).toHaveAttribute('href', '/admin/login');
  await signIn.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new URL('/admin/login', base).href);
  await expect(page.locator('#login-form')).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  await page.goto(base.href);
  await explore.click();
  await expect(page).toHaveURL(new URL('/admin/login', base).href);
  await page.goto(base.href);
  await page.locator('a[href="#workflow" ]').click();
  await expect(page).toHaveURL(new URL('/#workflow', base).href);
  await expect.poll(async () => (await workflow().boundingBox())?.y ?? Infinity).toBeLessThan(130);
  await page.goto(new URL('/admin/login', base).href);
  console.log('PASS public links and keyboard Sign in/Explore demo reach the real masked-password login');

  publicPhase = false;
  await expect(page.getByRole('button', { name: /Fill demo credentials/ })).toBeVisible();
  const countBefore = loginRequests;
  await page.getByRole('button', { name: /Fill demo credentials/ }).click();
  assert.equal(loginRequests, countBefore, 'Demo fill does not bypass normal sign-in.');
  openedSession = true;
  await page.getByRole('button', { name: /Sign in to your workspace/ }).click();
  await expect(page).toHaveURL(new URL('/admin', base).href);
  await expect(page.locator('.admin-header-body h1')).toHaveText('Overview');
  await expect(page.locator('.summary-metric')).toHaveCount(4);
  await expect(page.locator('.followup-card')).toHaveCount(3);
  await expect(page.locator('.followup-lead-name')).toHaveText(['Maya Chen', 'Jordan Ellis', 'Priya Shah']);
  publicPhase = true;
  await page.goto(base.href);
  await expect(page.locator('.hero-copy h1')).toBeVisible();
  for (const name of ['Maya Chen', 'Jordan Ellis', 'Priya Shah']) await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  assert.deepEqual(publicPrivateRequests, [], 'Public pages never request staff data, including with a valid staff cookie.');
  console.log('PASS real protected dashboard remains available; public homepage stays private-data-free with a staff session');

  for (const width of [320, 390, 768, 1280, 1440, 1586, 1920]) {
    await page.setViewportSize({ width, height: width <= 768 ? 844 : 992 });
    await page.goto(base.href);
    await expect(page.locator('.hero-copy h1')).toBeVisible();
    await noOverflow(width);
    await geometry(width);
    if (width === 390 || width === 1586) {
      await page.screenshot({ path: `.local/screenshots/stage05-home-${width === 390 ? 'mobile' : 'desktop'}.png`, fullPage: true, animations: 'disabled' });
      await page.locator('.home-hero').screenshot({ path: `.local/screenshots/stage05-home-${width === 390 ? 'mobile' : 'desktop'}-hero.png`, animations: 'disabled' });
    }
  }
  console.log('PASS unscaled 1480px dashboard crop, clear text and no horizontal overflow at 320/390/768/1280/1440/1586/1920px');

  await page.setViewportSize({ width: 1586, height: 992 });
  await page.goto(base.href);
  await choose(0).click();
  await active(0);
  const announcements = page.locator('[data-workflow-announcement]');
  await expect(announcements).toHaveAttribute('role', 'status');
  await choose(0).focus();
  await page.keyboard.press('ArrowRight');
  await active(1);
  await expect(choose(1)).toBeFocused();
  await focusedOutline(choose(1));
  await page.keyboard.press('End');
  await active(2);
  await expect(choose(2)).toBeFocused();
  await page.keyboard.press('Home');
  await active(0);
  await expect(choose(0)).toBeFocused();
  await choose(1).focus();
  await page.keyboard.press('Space');
  await active(1);
  await choose(2).focus();
  await page.keyboard.press('Enter');
  await active(2);
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  const beforeScrollAnnouncement = await announcements.textContent();
  // A manual choice deliberately persists until an actual viewport movement.
  await scrollStep(2);
  await active(2);
  await scrollStep(0);
  await active(0);
  await scrollStep(1);
  await active(1);
  await scrollStep(2);
  await active(2);
  assert.equal(await announcements.textContent(), beforeScrollAnnouncement, 'Automatic scroll updates do not spam screen-reader announcements.');
  await page.screenshot({ path: '.local/screenshots/stage05-home-workflow.png', animations: 'disabled' });
  console.log('PASS scroll-driven workflow, native click/Space/Enter, arrow/Home/End controls and quiet scroll announcements');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(workflow()).toHaveAttribute('data-workflow-motion', 'manual');
  assert.equal(await page.locator('.home-workflow .workflow-stage').evaluate(element => getComputedStyle(element).position), 'static');
  await choose(2).click();
  await active(2);
  await scrollStep(0);
  await expect(workflow()).toHaveAttribute('data-workflow-active', '2');
  const animationDurations = await page.locator('.floating-icon').evaluateAll(elements => elements.map(element => getComputedStyle(element).animationDuration));
  assert(animationDurations.every(duration => duration.split(',').every(part => parseFloat(part) <= 0.001)), 'Reduced motion disables floating animation.');
  await choose(0).click();
  await active(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await scrollStep(1);
  await active(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  console.log('PASS runtime reduced-motion preference disables automatic selection/sticky motion; manual controls remain useful');
  await page.goto(new URL('/platform', base).href);
  await expect(page.locator('#main-content h1')).toBeVisible();
  await page.getByRole('link', { name: 'Ootla', exact: true }).first().click();
  await expect(page).toHaveURL(base.href);
  await choose(1).click();
  await active(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base.href);
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#public-navigation')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#public-navigation')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused();
  await choose(2).click();
  await active(2);
  await noOverflow(390);
  assert.deepEqual(pageErrors, [], 'No browser JavaScript errors occurred.');
  assert.deepEqual(externalRequests, [], 'No third-party requests, provider calls or external assets were used.');
  assert.deepEqual(publicPrivateRequests, [], 'Public presentation never requests staff records.');
  console.log('PASS SPA workflow remount, manual mobile workflow, keyboard mobile navigation and no browser/external/private-data requests');
  console.log('Stage 05 homepage: all seven focused browser groups passed.');
}
} finally {
  if (openedSession) {
    const response = await context.request.post(new URL('/api/auth/logout', base).href, { headers: { Origin: base.origin } }).catch(() => null);
    if (!response || response.status() !== 204) {
      console.error('Cleanup: browser-owned sign-in session could not be revoked.');
      process.exitCode = 1;
    }
  }
  await browser.close();
}









