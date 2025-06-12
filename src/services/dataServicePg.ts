import { Pool } from 'pg';
import { IDataService } from './dataServiceInterface';
import { AppState} from '../types';

interface UserRecord {
  total: number;
  byValue: { [key: string]: number };
  dailyGiven: number;
  lastReset: string;
}

/**
 * Postgres-backed implementation of IDataService
 */
export function createDataService(): IDataService {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  const defaults: AppState['config'] = {
    dailyLimit: 10,
    values: ['teamwork'],
    rewards: [{ name: 'Coffee Voucher', cost: 50 }],
    label: 'points'
  };
  // ensure tables exist
  (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value JSONB NOT NULL);
      CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY, record JSONB NOT NULL);
    `);
  })().catch(console.error);

  const service: IDataService = {
    getConfig: async () => {
      const res = await pool.query('SELECT value FROM config WHERE key=$1', ['config']);
      if (res.rowCount === 0) {
        await pool.query('INSERT INTO config(key,value) VALUES($1,$2)', ['config', defaults]);
        return { ...defaults };
      }
      return res.rows[0].value;
    },

    updateConfig: async (newCfg) => {
      const cfg = await service.getConfig();
      const merged = { ...cfg, ...newCfg };
      await pool.query(
        'INSERT INTO config(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2',
        ['config', merged]
      );
    },

    setDailyLimit: async (limit) => service.updateConfig({ dailyLimit: limit }),

    addValue: async (value) => {
      const cfg = await service.getConfig();
      const v = value.toLowerCase().trim();
      if (!cfg.values.includes(v)) {
        cfg.values.push(v);
        await service.updateConfig({ values: cfg.values });
      }
    },

    removeValue: async (value) => {
      const cfg = await service.getConfig();
      const v = value.toLowerCase().trim();
      const values = cfg.values.filter(x => x !== v);
      await service.updateConfig({ values });
    },

    addReward: async (name, cost) => {
      const cfg = await service.getConfig();
      const idx = cfg.rewards.findIndex(r => r.name === name);
      if (idx >= 0) cfg.rewards[idx].cost = cost;
      else cfg.rewards.push({ name, cost });
      await service.updateConfig({ rewards: cfg.rewards });
    },

    removeReward: async (name) => {
      const cfg = await service.getConfig();
      const rewards = cfg.rewards.filter(r => r.name !== name);
      await service.updateConfig({ rewards });
    },

    getRewards: async () => {
      const cfg = await service.getConfig();
      return cfg.rewards;
    },

    getReward: async (name) => {
      const rewards = await service.getRewards();
      return rewards.find(r => r.name === name);
    },

    getUserRecord: async (userId) => {
      const today = new Date().toISOString().split('T')[0];
      const res = await pool.query('SELECT record FROM users WHERE user_id=$1', [userId]);
      if (res.rowCount === 0) {
        const record = { total: 0, byValue: {}, dailyGiven: 0, lastReset: today };
        await pool.query('INSERT INTO users(user_id,record) VALUES($1,$2)', [userId, record]);
        return record;
      }
      return res.rows[0].record;
    },

    getAllUsers: async () => {
      const res = await pool.query('SELECT user_id,record FROM users');
      return res.rows.reduce((acc, r) => ({ ...acc, [r.user_id]: r.record }), {} as Record<string, UserRecord>);
    },

    resetUserPoints: async (userId) => {
      const today = new Date().toISOString().split('T')[0];
      const record = { total: 0, byValue: {}, dailyGiven: 0, lastReset: today };
      await pool.query(
        'INSERT INTO users(user_id,record) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET record=$2',
        [userId, record]
      );
    },

    recordRecognition: async (recog) => {
      const { giver, receiver, value, points } = recog;
      const today = new Date().toISOString().split('T')[0];
      // giver side
      let giverRec = await service.getUserRecord(giver);
      if (giverRec.lastReset !== today) { giverRec.dailyGiven = 0; giverRec.lastReset = today; }
      giverRec.dailyGiven += points;
      await pool.query(
        'INSERT INTO users(user_id,record) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET record=$2',
        [giver, giverRec]
      );
      // receiver side
      let recvRec = await service.getUserRecord(receiver);
      recvRec.total += points;
      recvRec.byValue[value] = (recvRec.byValue[value] || 0) + points;
      await pool.query(
        'INSERT INTO users(user_id,record) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET record=$2',
        [receiver, recvRec]
      );
    },

    canGivePoints: async (userId, pts) => {
      const rec = await service.getUserRecord(userId);
      const today = new Date().toISOString().split('T')[0];
      if (rec.lastReset !== today) return true;
      return rec.dailyGiven + pts <= (await service.getConfig()).dailyLimit;
    },

    redeemReward: async (userId, name) => {
      const reward = await service.getReward(name);
      if (!reward) return false;
      let rec = await service.getUserRecord(userId);
      if (rec.total < reward.cost) return false;
      rec.total -= reward.cost;
      await pool.query(
        'INSERT INTO users(user_id,record) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET record=$2',
        [userId, rec]
      );
      return true;
    },

    saveData: async () => {},
    normalizeUserIds: async () => {},
    resetRewards: async () => service.updateConfig({ rewards: [] }),
    resetValues: async () => service.updateConfig({ values: ['teamwork'] }),
    setLabel: async (lbl) => service.updateConfig({ label: lbl }),
  };
  return service;
}
