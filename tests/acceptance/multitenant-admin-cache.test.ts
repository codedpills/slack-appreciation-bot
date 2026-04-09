import { getAdminUsersCached } from '../../src/utils';

describe('Workspace-scoped admin cache', () => {
  test('caches admins per workspace', async () => {
    const cache = new Map();
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

    const adminsT1 = await getAdminUsersCached(client, 'T1', cache, 10000);
    const adminsT2 = await getAdminUsersCached(client, 'T2', cache, 10000);
    const adminsT1Again = await getAdminUsersCached(client, 'T1', cache, 10000);

    expect(adminsT1).toEqual(['U1']);
    expect(adminsT2).toEqual(['U1']);
    expect(adminsT1Again).toEqual(['U1']);
    expect(client.users.list).toHaveBeenCalledTimes(2);
  });
});
