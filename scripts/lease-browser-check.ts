import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';
import type { ServerConfig } from '../server/config/env.js';

export async function checkLeaseBrowser(input: { base: string; cookie: string; applicationId: string; config: ServerConfig }) {
  const root = path.resolve(import.meta.dirname, '..');
  const web = await createServer({ configFile: false, root: path.join(root, 'client'), publicDir: path.join(root, 'public'), server: { host: '127.0.0.1', port: 0, proxy: { '/api': input.base } }, logLevel: 'error' });
  await web.listen();
  const address = web.httpServer!.address(); assert(address && typeof address !== 'string');
  const base = 'http://127.0.0.1:' + address.port;
  const previous = input.config.appUrl;
  (input.config as { appUrl: string }).appUrl = base;
  const browser = await chromium.launch({ channel: process.env.OOTLA_BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    await context.addCookies([{ name: 'ootla.sid', value: input.cookie.split('=')[1]!, url: base, httpOnly: true, sameSite: 'Lax' }]);
    let drop = false; const errors: string[] = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (/^https?:$/.test(url.protocol) && url.origin !== base) { errors.push('Unexpected external request'); return route.abort(); }
      if (drop && url.pathname.endsWith('/transition')) { drop = false; const response = await route.fetch(); assert.equal(response.status(), 200); await response.dispose(); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    const applicationPath = '/admin/applications?application=' + input.applicationId;
    const approval = await context.request.post(base + '/api/application-journey/' + input.applicationId + '/decisions', { headers: { Origin: base }, data: { requestKey: randomUUID(), decision: 'approved', reason: 'Staff reviewed this synthetic browser application.' } });
    assert.equal(approval.status(), 200);
    await page.goto(base + applicationPath);
    await expect(page.locator('[data-lease-action=create]')).toBeVisible();
    await page.getByLabel('Lease start date', { exact: true }).fill('2027-04-01');
    await page.getByRole('button', { name: 'Create lease preparation', exact: true }).click();
    await expect(page.locator('[data-lease-success]')).toBeVisible();
    for (const [index, stage] of ['signature_requested', 'partially_signed', 'fully_signed', 'move_in_scheduled', 'completed'].entries()) {
      const form = page.locator('[data-lease-action=transition]');
      await expect(form.locator('[name=stage]')).toHaveValue(stage);
      await form.getByLabel('Evidence reference and staff note').fill('Synthetic browser evidence for ' + stage);
      await form.locator('[name=confirmed]').check();
      if (stage === 'move_in_scheduled') await form.getByLabel('Move-in date and time', { exact: true }).fill('2027-04-02T10:00');
      if (index === 0) drop = true;
      await form.getByRole('button', { name: 'Record lease transition' }).click();
      if (index === 0) { await expect(form.locator('[data-lease-error]')).toContainText(/reach|connection/i); await form.getByRole('button', { name: 'Record lease transition' }).click(); }
      await expect(page.locator('[data-lease-success]')).toBeVisible();
      await expect(page.locator('[data-lease-workspace] [aria-current=step]')).toContainText(['Signature requested', 'Partially signed', 'Fully signed', 'Move-in scheduled', 'Completed'][index]!);
    }
    await page.reload();
    await expect(page.locator('[data-lease-workspace] [aria-current=step]')).toHaveText(/Completed/);
    const result = await (await context.request.get(base + '/api/application-leases/' + input.applicationId)).json();
    assert.equal(result.events.length, 6); assert.equal(result.workflow.residentCount, 1); assert(result.tasks.length > 0);
    await mkdir(path.join(root, '.local/screenshots'), { recursive: true });
    for (const width of [320, 390, 768, 1586]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(await page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
      if (width === 390) await page.screenshot({ path: path.join(root, '.local/screenshots/lease-390.png'), fullPage: true });
    }
    await page.goto(base + applicationPath + '&preview=1');
    await expect(page.locator('.ap-preview-banner')).toBeVisible();
    assert.equal(await page.locator('[data-lease-action]').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS lease browser: five transitions, lost-response replay, persistence, one resident, linked tasks, four widths and read-only preview');
  } finally { await browser.close(); await web.close(); (input.config as { appUrl: string }).appUrl = previous; }
}
