import { Pool } from 'pg';
import { IDataService } from './dataServiceInterface';
import { AppState} from '../types';

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
  const state: AppState = { config: { ...defaults }, users: {} };
  const service: IDataService = {
    getConfig: () => ({ ...state.config }),

    updateConfig: async (newCfg) => {
      state.config = { ...state.config, ...newCfg };
      await pool.query(
        'INSERT INTO config(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2',
        ['config', state.config]
      );
    },

    setDailyLimit: async (limit) => service.updateConfig({ dailyLimit: limit }),

    addValue: async (value) => {
      const v = value.toLowerCase().trim();
      if (!state.config.values.includes(v)) {
        state.config.values.push(v);
        await service.updateConfig({ values: state.config.values });
      }
    },

    removeValue: async (value) => {
      const v = value.toLowerCase().trim();
      state.config.values = state.config.values.filter(x => x !== v);
      await service.updateConfig({ values: state.config.values });
    },

    addReward: async (name, cost) => {
      const idx = state.config.rewards.findIndex(r => r.name === name);
      if (idx >= 0) state.config.rewards[idx].cost = cost;
      else state.config.rewards.push({ name, cost });
      await service.updateConfig({ rewards: state.config.rewards });
    },

    removeReward: async (name) => {
      state.config.rewards = state.config.rewards.filter(r => r.name !== name);
      await service.updateConfig({ rewards: state.config.rewards });
    },

    getRewards: () => [...state.config.rewards],

    getReward: (name) => state.config.rewards.find(r => r.name === name),

    getUserRecord: (userId) => {
      if (!state.users[userId]) {
        const today = new Date().toISOString().split('T')[0];
        state.users[userId] = { total: 0, byValue: {}, dailyGiven: 0, lastReset: today };
        pool.query(
          'INSERT INTO users(user_id,record) VALUES($1,$2)',
          [userId, state.users[userId]]
        ).catch(console.error);
      }
      return { ...state.users[userId] };
    },

    getAllUsers: () => ({ ...state.users }),

    resetUserPoints: async (userId) => {
      const today = new Date().toISOString().split('T')[0];
      state.users[userId] = { total: 0, byValue: {}, dailyGiven: 0, lastReset: today };
      await pool.query(
        'INSERT INTO users(user_id,record) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET record=$2',
        [userId, state.users[userId]]
      );
    },

    recordRecognition: async (recog) => {
      const { giver, receiver, value, points } = recog;
      const today = new Date().toISOString().split('T')[0];
      // process giver
      let g = service.getUserRecord(giver);
      if (g.lastReset !== today) { g.dailyGiven = 0; g.lastReset = today; }
      g.dailyGiven += points;
      state.users[giver] = g;
      await pool.query(
        'INSERT INTO users(user_id,record) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET record=$2',
        [giver, g]
      );
      // process receiver
      let r = service.getUserRecord(receiver);
      r.total += points;
      r.byValue[value] = (r.byValue[value] || 0) + points;
      state.users[receiver] = r;
      await pool.query(
        'INSERT INTO users(user_id,record) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET record=$2',
        [receiver, r]
      );
    },

    canGivePoints: (userId, pts) => {
      const u = service.getUserRecord(userId);
      const today = new Date().toISOString().split('T')[0];
      if (u.lastReset !== today) return true;
      return u.dailyGiven + pts <= state.config.dailyLimit;
    },

    redeemReward: async (userId, name) => {
      const reward = service.getReward(name);
      if (!reward) return false;
      let u = service.getUserRecord(userId);
      if (u.total < reward.cost) return false;
      u.total -= reward.cost;
      state.users[userId] = u;
      await pool.query(
        'INSERT INTO users(user_id,record) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET record=$2',
        [userId, u]
      );
      return true;
    },

    saveData: async () => {},
    normalizeUserIds: async () => {},
    resetRewards: async () => service.updateConfig({ rewards: [] }),
    resetValues: async () => service.updateConfig({ values: ['teamwork'] }),
    setLabel: async (lbl) => service.updateConfig({ label: lbl }),
  };
  // Async init: create tables and seed
  (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value JSONB NOT NULL);
      CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY, record JSONB NOT NULL);
    `);
    // seed config and users based on state
    await pool.query(
      'INSERT INTO config(key,value) VALUES($1,$2) ON CONFLICT DO NOTHING',
      ['config', state.config]
    );
    Object.entries(state.users).forEach(([id, rec]) => {
      pool.query(
        'INSERT INTO users(user_id,record) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [id, rec]
      ).catch(console.error);
    });
  })().catch(console.error);
  return service;
}
