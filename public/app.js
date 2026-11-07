import { LAND_POINTS } from './world-points.js';
import { createGlobe } from './globe.js';
import { HUBS, cityFromTimezone, nearestCity, formatCoords } from './cities.js';
import { icon, hydrateIcons, LOGO_MARK } from './icons.js';

/* ------------------------------------------------------------------ helpers */
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const label = word => ({ navigate: 'Navigate', click: 'Click', fill: 'Fill input', assertVisible: 'Assert visible', assertText: 'Assert text' }[word] || word);
const timeAgo = iso => { const t = new Date(iso); if (Number.isNaN(t.getTime())) return '—'; return t.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const relative = iso => { const s = (Date.now() - new Date(iso).getTime()) / 1000; if (!Number.isFinite(s)) return '—'; if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`; return timeAgo(iso); };
const stepInfo = step => step.action === 'navigate' ? step.value : step.action === 'assertText' ? `[data-testid="${step.target}"] includes “${step.value}”` : step.action === 'fill' ? `[data-testid="${step.target}"] ← ${step.target.toLowerCase().includes('password') ? '••••••••' : `“${step.value}”`}` : `[data-testid="${step.target}"]`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTyping = el => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
const store = { get(key) { try { return localStorage.getItem(key); } catch { return null; } }, set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } } };
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const actions = ['navigate', 'click', 'fill', 'assertVisible', 'assertText'];
const SPEEDS = { turbo: 60, normal: 420, slow: 1100 };
const VIEW_META = [
  { id: 'overview', label: 'Overview', icon: 'overview', desc: 'Globe, live metrics and quick replay', primary: true },
  { id: 'workbench', label: 'Workbench', icon: 'workbench', desc: 'Build, replay and inspect cases', primary: true },
  { id: 'activity', label: 'Runs', icon: 'runs', desc: 'Execution history and trends', primary: true },
  { id: 'projects', label: 'Projects', icon: 'projects', desc: 'Workspaces and environments', primary: true },
  { id: 'platform', label: 'Platform', icon: 'platform', desc: 'Control plane adapters', primary: true },
  { id: 'team', label: 'Team', icon: 'team', desc: 'Roles and permission matrix' },
  { id: 'governance', label: 'Trust', icon: 'trust', desc: 'Privacy, security and storage' },
  { id: 'contact', label: 'Contact', icon: 'contact', desc: 'Send a local message' },
  { id: 'account', label: 'Account', icon: 'account', desc: 'Demo sign-in and session' }
];
const views = new Set(VIEW_META.map(v => v.id));

const state = {
  cases: [], runs: [], projects: [], team: [], platform: {}, infrastructure: {}, session: { authenticated: false, user: null }, metrics: {},
  selected: null, search: '', filter: 'all', sort: 'updated', inspector: 'evidence', running: false, latestEvents: [], codeCache: {}, activeStep: -1,
  editorId: null, projectEditorId: null, editSteps: [], view: 'overview',
  runFilter: 'all', runSearch: '', runLimit: 12, runner: { available: false, reason: 'Checking…' }, speed: SPEEDS[store.get('traceproof_speed')] ? store.get('traceproof_speed') : 'normal'
};
let lastFocus = null;

const storageName = () => state.infrastructure.database === 'postgresql' ? 'PostgreSQL' : state.infrastructure.database === 'json-fallback' ? 'JSON file' : 'local storage';

const documents = {
  privacy: { title: 'Privacy policy', html: () => `<h3>Local by design</h3><p>TraceProof does not send cases, execution evidence, messages, or demo credentials to a third party. Operational records are kept in <b>${storageName()}</b> on this machine.</p><h3>The globe</h3><p>Your city is estimated from the browser time zone, without any network request. Precise location is only read after you press <i>Use precise location</i> and accept the browser prompt; it is used in memory to pick the nearest city and is never stored or sent.</p><h3>Your controls</h3><p>Export the workspace from the header. Delete individual cases and projects through their controls. Contact submissions require explicit consent.</p>` },
  terms: { title: 'Terms of use', html: () => '<h3>Review environment</h3><p>This application is a local QA demonstration. Evidence is produced by a lightweight DOM replay engine and must not be treated as a trusted compliance record.</p><h3>Responsible use</h3><p>Only test applications and data you are authorized to use. Review generated Playwright tests before executing them in another environment.</p><h3>No warranty</h3><p>The software is provided under the MIT license without warranty. Production use requires authentication, tenant isolation and a hardened execution worker.</p>' },
  security: { title: 'Security policy', html: () => '<h3>Current protections</h3><p>The server binds to loopback by default, rejects cross-origin writes, validates payloads and selectors, limits request size, writes data atomically and serves a restrictive Content Security Policy (no inline scripts or styles).</p><h3>Reporting</h3><p>Do not include secrets or personal data in a report. See <code>SECURITY.md</code> for the supported disclosure process and production limitations.</p>' },
  storage: { title: 'Storage & cookie inventory', html: () => `<h3>Server storage</h3><p>Current backend: <b>${storageName()}</b>. Docker mode uses PostgreSQL in a local volume; otherwise a JSON file in <code>data/</code> is used.</p><h3>Cookies</h3><p><code>tp_session</code> is an HttpOnly, SameSite=Strict authentication cookie. There are no analytics or advertising cookies.</p><h3>Browser storage</h3><p><code>traceproof_privacy_choice</code> records whether this notice was dismissed and <code>traceproof_speed</code> remembers your replay speed.</p><h3>Third-party SDKs</h3><p>None at runtime besides the PostgreSQL driver on the server. No analytics, pixels, remote fonts or tracking SDKs.</p>` }
};

/* ------------------------------------------------------------------ api + toasts */
async function api(url, options = {}) {
  const resp = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Request failed (${resp.status})`);
  return data;
}
function notify(message, error = false) {
  const stack = $('#toast-stack');
  const toast = document.createElement('div');
  toast.className = `toast ${error ? 'error' : ''}`;
  toast.innerHTML = `<span class="toast-icon" aria-hidden="true">${error ? '✕' : '✓'}</span><span></span><button type="button" aria-label="Dismiss">×</button>`;
  toast.querySelector('span:nth-child(2)').textContent = message;
  stack.append(toast);
  while (stack.children.length > 4) stack.firstElementChild.remove();
  requestAnimationFrame(() => toast.classList.add('show'));
  const close = () => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 260); };
  toast.querySelector('button').addEventListener('click', close);
  setTimeout(close, error ? 5200 : 3600);
}
function current() { return state.cases.find(item => item.id === state.selected) || state.cases[0] || null; }
function currentRun() { return state.runs.find(r => r.caseId === current()?.id) || null; }

async function reload({ initial = false } = {}) {
  $('main').setAttribute('aria-busy', 'true');
  try {
    const result = await api('/api/state');
    Object.assign(state, { cases: result.cases, runs: result.runs, projects: result.projects || [], team: result.team || [], platform: result.platform || {}, metrics: result.metrics, infrastructure: result.infrastructure || {}, session: result.session || state.session });
    if (!state.cases.find(c => c.id === state.selected)) state.selected = state.cases[0]?.id || null;
    if (initial && current()) { const path = current().steps[0]?.value; if (path) loadPreview(path); }
    render();
  } finally { $('main').removeAttribute('aria-busy'); }
}
function render() { renderRunner(); renderStorage(); renderMetrics(); renderOverview(); renderCases(); renderCurrent(); renderInspector(); renderHistory(); renderProjects(); renderTeam(); renderSession(); renderPlatform(); }

