export type AdminCacheEntry = {
  admins: string[];
  cachedAt: number;
};

export class AdminCacheService {
  private cache: Map<string, AdminCacheEntry>;
  private ttlMs: number;

  constructor(ttlMs = 5 * 60 * 1000) {
    this.cache = new Map();
    this.ttlMs = ttlMs;
  }

  async getAdmins(client: any, workspaceId: string): Promise<string[]> {
    const now = Date.now();
    const cached = this.cache.get(workspaceId);
    if (cached && now - cached.cachedAt < this.ttlMs) {
      return cached.admins;
    }

    const admins = await this.fetchAdmins(client);
    this.cache.set(workspaceId, { admins, cachedAt: now });
    return admins;
  }

  invalidate(workspaceId?: string): void {
    if (workspaceId) {
      this.cache.delete(workspaceId);
      return;
    }
    this.cache.clear();
  }

  private async fetchAdmins(client: any): Promise<string[]> {
    try {
      const result = await client.users.list();
      if (!result.ok || !result.members) {
        console.error('Failed to fetch users:', result.error);
        return [];
      }
      return result.members
        .filter((u: any) => (u.is_admin || u.is_owner || u.is_primary_owner) && !u.deleted)
        .map((u: any) => u.id);
    } catch (error) {
      console.error('Error fetching admin users:', error);
      return [];
    }
  }
}
