import { LAND_POINTS } from './world-points.js';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const label = word => ({ navigate: 'Navigate', click: 'Click', fill: 'Fill input', assertVisible: 'Assert visible', assertText: 'Assert text' }[word] || word);
const timeAgo = iso => { const t = new Date(iso); if (Number.isNaN(t.getTime())) return '—'; return t.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const stepInfo = step => step.action === 'navigate' ? step.value : step.action === 'assertText' ? `[data-testid="${step.target}"] includes “${step.value}”` : step.action === 'fill' ? `[data-testid="${step.target}"] ← ${step.target.toLowerCase().includes('password') ? '••••••••' : `“${step.value}”`}` : `[data-testid="${step.target}"]`;
const actions = ['navigate', 'click', 'fill', 'assertVisible', 'assertText'];
const state = { cases: [], runs: [], projects: [], team: [], platform: {}, trends: {}, infrastructure: {}, session: { authenticated: false, user: null }, metrics: {}, selected: null, search: '', filter: 'all', sort: 'updated', inspector: 'evidence', running: false, latestEvents: [], codeCache: {}, activeStep: -1, editorId: null, projectEditorId: null, editSteps: [] };
let lastFocus = null;
const documents = {
  privacy: { title: 'Privacy policy', html: '<h3>Local by design</h3><p>TraceProof does not send cases, execution evidence, messages, or demo credentials to a third party. In Docker mode, operational records remain in the local PostgreSQL volume.</p><h3>Data minimization</h3><p>Use fictional or redacted values in test cases. The replay engine redacts the bundled demo password before persisting a text snapshot.</p><h3>Your controls</h3><p>Export the workspace from the header. Delete individual cases and projects through their controls. Contact submissions require explicit consent.</p>' },
  terms: { title: 'Terms of use', html: '<h3>Review environment</h3><p>This application is a local QA demonstration. Evidence is produced by a lightweight DOM replay engine and must not be treated as a trusted compliance record.</p><h3>Responsible use</h3><p>Only test applications and data you are authorized to use. Review generated Playwright tests before executing them in another environment.</p><h3>No warranty</h3><p>The software is provided under the MIT license without warranty. Production use requires authentication, tenant isolation and a hardened execution worker.</p>' },
  security: { title: 'Security policy', html: '<h3>Current protections</h3><p>The server binds to loopback by default, rejects external navigation in cases, validates payloads and selectors, limits request size, writes data atomically and serves a restrictive Content Security Policy.</p><h3>Reporting</h3><p>Do not include secrets or personal data in a report. See <code>SECURITY.md</code> for the supported disclosure process and production limitations.</p>' },
  storage: { title: 'Storage & cookie inventory', html: '<h3>Server storage</h3><p>PostgreSQL stores projects, cases, runs, contact messages, and session hashes in a local Docker volume. The JSON fallback is used only outside Docker for isolated development.</p><h3>Cookies</h3><p><code>tp_session</code> is an HttpOnly, SameSite=Strict authentication cookie. <code>traceproof_privacy_choice</code> records only whether this notice was dismissed. There are no analytics or advertising cookies.</p><h3>Third-party SDKs</h3><p>The runtime uses only the PostgreSQL driver. No analytics, advertising pixels, remote fonts, or browser tracking SDKs are included.</p>' }
};

async function api(url, options = {}) {
  const resp = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Request failed (${resp.status})`);
  return data;
}
function notify(message, error = false) {
  const el = $('#toast'); el.textContent = message; el.classList.toggle('error', error); el.classList.add('show');
  clearTimeout(notify.timeout); notify.timeout = setTimeout(() => el.classList.remove('show'), 4000);
}
function current() { return state.cases.find(item => item.id === state.selected) || state.cases[0] || null; }
function currentRun() { return state.runs.find(r => r.caseId === current()?.id) || null; }

async function reload({ initial = false } = {}) {
  document.querySelector('main').setAttribute('aria-busy', 'true');
  try {
    const result = await api('/api/state');
    Object.assign(state, { cases: result.cases, runs: result.runs, projects: result.projects || [], team: result.team || [], platform: result.platform || {}, metrics: result.metrics, infrastructure: result.infrastructure || {}, session: result.session || state.session });
    if (!state.cases.find(c => c.id === state.selected)) state.selected = state.cases[0]?.id || null;
    if (initial && current()) { const path = current().steps[0]?.value; if (path) loadPreview(path); }
    render();
  } finally { document.querySelector('main').removeAttribute('aria-busy'); }
}
function render() { renderMetrics(); renderCases(); renderCurrent(); renderInspector(); renderHistory(); renderProjects(); renderTeam(); renderSession(); renderPlatform(); }
function renderMetrics() {
  $('#metric-cases').textContent = state.metrics.cases;
  $('#metric-runs').textContent = state.metrics.runs;
  $('#metric-passing').textContent = state.metrics.passing;
  $('#metric-failing').textContent = state.metrics.failing;
  $('#metric-rate').textContent = state.metrics.passRate === null ? '—' : `${state.metrics.passRate}%`;
  $('#activity-rate').textContent = state.metrics.passRate === null ? '—' : `${state.metrics.passRate}%`;
  $('#activity-total').textContent = state.metrics.runs;
}
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
  $('#case-list').innerHTML = results.length ? results.map((c, i) => {
    const r = state.runs.find(r => r.caseId === c.id);
    const status = r ? (r.status === 'passed' ? '✓ PASS' : '× FAIL') : `${c.steps.length} STEPS`;
    return `<button class="case-card ${c.id === state.selected ? 'active' : ''}" role="option" aria-selected="${c.id === state.selected}" data-case="${esc(c.id)}"><div class="case-card-top"><span class="ref">TP-${String(state.cases.length - state.cases.indexOf(c)).padStart(3,'0')}</span><span>${esc(status)}</span></div><div class="case-card-title">${esc(c.title)}</div><div class="case-card-text">${esc(c.description || 'No description added.')}</div><div class="case-card-footer"><span class="severity ${c.severity}">${esc(c.severity.toUpperCase())}</span><span>${esc(c.source)}</span></div></button>`;
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
  $('#step-indicator').textContent = `${c?.steps.length || 0} STEPS`;
  $('#step-list').innerHTML = c?.steps.map((s, i) => {
    const event = state.latestEvents[i] && state.latestEvents[0]?._case === c.id ? state.latestEvents[i] : run?.events[i];
    return `<div class="step ${state.running && i === state.activeStep ? 'current' : ''}"><span class="step-index">${String(i+1).padStart(2,'0')}</span><div class="step-main"><strong>${esc(label(s.action))}</strong><small>${esc(stepInfo(s))}</small></div><span class="step-status ${event?.status || ''}">${event?.status === 'passed' ? '✓' : event?.status === 'failed' ? '✕' : '○'}</span></div>`;
  }).join('') || '<div class="empty-state">Add your first reproduction step.</div>';
  for (const id of ['edit-case', 'duplicate-case', 'delete-case', 'run-case', 'download-spec']) $("#"+id).disabled = !c || state.running;
  $('#run-case').textContent = state.running ? `◉ Replaying step ${state.activeStep + 1}...` : '▶ Run reproduction';
}
function renderInspector() {
  const c = current();
  $$('.inspector-tab').forEach(e => e.classList.toggle('active', e.dataset.inspector === state.inspector));
  const container = $('#inspector-body');
  if (!c) { container.innerHTML = '<div class="empty-state">No case to inspect.</div>'; return; }
  if (state.inspector === 'code') {
    const code = state.codeCache[c.id];
    if (typeof code !== 'string') { container.innerHTML = '<div class="empty-state"><span class="symbol">⌘</span>Loading generated Playwright test...</div>'; loadCode(c); return; }
    container.innerHTML = `<div class="inspect-kicker">PLAYWRIGHT / TYPESCRIPT</div><div class="inspect-label">GENERATED REPRODUCTION TEST</div><div class="code-wrap"><div class="code-head">${esc(c.title)} <span>.spec.ts</span></div><pre id="code-text"></pre></div><button id="copy-code" class="btn btn-outline full-width">⧉ Copy test code</button><p class="form-hint">Output targets the bundled demo routes. Install Playwright to run the spec in a real browser.</p>`;
    $('#code-text').textContent = code; return;
  }
  if (state.inspector === 'json') {
    const text = JSON.stringify(c, null, 2);
    container.innerHTML = '<div class="inspect-kicker">STRUCTURED TEST CASE</div><div class="inspect-label">PORTABLE JSON</div><div class="code-wrap"><div class="code-head">case.json <span>JSON</span></div><pre id="json-text"></pre></div><button id="copy-json" class="btn btn-outline full-width">⧉ Copy JSON</button>';
    $('#json-text').textContent = text; return;
  }
  const r = currentRun();
  if (!r) {
    container.innerHTML = `<div class="empty-state"><span class="symbol">◎</span><strong>No execution evidence yet</strong><p>Run this reproduction to collect step results, the observed DOM text, and failure details.</p><small>The demo executes in an embedded, local test environment.</small></div>`; return;
  }
  const fail = r.events.find(ev => ev.status === 'failed');
  container.innerHTML = `<div class="inspect-kicker">LATEST EXECUTION · ${esc(timeAgo(r.createdAt))}</div><div class="inspect-status ${r.status}"><div class="inspect-kicker">${r.status === 'passed' ? 'VALIDATED SCENARIO' : 'REPRODUCED DEFECT'}</div><h3>${r.status === 'passed' ? '✓ All checks passed' : '✕ Assertion failed'}</h3><p>${fail ? esc(fail.detail) : `All ${r.events.length} steps completed successfully in ${r.durationMs} ms.`}</p></div><div class="inspect-label">EXECUTION TIMELINE · ${r.events.length} EVENTS</div>${r.events.map((e, i) => `<div class="evidence-card"><strong>${esc(e.status === 'passed' ? '✓' : '✕')} &nbsp; ${String(i+1).padStart(2,'0')} / ${esc(label(e.action))}</strong><em class="${e.status}">${e.durationMs}ms</em><small>${esc(e.detail)}</small>${e.snapshot && (e.status === 'failed' || i === r.events.length-1) ? `<details><summary class="evidence-summary">DOM snapshot</summary><pre>${esc(e.snapshot)}</pre></details>` : ''}</div>`).join('')}<button class="btn btn-outline full-width" id="copy-evidence">⧉ Copy execution evidence</button>`;
}
async function loadCode(c) {
  try {
    const res = await fetch(`/api/cases/${encodeURIComponent(c.id)}/spec`);
    if (!res.ok) throw new Error('Could not generate spec');
    state.codeCache[c.id] = await res.text();
    if (current()?.id === c.id && state.inspector === 'code') renderInspector();
  } catch (e) { notify(e.message, true); }
}
function renderHistory() {
  $('#history-body').innerHTML = state.runs.slice(0, 8).map(r => `<tr><td><strong>${esc(r.caseTitle)}</strong></td><td><span class="status ${r.status}">${r.status.toUpperCase()}</span></td><td>${r.events.length}</td><td>${r.durationMs} ms</td><td>${esc(timeAgo(r.createdAt))}</td></tr>`).join('') || '<tr><td colspan="5" class="history-empty">No recorded runs. Select a case and press Run reproduction.</td></tr>';
}
function renderProjects() {
  $('#project-total').textContent = state.projects.filter(item => item.status === 'active').length;
  $('#database-status').textContent = (state.infrastructure.database || 'connecting').toUpperCase();
  $('#project-grid').innerHTML = state.projects.map((project, index) => `<article data-project-card="${esc(project.id)}"><span class="project-key">${esc(project.key)} // 0${index + 1}</span><h2>${esc(project.name)}</h2><p>${esc(project.description || 'No project description.')}</p><div class="project-actions"><span>${esc(project.status)} · ${state.cases.length} signals</span><button data-edit-project="${esc(project.id)}">Configure ↗</button></div></article>`).join('') || '<div class="empty-state">No projects yet. Authenticate as admin to create one.</div>';
  state.projects.forEach(project => $(`[data-project-card="${project.id}"]`)?.style.setProperty('--project-accent', project.accent));
}
function renderTeam() {
  $('#team-grid').innerHTML = state.team.map(member => `<article class="team-card"><div class="team-avatar">${esc(member.name.split(/\s+/).map(word => word[0]).join('').slice(0,2))}</div><h2>${esc(member.name)}</h2><p>${esc(member.role)}</p><div class="team-meta"><span>${esc(member.scope)}</span><b>${esc(member.status.toUpperCase())}</b></div></article>`).join('');
}
function renderSession() {
  const user = state.session?.user;
  $('#account-state').innerHTML = `<i></i> ${user ? 'SESSION ACTIVE' : 'SIGNED OUT'}`;
  $('#session-details').innerHTML = user ? `<dl><dt>IDENTITY</dt><dd>${esc(user.name)}</dd><dt>EMAIL</dt><dd>${esc(user.email)}</dd><dt>ROLE</dt><dd>${esc(user.role.toUpperCase())}</dd><dt>DATABASE</dt><dd>${esc((state.infrastructure.database || 'unknown').toUpperCase())}</dd><dt>COOKIE</dt><dd>HTTPONLY / STRICT</dd></dl>` : '<span class="empty-state">No authenticated session.</span>';
  $('#logout-button').classList.toggle('hidden', !user);
  $('#login-form').classList.toggle('hidden', Boolean(user));
}
function renderPlatform() {
  const platform = state.platform || {};
  $('#release-readiness').textContent = `${Math.max(62, 100 - (state.metrics.failing || 0) * 8)}%`;
  $('#flaky-count').textContent = state.runs.filter((run, index) => index && state.runs[index - 1]?.caseId === run.caseId && state.runs[index - 1]?.status !== run.status).length;
  $('#integration-list').innerHTML = (platform.integrations || []).map(item => `<button data-integration="${esc(item.id)}"><span><b>${esc(item.name)}</b><small>${esc(item.mode)} adapter</small></span><em class="${esc(item.status)}">${esc(item.status.toUpperCase())}</em></button>`).join('');
  $('#schedule-list').innerHTML = (platform.schedules || []).map(item => `<button data-schedule="${esc(item.id)}"><span><b>${esc(item.name)}</b><small>${esc(item.cron)}</small></span><em>${item.enabled ? 'ON' : 'OFF'}</em></button>`).join('');
}
async function platformAction(action, extra = {}) {
  if (state.session?.user?.role !== 'admin') { setView('account'); notify('Admin session required for control-plane mutations', true); return null; }
  const result = await api('/api/platform/action', { method: 'POST', body: JSON.stringify({ action, ...extra }) });
  await reload(); return result;
}
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
  });
}
function isVisible(node, win) {
  if (!node) return false;
  const style = win.getComputedStyle(node);
  return style.display !== 'none' && style.visibility !== 'hidden' && node.getBoundingClientRect().width > 0;
}
function textSnapshot(doc) { return String(doc.body?.innerText || '').trim().slice(0, 1500); }
async function executeStep(step, frame) {
  const start = performance.now();
  const detail = { status: 'passed', action: step.action, detail: '', durationMs: 0, url: '', snapshot: '' };
  try {
    if (step.action === 'navigate') { await waitForLoad(frame, step.value); detail.detail = `Opened ${step.value}`; }
    else {
      const doc = frame.contentDocument, win = frame.contentWindow;
      if (!doc || !win) throw new Error('Sandbox unavailable');
      const node = doc.querySelector(`[data-testid="${step.target}"]`);
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
      await new Promise(resolve => setTimeout(resolve, 85));
    }
  } catch (err) { detail.status = 'failed'; detail.detail = err.message; }
  try {
    detail.url = frame.contentWindow?.location?.pathname || '';
    detail.snapshot = textSnapshot(frame.contentDocument);
    // Sample credentials are present in the sandbox UI; avoid saving the password in text snapshots.
    detail.snapshot = detail.snapshot.replaceAll('DemoPass123', '[demo credential hidden]');
  } catch { detail.snapshot = '(No accessible DOM snapshot)'; }
  detail.durationMs = Math.round(performance.now() - start);
  return detail;
}
async function runCase() {
  const c = current(); if (state.running || !c) return;
  state.running = true; state.activeStep = 0; state.latestEvents = [];
  renderCurrent();
  const start = performance.now(); const events = [];
  try {
    for (let i=0;i<c.steps.length;i++) {
      state.activeStep = i; renderCurrent();
      const result = await executeStep(c.steps[i], $('#sandbox-frame'));
      events.push(result); state.latestEvents = events.map(e => ({ ...e, _case: c.id }));
      renderCurrent();
      if (result.status === 'failed') break;
    }
    const failed = events.some(e => e.status === 'failed');
    const run = await api('/api/runs', { method: 'POST', body: JSON.stringify({ caseId: c.id, status: failed ? 'failed' : 'passed', events, durationMs: Math.round(performance.now() - start) }) });
    notify(failed ? `Defect reproduced · ${run.events.length} steps recorded` : `Scenario passed · ${run.events.length} steps verified`, failed);
    await reload();
  } catch (e) { notify(e.message, true); }
  finally { state.running = false; state.activeStep = -1; render(); }
}
function exportEvidence(r) {
  if (!r) return '';
  return [`TRACEPROOF QA EXECUTION — ${r.status.toUpperCase()}`, `Case: ${r.caseTitle}`, `When: ${r.createdAt}`, `Duration: ${r.durationMs} ms`, '', ...r.events.flatMap((ev, i) => [`[${i+1}] ${label(ev.action)} — ${ev.status.toUpperCase()} (${ev.durationMs} ms)`, ev.detail, `Route: ${ev.url}`, ...(ev.status === 'failed' ? [`DOM: ${ev.snapshot}`] : []), ''])].join('\n');
}
async function copy(text) { if (!text) return notify('Nothing to copy yet', true); try { await navigator.clipboard.writeText(text); notify('Copied to clipboard'); } catch { notify('Clipboard access unavailable: use the downloadable export.', true); } }
function modalOpen(entry = null) {
  lastFocus = document.activeElement;
  state.editorId = entry?.id || null;
  $('#modal-title').textContent = entry ? 'Edit reproduction case' : 'New reproduction case';
  $('#form-title').value = entry?.title || '';
  $('#form-description').value = entry?.description || '';
  $('#form-severity').value = entry?.severity || 'medium';
  $('#form-source').value = entry?.source || 'Manual report';
  state.editSteps = structuredClone(entry?.steps || [
    { action: 'navigate', value: '/sandbox/shop' },
    { action: 'assertVisible', target: 'product-card' }
  ]);
  renderEditor(); $('#modal-backdrop').classList.remove('hidden'); $('#form-title').focus();
}
function modalClose() { $('#modal-backdrop').classList.add('hidden'); lastFocus?.focus?.(); }
function collectEditor() {
  state.editSteps = $$('.editor-step').map(row => ({
    action: row.querySelector('.editor-action').value,
    target: row.querySelector('.editor-target').value,
    value: row.querySelector('.editor-value').value
  }));
}
function renderEditor() {
  $('#step-editor').innerHTML = state.editSteps.map((s, i) => {
    const needsTarget = s.action !== 'navigate'; const needsValue = ['navigate', 'fill', 'assertText'].includes(s.action);
    return `<div class="editor-step" data-index="${i}"><span class="index">${i + 1}</span><select class="editor-action" aria-label="Step ${i+1} action">${actions.map(a => `<option ${s.action===a ? 'selected' : ''} value="${a}">${label(a)}</option>`).join('')}</select><input class="editor-target" ${!needsTarget ? 'disabled' : ''} placeholder="data-testid" aria-label="Step ${i+1} target" value="${esc(s.target || '')}"/><input class="editor-value" ${!needsValue ? 'disabled' : ''} placeholder="${s.action==='navigate'?'\/sandbox/shop':s.action==='fill'?'Input value':'Expected text'}" aria-label="Step ${i+1} value" value="${esc(s.value || '')}"/><button type="button" class="remove-step" data-remove="${i}" aria-label="Remove step ${i+1}">×</button></div>`;
  }).join('');
}
async function submitModal(e) {
  e.preventDefault(); collectEditor();
  const steps = state.editSteps.map(s => { const obj = { action: s.action }; if (s.action === 'navigate') obj.value = s.value; else { obj.target=s.target; if(['fill','assertText'].includes(s.action)) obj.value=s.value; } return obj; });
  const entry = { title:$('#form-title').value, description:$('#form-description').value, severity:$('#form-severity').value, source:$('#form-source').value, steps };
  try {
    const result = await api(state.editorId ? `/api/cases/${state.editorId}` : '/api/cases', { method: state.editorId ? 'PUT' : 'POST', body: JSON.stringify(entry) });
    state.selected = result.id; delete state.codeCache[result.id]; modalClose(); await reload(); loadPreview(result.steps[0].value); setView('workbench');
    notify(state.editorId ? 'Case updated' : 'New QA case created');
  } catch (error) { notify(error.message, true); }
}

