import { Pool } from 'pg';
import { IDataService } from './dataServiceInterface';
import { AppState, WorkspaceInstall } from '../types';

interface UserRecord {
  total: number;
  byValue: { [key: string]: number };
  dailyGiven: number;
  lastReset: string;
}

/**
 * Postgres-backed implementation of IDataService
 */
export function createDataService(options?: { pool?: Pool }): IDataService {
  const pool = options?.pool
    ? options.pool
    : new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
      });
  const defaults: AppState['config'] = {
    dailyLimit: 10,
    values: ['teamwork'],
    rewards: [{ name: 'Coffee Voucher', cost: 50 }],
    label: 'points'
  };
  const initPromise = pool
    .query(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        bot_user_id TEXT,
        bot_token TEXT,
        installed_at TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS config (
        workspace_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value JSONB NOT NULL,
        PRIMARY KEY (workspace_id, key)
      );
      CREATE TABLE IF NOT EXISTS users (
        workspace_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        record JSONB NOT NULL,
        PRIMARY KEY (workspace_id, user_id)
      );
    `)
    .catch(error => {
      console.error('Failed to initialize database schema:', error);
      throw error;
    });

  const normalizeWorkspaceId = (workspaceId?: string) => {
    const normalized = workspaceId?.trim();
    return normalized && normalized.length > 0 ? normalized : 'default';
  };

  const ensureInit = async () => {
    await initPromise;
  };

  const service: IDataService = {
    getConfig: async (workspaceId) => {
      await ensureInit();
      const workspaceKey = normalizeWorkspaceId(workspaceId);
      const res = await pool.query(
        'SELECT value FROM config WHERE workspace_id=$1 AND key=$2',
        [workspaceKey, 'config']
      );
      if (res.rowCount === 0) {
        await pool.query(
          'INSERT INTO config(workspace_id,key,value) VALUES($1,$2,$3) ON CONFLICT(workspace_id,key) DO NOTHING',
          [workspaceKey, 'config', defaults]
        );
        const insertedRes = await pool.query(
          'SELECT value FROM config WHERE workspace_id=$1 AND key=$2',
          [workspaceKey, 'config']
        );
        if (insertedRes.rowCount === 0) {
          return { ...defaults };
        }
        return insertedRes.rows[0].value;
      }
      return res.rows[0].value;
    },

    updateConfig: async (newCfg, workspaceId) => {
      const workspaceKey = normalizeWorkspaceId(workspaceId);
      const cfg = await service.getConfig(workspaceKey);
      const merged = { ...cfg, ...newCfg };
      await pool.query(
        'INSERT INTO config(workspace_id,key,value) VALUES($1,$2,$3) ON CONFLICT(workspace_id,key) DO UPDATE SET value=$3',
        [workspaceKey, 'config', merged]
      );
    },

    setDailyLimit: async (limit, workspaceId) => service.updateConfig({ dailyLimit: limit }, workspaceId),

    addValue: async (value, workspaceId) => {
      const cfg = await service.getConfig(workspaceId);
      const v = value.toLowerCase().trim();
      if (!cfg.values.includes(v)) {
        cfg.values.push(v);
        await service.updateConfig({ values: cfg.values }, workspaceId);
      }
    },

    removeValue: async (value, workspaceId) => {
      const cfg = await service.getConfig(workspaceId);
      const v = value.toLowerCase().trim();
      const values = cfg.values.filter(x => x !== v);
      await service.updateConfig({ values }, workspaceId);
    },

    addReward: async (name, cost, workspaceId) => {
      const cfg = await service.getConfig(workspaceId);
      const idx = cfg.rewards.findIndex(r => r.name === name);
      if (idx >= 0) cfg.rewards[idx].cost = cost;
      else cfg.rewards.push({ name, cost });
      await service.updateConfig({ rewards: cfg.rewards }, workspaceId);
    },

    removeReward: async (name, workspaceId) => {
      const cfg = await service.getConfig(workspaceId);
      const rewards = cfg.rewards.filter(r => r.name !== name);
      await service.updateConfig({ rewards }, workspaceId);
    },

    getRewards: async (workspaceId) => {
      const cfg = await service.getConfig(workspaceId);
      return cfg.rewards;
    },

    getReward: async (name, workspaceId) => {
      const rewards = await service.getRewards(workspaceId);
      return rewards.find(r => r.name === name);
    },

    getUserRecord: async (userId, workspaceId) => {
      await ensureInit();
      const workspaceKey = normalizeWorkspaceId(workspaceId);
      const today = new Date().toISOString().split('T')[0];
      const res = await pool.query(
        'SELECT record FROM users WHERE workspace_id=$1 AND user_id=$2',
        [workspaceKey, userId]
      );
      if (res.rowCount === 0) {
        const record = { total: 0, byValue: {}, dailyGiven: 0, lastReset: today };
        await pool.query(
          'INSERT INTO users(workspace_id,user_id,record) VALUES($1,$2,$3) ON CONFLICT(workspace_id,user_id) DO NOTHING',
          [workspaceKey, userId, record]
        );
        const insertedRes = await pool.query(
          'SELECT record FROM users WHERE workspace_id=$1 AND user_id=$2',
          [workspaceKey, userId]
        );
        return insertedRes.rowCount === 0 ? record : insertedRes.rows[0].record;
      }
      return res.rows[0].record;
    },

    getAllUsers: async (workspaceId) => {
      await ensureInit();
      const workspaceKey = normalizeWorkspaceId(workspaceId);
      const res = await pool.query(
        'SELECT user_id,record FROM users WHERE workspace_id=$1',
        [workspaceKey]
      );
      return res.rows.reduce((acc, r) => ({ ...acc, [r.user_id]: r.record }), {} as Record<string, UserRecord>);
    },

    resetUserPoints: async (userId, workspaceId) => {
      await ensureInit();
      const workspaceKey = normalizeWorkspaceId(workspaceId);
      const today = new Date().toISOString().split('T')[0];
      const record = { total: 0, byValue: {}, dailyGiven: 0, lastReset: today };
      await pool.query(
        'INSERT INTO users(workspace_id,user_id,record) VALUES($1,$2,$3) ON CONFLICT(workspace_id,user_id) DO UPDATE SET record=$3',
        [workspaceKey, userId, record]
      );
    },

    recordRecognition: async (recog, workspaceId) => {
      await ensureInit();
      const workspaceKey = normalizeWorkspaceId(workspaceId);
      const { giver, receiver, value, points } = recog;
      const today = new Date().toISOString().split('T')[0];
      // giver side
      const giverRec = await service.getUserRecord(giver, workspaceKey);
      if (giverRec.lastReset !== today) { giverRec.dailyGiven = 0; giverRec.lastReset = today; }
      giverRec.dailyGiven += points;
      await pool.query(
        'INSERT INTO users(workspace_id,user_id,record) VALUES($1,$2,$3) ON CONFLICT(workspace_id,user_id) DO UPDATE SET record=$3',
        [workspaceKey, giver, giverRec]
      );
      // receiver side
      const recvRec = await service.getUserRecord(receiver, workspaceKey);
      recvRec.total += points;
      recvRec.byValue[value] = (recvRec.byValue[value] || 0) + points;
      await pool.query(
        'INSERT INTO users(workspace_id,user_id,record) VALUES($1,$2,$3) ON CONFLICT(workspace_id,user_id) DO UPDATE SET record=$3',
        [workspaceKey, receiver, recvRec]
      );
    },

    canGivePoints: async (userId, pts, workspaceId) => {
      const rec = await service.getUserRecord(userId, workspaceId);
      const today = new Date().toISOString().split('T')[0];
      if (rec.lastReset !== today) return true;
      return rec.dailyGiven + pts <= (await service.getConfig(workspaceId)).dailyLimit;
    },

    redeemReward: async (userId, name, workspaceId) => {
      const reward = await service.getReward(name, workspaceId);
      if (!reward) return false;
      const rec = await service.getUserRecord(userId, workspaceId);
      if (rec.total < reward.cost) return false;
      rec.total -= reward.cost;
      await pool.query(
        'INSERT INTO users(workspace_id,user_id,record) VALUES($1,$2,$3) ON CONFLICT(workspace_id,user_id) DO UPDATE SET record=$3',
        [normalizeWorkspaceId(workspaceId), userId, rec]
      );
      return true;
    },

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    saveData: async () => {},
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    normalizeUserIds: async () => {},
    resetRewards: async (workspaceId) => service.updateConfig({ rewards: [] }, workspaceId),
    resetValues: async (workspaceId) => service.updateConfig({ values: ['teamwork'] }, workspaceId),
    setLabel: async (lbl, workspaceId) => service.updateConfig({ label: lbl }, workspaceId),

    upsertWorkspaceInstall: async (install: WorkspaceInstall) => {
        await ensureInit();
      await pool.query(
        `INSERT INTO workspaces(id, bot_user_id, bot_token, installed_at)
         VALUES($1, $2, $3, $4)
         ON CONFLICT(id)
         DO UPDATE SET bot_user_id=$2, bot_token=$3, installed_at=$4`,
        [install.workspaceId, install.botUserId, install.botToken, new Date(install.installedAt)]
      );
    },

    getWorkspaceInstall: async (workspaceId: string) => {
        await ensureInit();
      const res = await pool.query(
        'SELECT id, bot_user_id, bot_token, installed_at FROM workspaces WHERE id=$1',
        [workspaceId]
      );
      if (res.rowCount === 0) return null;
      const row = res.rows[0];
      return {
        workspaceId: row.id,
        botUserId: row.bot_user_id,
        botToken: row.bot_token,
        installedAt: new Date(row.installed_at).toISOString()
      };
    }
  };
  return service;
}
