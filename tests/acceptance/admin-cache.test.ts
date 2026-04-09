import { AdminCacheService } from '../../src/services/adminCacheService';

describe('AdminCacheService', () => {
  test('caches admin lookups per workspace', async () => {
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

    const adminsFirst = await service.getAdmins(client, 'T1');
    const adminsSecond = await service.getAdmins(client, 'T1');

    expect(adminsFirst).toEqual(['U1']);
    expect(adminsSecond).toEqual(['U1']);
    expect(client.users.list).toHaveBeenCalledTimes(1);
  });

  test('keeps cache isolated per workspace', async () => {
    const client = {
      users: {
        list: jest
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            members: [
              { id: 'U1', is_admin: true, is_owner: false, is_primary_owner: false, deleted: false }
            ]
          })
          .mockResolvedValueOnce({
            ok: true,
            members: [
              { id: 'U2', is_admin: true, is_owner: false, is_primary_owner: false, deleted: false }
            ]
          })
      }
    } as any;

    const service = new AdminCacheService(10000);

    const adminsT1 = await service.getAdmins(client, 'T1');
    const adminsT2 = await service.getAdmins(client, 'T2');

    expect(adminsT1).toEqual(['U1']);
    expect(adminsT2).toEqual(['U2']);
    expect(client.users.list).toHaveBeenCalledTimes(2);
  });

  test('refreshes admins after TTL expires', async () => {
    const client = {
      users: {
        list: jest
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            members: [
              { id: 'U1', is_admin: true, is_owner: false, is_primary_owner: false, deleted: false }
            ]
          })
          .mockResolvedValueOnce({
            ok: true,
            members: [
              { id: 'U2', is_admin: true, is_owner: false, is_primary_owner: false, deleted: false }
            ]
          })
      }
    } as any;

    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1000);
    nowSpy.mockReturnValueOnce(1000 + 1100);

    const service = new AdminCacheService(1000);

    const adminsFirst = await service.getAdmins(client, 'T1');
    const adminsSecond = await service.getAdmins(client, 'T1');

    expect(adminsFirst).toEqual(['U1']);
    expect(adminsSecond).toEqual(['U2']);
    expect(client.users.list).toHaveBeenCalledTimes(2);

    nowSpy.mockRestore();
  });

  test('returns empty list when Slack lookup fails', async () => {
    const client = {
      users: {
        list: jest.fn().mockRejectedValue(new Error('Slack down'))
      }
    } as any;

    const service = new AdminCacheService(10000);

    const admins = await service.getAdmins(client, 'T1');

    expect(admins).toEqual([]);
    expect(client.users.list).toHaveBeenCalledTimes(1);
  });
});
