import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// Stage 05b, public-only: existing local server; no sign-in, database mutation,
// provider actions, contact submission, visitor persistence or external services.
const base = new URL(process.env.OOTLA_CHECK_URL || 'http://127.0.0.1:5173');
const expectedContactEmail = process.env.OOTLA_EXPECTED_CONTACT_EMAIL || 'hello@ootla.ai'; // Confirmed by the project owner for Stage 05b.
const contactOnly = process.argv.includes('--contact-only');
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
const integrationIds = ['yardi-records', 'google-calendar', 'google-analytics', 'customer-import', 'applicant-portal', 'maintenance-coordination', 'payment-handoff'];
const knownRoutes = new Set(['/', '/platform', '/integrations', '/ai-workflows', '/workflows/leasing', '/workflows/resident-support', '/contact', '/privacy', '/admin/login']);
const routes = [
  { path: '/integrations', slug: 'integrations', words: [/licensed (?:Yardi )?interfaces/i, /permissions/i, /configuration/i, /Google Calendar/i, /Google Analytics/i, /customer history/i, /applicant/i, /maintenance/i, /payment/i] },
  { path: '/platform', slug: 'platform', words: [/leads/i, /viewings/i, /applications/i, /operations/i, /staff/i] },
  { path: '/contact', slug: 'contact', words: [/contact/i] },
  { path: '/privacy', slug: 'privacy', words: [/privacy/i, /demo|example|public/i] },
];
const selector = () => page.locator('[data-onboarding-demo]');
const pathButton = name => selector().locator('[data-onboarding-path="' + name + '"]');
const pathContent = () => selector().locator('[data-onboarding-content]');
async function go(path) {
  publicPhase = !new URL(path, base).pathname.startsWith('/admin/');
  const response = await page.goto(new URL(path, base).href);
  assert.equal(response?.status(), 200, 'Direct navigation loads ' + path);
  await expect(page.locator('#main-content h1')).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
}
async function noOverflow(width, path) {
  const geometry = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth, viewport: innerWidth,
    offending: [...document.querySelectorAll('#main-content *')].filter(element => {
      if (!(element instanceof HTMLElement) || element.closest('[hidden],[aria-hidden="true"],.sr-only,.visually-hidden')) return false;
      const style = getComputedStyle(element);
      if (style.clip !== 'auto' || style.clipPath !== 'none') return false;
      const bounds = element.getBoundingClientRect();
      return bounds.width > 0 && (bounds.right > innerWidth + 1 || bounds.left < -1);
    }).slice(0, 5).map(element => element.className || element.tagName),
  }));
  assert(geometry.document <= geometry.viewport + 1, path + ' overflows at ' + width + 'px: ' + JSON.stringify(geometry));
  assert.deepEqual(geometry.offending, [], path + ' has clipped or off-screen content at ' + width + 'px.');
}
async function focusOutline(locator) {
  const style = await locator.evaluate(element => {
    const value = getComputedStyle(element);
    return { width: parseFloat(value.outlineWidth), style: value.outlineStyle, color: value.outlineColor };
  });
  assert(style.width >= 2 && style.style !== 'none' && style.color !== 'rgba(0, 0, 0, 0)', 'A visible keyboard focus indicator is present.');
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
      return { selector: element.className || element.tagName.toLowerCase(), text: element.textContent.trim().replace(/\s+/g, ' ').slice(0, 70), ratio: (values[0] + 0.05) / (values[1] + 0.05), minimum: large ? 3 : 4.5 };
    });
  });
}
function checkContrast(rows, label) {
  assert(rows.length >= 8, label + ' has a useful rendered-text sample.');
  const failures = rows.filter(row => row.ratio < row.minimum);
  assert.equal(failures.length, 0, label + ' contrast failures: ' + failures.map(row => row.selector + ': ' + row.text + ' (' + row.ratio.toFixed(2) + ':1)').join('; '));
}
async function activePath(name) {
  for (const key of ['yardi', 'standalone']) await expect(pathButton(key)).toHaveAttribute('aria-pressed', String(name === key));
  await expect(pathContent()).toContainText(name === 'yardi' ? /Yardi-connected/i : /Standalone/i);
  if (name === 'yardi') {
    await expect(pathContent()).toContainText(/licens/i);
    await expect(pathContent()).toContainText(/permission/i);
  } else {
    await expect(pathContent()).toContainText(/history|customer/i);
    await expect(pathContent()).toContainText(/mapping|map|review/i);
  }
}
await mkdir('.local/screenshots', { recursive: true });
try {
  if (contactOnly) {
    await go('/contact');
    const email = () => page.getByRole('link', { name: expectedContactEmail, exact: true });
    await expect(page.locator('#main-content h2').first()).toHaveText('Contact Ootla');
    await expect(email()).toHaveAttribute('href', 'mailto:' + expectedContactEmail);
    await expect(page.locator('#main-content')).not.toContainText(/contact details awaiting confirmation|contact channel is not yet available/i);
    await expect(page.locator('#main-content form')).toHaveCount(0);
    await email().focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(email()).toBeFocused();
    await focusOutline(email());
    // A verified mailto is inspected/focused only. Never activate it or open a mail client.
    await go('/privacy');
    await page.locator('#main-content a[href="/contact"]').click();
    await expect(page).toHaveURL(new URL('/contact', base).href);
    await expect(page.locator('#main-content')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(email()).toBeFocused();
    await expect(email()).toHaveAttribute('href', 'mailto:' + expectedContactEmail);
    let samples = 0;
    for (const width of [320, 390, 1586]) {
      await page.setViewportSize({ width, height: width <= 390 ? 844 : 992 });
      await go('/contact');
      await noOverflow(width, '/contact with verified email');
      const rows = await renderedContrast();
      checkContrast(rows, 'Configured Contact at ' + width + 'px');
      samples += rows.length;
      if (width !== 320) {
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.screenshot({ path: '.local/screenshots/stage05b-contact-' + (width === 390 ? 'mobile' : 'desktop') + '.png', fullPage: true, animations: 'disabled' });
      }
    }
    const storage = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
    assert.deepEqual(storage, { local: [], session: [] });
    assert.deepEqual(await context.cookies(), []);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(publicApiRequests, []);
    assert.deepEqual(outboundRequests, []);
    assert.equal(context.pages().length, 1, 'No mail client, new window or external action is opened.');
    console.log('PASS verified Contact email href (not activated), keyboard Tab/focus, Privacy cross-link and no contact placeholder/form');
    console.log('PASS configured Contact at 320/390/1586px with ' + samples + ' passing contrast samples and refreshed desktop/mobile captures');
    console.log('PASS no browser errors, private/API/provider/outbound requests, storage, cookies, contact submissions or mail activation');
    console.log('Stage 05b Contact-only follow-up completed.');
  } else {
  for (const route of routes) {
    await go(route.path);
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('.public-detail-page')).toHaveCount(1);
    await expect(page.locator('.dashboard-preview,.home-dashboard-preview,.admin-dashboard')).toHaveCount(0);
    const text = await page.locator('#main-content').innerText();
    for (const word of route.words) assert.match(text, word, route.path + ' explains ' + word);
    for (const name of ['Maya Chen', 'Jordan Ellis', 'Priya Shah']) await expect(page.getByText(name, { exact: true })).toHaveCount(0);
    assert.equal(await page.locator('#main-content h1').evaluate(element => getComputedStyle(element).fontWeight), '500', route.path + ' preserves lighter marketing headings.');
    const ids = await page.locator('[id]').evaluateAll(elements => elements.map(element => element.id));
    assert.equal(new Set(ids).size, ids.length, route.path + ' has unique DOM IDs.');
    await expect(page.locator('.site-header').getByRole('link', { name: /^Sign in$/i })).toHaveAttribute('href', '/admin/login');
    await expect(page.locator('.site-header').getByRole('link', { name: /^Explore demo\b/i })).toHaveAttribute('href', '/admin/login');
    await page.reload();
    await expect(page.locator('#main-content h1')).toBeVisible();
  }
  await go('/integrations');
  await expect(page.locator('#main-content h1')).toHaveText('Yardi-ready integration.');
  for (const id of integrationIds) {
    const section = page.locator('#' + id);
    await expect(section).toHaveCount(1);
    await expect(section.locator('[data-integration-preview]')).toHaveCount(1);
    await expect(section).toContainText(/example|illustrat|preview/i);
  }
  const previews = await page.locator('[data-integration-preview]').evaluateAll(elements => elements.map(element => ({ id: element.getAttribute('data-integration-preview'), text: element.textContent.trim() })));
  assert.equal(previews.length, 7, 'Each integration section has a distinct product preview.');
  assert.equal(new Set(previews.map(preview => preview.id)).size, 7, 'Product preview identifiers are distinct.');
  assert.equal(new Set(previews.map(preview => preview.text)).size, 7, 'Product preview contents are distinct.');
  const integrationsText = await page.locator('#main-content').innerText();
  assert.match(integrationsText, /Yardi remains authoritative/i, 'Configured Yardi records preserve their source of authority.');
  assert.match(integrationsText, /no live|not live|not connected|no .*connection/i, 'Live connection is not invented.');
  assert.doesNotMatch(integrationsText, /Yardi[- ]certified|certified by Yardi|official Yardi partner|Yardi certification achieved/i, 'Yardi certification or partnership is not invented.');
  await expect(page.locator('#payment-handoff')).toContainText(/provider/i);
  await expect(page.locator('#payment-handoff')).toContainText(/authoriz|capture|charge|refund/i);
  await expect(page.locator('#applicant-portal')).toContainText(/staff|review/i);
  await expect(page.locator('#google-analytics')).toContainText(/acquisition|source/i);
  await go('/platform');
  await expect(page.locator('#main-content a[href^="/workflows/leasing"]')).not.toHaveCount(0);
  await expect(page.locator('#main-content a[href^="/workflows/resident-support"]')).not.toHaveCount(0);
  console.log('PASS complete integrations/platform/contact/privacy direct routes, exact Yardi headline, honest activation boundaries, seven distinct previews and corresponding workflow links');

  const checkedDestinations = new Map();
  let checkedLinks = 0;
  for (const route of routes) {
    await go(route.path);
    const links = await page.locator('a[href]').evaluateAll(elements => elements.map((element, index) => ({ index, href: element.getAttribute('href'), text: element.textContent.trim() })));
    assert(links.some(link => new URL(link.href, new URL(route.path, base)).pathname === '/contact'), route.path + ' includes a real Contact destination.');
    assert(links.some(link => new URL(link.href, new URL(route.path, base)).pathname === '/privacy'), route.path + ' includes a real Privacy destination.');
    for (const link of links) {
      assert(link.href && link.href !== '#' && !/^javascript:/i.test(link.href), 'Useful destination for ' + link.text);
      const target = new URL(link.href, new URL(route.path, base));
      if (target.protocol === 'mailto:') {
        assert.equal(target.pathname.toLowerCase(), expectedContactEmail.toLowerCase(), 'Contact address is the user-verified address.');
        checkedLinks += 1;
        continue;
      }
      assert.equal(target.origin, base.origin, 'Public CTAs use real local pages without provider actions.');
      assert(knownRoutes.has(target.pathname), 'Known implemented destination for ' + link.text + ': ' + target.pathname);
      const targetKey = target.pathname + target.search + target.hash;
      if (!checkedDestinations.has(targetKey)) {
        const response = await context.request.get(target.href);
        assert.equal(response.status(), 200, 'Link destination responds successfully: ' + targetKey);
        checkedDestinations.set(targetKey, true);
      }
      await go(route.path);
      const current = page.locator('a[href]').nth(link.index);
      const hiddenMenu = current.locator('xpath=ancestor::details');
      if (await hiddenMenu.count()) await hiddenMenu.locator('summary').click();
      const spa = await current.getAttribute('data-link') !== null;
      publicPhase = target.pathname !== '/admin/login';
      await current.focus();
      await current.click();
      await expect(page).toHaveURL(target.href);
      if (target.pathname === '/admin/login') {
        await expect(page.locator('#login-form')).toBeVisible();
        await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
      } else {
        await expect(page.locator('#main-content h1')).toHaveCount(1);
        assert(!/404/.test(await page.locator('#main-content').innerText()), 'Target is an implemented page: ' + targetKey);
        if (target.hash) {
          const anchor = page.locator('[id="' + decodeURIComponent(target.hash.slice(1)) + '"]');
          await expect(anchor).toHaveCount(1);
          if (spa) await expect(anchor).toBeFocused();
          await expect.poll(async () => { const bounds = await anchor.boundingBox(); return bounds && bounds.y >= -1 && bounds.y < (page.viewportSize()?.height ?? 0); }).toBeTruthy();
        } else if (spa) {
          await expect(page.locator('#main-content')).toBeFocused();
        }
      }
      checkedLinks += 1;
    }
  }
  publicPhase = true;
  console.log('PASS all ' + checkedLinks + ' navigation/footer/CTA link occurrences and ' + checkedDestinations.size + ' implemented local destinations/fragments; genuine Contact/Privacy pages and real masked-password login');

  await go('/integrations');
  await expect(selector()).toHaveCount(1);
  await expect(selector()).toContainText(/illustrat|example/i);
  await expect(selector()).toContainText(/does not|no .*chang|without.*chang/i);
  await expect(selector().locator('input,textarea,form')).toHaveCount(0);
  await activePath('yardi');
  const initial = await pathContent().innerText();
  await pathButton('standalone').click();
  await activePath('standalone');
  assert.notEqual(await pathContent().innerText(), initial, 'Selecting standalone changes its illustrative explanation.');
  await pathButton('yardi').click();
  await activePath('yardi');
  assert.equal(await pathContent().innerText(), initial, 'Returning to Yardi restores its explanation.');
  await pathButton('yardi').focus();
  await page.keyboard.press('ArrowRight');
  await activePath('standalone');
  await expect(pathButton('standalone')).toBeFocused();
  await focusOutline(pathButton('standalone'));
  await page.keyboard.press('Home');
  await activePath('yardi');
  await page.keyboard.press('End');
  await activePath('standalone');
  await page.keyboard.press('ArrowLeft');
  await activePath('yardi');
  await pathButton('standalone').focus();
  await page.keyboard.press('Space');
  await activePath('standalone');
  await pathButton('yardi').focus();
  await page.keyboard.press('Enter');
  await activePath('yardi');
  await expect(selector().locator('[data-onboarding-status]')).toHaveAttribute('role', 'status');
  await expect(selector().locator('[data-onboarding-status]')).not.toBeEmpty();
  await pathButton('standalone').click();
  await page.locator('.site-header a[href="/platform"]').click();
  await expect(page).toHaveURL(new URL('/platform', base).href);
  await page.goBack();
  await expect(page).toHaveURL(new URL('/integrations', base).href);
  await activePath('yardi');
  await pathButton('standalone').click();
  await activePath('standalone');
  console.log('PASS illustrative onboarding click/replay-by-selection, arrow/Home/End/Enter/Space keyboard control, visible focus, polite status and clean SPA remount without organization changes');

  await go('/platform');
  const menu = page.locator('.site-header .public-workflow-menu');
  const summary = menu.locator('summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('open', '');
  await summary.press('Tab');
  await expect(menu.getByRole('link', { name: /^Leasing\b/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveAttribute('open', '');
  await expect(summary).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await go('/integrations');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#public-navigation')).toBeVisible();
  await summary.focus();
  await page.keyboard.press('Space');
  await expect(menu).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveAttribute('open', '');
  await expect(summary).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#public-navigation')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.locator('.site-header a[href="/platform"]').click();
  await expect(page).toHaveURL(new URL('/platform', base).href);
  await expect(page.locator('#main-content')).toBeFocused();
  console.log('PASS desktop/mobile native workflow navigation, Tab/Enter/Space, Escape focus return and mobile route change');

  const contrastSamples = [];
  for (const route of routes) {
    for (const width of [320, 390, 768, 1280, 1586]) {
      await page.setViewportSize({ width, height: width <= 768 ? 844 : 992 });
      await go(route.path);
      await noOverflow(width, route.path);
      if (route.path === '/integrations') {
        await pathButton('standalone').click();
        await activePath('standalone');
        await noOverflow(width, route.path + ' standalone path');
      }
      if (width === 390 || width === 1586) {
        const rows = await renderedContrast();
        checkContrast(rows, route.path + ' at ' + width + 'px');
        contrastSamples.push(...rows);
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.screenshot({ path: '.local/screenshots/stage05b-' + route.slug + '-' + (width === 390 ? 'mobile' : 'desktop') + '.png', fullPage: true, animations: 'disabled' });
      }
    }
  }
  console.log('PASS all four routes at 320/390/768/1280/1586px, both onboarding paths without overflow, desktop/mobile captures and ' + contrastSamples.length + ' rendered contrast samples');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await go('/integrations');
  assert(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), 'Reduced motion is active.');
  await activePath('yardi');
  await pathButton('standalone').click();
  await activePath('standalone');
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await activePath('standalone');
  const animation = await selector().locator('*').evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element);
    return { duration: style.animationDuration, transition: style.transitionDuration };
  }));
  assert(animation.every(value => [value.duration, value.transition].every(durations => durations.split(',').every(duration => parseFloat(duration) <= 0.001))), 'Reduced motion removes preview transition/animation durations.');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const storage = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
  assert.deepEqual(storage, { local: [], session: [] }, 'Public pages do not save visitor/demo data.');
  assert.deepEqual(await context.cookies(), [], 'Public preview does not create session cookies.');
  assert.deepEqual(pageErrors, [], 'No browser JavaScript errors.');
  assert.deepEqual(externalRequests, [], 'No external assets, analytics trackers or provider/model calls.');
  assert.deepEqual(publicApiRequests, [], 'Public content and selector never request organization or backend data.');
  assert.deepEqual(outboundRequests, [], 'No contact submission, import/upload, communication or mutating request.');
  console.log('PASS runtime reduced motion, manual-only selector, no browser errors, saved state, cookies, private APIs, tracker/provider requests or outbound actions');
  console.log('Stage 05b public platform checks completed.');
  }
} finally {
  await browser.close();
}