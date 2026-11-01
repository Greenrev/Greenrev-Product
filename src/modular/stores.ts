import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Pool, type PoolConfig } from 'pg';
import { Problem } from '../errors.js';
import type { StateStore } from './model.js';

/** Local persistence. Each request, journal, audit event and replay commits together. */
export class SqliteStore implements StateStore {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    this.db.exec('CREATE TABLE IF NOT EXISTS greenrev_saas_documents (id TEXT PRIMARY KEY, payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1)');
  }
  async list(prefix:string,limit=100,after=''):Promise<{key:string;value:unknown}[]>{const rows=this.db.prepare('SELECT id,payload FROM greenrev_saas_documents WHERE substr(id,1,length(?))=? AND id>? ORDER BY id LIMIT ?').all(prefix,prefix,after,limit);return rows.map(r=>({key:String(r.id),value:JSON.parse(String(r.payload)) as unknown}));}
  async read(key: string): Promise<unknown | null> {
    const row = this.db.prepare('SELECT payload FROM greenrev_saas_documents WHERE id=?').get(key);
    return row ? JSON.parse(String(row.payload)) as unknown : null;
  }
  async transaction<T>(key: string, action: (current: unknown | null) => { state: unknown; result: T }): Promise<T> {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT payload FROM greenrev_saas_documents WHERE id=?').get(key);
      const next = action(row ? JSON.parse(String(row.payload)) as unknown : null);
      this.db.prepare('INSERT INTO greenrev_saas_documents(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,revision=revision+1')
        .run(key, JSON.stringify(next.state));
      this.db.exec('COMMIT');
      return structuredClone(next.result);
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close(): void { this.db.close(); }
}

/** The host developer applies migrations/postgres.sql after approving table ownership. */
export class PostgresStore implements StateStore {
  private pool: Pool;
  constructor(config: PoolConfig | Pool) { this.pool = config instanceof Pool ? config : new Pool(config); }
  async list(prefix:string,limit=100,after=''):Promise<{key:string;value:unknown}[]>{const r=await this.pool.query<{id:string;payload:unknown}>('SELECT id,payload FROM greenrev_saas_documents WHERE left(id,length($1))=$1 AND id>$2 ORDER BY id LIMIT $3',[prefix,after,limit]);return r.rows.map(r=>({key:r.id,value:r.payload}));}
  async read(key: string): Promise<unknown | null> {
    const result = await this.pool.query<{ payload: unknown }>('SELECT payload FROM greenrev_saas_documents WHERE id=$1', [key]);
    return result.rows[0]?.payload ?? null;
  }
  async transaction<T>(key: string, action: (current: unknown | null) => { state: unknown; result: T }): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Also serialises the first insert; locking a missing row alone cannot do so.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
      const current = await client.query<{ payload: unknown }>('SELECT payload FROM greenrev_saas_documents WHERE id=$1 FOR UPDATE', [key]);
      const next = action(current.rows[0]?.payload ?? null);
      await client.query('INSERT INTO greenrev_saas_documents(id,payload) VALUES($1,$2::jsonb) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,revision=greenrev_saas_documents.revision+1', [key, JSON.stringify(next.state)]);
      await client.query('COMMIT');
      return structuredClone(next.result);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  async close(): Promise<void> { await this.pool.end(); }
}

export function stateDocument<T>(value: unknown, kind: string): T {
  if (!value || typeof value !== 'object' || (value as { schema_version?: number }).schema_version !== 4) {
    throw new Problem(kind + ' is missing or uses an unsupported schema version', 409);
  }
  return value as T;
}
