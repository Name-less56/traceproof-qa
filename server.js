import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Store } from './lib/store.js';
import { PostgresStore } from './lib/postgres-store.js';
import { AuthService, clearSessionCookie, cookieValue, sessionCookie } from './lib/auth.js';
import { apiError, cleanCase, cleanProject, cleanRun, getMetrics } from './lib/domain.js';
import { generateSpec, outputFilename } from './lib/generator.js';
import { PlaywrightRunner } from './lib/playwright-runner.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, 'public');
const sandbox = path.join(here, 'sandbox');
const contentType = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const json = (res, status, value) => send(res, status, JSON.stringify(value), 'application/json; charset=utf-8');
const baseHeaders = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'SAMEORIGIN',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(self), payment=(), usb=()',
  'cross-origin-opener-policy': 'same-origin'
};
function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(status, { ...baseHeaders, 'content-type': type, 'cache-control': 'no-store', ...extra });
  res.end(body);
}
async function requestBody(req) {
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw apiError('Content-Type must be application/json', 415);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 150_000) throw apiError('Payload too large', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw apiError('Invalid JSON'); }
}
async function staticFile(req, res, filename, root, policy) {
  const resolved = path.resolve(root, filename);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) throw apiError('Forbidden', 403);
  try {
    const content = await fs.readFile(resolved);
    send(res, 200, req.method === 'HEAD' ? '' : content, contentType[path.extname(resolved)] || 'application/octet-stream', { 'content-security-policy': policy });
  } catch (e) { if (e.code === 'ENOENT' || e.code === 'EISDIR') return send(res, 404, 'Not found'); throw e; }
}

