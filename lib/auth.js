import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const demoUsers = [
  { id: 'demo-admin', email: 'admin@traceproof.local', name: 'Mara Chen', role: 'admin', salt: 'traceproof-admin-v1', passwordHash: '' },
  { id: 'demo-engineer', email: 'qa@traceproof.local', name: 'Jon Bell', role: 'engineer', salt: 'traceproof-engineer-v1', passwordHash: '' }
];
demoUsers[0].passwordHash = scryptSync('TraceProof!2026', demoUsers[0].salt, 64).toString('hex');
demoUsers[1].passwordHash = scryptSync('Quality!2026', demoUsers[1].salt, 64).toString('hex');

const tokenHash = token => createHash('sha256').update(token).digest('hex');

export class AuthService {
  constructor(store) { this.store = store; this.memory = new Map(); this.attempts = new Map(); }
  verify(email, password, ip = 'local') {
    const now = Date.now();
    const recent = (this.attempts.get(ip) || []).filter(time => now - time < 60_000);
    if (recent.length >= 8) throw Object.assign(new Error('Too many login attempts. Try again in one minute.'), { status: 429 });
    recent.push(now); this.attempts.set(ip, recent);
    const user = demoUsers.find(item => item.email === String(email || '').trim().toLowerCase());
    if (!user || typeof password !== 'string') return null;
    const actual = scryptSync(password, user.salt, 64);
    const expected = Buffer.from(user.passwordHash, 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    this.attempts.delete(ip);
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }
  async create(user) {
    const token = randomBytes(32).toString('base64url'); const hash = tokenHash(token);
    if (this.store.saveSession) await this.store.saveSession(hash, user);
    else this.memory.set(hash, { user, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
    return token;
  }
  async read(token) {
    if (!token) return null; const hash = tokenHash(token);
    if (this.store.getSession) {
      const value = await this.store.getSession(hash);
      if (!value) return null;
      const user = demoUsers.find(item => item.id === value.user_id);
      return user ? { id: user.id, email: user.email, name: user.name, role: value.role } : null;
    }
    const value = this.memory.get(hash);
    if (!value || value.expiresAt < Date.now()) { this.memory.delete(hash); return null; }
    return value.user;
  }
  async destroy(token) {
    if (!token) return; const hash = tokenHash(token);
    if (this.store.deleteSession) await this.store.deleteSession(hash); else this.memory.delete(hash);
  }
}

export function cookieValue(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  for (const cookie of cookies) { const [key, ...rest] = cookie.trim().split('='); if (key === name) return decodeURIComponent(rest.join('=')); }
  return '';
}

export const sessionCookie = (token, secure = false) => `tp_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure ? '; Secure' : ''}`;
export const clearSessionCookie = secure => `tp_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;
