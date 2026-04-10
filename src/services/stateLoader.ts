import { IDataService } from './dataServiceInterface';
import { AppConfig, Reward, UserRecord } from '../types';

export type HomeState = {
  users: Record<string, UserRecord>;
  config: AppConfig;
  rewards: Reward[];
  currentUser: UserRecord;
};

export class StateLoader {
  private dataService: IDataService;

  constructor(dataService: IDataService) {
    this.dataService = dataService;
  }

  async loadState(workspaceId?: string): Promise<Omit<HomeState, 'currentUser'>> {
    const [users, config, rewards] = await Promise.all([
      this.dataService.getAllUsers(workspaceId),
      this.dataService.getConfig(workspaceId),
      this.dataService.getRewards(workspaceId)
    ]);

    return {
      users,
      config,
      rewards
    };
  }

  async loadHomeState(userId: string, workspaceId?: string): Promise<HomeState> {
    const { users, config, rewards } = await this.loadState(workspaceId);

    const currentUser = users[userId] || {
      total: 0,
      byValue: {},
      dailyGiven: 0,
      lastReset: ''
    };

    return {
      users,
      config,
      rewards,
      currentUser
    };
  }
}