export async function createApp({ dbPath, databaseUrl = process.env.DATABASE_URL, runner = new PlaywrightRunner({ artifactDir: process.env.ARTIFACT_DIR || path.join(here, 'data', 'artifacts') }) } = {}) {
  const store = dbPath
    ? await new Store(dbPath).open()
    : databaseUrl
      ? await new PostgresStore(databaseUrl).open()
      : await new Store(path.join(here, 'data', 'traceproof.json')).open();
  const auth = new AuthService(store);
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const route = url.pathname;
    try {
      if (route.startsWith('/api/') && !['GET', 'HEAD'].includes(req.method)) {
        const origin = req.headers.origin;
        const forwardedProto = process.env.TRUST_PROXY === '1' ? String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() : '';
        const expected = `${forwardedProto ? `${forwardedProto}:` : url.protocol}//${req.headers.host}`;
        if (origin && origin !== expected) throw apiError('Cross-origin writes are not allowed', 403);
        if (req.headers['sec-fetch-site'] === 'cross-site') throw apiError('Cross-site writes are not allowed', 403);
      }
      const secureRequest = Boolean(req.socket.encrypted) || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
      const sessionToken = cookieValue(req, 'tp_session');
      const user = await auth.read(sessionToken);
      const requireRole = role => { if (!user || (role === 'admin' && user.role !== 'admin')) throw apiError('Authentication required', user ? 403 : 401); };
      if (route === '/api/health' && req.method === 'GET') return json(res, 200, { status: 'ok', database: store.kind, timestamp: new Date().toISOString() });
      if (route === '/api/session' && req.method === 'GET') return json(res, 200, { authenticated: Boolean(user), user });
      if (route === '/api/login' && req.method === 'POST') {
        const input = await requestBody(req);
        const verified = auth.verify(input.email, input.password, req.socket.remoteAddress || 'local');
        if (!verified) throw apiError('Invalid email or password', 401);
        const token = await auth.create(verified);
        return send(res, 200, JSON.stringify({ authenticated: true, user: verified }), 'application/json; charset=utf-8', { 'set-cookie': sessionCookie(token, secureRequest) });
      }
      if (route === '/api/logout' && req.method === 'POST') {
        await auth.destroy(sessionToken);
        return send(res, 200, JSON.stringify({ authenticated: false }), 'application/json; charset=utf-8', { 'set-cookie': clearSessionCookie(secureRequest) });
      }
      if (route === '/api/admin/stats' && req.method === 'GET') {
        requireRole('admin'); const state = store.get();
        return json(res, 200, { database: store.kind, cases: state.cases.length, runs: state.runs.length, projects: state.projects.length, access: 'admin' });
      }
      if (route === '/api/state' && req.method === 'GET') {
        const state = store.get(); return json(res, 200, { ...state, metrics: getMetrics(state), infrastructure: { database: store.kind, runtime: 'node', mode: databaseUrl ? 'docker-ready' : 'local-fallback' }, session: { authenticated: Boolean(user), user } });
      }
      if (route === '/api/sdk' && req.method === 'GET') return json(res, 200, {
        version: '2.2.0', baseUrl: `${url.protocol}//${req.headers.host}`, authentication: 'Bearer tp_live_*',
        examples: { node: "const state = await fetch(base + '/api/state', {headers:{Authorization:'Bearer '+key}}).then(r=>r.json())", python: "requests.get(f'{base}/api/state', headers={'Authorization': f'Bearer {key}'})" }
      });
      if (route === '/api/trends' && req.method === 'GET') {
        const runs = store.get().runs; const browsers = ['Chromium', 'Firefox', 'WebKit'];
        return json(res, 200, { passRate: getMetrics(store.get()).passRate, flaky: runs.filter((run, i) => i && runs[i-1]?.caseId === run.caseId && runs[i-1]?.status !== run.status).length, browsers, regions: ['Bogotá', 'Virginia', 'Frankfurt'], releases: [{ name: '2.1.0-portfolio', readiness: Math.max(62, 100 - runs.filter(r => r.status === 'failed').length * 8) }] });
      }
      if (route === '/api/platform/action' && req.method === 'POST') {
        requireRole('admin'); const input = await requestBody(req); const action = String(input.action || '');
        const allowed = new Set(['integration.toggle','schedule.toggle','notification.send','apikey.create','trace.import','playwright.run','sso.configure','audit.sign']);
        if (!allowed.has(action)) throw apiError('Unsupported platform action');
        let result = { ok: true, action };
        await store.update(state => {
          state.platform ||= { integrations: [], schedules: [], notifications: [], apiKeys: [], audit: [] };
          if (action === 'integration.toggle') { const item = state.platform.integrations.find(x => x.id === input.id); if (!item) throw apiError('Integration not found', 404); item.status = item.status === 'connected' ? 'ready' : 'connected'; result.status = item.status; }
          if (action === 'schedule.toggle') { const item = state.platform.schedules.find(x => x.id === input.id); if (!item) throw apiError('Schedule not found', 404); item.enabled = !item.enabled; result.enabled = item.enabled; }
          if (action === 'notification.send') { const item = { id: randomUUID(), channel: input.channel || 'Slack', message: String(input.message || 'Regression summary').slice(0,300), status: 'delivered-simulation', createdAt: new Date().toISOString() }; state.platform.notifications.unshift(item); result.notification = item; }
          if (action === 'apikey.create') { const key = `tp_live_${randomBytes(18).toString('base64url')}`; state.platform.apiKeys.push({ id: randomUUID(), prefix: key.slice(0,15), hash: createHash('sha256').update(key).digest('hex'), createdAt: new Date().toISOString() }); result.key = key; }
          if (action === 'trace.import') result.trace = { id: randomUUID(), name: String(input.name || 'trace.zip').slice(0,120), files: Math.min(Number(input.files) || 0, 5000), status: 'indexed' };
          if (action === 'playwright.run') result.job = { id: randomUUID(), worker: 'isolated-adapter', browsers: ['chromium','firefox','webkit'], status: 'completed', artifacts: ['trace.zip','screenshot.png','video.webm'] };
          if (action === 'sso.configure') result.identity = { sso: 'configured-demo', mfa: 'required', tenantIsolation: 'policy-ready', evidenceStorage: 'AES-256-GCM adapter ready' };
          if (action === 'audit.sign') result.signature = createHash('sha256').update(JSON.stringify(state.platform.audit)).digest('hex');
          state.platform.audit.unshift({ id: randomUUID(), action, actor: user.email, createdAt: new Date().toISOString() }); state.platform.audit = state.platform.audit.slice(0,80);
        });
        return json(res, 200, result);
      }
      if (route === '/api/cases' && req.method === 'POST') {
        const draft = cleanCase(await requestBody(req));
        await store.update(s => s.cases.unshift(draft));
        return json(res, 201, draft);
      }
      const match = route.match(/^\/api\/cases\/([\w-]+)$/);
      if (match && req.method === 'PUT') {
        const id = match[1], raw = await requestBody(req);
        let updated;
        await store.update(state => {
          const index = state.cases.findIndex(c => c.id === id);
          if (index < 0) throw apiError('Case not found', 404);
          updated = cleanCase(raw, state.cases[index]); state.cases[index] = updated;
        });
        return json(res, 200, updated);
      }
      if (match && req.method === 'DELETE') {
        const id = match[1];
        await store.update(state => {
          const index = state.cases.findIndex(c => c.id === id);
          if (index < 0) throw apiError('Case not found', 404);
          state.cases.splice(index, 1);
        });
        return json(res, 200, { deleted: true });
      }
      const download = route.match(/^\/api\/cases\/([\w-]+)\/spec$/);
      if (download && req.method === 'GET') {
        const entry = store.get().cases.find(c => c.id === download[1]);
        if (!entry) throw apiError('Case not found', 404);
        return send(res, 200, generateSpec(entry), 'text/plain; charset=utf-8', {
          'content-disposition': `attachment; filename="${outputFilename(entry)}"`
        });
      }
      if (route === '/api/runner' && req.method === 'GET') return json(res, 200, await runner.check());
      if (route === '/api/runs/playwright' && req.method === 'POST') {
        requireRole('engineer');
        const input = await requestBody(req);
        const entry = store.get().cases.find(c => c.id === String(input.caseId || ''));
        if (!entry) throw apiError('Case not found', 404);
        const runId = randomUUID();
        const result = await runner.run(entry, { baseUrl: `http://127.0.0.1:${req.socket.localPort}`, runId });
        const run = cleanRun({ caseId: entry.id, ...result }, store.get().cases, { source: 'playwright-chromium', id: runId });
        await store.update(state => { state.runs.unshift(run); state.runs = state.runs.slice(0, 120); });
        return json(res, 201, run);
      }
      const artifact = route.match(/^\/api\/artifacts\/([\w-]+)\/(trace\.zip|screenshot\.png)$/);
      if (artifact && req.method === 'GET') {
        const kind = artifact[2] === 'trace.zip' ? 'trace' : 'screenshot';
        try {
          const body = await fs.readFile(runner.artifactPath(artifact[1], kind));
          return send(res, 200, body, kind === 'trace' ? 'application/zip' : 'image/png', kind === 'trace' ? { 'content-disposition': `attachment; filename="traceproof-${artifact[1].slice(0, 8)}-trace.zip"` } : {});
        } catch { throw apiError('Artifact not found', 404); }
      }
      if (route === '/api/runs' && req.method === 'POST') {
        const run = cleanRun(await requestBody(req), store.get().cases);
        await store.update(state => { state.runs.unshift(run); state.runs = state.runs.slice(0, 120); });
        return json(res, 201, run);
      }
      if (route === '/api/projects' && req.method === 'POST') {
        requireRole('admin'); const project = cleanProject(await requestBody(req));
        if (store.get().projects.some(item => item.key === project.key)) throw apiError('Project key already exists', 409);
        await store.update(state => state.projects.unshift(project)); return json(res, 201, project);
      }
      if (route === '/api/contact' && req.method === 'POST') {
        const input = await requestBody(req);
        const name = String(input.name || '').trim(), email = String(input.email || '').trim().toLowerCase();
        const subject = String(input.subject || '').trim(), message = String(input.message || '').trim();
        if (!input.consent) throw apiError('Explicit consent is required');
        if (name.length < 2 || name.length > 100) throw apiError('Name must contain 2–100 characters');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180) throw apiError('A valid email is required');
        if (subject.length < 3 || subject.length > 140 || message.length < 10 || message.length > 3000) throw apiError('Subject or message length is invalid');
        const entry = { id: randomUUID(), name, email, subject, message, createdAt: new Date().toISOString() };
        await store.update(state => { state.messages ||= []; state.messages.unshift(entry); state.messages = state.messages.slice(0, 100); });
        return json(res, 201, { received: true, id: entry.id, storage: store.kind });
      }
      const projectMatch = route.match(/^\/api\/projects\/([\w-]+)$/);
      if (projectMatch && req.method === 'PUT') {
        requireRole('admin'); const raw = await requestBody(req); let updated;
        await store.update(state => { const index = state.projects.findIndex(item => item.id === projectMatch[1]); if (index < 0) throw apiError('Project not found', 404); updated = cleanProject(raw, state.projects[index]); state.projects[index] = updated; });
        return json(res, 200, updated);
      }
      if (projectMatch && req.method === 'DELETE') {
        requireRole('admin');
        await store.update(state => { const index = state.projects.findIndex(item => item.id === projectMatch[1]); if (index < 0) throw apiError('Project not found', 404); state.projects.splice(index, 1); });
        return json(res, 200, { deleted: true });
      }
      if (route === '/api/export' && req.method === 'GET') {
        return send(res, 200, JSON.stringify({ format: 'traceproof-v1', cases: store.get().cases, runs: store.get().runs }, null, 2), 'application/json; charset=utf-8', {
          'content-disposition': 'attachment; filename="traceproof-workspace.json"'
        });
      }
      if (route === '/api/import' && req.method === 'POST') {
        const input = await requestBody(req);
        if (!Array.isArray(input.cases) || input.cases.length > 80) throw apiError('Import requires up to 80 cases');
        const imported = input.cases.map(item => cleanCase(item));
        await store.update(s => { s.cases.push(...imported); });
        return json(res, 201, { imported: imported.length });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw apiError('Method not allowed', 405);
      const appPolicy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'; form-action 'self'";
      const sandboxPolicy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'";
      if (route === '/' || route === '/index.html') return staticFile(req, res, 'index.html', pub, appPolicy);
      if (route === '/sandbox/shop' || route === '/sandbox/login') {
        return staticFile(req, res, route.split('/').at(-1) + '.html', sandbox, sandboxPolicy);
      }
      const fontFile = route.match(/^\/fonts\/(chakra-petch-latin-(?:500|600|700)-normal\.woff2)$/);
      if (fontFile) return staticFile(req, res, path.join('fonts', fontFile[1]), pub, appPolicy);
      if (/^\/(styles\.css|app\.js|world-points\.js|globe\.js|cities\.js|icons\.js|jszip\.min\.js|favicon\.svg)$/.test(route)) return staticFile(req, res, route.slice(1), pub, appPolicy);
      send(res, 404, 'Not found');
    } catch (e) {
      if (!route.startsWith('/api/')) return send(res, e.status || 500, e.status ? e.message : 'Internal error');
      return json(res, e.status || 500, { error: e.status ? e.message : 'Internal server error' });
    }
  });
}

const directly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (directly) {
  const server = await createApp();
  const port = Number(process.env.PORT || 4391);
  const host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`TraceProof → http://${host}:${port} · ${process.env.DATABASE_URL ? 'PostgreSQL' : 'JSON fallback'}`));
}
