import { randomUUID } from 'node:crypto';

export const SEVERITIES = ['critical', 'high', 'medium', 'low'];
export const ACTIONS = ['navigate', 'click', 'fill', 'assertVisible', 'assertText'];
export const ROUTES = ['/sandbox/shop', '/sandbox/login'];
const now = () => new Date().toISOString();

export function apiError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function text(value, field, max = 1000, { empty = false } = {}) {
  if (typeof value !== 'string') throw apiError(`${field} must be a string`);
  const clean = value.trim();
  if (!empty && !clean) throw apiError(`${field} is required`);
  if (clean.length > max) throw apiError(`${field} exceeds ${max} characters`);
  return clean;
}

export function cleanStep(raw) {
  if (!raw || typeof raw !== 'object' || !ACTIONS.includes(raw.action)) {
    throw apiError('Unsupported step action');
  }
  const action = raw.action;
  const step = { id: typeof raw.id === 'string' && /^[\w-]{1,70}$/.test(raw.id) ? raw.id : randomUUID(), action };
  if (action === 'navigate') {
    const path = text(raw.value, 'Navigation route', 200);
    if (!ROUTES.includes(path)) throw apiError('Only the bundled demo sandbox routes are supported');
    step.value = path;
  } else {
    step.target = text(raw.target, 'Test ID', 80);
    if (!/^[A-Za-z][\w-]*$/.test(step.target)) throw apiError('Test ID must be alphanumeric (with - or _)');
    if (action === 'fill' || action === 'assertText') step.value = text(raw.value, 'Step value', 500);
  }
  return step;
}

export function cleanCase(raw, existing = null) {
  if (!raw || typeof raw !== 'object') throw apiError('Expected a case object');
  const title = text(raw.title, 'Title', 130);
  const description = text(raw.description || '', 'Description', 2200, { empty: true });
  const severity = SEVERITIES.includes(raw.severity) ? raw.severity : 'medium';
  const source = text(raw.source || 'Manual report', 'Source', 100);
  if (!Array.isArray(raw.steps) || raw.steps.length === 0 || raw.steps.length > 24) {
    throw apiError('A case requires 1–24 reproduction steps');
  }
  const steps = raw.steps.map(cleanStep);
  if (steps[0].action !== 'navigate') throw apiError('First step must navigate to a bundled sandbox route');
  return {
    id: existing?.id || randomUUID(), title, description, severity, source,
    steps, status: existing?.status || 'ready', createdAt: existing?.createdAt || now(), updatedAt: now()
  };
}

export function cleanRun(raw, cases) {
  if (!raw || typeof raw !== 'object') throw apiError('Expected run result');
  const relevant = cases.find(item => item.id === raw.caseId);
  if (!relevant) throw apiError('Case not found', 404);
  if (!['passed', 'failed'].includes(raw.status)) throw apiError('Invalid run status');
  if (!Array.isArray(raw.events) || raw.events.length > 24 || raw.events.length === 0) {
    throw apiError('Run requires 1–24 events');
  }
  const eventStatuses = ['passed', 'failed'];
  const events = raw.events.map((event, index) => {
    if (!event || !eventStatuses.includes(event.status)) throw apiError(`Invalid run event ${index}`);
    if (!relevant.steps[index]) throw apiError('Run has more events than planned steps');
    return {
      index, action: relevant.steps[index].action, status: event.status,
      detail: text(String(event.detail || ''), 'Event detail', 1100, { empty: true }),
      durationMs: Math.min(Math.max(Number(event.durationMs) || 0, 0), 60_000),
      url: text(String(event.url || ''), 'Event url', 250, { empty: true }),
      snapshot: text(String(event.snapshot || ''), 'Snapshot', 1800, { empty: true })
    };
  });
  if ((raw.status === 'failed') !== events.some(e => e.status === 'failed')) {
    throw apiError('Run status does not match step results');
  }
  return {
    id: randomUUID(), caseId: relevant.id, caseTitle: relevant.title, status: raw.status,
    source: 'local-browser-replay', durationMs: Math.min(Math.max(Number(raw.durationMs) || 0, 0), 100_000),
    events, createdAt: now()
  };
}

