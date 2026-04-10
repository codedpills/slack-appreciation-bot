import { AdminCacheService } from '../../src/services/adminCacheService';

describe('Workspace-scoped admin cache', () => {
  test('caches admins per workspace', async () => {
    const client = {
      users: {
        list: jest.fn().mockResolvedValue({
          ok: true,
          members: [
            { id: 'U1', is_admin: true, is_owner: false, is_primary_owner: false, deleted: false },
            { id: 'U2', is_admin: false, is_owner: false, is_primary_owner: false, deleted: false }
          ]
        })
      }
    } as any;

    const service = new AdminCacheService(10000);

    const adminsT1 = await service.getAdmins(client, 'T1');
    const adminsT2 = await service.getAdmins(client, 'T2');
    const adminsT1Again = await service.getAdmins(client, 'T1');

    expect(adminsT1).toEqual(['U1']);
    expect(adminsT2).toEqual(['U1']);
    expect(adminsT1Again).toEqual(['U1']);
    expect(client.users.list).toHaveBeenCalledTimes(2);
  });
});