/* ------------------------------------------------------------------ overview */
function countTo(el, value, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(value)) { el.textContent = '—'; el.dataset.value = ''; return; }
  const from = Number(el.dataset.value || 0); el.dataset.value = value;
  if (reducedMotion() || from === value) { el.textContent = `${value}${suffix}`; return; }
  const start = performance.now(), duration = 700;
  const tick = now => { const t = Math.min((now - start) / duration, 1), e = 1 - Math.pow(1 - t, 3); el.textContent = `${Math.round(from + (value - from) * e)}${suffix}`; if (t < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
function renderStorage() { $$('[data-storage-label]').forEach(el => { el.textContent = storageName(); }); }
function renderMetrics() {
  const m = state.metrics;
  countTo($('#metric-cases'), m.cases); countTo($('#metric-runs'), m.runs); countTo($('#metric-passing'), m.passing); countTo($('#metric-failing'), m.failing);
  countTo($('#hero-cases'), m.cases); countTo($('#hero-runs'), m.runs);
  const rate = m.passRate;
  countTo($('#metric-rate'), rate, '%'); countTo($('#hero-rate'), rate, '%'); countTo($('#activity-rate'), rate, '%'); countTo($('#activity-total'), m.runs);
  $('#pass-ring').style.setProperty('--p', `${rate ?? 0}`);
  $('#pass-ring').classList.toggle('low', rate !== null && rate < 60);
  const durations = state.runs.map(r => r.durationMs).sort((a, b) => a - b);
  $('#activity-median').textContent = durations.length ? `${durations[Math.floor(durations.length / 2)]} ms` : '—';
}
function renderOverview() {
  const last = state.runs[0], hud = $('#hud-last-run');
  hud.textContent = last ? `${last.status === 'passed' ? '✓ PASS' : '✕ FAIL'} · ${relative(last.createdAt).toUpperCase()}` : 'NO RUNS YET';
  hud.className = last ? last.status : '';
  $('#overview-feed').innerHTML = state.runs.slice(0, 6).map(r => `<li><button type="button" data-open-case="${esc(r.caseId)}"><span class="feed-status ${esc(r.status)}">${r.status === 'passed' ? '✓' : '✕'}</span><span class="feed-main"><b>${esc(r.caseTitle)}</b><small>${r.events.length} steps · ${r.durationMs} ms</small></span><time datetime="${esc(r.createdAt)}">${esc(relative(r.createdAt))}</time></button></li>`).join('') || '<li class="empty-state">No replays yet. Use quick replay to generate your first evidence.</li>';
  $('#quick-count').textContent = state.cases.length;
  $('#quick-replay').innerHTML = state.cases.slice(0, 6).map(c => { const r = state.runs.find(x => x.caseId === c.id); return `<button type="button" class="quick-item" data-quick-run="${esc(c.id)}"><span class="severity ${esc(c.severity)}">${esc(c.severity.toUpperCase())}</span><span class="quick-main"><b>${esc(c.title)}</b><small>${c.steps.length} steps · ${r ? `last ${r.status}` : 'never run'}</small></span><span class="quick-play" aria-hidden="true">▶</span></button>`; }).join('') || '<div class="empty-state">No cases yet.</div>';
}

/* ------------------------------------------------------------------ cases + workbench */
function filteredCases() {
  const severity = { critical: 0, high: 1, medium: 2, low: 3 };
  return state.cases.filter(c => (state.filter === 'all' || c.severity === state.filter) && `${c.title} ${c.description}`.toLowerCase().includes(state.search)).sort((a, b) => {
    if (state.sort === 'severity') return severity[a.severity] - severity[b.severity] || a.title.localeCompare(b.title);
    if (state.sort === 'title') return a.title.localeCompare(b.title);
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
}
function renderCases() {
  const results = filteredCases(); $('#case-count').textContent = state.cases.length;
  $('#case-list').innerHTML = results.length ? results.map(c => {
    const r = state.runs.find(run => run.caseId === c.id);
    const status = r ? (r.status === 'passed' ? '✓ PASS' : '✕ FAIL') : `${c.steps.length} STEPS`;
    return `<button class="case-card ${c.id === state.selected ? 'active' : ''}" role="option" aria-selected="${c.id === state.selected}" data-case="${esc(c.id)}"><div class="case-card-top"><span class="ref">TP-${String(state.cases.length - state.cases.indexOf(c)).padStart(3, '0')}</span><span class="case-status ${r ? r.status : ''}">${esc(status)}</span></div><div class="case-card-title">${esc(c.title)}</div><div class="case-card-text">${esc(c.description || 'No description added.')}</div><div class="case-card-footer"><span class="severity ${c.severity}">${esc(c.severity.toUpperCase())}</span><span>${esc(c.source)}</span></div></button>`;
  }).join('') : '<div class="empty-state">No incidents match these filters.<br/>Try another search.</div>';
  $$('.filter').forEach(el => el.classList.toggle('active', el.dataset.filter === state.filter));
}
function renderCurrent() {
  const c = current();
  $('#selected-title').textContent = c?.title || 'No case selected';
  $('#selected-desc').textContent = c?.description || 'Create a case to get started.';
  $('#selected-severity').className = `severity ${c?.severity || 'medium'}`;
  $('#selected-severity').textContent = (c?.severity || 'medium').toUpperCase();
  $('#case-source b').textContent = c?.source || '—';
  $('#case-updated b').textContent = c ? timeAgo(c.updatedAt) : '—';
  const run = currentRun();
  $('#step-indicator').textContent = state.running ? `STEP ${state.activeStep + 1} / ${c?.steps.length || 0}` : `${c?.steps.length || 0} STEPS`;
  $('#step-list').innerHTML = c?.steps.map((s, i) => {
    const event = state.latestEvents[0]?._case === c.id ? state.latestEvents[i] : (state.running ? null : run?.events[i]);
    const cls = state.running && i === state.activeStep ? 'current' : event?.status || '';
    return `<div class="step ${cls}"><span class="step-index">${String(i + 1).padStart(2, '0')}</span><div class="step-main"><strong>${esc(label(s.action))}</strong><small>${esc(stepInfo(s))}</small></div><span class="step-status ${event?.status || ''}">${event?.status === 'passed' ? '✓' : event?.status === 'failed' ? '✕' : state.running && i === state.activeStep ? '◌' : '○'}</span></div>`;
  }).join('') || '<div class="empty-state">Add your first reproduction step.</div>';
  for (const id of ['edit-case', 'duplicate-case', 'delete-case', 'run-case', 'download-spec']) $('#' + id).disabled = !c || state.running;
  $('#run-case').textContent = state.running ? `◉ Replaying step ${state.activeStep + 1}…` : '▶ Run reproduction';
  const total = c?.steps.length || 0, done = state.running ? state.latestEvents.length : 0;
  $('#replay-progress').style.setProperty('--progress', total ? `${done / total}` : '0');
  $('#replay-progress').parentElement.classList.toggle('active', state.running);
  $('.workspace-panel').classList.toggle('is-running', state.running);
  const list = $('#step-list'), active = list.querySelector('.step.current');
  if (active) { const top = active.offsetTop - list.offsetTop; if (top < list.scrollTop || top + active.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTo({ top: top - 8, behavior: reducedMotion() ? 'auto' : 'smooth' }); }
}
function renderInspector() {
  const c = current();
  $$('.inspector-tab').forEach(e => e.classList.toggle('active', e.dataset.inspector === state.inspector));
  const container = $('#inspector-body');
  if (!c) { container.innerHTML = '<div class="empty-state">No case to inspect.</div>'; return; }
  if (state.inspector === 'code') {
    const code = state.codeCache[c.id];
    if (typeof code !== 'string') { container.innerHTML = '<div class="empty-state"><span class="symbol">⌘</span>Loading generated Playwright test…</div>'; loadCode(c); return; }
    container.innerHTML = `<div class="inspect-kicker">PLAYWRIGHT / TYPESCRIPT</div><div class="inspect-label">GENERATED REPRODUCTION TEST</div><div class="code-wrap"><div class="code-head">${esc(c.title)} <span>.spec.ts</span></div><pre id="code-text"></pre></div><button id="copy-code" class="btn btn-outline full-width">⧉ Copy test code</button><p class="form-hint">Output targets the bundled demo routes. Install Playwright to run the spec in a real browser.</p>`;
    $('#code-text').textContent = code; return;
  }
  if (state.inspector === 'json') {
    container.innerHTML = '<div class="inspect-kicker">STRUCTURED TEST CASE</div><div class="inspect-label">PORTABLE JSON</div><div class="code-wrap"><div class="code-head">case.json <span>JSON</span></div><pre id="json-text"></pre></div><button id="copy-json" class="btn btn-outline full-width">⧉ Copy JSON</button>';
    $('#json-text').textContent = JSON.stringify(c, null, 2); return;
  }
  const r = currentRun();
  if (!r) { container.innerHTML = '<div class="empty-state"><span class="symbol">◎</span><strong>No execution evidence yet</strong><p>Run this reproduction to collect step results, the observed DOM text, and failure details.</p><small>Press <kbd>R</kbd> or the Run button.</small></div>'; return; }
  const fail = r.events.find(ev => ev.status === 'failed');
  const real = r.source === 'playwright-chromium';
  const artifacts = real ? `<div class="artifact-card"><div class="inspect-label">CHROMIUM ARTIFACTS</div><img src="/api/artifacts/${esc(r.id)}/screenshot.png" alt="Final Chromium screenshot of ${esc(r.caseTitle)}" loading="lazy" /><a class="btn btn-outline full-width" href="/api/artifacts/${esc(r.id)}/trace.zip" download>${icon('download')} Download trace.zip</a><p class="form-hint">Open it with <code>npx playwright show-trace</code> or drop it on trace.playwright.dev.</p></div>` : '';
  container.innerHTML = `<div class="inspect-kicker">LATEST EXECUTION · ${esc(timeAgo(r.createdAt))} · <span class="engine ${real ? 'real' : ''}">${real ? 'PLAYWRIGHT · CHROMIUM' : 'DOM REPLAY'}</span></div><div class="inspect-status ${r.status}"><div class="inspect-kicker">${r.status === 'passed' ? 'VALIDATED SCENARIO' : 'REPRODUCED DEFECT'}</div><h3>${r.status === 'passed' ? '✓ All checks passed' : '✕ Assertion failed'}</h3><p>${fail ? esc(fail.detail) : `All ${r.events.length} steps completed successfully in ${r.durationMs} ms.`}</p></div><div class="inspect-label">EXECUTION TIMELINE · ${r.events.length} EVENTS</div><ol class="timeline">${r.events.map((e, i) => `<li class="evidence-card ${e.status}"><strong>${String(i + 1).padStart(2, '0')} / ${esc(label(e.action))}</strong><em class="${e.status}">${e.durationMs} ms</em><small>${esc(e.detail)}</small>${e.snapshot && (e.status === 'failed' || i === r.events.length - 1) ? `<details><summary class="evidence-summary">DOM snapshot</summary><pre>${esc(e.snapshot)}</pre></details>` : ''}</li>`).join('')}</ol>${artifacts}<button class="btn btn-outline full-width" id="copy-evidence">⧉ Copy execution evidence</button>`;
}
async function loadCode(c) {
  try {
    const res = await fetch(`/api/cases/${encodeURIComponent(c.id)}/spec`);
    if (!res.ok) throw new Error('Could not generate spec');
    state.codeCache[c.id] = await res.text();
    if (current()?.id === c.id && state.inspector === 'code') renderInspector();
  } catch (e) { notify(e.message, true); }
}

/* ------------------------------------------------------------------ runs */
function filteredRuns() { return state.runs.filter(r => (state.runFilter === 'all' || r.status === state.runFilter) && r.caseTitle.toLowerCase().includes(state.runSearch)); }
function renderHistory() {
  const runs = filteredRuns(), shown = runs.slice(0, state.runLimit);
  $('#history-body').innerHTML = shown.map(r => `<tr tabindex="0" data-open-case="${esc(r.caseId)}"><td><strong>${esc(r.caseTitle)}</strong>${r.source === 'playwright-chromium' ? ' <span class="engine real">CHROMIUM</span>' : ''}</td><td><span class="status ${r.status}">${r.status.toUpperCase()}</span></td><td>${r.events.length}</td><td>${r.durationMs} ms</td><td>${esc(timeAgo(r.createdAt))}</td></tr>`).join('') || `<tr><td colspan="5" class="history-empty">${state.runs.length ? 'No runs match this filter.' : 'No recorded runs. Select a case and press Run reproduction.'}</td></tr>`;
  $('#history-count').textContent = runs.length ? `Showing ${shown.length} of ${runs.length}` : '';
  $('#history-more').classList.toggle('hidden', runs.length <= state.runLimit);
  $$('[data-run-filter]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.runFilter === state.runFilter)));
  // cumulative pass-rate sparkline (oldest → newest)
  const recent = state.runs.slice(0, 30).reverse(); let passed = 0;
  const points = recent.map((r, i) => { if (r.status === 'passed') passed++; return [recent.length === 1 ? 120 : (i / (recent.length - 1)) * 240, 60 - (passed / (i + 1)) * 54]; });
  const svg = $('#run-trend');
  if (points.length) {
    const line = points.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
    svg.innerHTML = `<defs><linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3dffd0" stop-opacity=".35"/><stop offset="1" stop-color="#3dffd0" stop-opacity="0"/></linearGradient></defs><polygon points="0,64 ${line} 240,64" fill="url(#trend-fill)"/><polyline points="${line}" fill="none" stroke="#3dffd0" stroke-width="2" vector-effect="non-scaling-stroke"/>${points.length ? `<circle cx="${points.at(-1)[0]}" cy="${points.at(-1)[1]}" r="3" fill="#ff3d9a"/>` : ''}`;
    $('#run-trend-caption').textContent = `Cumulative over the last ${recent.length} runs`;
  } else { svg.innerHTML = ''; $('#run-trend-caption').textContent = 'No runs yet'; }
}

/* ------------------------------------------------------------------ projects, team, session, platform */
function renderProjects() {
  $('#project-total').textContent = state.projects.filter(item => item.status === 'active').length;
  $('#database-status').textContent = storageName().toUpperCase();
  $('#project-grid').innerHTML = state.projects.map((project, index) => `<article data-project-card="${esc(project.id)}"><span class="project-key">${esc(project.key)} // 0${index + 1}</span><h2>${esc(project.name)}</h2><p>${esc(project.description || 'No project description.')}</p><div class="project-actions"><span>${esc(project.status)} · ${state.cases.length} signals</span><button data-edit-project="${esc(project.id)}">Configure ↗</button></div></article>`).join('') || '<div class="empty-state">No projects yet. Authenticate as admin to create one.</div>';
  state.projects.forEach(project => $(`[data-project-card="${CSS.escape(project.id)}"]`)?.style.setProperty('--project-accent', project.accent));
}
function renderTeam() {
  $('#team-grid').innerHTML = state.team.map(member => `<article class="team-card"><div class="team-avatar">${esc(member.name.split(/\s+/).map(word => word[0]).join('').slice(0, 2))}</div><h2>${esc(member.name)}</h2><p>${esc(member.role)}</p><div class="team-meta"><span>${esc(member.scope)}</span><b>${esc(member.status.toUpperCase())}</b></div></article>`).join('');
}
function renderSession() {
  const user = state.session?.user;
  $('#account-state').innerHTML = `<i></i> ${user ? 'SESSION ACTIVE' : 'SIGNED OUT'}`;
  $('#account-state').classList.toggle('on', Boolean(user));
  $('#session-details').innerHTML = user ? `<dl><dt>IDENTITY</dt><dd>${esc(user.name)}</dd><dt>EMAIL</dt><dd>${esc(user.email)}</dd><dt>ROLE</dt><dd>${esc(user.role.toUpperCase())}</dd><dt>STORAGE</dt><dd>${esc(storageName().toUpperCase())}</dd><dt>COOKIE</dt><dd>HTTPONLY / STRICT</dd></dl>` : '<span class="empty-state">No authenticated session.</span>';
  $('#logout-button').classList.toggle('hidden', !user);
  $('#login-form').classList.toggle('hidden', Boolean(user));
  if (user) $('#account-avatar').textContent = user.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase(); else $('#account-avatar').innerHTML = icon('account');
  $('#account-chip-text').textContent = user ? user.role : 'Sign in';
  $('#account-chip').classList.toggle('signed-in', Boolean(user));
}
function renderPlatform() {
  const platform = state.platform || {};
  $('#release-readiness').textContent = `${Math.max(62, 100 - (state.metrics.failing || 0) * 8)}%`;
  const flips = state.runs.filter((run, index) => { const prev = state.runs.slice(index + 1).find(r => r.caseId === run.caseId); return prev && prev.status !== run.status; }).length;
  $('#flaky-count').textContent = flips;
  $('#integration-list').innerHTML = (platform.integrations || []).map(item => `<button data-integration="${esc(item.id)}"><span><b>${esc(item.name)}</b><small>${esc(item.mode)} adapter</small></span><em class="${esc(item.status)}">${esc(item.status.toUpperCase())}</em></button>`).join('');
  $('#schedule-list').innerHTML = (platform.schedules || []).map(item => `<button data-schedule="${esc(item.id)}"><span><b>${esc(item.name)}</b><small>${esc(item.cron)}</small></span><em class="${item.enabled ? 'on' : ''}">${item.enabled ? 'ON' : 'OFF'}</em></button>`).join('');
  // trend chart from real runs, no inline style attributes (CSP-safe)
  const chart = $('#trend-chart'); const chronological = state.runs.slice(0, 36).reverse();
  if (!chronological.length) { chart.innerHTML = '<span class="empty-state">Replay a case to start the trend.</span>'; return; }
  const windows = Math.min(6, chronological.length), size = Math.ceil(chronological.length / windows);
  chart.innerHTML = '';
  for (let w = 0; w < windows; w++) {
    const slice = chronological.slice(w * size, (w + 1) * size); if (!slice.length) continue;
    const rate = Math.round(slice.filter(r => r.status === 'passed').length / slice.length * 100);
    const bar = document.createElement('i'); bar.style.setProperty('--v', `${Math.max(rate, 4)}%`); bar.dataset.label = `${rate}%`; bar.title = `Window ${w + 1}: ${rate}% passing (${slice.length} runs)`;
    chart.append(bar);
  }
  $('#trend-caption').textContent = `${chronological.length} most recent runs split into ${windows} windows.`;
}
async function platformAction(action, extra = {}) {
  if (state.session?.user?.role !== 'admin') { setView('account'); notify('Admin session required for control-plane actions', true); return null; }
  const result = await api('/api/platform/action', { method: 'POST', body: JSON.stringify({ action, ...extra }) });
  await reload(); return result;
}

/* ------------------------------------------------------------------ replay engine */
function selectCase(id) {
  if (state.running) return;
  state.selected = id; state.activeStep = -1; state.latestEvents = [];
  state.inspector = 'evidence'; const path = current()?.steps[0]?.value;
  if (path) loadPreview(path);
  render();
}
function loadPreview(path) {
  if (!['/sandbox/shop', '/sandbox/login'].includes(path)) return;
  $('#browser-address').textContent = `127.0.0.1 ${path}`;
  $('#sandbox-frame').src = path;
}
function waitForLoad(frame, route) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { frame.removeEventListener('load', handler); reject(new Error('The sandbox took too long to load')); }, 6500);
    const handler = () => { clearTimeout(timer); resolve(); };
    frame.addEventListener('load', handler, { once: true });
    frame.src = route;
    $('#browser-address').textContent = `127.0.0.1 ${route}`;
  });
}
function isVisible(node, win) {
  if (!node) return false;
  const style = win.getComputedStyle(node);
  return style.display !== 'none' && style.visibility !== 'hidden' && node.getBoundingClientRect().width > 0;
}
const HIGHLIGHT = { pending: ['#ffc857', '0 0 0 6px rgba(255,200,87,.28)'], passed: ['#3dffd0', '0 0 0 6px rgba(61,255,208,.25)'], failed: ['#ff4d7d', '0 0 0 6px rgba(255,77,125,.3)'] };
function highlight(node, kind) {
  if (!node?.style) return;
  if (!node.dataset.tpOutline) node.dataset.tpOutline = JSON.stringify({ outline: node.style.outline, offset: node.style.outlineOffset, shadow: node.style.boxShadow, transition: node.style.transition });
  const [color, shadow] = HIGHLIGHT[kind];
  node.style.transition = 'outline-color .15s, box-shadow .15s';
  node.style.outline = `3px solid ${color}`; node.style.outlineOffset = '3px'; node.style.boxShadow = shadow;
  try { node.scrollIntoView({ block: 'nearest' }); } catch { /* detached */ }
}
function unhighlight(node) {
  if (!node?.dataset?.tpOutline) return;
  const prev = JSON.parse(node.dataset.tpOutline); delete node.dataset.tpOutline;
  node.style.outline = prev.outline; node.style.outlineOffset = prev.offset; node.style.boxShadow = prev.shadow; node.style.transition = prev.transition;
}
function textSnapshot(doc) { return String(doc.body?.innerText || '').trim().slice(0, 1500); }
async function executeStep(step, frame, delay) {
  const detail = { status: 'passed', action: step.action, detail: '', durationMs: 0, url: '', snapshot: '' };
  let node = null, actionMs = 0;
  try {
    if (step.action === 'navigate') { const t = performance.now(); await waitForLoad(frame, step.value); actionMs = performance.now() - t; detail.detail = `Opened ${step.value}`; }
    else {
      const doc = frame.contentDocument, win = frame.contentWindow;
      if (!doc || !win) throw new Error('Sandbox unavailable');
      node = doc.querySelector(`[data-testid="${CSS.escape(step.target)}"]`);
      if (node) { highlight(node, 'pending'); await sleep(delay * 0.55); }
      const t = performance.now();
      if (step.action === 'assertVisible') {
        if (!isVisible(node, win)) throw new Error(`Expected [data-testid="${step.target}"] to be visible, but it was not found or was hidden.`);
        detail.detail = `Verified ${step.target} is visible`;
      } else if (step.action === 'assertText') {
        const actual = node?.textContent?.trim() || '';
        if (!node || !actual.includes(step.value)) throw new Error(`Expected ${step.target} to contain “${step.value}”; observed “${actual || '(empty or missing)'}”.`);
        detail.detail = `Verified ${step.target} includes “${step.value}”`;
      } else if (step.action === 'click') {
        if (!isVisible(node, win)) throw new Error(`Cannot click missing or hidden element: ${step.target}`);
        if (node.disabled) throw new Error(`Cannot click disabled element: ${step.target}`);
        node.click(); detail.detail = `Clicked ${step.target}`;
      } else if (step.action === 'fill') {
        if (!node || !('value' in node)) throw new Error(`Cannot fill element: ${step.target}`);
        node.value = step.value;
        node.dispatchEvent(new win.Event('input', { bubbles: true }));
        node.dispatchEvent(new win.Event('change', { bubbles: true }));
        detail.detail = `Filled ${step.target} with ${step.target.toLowerCase().includes('password') ? '[redacted]' : 'provided test value'}`;
      }
      await sleep(85);
      actionMs = performance.now() - t;
    }
  } catch (err) { detail.status = 'failed'; detail.detail = err.message; }
  if (node) highlight(node, detail.status);
  try {
    detail.url = frame.contentWindow?.location?.pathname || '';
    detail.snapshot = textSnapshot(frame.contentDocument).replaceAll('DemoPass123', '[demo credential hidden]');
  } catch { detail.snapshot = '(No accessible DOM snapshot)'; }
  detail.durationMs = Math.round(actionMs);
  if (step.action !== 'navigate') { await sleep(delay * 0.45); if (detail.status === 'passed') unhighlight(node); }
  return detail;
}
async function runCase() {
  const c = current(); if (state.running || !c) return;
  if (state.view !== 'workbench') setView('workbench');
  state.running = true; state.activeStep = 0; state.latestEvents = [];
  $('#sandbox-badge').textContent = '◉ REPLAYING'; $('#sandbox-badge').className = 'sandbox-badge live';
  renderCurrent();
  const events = []; const delay = reducedMotion() ? Math.min(SPEEDS[state.speed], 120) : SPEEDS[state.speed];
  try {
    for (let i = 0; i < c.steps.length; i++) {
      state.activeStep = i; renderCurrent();
      const result = await executeStep(c.steps[i], $('#sandbox-frame'), delay);
      events.push(result); state.latestEvents = events.map(e => ({ ...e, _case: c.id }));
      renderCurrent();
      if (result.status === 'failed') break;
    }
    const failed = events.some(e => e.status === 'failed');
    const run = await api('/api/runs', { method: 'POST', body: JSON.stringify({ caseId: c.id, status: failed ? 'failed' : 'passed', events, durationMs: events.reduce((sum, e) => sum + e.durationMs, 0) }) });
    $('#sandbox-badge').textContent = failed ? '✕ DEFECT REPRODUCED' : '✓ SCENARIO PASSED'; $('#sandbox-badge').className = `sandbox-badge ${failed ? 'failed' : 'passed'}`;
    $('#browser-shell').classList.remove('flash-passed', 'flash-failed'); void $('#browser-shell').offsetWidth; $('#browser-shell').classList.add(failed ? 'flash-failed' : 'flash-passed');
    notify(failed ? `Defect reproduced · ${run.events.length} steps recorded` : `Scenario passed · ${run.events.length} steps verified`, failed);
    globe?.pulse(failed ? 'failed' : 'passed');
    state.inspector = 'evidence';
    await reload();
  } catch (e) { notify(e.message, true); $('#sandbox-badge').textContent = '◉ IDLE'; $('#sandbox-badge').className = 'sandbox-badge'; }
  finally { state.running = false; state.activeStep = -1; render(); }
}
function renderRunner() {
  const btn = $('#run-playwright'); if (!btn) return;
  btn.disabled = !current() || state.running || !state.runner.available;
  btn.dataset.tip = state.runner.available ? 'Run in an isolated headless Chromium and record trace.zip' : state.runner.reason || 'Playwright unavailable';
  $('#runner-state').textContent = state.runner.available ? 'CHROMIUM READY' : 'DOM REPLAY ONLY';
  $('#runner-state').classList.toggle('on', Boolean(state.runner.available));
}
async function runPlaywright() {
  const c = current(); if (state.running || !c) return;
  if (!state.runner.available) return notify(state.runner.reason || 'Playwright is not available on this server', true);
  if (!state.session?.user) { setView('account'); return notify('Sign in (engineer or admin) to launch a real browser run', true); }
  if (state.view !== 'workbench') setView('workbench');
  state.running = true; state.activeStep = 0; state.latestEvents = []; render();
  $('#sandbox-badge').textContent = '◉ CHROMIUM RUNNING'; $('#sandbox-badge').className = 'sandbox-badge live';
  $('#run-playwright').classList.add('busy');
  try {
    const run = await api('/api/runs/playwright', { method: 'POST', body: JSON.stringify({ caseId: c.id }) });
    const failed = run.status === 'failed';
    $('#sandbox-badge').textContent = failed ? '✕ DEFECT REPRODUCED · CHROMIUM' : '✓ PASSED · CHROMIUM'; $('#sandbox-badge').className = `sandbox-badge ${failed ? 'failed' : 'passed'}`;
    notify(failed ? 'Chromium reproduced the defect · trace.zip recorded' : 'Chromium run passed · trace.zip recorded', failed);
    globe?.pulse(failed ? 'failed' : 'passed');
    state.inspector = 'evidence'; await reload();
  } catch (error) { notify(error.message, true); $('#sandbox-badge').textContent = '◉ IDLE'; $('#sandbox-badge').className = 'sandbox-badge'; }
  finally { $('#run-playwright').classList.remove('busy'); state.running = false; state.activeStep = -1; render(); }
}
function setSpeed(speed) {
  if (!SPEEDS[speed]) return;
  state.speed = speed; store.set('traceproof_speed', speed);
  $$('[data-speed]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.speed === speed)));
}
function exportEvidence(r) {
  if (!r) return '';
  return [`TRACEPROOF QA EXECUTION — ${r.status.toUpperCase()}`, `Case: ${r.caseTitle}`, `When: ${r.createdAt}`, `Duration: ${r.durationMs} ms`, '', ...r.events.flatMap((ev, i) => [`[${i + 1}] ${label(ev.action)} — ${ev.status.toUpperCase()} (${ev.durationMs} ms)`, ev.detail, `Route: ${ev.url}`, ...(ev.status === 'failed' ? [`DOM: ${ev.snapshot}`] : []), ''])].join('\n');
}
async function copy(text) { if (!text) return notify('Nothing to copy yet', true); try { await navigator.clipboard.writeText(text); notify('Copied to clipboard'); } catch { notify('Clipboard access unavailable: use the downloadable export.', true); } }
function openCase(id) {
  if (!state.cases.some(c => c.id === id)) return notify('That case was deleted; its run history is kept as evidence.', true);
  setView('workbench'); selectCase(id);
}
async function quickRun(id) { if (state.running) return; setView('workbench'); selectCase(id); await sleep(60); runCase(); }

/* ------------------------------------------------------------------ modals */
function showBackdrop(el) { el.classList.remove('hidden'); requestAnimationFrame(() => el.classList.add('open')); }
function hideBackdrop(el) { el.classList.remove('open'); el.classList.add('hidden'); }
function modalOpen(entry = null) {
  lastFocus = document.activeElement;
  state.editorId = entry?.id || null;
  $('#modal-title').textContent = entry ? 'Edit reproduction case' : 'New reproduction case';
  $('#form-title').value = entry?.title || '';
  $('#form-description').value = entry?.description || '';
  $('#form-severity').value = entry?.severity || 'medium';
  $('#form-source').value = entry?.source || 'Manual report';
  state.editSteps = structuredClone(entry?.steps || [{ action: 'navigate', value: '/sandbox/shop' }, { action: 'assertVisible', target: 'product-card' }]);
  renderEditor(); showBackdrop($('#modal-backdrop')); $('#form-title').focus();
}
function modalClose() { hideBackdrop($('#modal-backdrop')); lastFocus?.focus?.(); }
function collectEditor() {
  state.editSteps = $$('.editor-step').map(row => ({ action: row.querySelector('.editor-action').value, target: row.querySelector('.editor-target').value, value: row.querySelector('.editor-value').value }));
}
function renderEditor() {
  $('#step-editor').innerHTML = state.editSteps.map((s, i) => {
    const needsTarget = s.action !== 'navigate'; const needsValue = ['navigate', 'fill', 'assertText'].includes(s.action);
    return `<div class="editor-step" data-index="${i}"><span class="index">${i + 1}</span><select class="editor-action" aria-label="Step ${i + 1} action">${actions.map(a => `<option ${s.action === a ? 'selected' : ''} value="${a}">${label(a)}</option>`).join('')}</select><input class="editor-target" list="testid-options" ${!needsTarget ? 'disabled' : ''} placeholder="data-testid" aria-label="Step ${i + 1} target" value="${esc(s.target || '')}"/><input class="editor-value" ${!needsValue ? 'disabled' : ''} placeholder="${s.action === 'navigate' ? '/sandbox/shop' : s.action === 'fill' ? 'Input value' : 'Expected text'}" aria-label="Step ${i + 1} value" value="${esc(s.value || '')}"/><button type="button" class="remove-step" data-remove="${i}" aria-label="Remove step ${i + 1}">×</button></div>`;
  }).join('');
}
async function submitModal(e) {
  e.preventDefault(); collectEditor();
  const steps = state.editSteps.map(s => { const obj = { action: s.action }; if (s.action === 'navigate') obj.value = s.value; else { obj.target = s.target; if (['fill', 'assertText'].includes(s.action)) obj.value = s.value; } return obj; });
  const entry = { title: $('#form-title').value, description: $('#form-description').value, severity: $('#form-severity').value, source: $('#form-source').value, steps };
  const editing = Boolean(state.editorId);
  try {
    const result = await api(editing ? `/api/cases/${state.editorId}` : '/api/cases', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(entry) });
    state.selected = result.id; delete state.codeCache[result.id]; modalClose(); await reload(); loadPreview(result.steps[0].value); setView('workbench');
    notify(editing ? 'Case updated' : 'New QA case created');
  } catch (error) { notify(error.message, true); }
}
function projectModalOpen(project = null) {
  if (!state.session?.user || state.session.user.role !== 'admin') { setView('account'); return notify('Sign in with the admin demo account to manage projects', true); }
  lastFocus = document.activeElement; state.projectEditorId = project?.id || null;
  $('#project-modal-title').textContent = project ? 'Configure project' : 'New project';
  $('#project-name').value = project?.name || ''; $('#project-key').value = project?.key || '';
  $('#project-description').value = project?.description || ''; $('#project-accent').value = project?.accent || '#3dffd0'; $('#project-status').value = project?.status || 'active';
  showBackdrop($('#project-backdrop')); $('#project-name').focus();
}
function projectModalClose() { hideBackdrop($('#project-backdrop')); lastFocus?.focus?.(); }
async function submitProject(event) {
  event.preventDefault();
  const body = { name: $('#project-name').value, key: $('#project-key').value, description: $('#project-description').value, accent: $('#project-accent').value, status: $('#project-status').value };
  const editing = Boolean(state.projectEditorId);
  try {
    await api(editing ? `/api/projects/${state.projectEditorId}` : '/api/projects', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(body) });
    projectModalClose(); await reload(); setView('projects'); notify(`Project ${editing ? 'updated' : 'created'} · ${storageName()}`);
  } catch (error) { notify(error.message, true); }
}
function closeInfo() { hideBackdrop($('#info-backdrop')); lastFocus?.focus?.(); }
function openInfo(key) {
  const doc = documents[key]; if (!doc) return;
  lastFocus = document.activeElement;
  $('#info-title').textContent = doc.title; $('#info-content').innerHTML = doc.html();
  showBackdrop($('#info-backdrop')); $('#info-close').focus();
}

/* ------------------------------------------------------------------ command palette */
let paletteItems = [], paletteIndex = 0;
function paletteCommands() {
  const cmds = VIEW_META.map((v, i) => ({ group: 'Navigate', icon: v.icon, label: `Go to ${v.label}`, hint: String(i + 1), keywords: `${v.id} ${v.desc}`, run: () => setView(v.id) }));
  cmds.push(
    { group: 'Actions', icon: 'plus', label: 'Create a new case', hint: 'N', keywords: 'add case editor', run: () => modalOpen() },
    { group: 'Actions', icon: 'play', label: current() ? `Run “${current().title}”` : 'Run selected case', hint: 'R', keywords: 'replay execute reproduction', run: () => runCase() },
    { group: 'Actions', icon: 'chip', label: 'Run selected case in real Chromium (Playwright)', keywords: 'playwright trace zip real browser', run: () => runPlaywright() },
    { group: 'Actions', icon: 'download', label: 'Export Playwright spec of selected case', keywords: 'download test typescript', run: () => current() && window.location.assign(`/api/cases/${encodeURIComponent(current().id)}/spec`) },
    { group: 'Actions', icon: 'download', label: 'Export workspace JSON', keywords: 'backup download data', run: () => window.location.assign('/api/export') },
    { group: 'Actions', icon: 'upload', label: 'Import cases from JSON', keywords: 'upload restore', run: () => $('#import-file').click() },
    { group: 'Actions', icon: 'runs', label: 'Copy latest evidence', keywords: 'clipboard run report', run: () => copy(exportEvidence(state.runs[0])) },
    { group: 'Globe', icon: 'recenter', label: 'Recenter globe on my city', keywords: 'earth planet location', run: () => { setView('overview'); globe?.focus(); } },
    { group: 'Globe', icon: 'locate', label: 'Use precise location', keywords: 'gps geolocation city', run: () => { setView('overview'); locate(); } },
    ...Object.keys(SPEEDS).map(speed => ({ group: 'Replay speed', icon: 'chip', label: `Replay speed: ${speed === 'slow' ? 'Slow-mo' : speed[0].toUpperCase() + speed.slice(1)}`, keywords: 'tempo velocity', run: () => { setSpeed(speed); notify(`Replay speed set to ${speed}`); } })),
    { group: 'Information', icon: 'trust', label: 'Privacy policy', keywords: 'trust legal', run: () => openInfo('privacy') },
    { group: 'Information', icon: 'database', label: 'Storage inventory', keywords: 'cookies data', run: () => openInfo('storage') }
  );
  state.cases.forEach(c => cmds.push({ group: 'Cases', icon: 'workbench', label: c.title, hint: c.severity.toUpperCase(), keywords: `${c.description} ${c.source} case open`, run: () => openCase(c.id) }));
  return cmds;
}
function renderPalette() {
  const query = $('#palette-input').value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  paletteItems = paletteCommands().filter(cmd => { const hay = `${cmd.group} ${cmd.label} ${cmd.keywords || ''}`.toLowerCase(); return query.every(q => hay.includes(q)); }).slice(0, 40);
  paletteIndex = Math.min(paletteIndex, Math.max(paletteItems.length - 1, 0));
  let group = '';
  $('#palette-list').innerHTML = paletteItems.map((cmd, i) => { const head = cmd.group !== group ? `<li class="palette-group" role="presentation">${esc(cmd.group)}</li>` : ''; group = cmd.group; return `${head}<li role="option" id="palette-opt-${i}" class="palette-item ${i === paletteIndex ? 'active' : ''}" aria-selected="${i === paletteIndex}" data-index="${i}"><span class="palette-icon">${icon(cmd.icon)}</span><span class="palette-label">${esc(cmd.label)}</span>${cmd.hint ? `<kbd>${esc(cmd.hint)}</kbd>` : ''}</li>`; }).join('') || '<li class="palette-empty">No matching command.</li>';
  $('#palette-input').setAttribute('aria-activedescendant', paletteItems.length ? `palette-opt-${paletteIndex}` : '');
  $('#palette-list .active')?.scrollIntoView({ block: 'nearest' });
}
function openPalette(prefill = '') {
  closeSheet(); lastFocus = document.activeElement;
  $('#palette-input').value = prefill; paletteIndex = 0; renderPalette();
  showBackdrop($('#palette-backdrop')); $('#palette-input').focus();
}
function closePalette() { hideBackdrop($('#palette-backdrop')); lastFocus?.focus?.(); }
function runPaletteItem(i) { const cmd = paletteItems[i]; if (!cmd) return; closePalette(); cmd.run(); }

/* ------------------------------------------------------------------ navigation */
const nav = $('#primary-nav'), glider = $('.nav-glider'), hover = $('.nav-hover'), topbar = $('#topbar');
nav.insertAdjacentHTML('beforeend', VIEW_META.map((v, i) => v.primary ? `<button class="nav-tab" role="tab" id="tab-${v.id}" aria-selected="false" aria-controls="view-${v.id}" tabindex="-1" data-view="${v.id}" title="${esc(v.label)} (${i + 1})"><span class="tab-icon">${icon(v.icon)}</span>${esc(v.label)}</button>` : '').join('') + `<button class="nav-tab nav-more" id="nav-more" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="more-menu"><span class="tab-icon">${icon('more')}</span><b id="nav-more-label">More</b><i class="caret">${icon('chevron')}</i></button>`);
const moreBtn = $('#nav-more'), moreMenu = $('#more-menu');
moreMenu.innerHTML = '<span class="more-group">Views</span>' + VIEW_META.map((v, i) => v.primary ? '' : `<button type="button" role="menuitem" class="more-item" data-view-jump="${v.id}"><span class="sheet-icon">${icon(v.icon)}</span><span><b>${esc(v.label)}</b><small>${esc(v.desc)}</small></span><kbd>${i + 1}</kbd></button>`).join('')
  + `<span class="more-group">Workspace data</span><button type="button" role="menuitem" class="more-item" id="import-trigger"><span class="sheet-icon">${icon('upload')}</span><span><b>Import cases</b><small>Load a TraceProof JSON export</small></span></button><a role="menuitem" class="more-item" href="/api/export" download><span class="sheet-icon">${icon('download')}</span><span><b>Export workspace</b><small>Download cases and runs as JSON</small></span></a>`;
function openMore() {
  const navRect = topbar.getBoundingClientRect(), r = moreBtn.getBoundingClientRect();
  moreMenu.style.setProperty('--mx', `${Math.min(r.left - navRect.left, navRect.width - 320)}px`);
  topbar.classList.add('more-open'); moreBtn.setAttribute('aria-expanded', 'true');
}
function closeMore() { topbar.classList.remove('more-open'); moreBtn.setAttribute('aria-expanded', 'false'); }
moreBtn.addEventListener('click', event => { event.stopPropagation(); topbar.classList.contains('more-open') ? closeMore() : (openMore(), moreMenu.querySelector('.more-item')?.focus({ preventScroll: true })); });
moreMenu.addEventListener('keydown', event => {
  const items = $$('.more-item'), i = items.indexOf(document.activeElement);
  if (event.key === 'ArrowDown') { event.preventDefault(); items[(i + 1) % items.length].focus(); }
  if (event.key === 'ArrowUp') { event.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  if (event.key === 'Escape') { closeMore(); moreBtn.focus(); }
});
document.addEventListener('pointerdown', event => { if (topbar.classList.contains('more-open') && !moreMenu.contains(event.target) && !moreBtn.contains(event.target)) closeMore(); });
$('#nav-sheet-grid').innerHTML = VIEW_META.map((v, i) => `<button type="button" class="sheet-item" data-view-jump="${v.id}"><span class="sheet-icon">${icon(v.icon)}</span><span><b>${esc(v.label)}</b><small>${esc(v.desc)}</small></span><kbd>${i + 1}</kbd></button>`).join('');
let gliderRect = null, gliderTimer = 0;
function placeIndicator(el, tab) { el.style.setProperty('--x', `${tab.offsetLeft}px`); el.style.setProperty('--w', `${tab.offsetWidth}px`); }
function moveGlider(animate = true) {
  const tab = nav.querySelector('.nav-tab.active') || moreBtn; if (!tab || !nav.offsetParent) return;
  const next = { x: tab.offsetLeft, w: tab.offsetWidth };
  clearTimeout(gliderTimer);
  if (!animate || !gliderRect || reducedMotion()) { glider.classList.add('no-anim'); placeIndicator(glider, tab); void glider.offsetWidth; glider.classList.remove('no-anim'); }
  else {
    // Liquid stretch: span old → new, then contract onto the target.
    const left = Math.min(gliderRect.x, next.x), right = Math.max(gliderRect.x + gliderRect.w, next.x + next.w);
    glider.classList.add('stretch'); glider.style.setProperty('--x', `${left}px`); glider.style.setProperty('--w', `${right - left}px`);
    gliderTimer = setTimeout(() => { glider.classList.remove('stretch'); placeIndicator(glider, tab); }, 170);
  }
  gliderRect = next; glider.classList.add('ready');
  if (nav.scrollWidth > nav.clientWidth) { const left = tab.offsetLeft - 8, right = tab.offsetLeft + tab.offsetWidth + 8; if (left < nav.scrollLeft) nav.scrollLeft = left; else if (right > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = right - nav.clientWidth; }
}
nav.addEventListener('pointerover', event => { const tab = event.target.closest('.nav-tab'); if (!tab) return; placeIndicator(hover, tab); hover.classList.add('visible'); });
nav.addEventListener('pointerleave', () => hover.classList.remove('visible'));
nav.addEventListener('click', event => { const tab = event.target.closest('[data-view]'); if (tab) setView(tab.dataset.view); });
nav.addEventListener('keydown', event => {
  const tabs = $$('.nav-tab[data-view]'), i = tabs.indexOf(document.activeElement); if (i < 0) return;
  const next = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
  if (next === undefined) return; event.preventDefault(); tabs[next].focus(); setView(tabs[next].dataset.view);
});
function openSheet() { topbar.classList.add('sheet-open'); $('#menu-toggle').setAttribute('aria-expanded', 'true'); $('#menu-toggle').setAttribute('aria-label', 'Close navigation menu'); }
function closeSheet() { topbar.classList.remove('sheet-open'); $('#menu-toggle').setAttribute('aria-expanded', 'false'); $('#menu-toggle').setAttribute('aria-label', 'Open navigation menu'); }
$('#menu-toggle').addEventListener('click', () => topbar.classList.contains('sheet-open') ? closeSheet() : openSheet());
document.addEventListener('pointerdown', event => { if (topbar.classList.contains('sheet-open') && !topbar.contains(event.target)) closeSheet(); });
$('#sheet-palette').addEventListener('click', () => openPalette());

function setView(name, { updateHash = true } = {}) {
  if (!views.has(name)) name = 'overview';
  const order = VIEW_META.findIndex(v => v.id === name), prev = VIEW_META.findIndex(v => v.id === state.view);
  $('main').dataset.dir = order >= prev ? 'forward' : 'back';
  const changed = state.view !== name; state.view = name;
  $$('[data-view-panel]').forEach(panel => { const active = panel.dataset.viewPanel === name; panel.classList.toggle('active', active); panel.hidden = !active; });
  $$('.nav-tab[data-view]').forEach(tab => { const active = tab.dataset.view === name; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; });
  const secondary = !VIEW_META[order].primary;
  moreBtn.classList.toggle('active', secondary); $('#nav-more-label').textContent = secondary ? VIEW_META[order].label : 'More';
  if (secondary) $('#tab-overview').tabIndex = 0;
  $$('.sheet-item, .more-item').forEach(item => item.classList.toggle('active', item.dataset.viewJump === name));
  requestAnimationFrame(() => moveGlider(changed)); closeSheet(); closeMore();
  document.title = `${VIEW_META[order].label} · TraceProof`;
  if (changed) { showBar({ hold: 700 }); window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' }); }
  if (updateHash) history.replaceState(null, '', `#${name}`);
}
document.body.addEventListener('click', event => { const target = event.target.closest('[data-view-jump],[data-view-link]'); if (target) { event.preventDefault(); setView(target.dataset.viewJump || target.dataset.viewLink); } });
window.addEventListener('hashchange', () => setView(location.hash.slice(1), { updateHash: false }));

let scrollTick = false, lastScrollY = window.scrollY, travel = 0, pointerOnBar = false, holdUntil = 0;
const HIDE_AFTER = 12, SHOW_AFTER = 28, TOP_ZONE = 24;
function keyboardFocusInBar() { const el = document.activeElement; return Boolean(el && el !== document.body && topbar.contains(el) && el.matches(':focus-visible')); }
function hideBar() {
  if (topbar.classList.contains('is-hidden') || pointerOnBar || performance.now() < holdUntil) return;
  if (topbar.classList.contains('sheet-open') || topbar.classList.contains('more-open') || keyboardFocusInBar()) return;
  topbar.classList.add('is-hidden');
}
function showBar({ hold = 0 } = {}) {
  if (hold) holdUntil = performance.now() + hold;
  topbar.classList.remove('is-hidden');
}
function onScroll() {
  const y = Math.max(window.scrollY, 0), max = document.documentElement.scrollHeight - innerHeight, dy = y - lastScrollY;
  lastScrollY = y;
  topbar.classList.toggle('condensed', y > 8);
  $('#scroll-progress').style.setProperty('--progress', max > 0 ? `${Math.min(y / max, 1)}` : '0');
  // accumulate travel in one direction; reset when direction flips (hysteresis stops show/hide thrashing)
  travel = Math.sign(dy) === Math.sign(travel) ? travel + dy : dy;
  if (y <= TOP_ZONE) showBar();
  else if (travel > HIDE_AFTER) hideBar();
  else if (travel < -SHOW_AFTER) showBar();
  scrollTick = false;
}
topbar.addEventListener('pointerenter', () => { pointerOnBar = true; });
topbar.addEventListener('pointerleave', () => { pointerOnBar = false; });
document.addEventListener('pointermove', event => { if (event.pointerType === 'mouse' && event.clientY < 8 && topbar.classList.contains('is-hidden')) showBar({ hold: 900 }); }, { passive: true });
topbar.addEventListener('focusin', () => { if (keyboardFocusInBar()) showBar(); });
$('#topbar-dock').addEventListener('click', () => showBar({ hold: 900 }));
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', () => { moveGlider(false); if (innerWidth > 1180) closeSheet(); });
new ResizeObserver(() => moveGlider(false)).observe(nav);

/* ------------------------------------------------------------------ events */
$('#case-list').addEventListener('click', event => { const button = event.target.closest('[data-case]'); if (button) selectCase(button.dataset.case); });
$('#case-search').addEventListener('input', event => { state.search = event.target.value.toLowerCase().trim(); renderCases(); });
$('#case-sort').addEventListener('change', event => { state.sort = event.target.value; renderCases(); });
$('.case-filters').addEventListener('click', event => { const b = event.target.closest('[data-filter]'); if (b) { state.filter = b.dataset.filter; renderCases(); } });
$('.inspector-tabs').addEventListener('click', event => { const b = event.target.closest('[data-inspector]'); if (b) { state.inspector = b.dataset.inspector; renderInspector(); } });
$('#inspector-body').addEventListener('click', event => {
  if (event.target.id === 'copy-code') copy(state.codeCache[current()?.id]);
  if (event.target.id === 'copy-json') copy(JSON.stringify(current(), null, 2));
  if (event.target.id === 'copy-evidence') copy(exportEvidence(currentRun()));
});
$('#run-case').addEventListener('click', runCase);
$('#run-playwright').addEventListener('click', runPlaywright);
$('.speed-control').addEventListener('click', event => { const b = event.target.closest('[data-speed]'); if (b) setSpeed(b.dataset.speed); });
$('#download-spec').addEventListener('click', () => { if (current()) window.location.assign(`/api/cases/${encodeURIComponent(current().id)}/spec`); });
$('#refresh-preview').addEventListener('click', () => loadPreview(current()?.steps[0]?.value || '/sandbox/shop'));
$('#new-case').addEventListener('click', () => modalOpen());
$('#edit-case').addEventListener('click', () => current() && modalOpen(current()));
$('#duplicate-case').addEventListener('click', async () => {
  const c = current(); if (!c) return;
  try { const created = await api('/api/cases', { method: 'POST', body: JSON.stringify({ ...c, title: `Copy of ${c.title}`.slice(0, 130) }) }); state.selected = created.id; await reload(); notify('Duplicated case'); }
  catch (e) { notify(e.message, true); }
});
$('#delete-case').addEventListener('click', async () => {
  const c = current(); if (!c || !confirm(`Delete “${c.title}”? Historical runs will remain in execution history.`)) return;
  try { await api(`/api/cases/${c.id}`, { method: 'DELETE' }); state.selected = null; await reload(); notify('Case deleted'); }
  catch (e) { notify(e.message, true); }
});
$('#copy-latest').addEventListener('click', () => copy(exportEvidence(state.runs[0])));
$('#run-filter').addEventListener('click', event => { const b = event.target.closest('[data-run-filter]'); if (!b) return; state.runFilter = b.dataset.runFilter; state.runLimit = 12; renderHistory(); });
$('#run-search').addEventListener('input', event => { state.runSearch = event.target.value.toLowerCase().trim(); state.runLimit = 12; renderHistory(); });
$('#history-more').addEventListener('click', () => { state.runLimit += 12; renderHistory(); });
document.body.addEventListener('click', event => { const el = event.target.closest('[data-open-case]'); if (el) openCase(el.dataset.openCase); const q = event.target.closest('[data-quick-run]'); if (q) quickRun(q.dataset.quickRun); });
$('#history-body').addEventListener('keydown', event => { const row = event.target.closest('[data-open-case]'); if (row && event.key === 'Enter') openCase(row.dataset.openCase); });
$('#hero-quick-run').addEventListener('click', () => { const target = state.cases.find(c => /confirmation/i.test(c.title)) || state.cases.find(c => c.severity === 'critical') || state.cases[0]; if (target) quickRun(target.id); else notify('No cases available yet', true); });
$('#import-trigger').addEventListener('click', () => { closeMore(); $('#import-file').click(); });
$('#import-file').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    if (file.size > 150000) throw new Error('JSON is too large (max 150 KB)');
    const result = await api('/api/import', { method: 'POST', body: JSON.stringify(JSON.parse(await file.text())) });
    await reload(); notify(`Imported ${result.imported} cases`);
  } catch (err) { notify(err.message, true); } finally { e.target.value = ''; }
});
$('#modal-close').addEventListener('click', modalClose);
$('#modal-cancel').addEventListener('click', modalClose);
$('#modal-backdrop').addEventListener('click', event => { if (event.target.id === 'modal-backdrop') modalClose(); });
$('#new-project').addEventListener('click', () => projectModalOpen());
$('#project-grid').addEventListener('click', event => { const button = event.target.closest('[data-edit-project]'); if (button) projectModalOpen(state.projects.find(item => item.id === button.dataset.editProject)); });
$('#project-form').addEventListener('submit', submitProject);
$('#project-close').addEventListener('click', projectModalClose);
$('#project-cancel').addEventListener('click', projectModalClose);
$('#project-backdrop').addEventListener('click', event => { if (event.target.id === 'project-backdrop') projectModalClose(); });
const DEMO_ACCOUNTS = { admin: ['admin@traceproof.local', 'TraceProof!2026'], engineer: ['qa@traceproof.local', 'Quality!2026'] };
$('.role-picker').addEventListener('click', event => { const b = event.target.closest('[data-demo-account]'); if (!b) return; const [email, password] = DEMO_ACCOUNTS[b.dataset.demoAccount]; $('#login-email').value = email; $('#login-password').value = password; $$('[data-demo-account]').forEach(x => x.setAttribute('aria-checked', String(x === b))); });
$('#toggle-password').addEventListener('click', () => { const input = $('#login-password'), show = input.type === 'password'; input.type = show ? 'text' : 'password'; $('#toggle-password').setAttribute('aria-label', show ? 'Hide password' : 'Show password'); $('#toggle-password').textContent = show ? '◌' : '◉'; });
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  try { const result = await api('/api/login', { method: 'POST', body: JSON.stringify({ email: $('#login-email').value, password: $('#login-password').value }) }); state.session = result; await reload(); notify(`Secure session established · ${result.user.role}`); }
  catch (error) { notify(error.message, true); }
});
$('#logout-button').addEventListener('click', async () => { try { await api('/api/logout', { method: 'POST', body: '{}' }); await reload(); notify('Session ended'); } catch (error) { notify(error.message, true); } });
$('#contact-message').addEventListener('input', event => { $('#contact-count').textContent = `${event.target.value.length} / 3000`; });
$('#contact-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const result = await api('/api/contact', { method: 'POST', body: JSON.stringify({ name: $('#contact-name').value, email: $('#contact-email').value, subject: $('#contact-subject').value, message: $('#contact-message').value, consent: $('#contact-consent').checked }) });
    event.target.reset(); $('#contact-count').textContent = '0 / 3000'; notify(`Message stored locally · ${result.storage || storageName()}`);
  } catch (error) { notify(error.message, true); }
});
$('#integration-list').addEventListener('click', async event => { const button = event.target.closest('[data-integration]'); if (!button) return; try { const result = await platformAction('integration.toggle', { id: button.dataset.integration }); if (result) notify(`Integration ${result.status} · simulation adapter`); } catch (error) { notify(error.message, true); } });
$('#schedule-list').addEventListener('click', async event => { const button = event.target.closest('[data-schedule]'); if (!button) return; try { const result = await platformAction('schedule.toggle', { id: button.dataset.schedule }); if (result) notify(`Nightly agent ${result.enabled ? 'enabled' : 'paused'}`); } catch (error) { notify(error.message, true); } });
document.body.addEventListener('click', async event => {
  const button = event.target.closest('[data-platform-action]'); if (!button) return;
  try {
    const action = button.dataset.platformAction; button.classList.add('busy');
    const result = await platformAction(action, action === 'notification.send' ? { channel: 'Slack', message: 'TraceProof regression digest: portfolio run complete.' } : {}); if (!result) return;
    if (action === 'playwright.run') $('#worker-output').textContent = JSON.stringify(result.job, null, 2);
    if (action === 'notification.send') $('#automation-output').textContent = JSON.stringify(result.notification, null, 2);
    if (action === 'apikey.create') $('#sdk-output').textContent = `SAVE THIS KEY — SHOWN ONCE\n${result.key}\n\nGET /api/sdk for Node and Python examples.`;
    if (action === 'sso.configure') $('#identity-output').textContent = JSON.stringify(result.identity, null, 2);
    if (action === 'audit.sign') $('#identity-output').textContent = `SHA-256 AUDIT SIGNATURE\n${result.signature}`;
    notify(`${action} completed (simulation)`);
  } catch (error) { notify(error.message, true); } finally { button.classList.remove('busy'); }
});
$('#trace-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 25_000_000) throw new Error('Trace exceeds the 25 MB portfolio limit');
    if (!window.JSZip) throw new Error('ZIP reader is still loading, try again');
    const zip = await window.JSZip.loadAsync(await file.arrayBuffer()); const names = Object.keys(zip.files); const result = await platformAction('trace.import', { name: file.name, files: names.length }); if (!result) return;
    $('#trace-output').textContent = `${result.trace.status.toUpperCase()} · ${result.trace.files} files\n${names.slice(0, 8).join('\n')}`; notify('Playwright trace indexed locally');
  } catch (error) { notify(error.message, true); } finally { event.target.value = ''; }
});
$('[data-example-report]').addEventListener('click', () => { $('#ai-report').value = 'Critical: after clicking Add to cart the counter updates but no confirmation message appears'; $('#ai-report').focus(); });
$('#generate-case').addEventListener('click', async () => {
  const report = $('#ai-report').value.trim(); if (report.length < 12) return notify('Describe the defect in at least 12 characters', true);
  const login = /login|sign.?in|sesión|acceso/i.test(report); const route = login ? '/sandbox/login' : '/sandbox/shop';
  const steps = login ? [{ action: 'navigate', value: route }, { action: 'fill', target: 'login-email', value: 'demo@example.com' }, { action: 'fill', target: 'login-password', value: 'DemoPass123' }, { action: 'click', target: 'submit-login' }, { action: 'assertText', target: 'login-result', value: 'Welcome back' }] : [{ action: 'navigate', value: route }, { action: 'click', target: 'add-to-cart' }, { action: 'assertText', target: 'cart-toast', value: 'Added to cart' }];
  const draft = { title: report.slice(0, 96), description: `Locally structured from a natural-language report. Human review required. Original: ${report}`, severity: /critical|crítico|bloquea|payment|pago/i.test(report) ? 'critical' : 'medium', source: 'Assisted authoring', steps };
  $('#ai-output').textContent = JSON.stringify(draft, null, 2);
  try { const created = await api('/api/cases', { method: 'POST', body: JSON.stringify(draft) }); state.selected = created.id; await reload(); notify('Reviewable QA case generated · open it in the workbench'); }
  catch (error) { notify(error.message, true); }
});
document.body.addEventListener('click', event => { const button = event.target.closest('[data-doc]'); if (button) openInfo(button.dataset.doc); if (event.target.closest('[data-open-palette]')) openPalette(); });
$('#info-close').addEventListener('click', closeInfo);
$('#info-backdrop').addEventListener('click', event => { if (event.target.id === 'info-backdrop') closeInfo(); });
$('#cmd-trigger').addEventListener('click', () => openPalette());
$('#cmd-kbd').textContent = isMac ? '⌘K' : 'Ctrl K';
$('#palette-backdrop').addEventListener('click', event => { if (event.target.id === 'palette-backdrop') closePalette(); });
$('#palette-input').addEventListener('input', () => { paletteIndex = 0; renderPalette(); });
$('#palette-list').addEventListener('click', event => { const item = event.target.closest('[data-index]'); if (item) runPaletteItem(Number(item.dataset.index)); });
$('#palette-list').addEventListener('pointermove', event => { const item = event.target.closest('[data-index]'); if (item && Number(item.dataset.index) !== paletteIndex) { paletteIndex = Number(item.dataset.index); renderPalette(); } });

