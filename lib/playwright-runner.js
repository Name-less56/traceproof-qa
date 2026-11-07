// Server-side Playwright runner.
// Executes a case's steps in a real, isolated Chromium context against the
// bundled sandbox and records a genuine Playwright trace.zip + final screenshot.
// Playwright is optional: when it (or its browser) is missing, the runner
// reports itself unavailable and the UI keeps the in-page DOM replay.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const ALLOWED_ROUTES = new Set(['/sandbox/shop', '/sandbox/login']);
const STEP_TIMEOUT = 5000;

export class PlaywrightRunner {
  constructor({ artifactDir = process.env.ARTIFACT_DIR || path.join(os.tmpdir(), 'traceproof-artifacts') } = {}) {
    this.artifactDir = artifactDir;
    this.busy = false;
    this.status = null;
  }

  async load() {
    try { return (await import('playwright')).chromium; }
    catch { try { return (await import('@playwright/test')).chromium; } catch { return null; } }
  }

  async check() {
    if (this.status) return this.status;
    const chromium = await this.load();
    if (!chromium) return (this.status = { available: false, reason: 'Playwright is not installed (npm install).' });
    try { await fs.access(chromium.executablePath()); }
    catch { return (this.status = { available: false, reason: 'Chromium is missing. Run: npx playwright install chromium' }); }
    return (this.status = { available: true, browser: 'chromium', version: null });
  }

  artifactPath(runId, kind) {
    if (!/^[\w-]+$/.test(runId)) throw new Error('Invalid run id');
    return path.join(this.artifactDir, `${runId}.${kind === 'trace' ? 'zip' : 'png'}`);
  }

  async run(testCase, { baseUrl, runId }) {
    const status = await this.check();
    if (!status.available) { const error = new Error(status.reason); error.status = 503; throw error; }
    if (this.busy) { const error = new Error('Another Playwright run is in progress'); error.status = 409; throw error; }
    this.busy = true;
    const chromium = await this.load();
    let browser;
    const events = [];
    try {
      await fs.mkdir(this.artifactDir, { recursive: true });
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ viewport: { width: 1100, height: 720 }, baseURL: baseUrl });
      // Only the bundled sandbox may be reached from this context.
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        return url.origin === new URL(baseUrl).origin ? route.continue() : route.abort();
      });
      await context.tracing.start({ screenshots: true, snapshots: true, sources: false, title: testCase.title });
      const page = await context.newPage();
      for (const step of testCase.steps) {
        const started = Date.now();
        const event = { status: 'passed', detail: '', durationMs: 0, url: '', snapshot: '' };
        try {
          const locator = step.target ? page.locator(`[data-testid="${step.target}"]`) : null;
          if (step.action === 'navigate') {
            if (!ALLOWED_ROUTES.has(step.value)) throw new Error(`Route not allowed: ${step.value}`);
            await page.goto(step.value, { waitUntil: 'load', timeout: STEP_TIMEOUT }); event.detail = `Opened ${step.value} in Chromium`;
          } else if (step.action === 'click') {
            await locator.click({ timeout: STEP_TIMEOUT }); event.detail = `Clicked ${step.target}`;
          } else if (step.action === 'fill') {
            await locator.fill(step.value, { timeout: STEP_TIMEOUT });
            event.detail = `Filled ${step.target} with ${step.target.toLowerCase().includes('password') ? '[redacted]' : 'provided test value'}`;
          } else if (step.action === 'assertVisible') {
            await locator.waitFor({ state: 'visible', timeout: STEP_TIMEOUT }); event.detail = `Verified ${step.target} is visible`;
          } else if (step.action === 'assertText') {
            const deadline = Date.now() + 2000; let actual = '';
            do { actual = ((await locator.count()) ? await locator.first().textContent() : '')?.trim() || ''; if (actual.includes(step.value)) break; await page.waitForTimeout(100); } while (Date.now() < deadline);
            if (!actual.includes(step.value)) throw new Error(`Expected ${step.target} to contain “${step.value}”; observed “${actual || '(empty or missing)'}”.`);
            event.detail = `Verified ${step.target} includes “${step.value}”`;
          }
        } catch (error) {
          event.status = 'failed';
          event.detail = String(error.message || error).split('\n')[0].replace(/\u001b\[[0-9;]*m/g, '').slice(0, 900);
        }
        event.durationMs = Date.now() - started;
        try { event.url = new URL(page.url()).pathname; event.snapshot = (await page.locator('body').innerText({ timeout: 1000 })).slice(0, 1500).replaceAll('DemoPass123', '[demo credential hidden]'); }
        catch { event.snapshot = ''; }
        events.push(event);
        if (event.status === 'failed') break;
      }
      await page.screenshot({ path: this.artifactPath(runId, 'screenshot'), fullPage: false });
      await context.tracing.stop({ path: this.artifactPath(runId, 'trace') });
      await context.close();
      return { events, status: events.some(e => e.status === 'failed') ? 'failed' : 'passed', durationMs: events.reduce((s, e) => s + e.durationMs, 0) };
    } finally {
      this.busy = false;
      await browser?.close().catch(() => {});
    }
  }
}
