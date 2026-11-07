// Generates the README screenshots from the real running app.
// Usage: npm run screenshots   (requires: npx playwright install chromium)
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createApp } from '../server.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'docs', 'screenshots');
const dir = await mkdtemp(path.join(tmpdir(), 'traceproof-shots-'));
const server = await createApp({ dbPath: path.join(dir, 'data.json') });
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, timezoneId: 'America/Bogota', colorScheme: 'dark' });
  await context.addInitScript(() => { try { localStorage.setItem('traceproof_privacy_choice', 'acknowledged'); localStorage.setItem('traceproof_speed', 'turbo'); } catch {} });
  const page = await context.newPage();
  await page.goto(`${base}/#overview`);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(out, 'overview.png') });

  await page.click('#hero-quick-run');
  await page.waitForSelector('.inspect-status.failed', { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, 'workbench.png') });

  await page.evaluate(() => { location.hash = '#activity'; });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(out, 'runs.png') });

  await page.keyboard.press('Control+k');
  await page.keyboard.type('run');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, 'palette.png') });

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/Bogota' });
  await mobile.addInitScript(() => { try { localStorage.setItem('traceproof_privacy_choice', 'acknowledged'); } catch {} });
  const phone = await mobile.newPage();
  await phone.goto(`${base}/#overview`);
  await phone.waitForTimeout(2500);
  await phone.click('#menu-toggle');
  await phone.waitForTimeout(700);
  await phone.screenshot({ path: path.join(out, 'mobile-menu.png') });
  console.log(`Screenshots written to ${path.relative(root, out)}/`);
} finally {
  await browser.close();
  await new Promise(ok => server.close(ok));
  await rm(dir, { recursive: true, force: true });
}
