import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { makeSeeds } from './domain.js';

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));

export class PostgresStore {
  constructor(connectionString) {
    this.pool = new Pool({ connectionString, max: 8, idleTimeoutMillis: 15_000, connectionTimeoutMillis: 5_000 });
    this.state = null;
    this.pending = Promise.resolve();
    this.kind = 'postgresql';
  }
  async open() {
    const schema = await fs.readFile(path.join(here, '..', 'db', 'schema.sql'), 'utf8');
    await this.pool.query(schema);
    await this.load();
    if (!this.state.cases.length && !this.state.projects.length) {
      this.state = makeSeeds();
      await this.flush();
    }
    return this;
  }
  async load() {
    const [cases, runs, projects, messages, platform] = await Promise.all([
      this.pool.query('SELECT * FROM qa_cases ORDER BY updated_at DESC'),
      this.pool.query('SELECT * FROM qa_runs ORDER BY created_at DESC LIMIT 120'),
      this.pool.query('SELECT * FROM qa_projects ORDER BY updated_at DESC'),
      this.pool.query('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 100'),
      this.pool.query('SELECT payload FROM platform_state WHERE singleton=true')
    ]);
    this.state = {
      cases: cases.rows.map(row => ({ id: row.id, title: row.title, description: row.description, severity: row.severity, source: row.source, steps: row.steps, status: row.status, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() })),
      runs: runs.rows.map(row => ({ id: row.id, caseId: row.case_id, caseTitle: row.case_title, status: row.status, source: row.source, durationMs: row.duration_ms, events: row.events, createdAt: row.created_at.toISOString() })),
      projects: projects.rows.map(row => ({ id: row.id, name: row.name, key: row.project_key, description: row.description, accent: row.accent, status: row.status, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() })),
      messages: messages.rows.map(row => ({ id: row.id, name: row.name, email: row.email, subject: row.subject, message: row.message, createdAt: row.created_at.toISOString() })),
      platform: platform.rows[0]?.payload || makeSeeds().platform,
      team: makeSeeds().team,
      version: 2
    };
    return this.state;
  }
  async flush() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [938441]);
      await client.query('DELETE FROM qa_cases');
      for (const item of this.state.cases) await client.query(
        'INSERT INTO qa_cases (id,title,description,severity,source,steps,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)',
        [item.id,item.title,item.description,item.severity,item.source,JSON.stringify(item.steps),item.status,item.createdAt,item.updatedAt]
      );
      await client.query('DELETE FROM qa_runs');
      for (const item of this.state.runs) await client.query(
        'INSERT INTO qa_runs (id,case_id,case_title,status,source,duration_ms,events,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)',
        [item.id,item.caseId,item.caseTitle,item.status,item.source,item.durationMs,JSON.stringify(item.events),item.createdAt]
      );
      await client.query('DELETE FROM qa_projects');
      for (const item of this.state.projects) await client.query(
        'INSERT INTO qa_projects (id,name,project_key,description,accent,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [item.id,item.name,item.key,item.description,item.accent,item.status,item.createdAt,item.updatedAt]
      );
      await client.query('DELETE FROM contact_messages');
      for (const item of this.state.messages || []) await client.query(
        'INSERT INTO contact_messages (id,name,email,subject,message,created_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [item.id,item.name,item.email,item.subject,item.message,item.createdAt]
      );
      await client.query('INSERT INTO platform_state (singleton,payload,updated_at) VALUES (true,$1::jsonb,now()) ON CONFLICT (singleton) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()', [JSON.stringify(this.state.platform || makeSeeds().platform)]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async update(fn) {
    const task = this.pending.then(async () => { const result = fn(this.state); await this.flush(); return result; });
    this.pending = task.then(() => {}, () => {});
    return task;
  }
  get() { return this.state; }
  async close() { await this.pool.end(); }
  async saveSession(tokenHash, user) {
    await this.pool.query('DELETE FROM app_sessions WHERE expires_at < now()');
    await this.pool.query('INSERT INTO app_sessions (token_hash,user_id,role,expires_at) VALUES ($1,$2,$3,now() + interval \'8 hours\') ON CONFLICT (token_hash) DO UPDATE SET expires_at=EXCLUDED.expires_at', [tokenHash,user.id,user.role]);
  }
  async getSession(tokenHash) {
    const result = await this.pool.query('SELECT user_id,role,expires_at FROM app_sessions WHERE token_hash=$1 AND expires_at > now()', [tokenHash]);
    return result.rows[0] || null;
  }
  async deleteSession(tokenHash) { await this.pool.query('DELETE FROM app_sessions WHERE token_hash=$1', [tokenHash]); }
}
