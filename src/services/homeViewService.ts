import { buildHomeViewFromContext, ViewContext } from '../views/homeView';
import { UserRecord } from '../types';

const defaultUserRecord: UserRecord = {
  total: 0,
  byValue: {},
  dailyGiven: 0,
  lastReset: ''
};

export class HomeViewService {
  buildHomeView(ctx: ViewContext) {
    const currentUser = ctx.currentUser || ctx.users[ctx.userId] || defaultUserRecord;
    return buildHomeViewFromContext({
      ...ctx,
      currentUser
    });
  }
}