export function cleanProject(raw, existing = null) {
  if (!raw || typeof raw !== 'object') throw apiError('Expected a project object');
  const name = text(raw.name, 'Project name', 90);
  const key = text(raw.key, 'Project key', 12).toUpperCase();
  if (!/^[A-Z][A-Z0-9-]{1,11}$/.test(key)) throw apiError('Project key must contain 2–12 uppercase letters, numbers, or hyphens');
  const description = text(raw.description || '', 'Project description', 500, { empty: true });
  const accent = /^#[0-9a-fA-F]{6}$/.test(raw.accent || '') ? raw.accent : '#82f5d2';
  return { id: existing?.id || randomUUID(), name, key, description, accent, status: raw.status === 'archived' ? 'archived' : 'active', createdAt: existing?.createdAt || now(), updatedAt: now() };
}

export function getMetrics(state) {
  const runs = state.runs;
  return {
    cases: state.cases.length,
    runs: runs.length,
    passing: runs.filter(r => r.status === 'passed').length,
    failing: runs.filter(r => r.status === 'failed').length,
    passRate: runs.length ? Math.round(100 * runs.filter(r => r.status === 'passed').length / runs.length) : null
  };
}

export function makeSeeds() {
  const saved = '2026-11-06T11:00:00.000Z';
  const make = (id, title, description, severity, steps, source = 'Sample bug report') => ({
    id, title, description, severity, source, steps: steps.map((step, i) => ({ id: `${id}-step-${i}`, ...step })),
    status: 'ready', createdAt: saved, updatedAt: saved
  });
  return {
    messages: [],
    platform: {
      integrations: [
        { id: 'github', name: 'GitHub', status: 'ready', mode: 'simulated' },
        { id: 'jira', name: 'Jira', status: 'ready', mode: 'simulated' },
        { id: 'slack', name: 'Slack', status: 'ready', mode: 'simulated' }
      ],
      schedules: [{ id: 'nightly', name: 'Nightly regression', cron: '0 2 * * *', enabled: true }],
      notifications: [],
      apiKeys: [],
      audit: [{ id: 'seed-audit', action: 'workspace.bootstrapped', actor: 'system', createdAt: saved }]
    },
    projects: [
      { id: '10000000-0000-4000-8000-000000000001', name: 'Northstar Commerce', key: 'NORTH', description: 'Checkout, account, and catalog quality signals for the fictional Northstar storefront.', accent: '#82f5d2', status: 'active', createdAt: saved, updatedAt: saved },
      { id: '10000000-0000-4000-8000-000000000002', name: 'Atlas Identity', key: 'ATLAS', description: 'Authentication and customer-access regression workspace.', accent: '#a493ff', status: 'active', createdAt: saved, updatedAt: saved },
      { id: '10000000-0000-4000-8000-000000000003', name: 'Ion Mobile', key: 'ION', description: 'Mobile release readiness and responsive interaction coverage.', accent: '#75a9ff', status: 'active', createdAt: saved, updatedAt: saved }
    ],
    team: [
      { id: 'demo-admin', name: 'Mara Chen', role: 'Admin', scope: 'All projects', status: 'online' },
      { id: 'demo-engineer', name: 'Jon Bell', role: 'QA engineer', scope: 'Northstar Commerce', status: 'active' },
      { id: 'demo-viewer', name: 'Ari Soto', role: 'Viewer', scope: 'Atlas Identity', status: 'invited' }
    ],
    cases: [
      make('demo-cart-toast', 'Cart confirmation is missing',
        'A customer can add an item to the cart, but no confirmation toast appears. The missing feedback makes it unclear whether the action succeeded.',
        'high', [
          { action: 'navigate', value: '/sandbox/shop' },
          { action: 'click', target: 'add-to-cart' },
          { action: 'assertText', target: 'cart-toast', value: 'Added to cart' }
        ]),
      make('demo-login-happy', 'Customer login: successful feedback',
        'A controlled passing example verifying the customer login feedback in the included sandbox.',
        'medium', [
          { action: 'navigate', value: '/sandbox/login' },
          { action: 'fill', target: 'login-email', value: 'demo@example.com' },
          { action: 'fill', target: 'login-password', value: 'DemoPass123' },
          { action: 'click', target: 'submit-login' },
          { action: 'assertText', target: 'login-result', value: 'Welcome back' }
        ]),
      make('demo-cart-counter', 'Cart count updates after adding item',
        'A passing counter check in the bundled product sandbox.',
        'low', [
          { action: 'navigate', value: '/sandbox/shop' },
          { action: 'assertVisible', target: 'product-card' },
          { action: 'click', target: 'add-to-cart' },
          { action: 'assertText', target: 'cart-count', value: '1 item' }
        ])
    ], runs: [], version: 1
  };
}
