import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { PrismaBadgeUserExperienceRepository } from '../src/badge-user-experience';

const migration = readFileSync(
  fileURLToPath(
    new URL(
      '../prisma/migrations/20260829060000_add_badge_user_visibility/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);
const repository = readFileSync(
  fileURLToPath(new URL('../src/badge-user-experience.ts', import.meta.url)),
  'utf8',
);

describe('badge user visibility boundaries', () => {
  it('starts private and requires an exact group scope when shared', () => {
    expect(migration).toContain("DEFAULT 'PRIVATE'");
    expect(migration).toContain('badge_award_visibility_scope_check');
    expect(migration).toContain('badge_award_visibilities_shared_group_scope_fkey');
  });

  it('keeps one user-controlled visibility setting per award', () => {
    expect(migration).toContain('badge_award_visibilities_badge_award_id_key');
    expect(migration).toContain('badge_award_visibilities_badge_award_scope_fkey');
    expect(repository).toContain('userId: input.actorUserId');
    expect(repository).toContain("status: 'ACTIVE'");
  });

  it('requires an active membership before group sharing', () => {
    expect(repository).toContain('groupMembership.findFirst');
    expect(repository).toContain("group: { status: 'ACTIVE' }");
    expect(repository).not.toContain('PUBLIC');
  });

  it('limits service badge definitions and sharing choices to the selected group', async () => {
    const badgeVersionFindMany = vi.fn().mockResolvedValue([]);
    const notificationFindMany = vi.fn().mockResolvedValue([]);
    const client = {
      groupMembership: {
        findFirst: vi.fn().mockResolvedValue({ id: 'membership-1' }),
        findMany: vi.fn().mockResolvedValue([{ group: { id: 'group-1', name: 'サービス1' } }]),
      },
      workspaceMembership: { findFirst: vi.fn() },
      badgeAward: { findMany: vi.fn().mockResolvedValue([]) },
      badgeAwardNotification: { createMany: vi.fn(), findMany: notificationFindMany },
      badgeVersion: { findMany: badgeVersionFindMany },
    };

    const dashboard = await new PrismaBadgeUserExperienceRepository(client as never).getDashboard({
      workspaceId: 'workspace-1',
      groupId: 'group-1',
      actorUserId: 'user-1',
      now: new Date('2026-09-12T00:00:00.000Z'),
    });

    expect(client.groupMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ groupId: 'group-1' }) }),
    );
    expect(client.workspaceMembership.findFirst).not.toHaveBeenCalled();
    expect(badgeVersionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              definition: expect.objectContaining({
                OR: expect.arrayContaining([
                  expect.objectContaining({ groupId: { in: ['group-1'] } }),
                ]),
              }),
            }),
          ]),
        }),
      }),
    );
    expect(dashboard?.shareableGroups).toEqual([{ id: 'group-1', name: 'サービス1' }]);
  });
});
