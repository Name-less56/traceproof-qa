import fs from 'node:fs/promises';
import path from 'node:path';
import { makeSeeds } from './domain.js';

export class Store {
  constructor(filename) { this.filename = filename; this.state = null; this.pending = Promise.resolve(); this.kind = 'json-fallback'; }
  async open() {
    await fs.mkdir(path.dirname(this.filename), { recursive: true });
    try { this.state = JSON.parse(await fs.readFile(this.filename, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; this.state = makeSeeds(); await this.flush(); }
    return this;
  }
  async flush() {
    const tmp = `${this.filename}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    await fs.rename(tmp, this.filename);
  }
  async update(fn) {
    const task = this.pending.then(async () => {
      const result = fn(this.state);
      await this.flush();
      return result;
    });
    this.pending = task.then(() => {}, () => {});
    return task;
  }
  get() { return this.state; }
}