function projectModalOpen(project = null) {
  if (!state.session?.user || state.session.user.role !== 'admin') { setView('account'); return notify('Sign in with the admin demo account to manage projects', true); }
  lastFocus = document.activeElement; state.projectEditorId = project?.id || null;
  $('#project-modal-title').textContent = project ? 'Configure project' : 'New project';
  $('#project-name').value = project?.name || ''; $('#project-key').value = project?.key || '';
  $('#project-description').value = project?.description || ''; $('#project-accent').value = project?.accent || '#82f5d2'; $('#project-status').value = project?.status || 'active';
  $('#project-backdrop').classList.remove('hidden'); $('#project-name').focus();
}
function projectModalClose() { $('#project-backdrop').classList.add('hidden'); lastFocus?.focus?.(); }
async function submitProject(event) {
  event.preventDefault();
  const body = { name: $('#project-name').value, key: $('#project-key').value, description: $('#project-description').value, accent: $('#project-accent').value, status: $('#project-status').value };
  try {
    await api(state.projectEditorId ? `/api/projects/${state.projectEditorId}` : '/api/projects', { method: state.projectEditorId ? 'PUT' : 'POST', body: JSON.stringify(body) });
    projectModalClose(); await reload(); setView('projects'); notify(state.projectEditorId ? 'Project updated in PostgreSQL' : 'Project created in PostgreSQL');
  } catch (error) { notify(error.message, true); }
}

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
$('#download-spec').addEventListener('click', () => { if (current()) window.location.assign(`/api/cases/${encodeURIComponent(current().id)}/spec`); });
$('#refresh-preview').addEventListener('click', () => loadPreview(current()?.steps[0]?.value || '/sandbox/shop'));
$('#new-case').addEventListener('click', () => modalOpen());
$('#edit-case').addEventListener('click', () => current() && modalOpen(current()));
$('#duplicate-case').addEventListener('click', async () => {
  const c = current(); if (!c) return;
  try {
    const created = await api('/api/cases', { method: 'POST', body: JSON.stringify({ ...c, title: `Copy of ${c.title}`.slice(0,130) }) });
    state.selected = created.id; await reload(); notify('Duplicated case');
  } catch (e) { notify(e.message, true); }
});
$('#delete-case').addEventListener('click', async () => {
  const c = current(); if (!c || !confirm(`Delete “${c.title}”? Historical runs will remain in execution history.`)) return;
  try { await api(`/api/cases/${c.id}`, {method:'DELETE'}); state.selected = null; await reload(); notify('Case deleted'); }
  catch(e) { notify(e.message, true); }
});
$('#copy-latest').addEventListener('click', () => copy(exportEvidence(state.runs[0])));
$('#import-trigger').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    if (file.size > 150000) throw new Error('JSON is too large (max 150 KB)');
    const input = JSON.parse(await file.text());
    const result = await api('/api/import', {method:'POST',body:JSON.stringify(input)});
    await reload(); notify(`Imported ${result.imported} cases`);
  } catch(e) { notify(e.message,true); } finally { e.target.value=''; }
});
$('#modal-close').addEventListener('click', modalClose);
$('#modal-cancel').addEventListener('click', modalClose);
$('#modal-backdrop').addEventListener('click', event => { if(event.target.id==='modal-backdrop') modalClose(); });
$('#new-project').addEventListener('click', () => projectModalOpen());
$('#project-grid').addEventListener('click', event => { const button = event.target.closest('[data-edit-project]'); if (button) projectModalOpen(state.projects.find(item => item.id === button.dataset.editProject)); });
$('#project-form').addEventListener('submit', submitProject);
$('#project-close').addEventListener('click', projectModalClose);
$('#project-cancel').addEventListener('click', projectModalClose);
$('#project-backdrop').addEventListener('click', event => { if (event.target.id === 'project-backdrop') projectModalClose(); });
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const result = await api('/api/login', { method: 'POST', body: JSON.stringify({ email: $('#login-email').value, password: $('#login-password').value }) });
    state.session = result; await reload(); notify(`Secure session established · ${result.user.role}`);
  } catch (error) { notify(error.message, true); }
});
$('#logout-button').addEventListener('click', async () => { try { await api('/api/logout', { method: 'POST', body: '{}' }); await reload(); notify('Session ended'); } catch (error) { notify(error.message, true); } });
$('#contact-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const result = await api('/api/contact', { method: 'POST', body: JSON.stringify({ name: $('#contact-name').value, email: $('#contact-email').value, subject: $('#contact-subject').value, message: $('#contact-message').value, consent: $('#contact-consent').checked }) });
    event.target.reset(); notify(`Message stored locally · ${result.storage}`);
  } catch (error) { notify(error.message, true); }
});
$('#integration-list').addEventListener('click', async event => { const button = event.target.closest('[data-integration]'); if (!button) return; try { const result = await platformAction('integration.toggle', { id: button.dataset.integration }); if (result) notify(`Integration ${result.status} · simulation adapter`); } catch (error) { notify(error.message, true); } });
$('#schedule-list').addEventListener('click', async event => { const button = event.target.closest('[data-schedule]'); if (!button) return; try { const result = await platformAction('schedule.toggle', { id: button.dataset.schedule }); if (result) notify(`Nightly agent ${result.enabled ? 'enabled' : 'paused'}`); } catch (error) { notify(error.message, true); } });
document.body.addEventListener('click', async event => {
  const button = event.target.closest('[data-platform-action]'); if (!button) return;
  try {
    const action = button.dataset.platformAction; const result = await platformAction(action, action === 'notification.send' ? { channel: 'Slack', message: 'TraceProof regression digest: portfolio run complete.' } : {}); if (!result) return;
    if (action === 'playwright.run') $('#worker-output').textContent = JSON.stringify(result.job, null, 2);
    if (action === 'notification.send') $('#automation-output').textContent = JSON.stringify(result.notification, null, 2);
    if (action === 'apikey.create') $('#sdk-output').textContent = `SAVE THIS KEY — SHOWN ONCE\n${result.key}\n\nGET /api/sdk for Node and Python examples.`;
    if (action === 'sso.configure') $('#identity-output').textContent = JSON.stringify(result.identity, null, 2);
    if (action === 'audit.sign') $('#identity-output').textContent = `SHA-256 AUDIT SIGNATURE\n${result.signature}`;
    notify(`${action} completed`);
  } catch (error) { notify(error.message, true); }
});
$('#trace-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 25_000_000) throw new Error('Trace exceeds the 25 MB portfolio limit');
    const zip = await window.JSZip.loadAsync(await file.arrayBuffer()); const names = Object.keys(zip.files); const result = await platformAction('trace.import', { name: file.name, files: names.length }); if (!result) return;
    $('#trace-output').textContent = `${result.trace.status.toUpperCase()} · ${result.trace.files} files\n${names.slice(0,8).join('\n')}`; notify('Playwright trace indexed locally');
  } catch (error) { notify(error.message, true); }
});
$('#generate-case').addEventListener('click', async () => {
  const report = $('#ai-report').value.trim(); if (report.length < 12) return notify('Describe the defect in at least 12 characters', true);
  const login = /login|sign.?in|sesión|acceso/i.test(report); const route = login ? '/sandbox/login' : '/sandbox/shop';
  const steps = login ? [{ action:'navigate', value:route },{ action:'fill', target:'login-email', value:'demo@example.com' },{ action:'fill', target:'login-password', value:'DemoPass123' },{ action:'click', target:'submit-login' },{ action:'assertText', target:'login-result', value:'Welcome back' }] : [{ action:'navigate', value:route },{ action:'click', target:'add-to-cart' },{ action:'assertText', target:'cart-toast', value:'Added to cart' }];
  const draft = { title: report.slice(0,96), description:`Locally structured from a natural-language report. Human review required. Original: ${report}`, severity:/critical|bloquea|payment/i.test(report)?'critical':'medium', source:'Assisted authoring', steps };
  $('#ai-output').textContent = JSON.stringify(draft, null, 2); try { const created = await api('/api/cases', { method:'POST', body:JSON.stringify(draft) }); state.selected=created.id; await reload(); notify('Reviewable QA case generated and saved'); } catch (error) { notify(error.message, true); }
});
function closeInfo() { $('#info-backdrop').classList.add('hidden'); lastFocus?.focus?.(); }
function openInfo(key) {
  const doc = documents[key]; if (!doc) return;
  lastFocus = document.activeElement;
  $('#info-title').textContent = doc.title; $('#info-content').innerHTML = doc.html;
  $('#info-backdrop').classList.remove('hidden'); $('#info-close').focus();
}
document.body.addEventListener('click', event => { const button = event.target.closest('[data-doc]'); if (button) openInfo(button.dataset.doc); });
$('#info-close').addEventListener('click', closeInfo);
$('#info-backdrop').addEventListener('click', event => { if (event.target.id === 'info-backdrop') closeInfo(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { if (!$('#info-backdrop').classList.contains('hidden')) closeInfo(); else if (!$('#project-backdrop').classList.contains('hidden')) projectModalClose(); else if (!$('#modal-backdrop').classList.contains('hidden')) modalClose(); }
  if (event.key !== 'Tab') return;
  const backdrop = !$('#modal-backdrop').classList.contains('hidden') ? $('#modal-backdrop') : !$('#project-backdrop').classList.contains('hidden') ? $('#project-backdrop') : !$('#info-backdrop').classList.contains('hidden') ? $('#info-backdrop') : null;
  if (!backdrop) return;
  const focusable = [...backdrop.querySelectorAll('button,input,select,textarea,[href]')].filter(el => !el.disabled);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
$('#case-form').addEventListener('submit', submitModal);
$('#add-step').addEventListener('click', () => { collectEditor(); if (state.editSteps.length >= 24) return notify('Maximum 24 steps per case', true); state.editSteps.push({action:'assertVisible',target:'product-card'}); renderEditor(); });
$('#step-editor').addEventListener('click', event => { const btn=event.target.closest('[data-remove]'); if (!btn) return; collectEditor(); state.editSteps.splice(Number(btn.dataset.remove),1); renderEditor(); });
$('#step-editor').addEventListener('change', event => {
  if (!event.target.classList.contains('editor-action')) return;
  const pos=Number(event.target.closest('.editor-step').dataset.index); collectEditor();
  if(state.editSteps[pos].action==='navigate') {state.editSteps[pos].value='/sandbox/shop';state.editSteps[pos].target='';}
  else if(!state.editSteps[pos].target) state.editSteps[pos].target='product-card';
  renderEditor();
});
const privacyBanner = $('#privacy-banner');
if (localStorage.getItem('traceproof_privacy_choice') !== 'acknowledged') privacyBanner.classList.remove('hidden');
$('#privacy-session').addEventListener('click', () => privacyBanner.classList.add('hidden'));
$('#privacy-remember').addEventListener('click', () => { localStorage.setItem('traceproof_privacy_choice', 'acknowledged'); privacyBanner.classList.add('hidden'); });

const views = new Set(['overview', 'workbench', 'activity', 'projects', 'team', 'platform', 'governance', 'contact', 'account']);
function setView(name, { updateHash = true } = {}) {
  if (!views.has(name)) name = 'overview';
  $$('[data-view-panel]').forEach(panel => {
    const active = panel.dataset.viewPanel === name;
    panel.classList.toggle('active', active); panel.hidden = !active;
  });
  $$('.nav-tab').forEach(tab => {
    const active = tab.dataset.view === name;
    tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active));
  });
  $('#topbar').classList.remove('nav-hidden');
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  if (updateHash) history.replaceState(null, '', `#${name}`);
}
$('.primary-nav').addEventListener('click', event => { const tab = event.target.closest('[data-view]'); if (tab) setView(tab.dataset.view); });
document.body.addEventListener('click', event => { const target = event.target.closest('[data-view-jump],[data-view-link]'); if (target) { event.preventDefault(); setView(target.dataset.viewJump || target.dataset.viewLink); } });

let previousScroll = window.scrollY;
let scrollTick = false;
window.addEventListener('scroll', () => {
  if (scrollTick) return;
  scrollTick = true;
  requestAnimationFrame(() => {
    const currentScroll = window.scrollY;
    if (currentScroll > previousScroll + 8 && currentScroll > 110) $('#topbar').classList.add('nav-hidden');
    else if (currentScroll < previousScroll - 5 || currentScroll < 40) $('#topbar').classList.remove('nav-hidden');
    previousScroll = Math.max(currentScroll, 0); scrollTick = false;
  });
}, { passive: true });

const interactiveHero = $('#interactive-hero');
const earthCanvas = $('#earth-canvas');
const earthContext = earthCanvas.getContext('2d');
const earthMotion = { rx: -.12, ry: -Math.PI / 2, targetX: -.12, targetY: -Math.PI / 2, auto: 0, active: false, city: { name:'Bogotá, Colombia', lat:4.711, lon:-74.0721 } };
const spherePoint = (lon, lat, land, index) => { const a=lon*Math.PI/180,b=lat*Math.PI/180,c=Math.cos(b); return { x:c*Math.cos(a),y:Math.sin(b),z:c*Math.sin(a),land,shimmer:(Math.sin(index*91.73)+1)/2 }; };
const earthPoints = [];
for (let i=0;i<LAND_POINTS.length;i+=2) earthPoints.push(spherePoint(LAND_POINTS[i]/100, LAND_POINTS[i+1]/100, true, i));
for (let i=0;i<15000;i++) { const y=1-(i/14999)*2,r=Math.sqrt(1-y*y),a=Math.PI*(3-Math.sqrt(5))*i; earthPoints.push({x:Math.cos(a)*r,y,z:Math.sin(a)*r,land:false,shimmer:(Math.sin(i*37.7)+1)/2}); }
const projectPoint = (point, cosy, siny, cosx, sinx, cx, cy, radius) => { const px=point.x*cosy+point.z*siny,pz=-point.x*siny+point.z*cosy,py=point.y*cosx-pz*sinx,depth=point.y*sinx+pz*cosx; return { x:cx+px*radius,y:cy-py*radius,depth }; };
const earthBuckets = Array.from({ length: 5 }, () => []);
const earthColors = ['rgba(250,255,255,.92)','rgba(84,255,196,.86)','rgba(65,220,255,.78)','rgba(139,104,255,.35)','rgba(25,159,220,.26)'];
let earthVisible = false, earthFrameRunning = false, earthStride = 2, slowFrames = 0;
function startEarth() { if (!earthFrameRunning && earthVisible && !document.hidden) { earthFrameRunning = true; requestAnimationFrame(drawEarth); } }
function drawEarth() {
  if (!earthVisible || document.hidden) { earthFrameRunning = false; return; }
  const frameStart = performance.now();
  const rect = earthCanvas.getBoundingClientRect(); const dpr = Math.min(devicePixelRatio || 1, 2);
  if (earthCanvas.width !== Math.round(rect.width * dpr) || earthCanvas.height !== Math.round(rect.height * dpr)) { earthCanvas.width = Math.round(rect.width * dpr); earthCanvas.height = Math.round(rect.height * dpr); }
  earthContext.setTransform(dpr, 0, 0, dpr, 0, 0); earthContext.clearRect(0, 0, rect.width, rect.height);
  const cx = rect.width / 2, cy = rect.height / 2, globeRadius = Math.min(rect.width, rect.height) * .455;
  const response = earthMotion.active ? .19 : .1;
  earthMotion.rx += (earthMotion.targetX - earthMotion.rx) * response; earthMotion.ry += (earthMotion.targetY - earthMotion.ry) * response;
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) earthMotion.auto += earthMotion.active ? .0012 : .0032;
  const ry = earthMotion.ry + earthMotion.auto, cosy = Math.cos(ry), siny = Math.sin(ry), cosx = Math.cos(earthMotion.rx), sinx = Math.sin(earthMotion.rx);
  earthContext.globalCompositeOperation = 'lighter';
  earthBuckets.forEach(bucket => { bucket.length = 0; });
  for (let index = 0; index < earthPoints.length; index += earthStride) {
    const point = earthPoints[index];
    const p=projectPoint(point,cosy,siny,cosx,sinx,cx,cy,globeRadius); if(p.depth<-.08) continue;
    const front=Math.max(.08,(p.depth+1)/2),size=(point.land?1.45:.72)*(.55+front*1.05);
    const bucket = point.land ? (point.shimmer>.84?0:point.shimmer>.45?1:2) : (point.shimmer>.76?3:4);
    earthBuckets[bucket].push(p.x-size/2,p.y-size/2,size);
  }
  earthBuckets.forEach((bucket, bucketIndex) => { earthContext.fillStyle=earthColors[bucketIndex];earthContext.beginPath();for(let i=0;i<bucket.length;i+=3)earthContext.rect(bucket[i],bucket[i+1],bucket[i+2],bucket[i+2]);earthContext.fill(); });
  earthContext.globalCompositeOperation = 'source-over';
  earthContext.strokeStyle = 'rgba(125,245,211,.24)'; earthContext.lineWidth = 1; earthContext.beginPath(); earthContext.arc(cx, cy, globeRadius + 4, 0, Math.PI * 2); earthContext.stroke();
  const city=earthMotion.city,cityPoint=spherePoint(city.lon,city.lat,true,1),cp=projectPoint(cityPoint,cosy,siny,cosx,sinx,cx,cy,globeRadius);
  const label=$('#earth-city'); if(cp.depth>0){ earthContext.fillStyle='#dffff5';earthContext.shadowColor='#68ffd0';earthContext.shadowBlur=24;earthContext.beginPath();earthContext.arc(cp.x,cp.y,5.5,0,Math.PI*2);earthContext.fill();earthContext.shadowBlur=0;earthContext.strokeStyle='#5dffd0';earthContext.beginPath();earthContext.arc(cp.x,cp.y,13,0,Math.PI*2);earthContext.stroke(); label.style.left=`${cp.x}px`;label.style.top=`${cp.y}px`;label.classList.add('visible'); } else label.classList.remove('visible');
  const frameCost = performance.now() - frameStart;
  slowFrames = frameCost > 24 ? Math.min(slowFrames + 1, 12) : Math.max(slowFrames - 1, 0);
  if (slowFrames > 8) earthStride = Math.min(4, earthStride + 1); else if (slowFrames === 0) earthStride = Math.max(2, earthStride - 1);
  requestAnimationFrame(drawEarth);
}
const earthStage = $('#signal-field');
earthStage.addEventListener('pointermove', event => {
  const rect = earthStage.getBoundingClientRect(), px=event.clientX-rect.left, py=event.clientY-rect.top, radius=Math.min(rect.width,rect.height)*.455;
  const inside=!event.target.closest('button')&&Math.hypot(px-rect.width/2,py-rect.height/2)<=radius;
  earthMotion.active=inside;earthStage.classList.toggle('is-interacting',inside);
  if(!inside){earthMotion.targetX=earthMotion.rx;earthMotion.targetY=earthMotion.ry;return;}
  const x = Math.max(0, Math.min(1, px / rect.width)); const y = Math.max(0, Math.min(1, py / rect.height));
  earthMotion.targetY = -Math.PI/2 + (x - .5) * 4.2 - earthMotion.auto; earthMotion.targetX = -.12 + (y - .5) * 1.45;
  $('#signal-x').textContent = String(Math.round((x - .5) * 180)); $('#signal-y').textContent = String(Math.round((y - .5) * 90));
});
earthStage.addEventListener('pointerleave', () => { earthMotion.active=false;earthMotion.targetX=earthMotion.rx;earthMotion.targetY=earthMotion.ry;earthStage.classList.remove('is-interacting'); });
const cities=[['Bogotá, Colombia',4.711,-74.0721],['Madrid, España',40.4168,-3.7038],['Ciudad de México, México',19.4326,-99.1332],['Buenos Aires, Argentina',-34.6037,-58.3816],['New York, Estados Unidos',40.7128,-74.006],['São Paulo, Brasil',-23.5505,-46.6333],['London, Reino Unido',51.5072,-.1276],['Tokyo, Japón',35.6762,139.6503],['Sydney, Australia',-33.8688,151.2093]];
$('#earth-locate').addEventListener('click', () => {
  if(!navigator.geolocation) return notify('Geolocation is unavailable in this browser',true);
  $('#earth-locate').textContent='⌖ Requesting permission…'; navigator.geolocation.getCurrentPosition(pos=>{const {latitude:lat,longitude:lon}=pos.coords;const nearest=cities.reduce((a,c)=>Math.hypot(c[1]-lat,c[2]-lon)<Math.hypot(a[1]-lat,a[2]-lon)?c:a);earthMotion.city={name:nearest[0],lat,lon};earthMotion.targetY=lon*Math.PI/180-Math.PI/2;earthMotion.targetX=-lat*Math.PI/180*.45;$('#earth-city strong').textContent=nearest[0];$('#earth-city small').textContent=`${Math.abs(lat).toFixed(4)}° ${lat>=0?'N':'S'}, ${Math.abs(lon).toFixed(4)}° ${lon>=0?'E':'W'}`;$('#earth-locate').textContent='⌖ Location active';notify(`Planet centered on ${nearest[0]}`);},()=>{$('#earth-locate').textContent='⌖ Detect my city';notify('Location was not shared. Bogotá remains highlighted.',true);},{enableHighAccuracy:false,timeout:7000,maximumAge:3600000});
});
new IntersectionObserver(entries => { earthVisible=Boolean(entries[0]?.isIntersecting);if(earthVisible)startEarth(); },{threshold:.01}).observe(earthStage);
document.addEventListener('visibilitychange', startEarth);

setView(location.hash.slice(1), { updateHash: false });
reload({ initial: true }).catch(e => notify(`Cannot connect to the local server: ${e.message}`, true));
