import { beforeEach, describe, expect, it, vi } from 'vitest';

const findFirst = vi.fn();

vi.mock('@bunshin/database', () => ({
  prisma: { serviceConfiguration: { findFirst } },
}));

import { serviceManagementReturnPath } from '../src/services/service-management-return';

describe('service management return path', () => {
  beforeEach(() => findFirst.mockReset());

  it('returns the service route only after matching slug and group on the server', async () => {
    findFirst.mockResolvedValue({ slug: 'agency-support' });
    await expect(
      serviceManagementReturnPath({
        groupId: 'group-a',
        serviceSlug: 'agency-support',
        section: 'legal',
        query: '?created=1',
      }),
    ).resolves.toBe('/s/agency-support/manage/legal?created=1');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ groupId: 'group-a', slug: 'agency-support' }),
      }),
    );
  });

  it('falls back to the internal route when the service does not match', async () => {
    findFirst.mockResolvedValue(null);
    await expect(
      serviceManagementReturnPath({
        groupId: 'group-a',
        serviceSlug: 'other-service',
        section: 'badges',
      }),
    ).resolves.toBe('/groups/group-a/badges');
  });

  it('rejects arbitrary redirect data without querying the database', async () => {
    await expect(
      serviceManagementReturnPath({
        groupId: 'group-a',
        serviceSlug: 'https://evil.example',
        section: 'members',
      }),
    ).resolves.toBe('/groups/group-a/members');
    expect(findFirst).not.toHaveBeenCalled();
  });
});
