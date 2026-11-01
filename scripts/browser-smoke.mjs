import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { withTestServer } from './test-server.mjs';

const checks = [], output = process.env.GREENREV_QA_OUTPUT || 'test-results';
await mkdir(output, { recursive: true });
await withTestServer(async base => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', ...(process.env.CHROMIUM_EXTRA_ARGS ? JSON.parse(process.env.CHROMIUM_EXTRA_ARGS) : [])] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } }); const errors = [];
    let sessionRequests = 0;
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/saas/session') sessionRequests++; });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('.topbar strong').filter({ hasText: 'Rental company' }).waitFor();
    assert.equal(sessionRequests, 1);
    checks.push('Development effect replay creates one initial browser session');
    const palette = await page.evaluate(() => ({ background: getComputedStyle(document.body).backgroundColor,
      text: getComputedStyle(document.body).color, lime: getComputedStyle(document.documentElement).getPropertyValue('--lime').trim(),
      card: getComputedStyle(document.querySelector('.module-card')).backgroundColor }));
    assert.deepEqual(palette, { background: 'rgb(5, 6, 6)', text: 'rgb(255, 255, 255)', lime: '#a3e635', card: 'rgb(16, 18, 17)' });
    checks.push('Previous charcoal, white and lime palette restored');
    const nav = page.locator('.sidebar nav');
    assert.equal(await nav.getByRole('button', { name: /Rentals/ }).count(), 1);
    assert.equal(await nav.getByRole('button', { name: /Parts|Dealership|Haulage/ }).count(), 0);
    checks.push('Rental-only menu excludes unrelated business modules');
    await nav.getByRole('button', { name: /Rentals/ }).click();
    await page.screenshot({ path: output + '/rental-desktop.png', fullPage: true });
    await page.getByRole('button', { name: 'Check out', exact: true }).click();
    let form = page.getByRole('dialog');
    await form.getByLabel('Odometer (km)', { exact: true }).fill('100'); await form.getByLabel('Fuel level (%)', { exact: true }).fill('80');
    await form.getByLabel('Vehicle condition', { exact: true }).fill('Clean pickup condition');
    await form.getByLabel('Customer acknowledgement reference', { exact: true }).fill('QA pickup signed');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Return vehicle', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Return vehicle', exact: true }).click(); form = page.getByRole('dialog');
    await form.getByLabel('Odometer (km)', { exact: true }).fill('200'); await form.getByLabel('Fuel level (%)', { exact: true }).fill('70');
    await form.getByLabel('Vehicle condition', { exact: true }).fill('Returned and inspected');
    await form.getByLabel('Customer acknowledgement reference', { exact: true }).fill('QA return signed');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('.status.returned').waitFor(); checks.push('Rental checkout and return through actual forms');
    const profile = page.getByLabel('Demo profile');
    await profile.selectOption('parts'); await page.locator('.topbar strong').filter({ hasText: 'Parts vendor' }).waitFor();
    assert.equal(await nav.getByRole('button', { name: /Rentals|Dealership|Haulage/ }).count(), 0);
    await nav.getByRole('button', { name: /Parts & stock/ }).click(); await page.getByText('Brake pad set', { exact: true }).waitFor();
    checks.push('Parts-only workspace and seeded stock display');
    await profile.selectOption('haulage'); await page.locator('.topbar strong').filter({ hasText: 'Haulage company' }).waitFor();
    await nav.getByRole('button', { name: /Haulage/ }).click(); await page.getByRole('button', { name: 'Dispatch', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm delivery', exact: true }).waitFor();
    await profile.selectOption('driver'); await page.locator('.profile').filter({ hasText: 'DRIVER' }).waitFor();
    assert.equal(await nav.getByRole('button', { name: /Accounts|Subscription|Branches/ }).count(), 0);
    await nav.getByRole('button', { name: /Haulage/ }).click();
    await page.getByRole('button', { name: 'Confirm delivery', exact: true }).click(); form = page.getByRole('dialog');
    await form.getByLabel('Recipient acknowledgement and evidence reference', { exact: true }).fill('Recipient QA accepted delivery, POD-001');
    await form.getByRole('button', { name: 'Save', exact: true }).click(); await page.locator('.status.delivered').waitFor();
    checks.push('Dispatch, driver financial isolation and proof of delivery');
    await profile.selectOption('mixed'); await page.locator('.topbar strong').filter({ hasText: 'Mobility group' }).waitFor();
    for (const label of ['Dealership', 'Parts & stock', 'Rentals', 'Haulage', 'Workshop']) assert.equal(await nav.getByRole('button', { name: new RegExp(label) }).count(), 1);
    checks.push('Mixed business sees all five selected modules');
    await profile.selectOption('new'); await page.getByRole('heading', { name: 'Build your business workspace' }).waitFor();
    await page.getByRole('checkbox', { name: /Rentals/ }).uncheck(); await page.getByRole('checkbox', { name: /Parts & stock/ }).check();
    await page.getByLabel('Business name', { exact: true }).fill('QA parts business');
    await page.getByRole('button', { name: 'Start 14-day trial', exact: true }).click();
    await page.locator('.topbar strong').filter({ hasText: 'QA parts business' }).waitFor();
    assert.equal(await nav.getByRole('button', { name: /Parts & stock/ }).count(), 1); assert.equal(await nav.getByRole('button', { name: /Rentals|Dealership/ }).count(), 0);
    checks.push('New subscriber selects Parts only and automatically receives the correct menu');
    await profile.selectOption('platform'); await page.locator('.topbar strong').filter({ hasText: 'GreenRev platform' }).waitFor();
    await nav.getByRole('button', { name: /Platform pricing/ }).click(); await page.getByRole('button', { name: 'Load current catalogue', exact: true }).click();
    await page.getByLabel('Shared core · monthly ₦', { exact: true }).fill('100'); await page.getByLabel('RENTAL · monthly ₦', { exact: true }).fill('200');
    await page.getByLabel('Reason for price change', { exact: true }).fill('Synthetic prices in a disposable QA database');
    await page.getByRole('button', { name: /Publish version/ }).click(); await page.getByRole('status').filter({ hasText: 'New catalogue version published' }).waitFor();
    await profile.selectOption('rentals'); await page.locator('.topbar strong').filter({ hasText: 'Rental company' }).waitFor();
    await nav.getByRole('button', { name: /Subscription/ }).click(); await page.getByRole('button', { name: 'Get itemised price', exact: true }).click();
    await page.getByRole('heading', { name: 'Your subscription quote', exact: true }).waitFor();
    assert.equal(await page.locator('td').getByText('CORE', { exact: true }).count(), 1);
    checks.push('Platform publishes prices and subscriber receives an itemised quote with one shared core');
    await page.setViewportSize({ width: 390, height: 844 }); await nav.getByRole('button', { name: /Rentals/ }).click();
    await page.screenshot({ path: output + '/rental-mobile.png', fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    checks.push('390px mobile workspace has no page-level horizontal overflow');
    assert.deepEqual(errors, []); checks.push('No uncaught browser JavaScript errors');
    for (const address of [base, base.replace('127.0.0.1', 'localhost')]) {
      const local = await browser.newPage();
      local.on('pageerror', error => errors.push(error.message));
      try {
        await local.goto(address, { waitUntil: 'networkidle' });
        await local.locator('.topbar strong').filter({ hasText: 'Rental company' }).waitFor();
        await local.getByLabel('Demo profile').selectOption('parts');
        await local.locator('.topbar strong').filter({ hasText: 'Parts vendor' }).waitFor();
        await local.reload({ waitUntil: 'networkidle' });
        await local.locator('.topbar strong').filter({ hasText: 'Parts vendor' }).waitFor();
        await local.getByLabel('Demo profile').selectOption('rentals');
        await local.locator('.topbar strong').filter({ hasText: 'Rental company' }).waitFor();
        // Next also has an accessibility route-announcer with role=alert.
        // The product's error banner is the failure being checked here.
        assert.equal(await local.locator('.message.error').count(), 0,
          JSON.stringify(await local.getByRole('alert').allTextContents()));
        checks.push('Profile switching and reload work at ' + new URL(address).hostname + ' without an origin override');
      } finally { await local.close(); }
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}, 3126);
await mkdir('docs/evidence', { recursive: true });
await writeFile('docs/evidence/browser-smoke.json', JSON.stringify({ completed_at: new Date().toISOString(), checks }, null, 2) + '\n');
process.stdout.write('PASS: ' + checks.length + ' browser scenarios.\n');
