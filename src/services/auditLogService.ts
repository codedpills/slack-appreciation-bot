import { Pool } from 'pg';
import { logger } from '../logger';

export interface AuditEntry {
  workspaceId: string;
  actorId: string;
  action: string;
  targetId?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export class AuditLogService {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true'
        ? { rejectUnauthorized: process.env.NODE_ENV === 'production' }
        : undefined,
      max: 3
    });
  }

  async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target_id TEXT,
        details JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_log_workspace ON audit_log(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(workspace_id, actor_id);
    `);
  }

  async log(entry: Omit<AuditEntry, 'timestamp'>): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO audit_log(workspace_id, actor_id, action, target_id, details)
         VALUES($1, $2, $3, $4, $5)`,
        [entry.workspaceId, entry.actorId, entry.action, entry.targetId || null, entry.details || null]
      );
    } catch (error) {
      logger.error({ error, entry }, 'Failed to write audit log');
    }
  }

  async getEntries(workspaceId: string, limit = 50): Promise<AuditEntry[]> {
    const res = await this.pool.query(
      `SELECT workspace_id, actor_id, action, target_id, details, created_at
       FROM audit_log WHERE workspace_id=$1
       ORDER BY created_at DESC LIMIT $2`,
      [workspaceId, limit]
    );
    return res.rows.map(row => ({
      workspaceId: row.workspace_id,
      actorId: row.actor_id,
      action: row.action,
      targetId: row.target_id,
      details: row.details,
      timestamp: new Date(row.created_at).toISOString()
    }));
  }
}