const openBackdrop = () => ['#palette-backdrop', '#info-backdrop', '#project-backdrop', '#modal-backdrop'].map(s => $(s)).find(el => !el.classList.contains('hidden')) || null;
document.addEventListener('keydown', event => {
  const backdrop = openBackdrop();
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); backdrop?.id === 'palette-backdrop' ? closePalette() : openPalette(); return; }
  if (backdrop?.id === 'palette-backdrop') {
    if (event.key === 'ArrowDown') { event.preventDefault(); paletteIndex = Math.min(paletteIndex + 1, paletteItems.length - 1); renderPalette(); }
    if (event.key === 'ArrowUp') { event.preventDefault(); paletteIndex = Math.max(paletteIndex - 1, 0); renderPalette(); }
    if (event.key === 'Enter') { event.preventDefault(); runPaletteItem(paletteIndex); }
    if (event.key === 'Escape') closePalette();
    return;
  }
  if (event.key === 'Escape') { if (topbar.classList.contains('more-open')) closeMore(); else if (topbar.classList.contains('sheet-open')) closeSheet(); else if (backdrop?.id === 'info-backdrop') closeInfo(); else if (backdrop?.id === 'project-backdrop') projectModalClose(); else if (backdrop?.id === 'modal-backdrop') modalClose(); }
  if (event.key === 'Tab' && backdrop) {
    const focusable = [...backdrop.querySelectorAll('button,input,select,textarea,[href]')].filter(el => !el.disabled && el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    return;
  }
  // Global single-key shortcuts (never while typing or with modifiers)
  if (backdrop || isTyping(document.activeElement) || event.metaKey || event.ctrlKey || event.altKey) return;
  if (/^[1-9]$/.test(event.key)) { setView(VIEW_META[Number(event.key) - 1].id); return; }
  if (event.key === '/') { event.preventDefault(); if (state.view === 'workbench') $('#case-search').focus(); else openPalette(); return; }
  if (event.key === '?') { openPalette(); return; }
  if (event.key.toLowerCase() === 'n') { event.preventDefault(); modalOpen(); return; }
  if (event.key.toLowerCase() === 'r' && current()) { event.preventDefault(); runCase(); }
});
$('#case-form').addEventListener('submit', submitModal);
$('#add-step').addEventListener('click', () => { collectEditor(); if (state.editSteps.length >= 24) return notify('Maximum 24 steps per case', true); state.editSteps.push({ action: 'assertVisible', target: 'product-card' }); renderEditor(); $$('.editor-step').at(-1)?.querySelector('select')?.focus(); });
$('#step-editor').addEventListener('click', event => { const btn = event.target.closest('[data-remove]'); if (!btn) return; collectEditor(); state.editSteps.splice(Number(btn.dataset.remove), 1); renderEditor(); });
$('#step-editor').addEventListener('change', event => {
  if (!event.target.classList.contains('editor-action')) return;
  const pos = Number(event.target.closest('.editor-step').dataset.index); collectEditor();
  if (state.editSteps[pos].action === 'navigate') { state.editSteps[pos].value = '/sandbox/shop'; state.editSteps[pos].target = ''; }
  else if (!state.editSteps[pos].target) state.editSteps[pos].target = 'product-card';
  renderEditor();
});
const privacyBanner = $('#privacy-banner');
if (store.get('traceproof_privacy_choice') !== 'acknowledged') privacyBanner.classList.remove('hidden');
$('#privacy-session').addEventListener('click', () => privacyBanner.classList.add('hidden'));
$('#privacy-remember').addEventListener('click', () => { store.set('traceproof_privacy_choice', 'acknowledged'); privacyBanner.classList.add('hidden'); });
const clock = () => { try { $('#contact-clock').textContent = new Intl.DateTimeFormat(undefined, { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' }).format(new Date()) + ' · Bogotá'; } catch { /* keep default */ } };
clock(); setInterval(clock, 30000);

/* ------------------------------------------------------------------ globe */
let globe = null;
const SOURCES = { timezone: 'DETECTED · TIME ZONE', offset: 'ESTIMATED · UTC OFFSET', default: 'DEFAULT NODE', gps: 'PRECISE · BROWSER LOCATION' };
function showCity(city, source, coords = city, note = '') {
  $('#earth-city-name').textContent = `${city.name}, ${city.country}`;
  $('#earth-city-coords').textContent = formatCoords(coords.lat, coords.lon);
  $('#earth-city-source').textContent = 'YOU ARE HERE';
  $('#geo-city').textContent = `${city.name}, ${city.country}`;
  $('#geo-source').textContent = `${SOURCES[source] || 'LOCATION'}${note}`;
}
function locate() {
  if (!navigator.geolocation) return notify('Geolocation is unavailable in this browser', true);
  const btn = $('#earth-locate'), text = $('.geo-locate-label'); text.textContent = 'Waiting for permission…'; btn.disabled = true;
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: lat, longitude: lon } = pos.coords; const { city, distance } = nearestCity(lat, lon);
    globe?.setCity({ ...city, lat, lon }); showCity(city, 'gps', { lat, lon }, ` · ${Math.round(distance)} KM`);
    text.textContent = 'Location active'; btn.classList.add('on'); btn.disabled = false; notify(`Globe centered near ${city.name}`);
  }, () => { text.textContent = 'Precise location'; btn.disabled = false; notify('Location was not shared. Your time-zone city stays highlighted.', true); }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 3600000 });
}
try {
  globe = createGlobe({
    stage: $('#signal-field'), canvas: $('#earth-canvas'), overlay: $('#earth-overlay'), label: $('#earth-city'), landPoints: LAND_POINTS, hubs: HUBS,
    onFrameInfo: ({ lon, lat }) => {
      const wrapped = ((lon + 540) % 360) - 180;
      $('#signal-x').textContent = `${wrapped >= 0 ? '+' : '−'}${Math.abs(wrapped).toFixed(1).padStart(5, '0')}`;
      $('#signal-y').textContent = `${lat >= 0 ? '+' : '−'}${Math.abs(lat).toFixed(1).padStart(4, '0')}`;
    }
  });
  const detected = cityFromTimezone();
  globe.setCity(detected.city, { immediate: true }); showCity(detected.city, detected.source);
} catch (error) { console.error(error); $('#signal-field').classList.add('globe-failed'); }
$('#earth-locate').addEventListener('click', locate);
$('#earth-recenter').addEventListener('click', () => globe?.focus());

/* ------------------------------------------------------------------ boot */
$('#logo-glyph').innerHTML = LOGO_MARK;
hydrateIcons();
setSpeed(state.speed);
setView(location.hash.slice(1), { updateHash: false });
onScroll();
reload({ initial: true }).catch(e => notify(`Cannot connect to the local server: ${e.message}`, true));
api('/api/runner').then(status => { state.runner = status; renderRunner(); }).catch(() => { state.runner = { available: false, reason: 'Runner status unavailable' }; renderRunner(); });
