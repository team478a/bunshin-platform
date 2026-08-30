import { describe, expect, it, vi } from 'vitest';
import type { BunshinAggregate } from '@bunshin/platform-domain';
import type { BunshinRepository } from '../src';
import {
  ArchiveBunshin,
  CreateBunshin,
  GetBunshin,
  ListServiceBunshins,
  UpdateBunshinProfile,
} from '../src';

const aggregate: BunshinAggregate = {
  id: 'bunshin-1',
  workspaceId: 'workspace-1',
  ownerUserId: 'user-1',
  name: 'Expert',
  slug: 'expert',
  type: 'EXPERT',
  status: 'DRAFT',
  objectiveSummary: 'Help users',
  audienceSummary: 'Teams',
  personalitySummary: 'Calm',
  avatarUrl: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  archivedAt: null,
  objectives: [],
  audiences: [],
  personality: null,
};

function repository(overrides: Partial<BunshinRepository> = {}): BunshinRepository {
  return {
    create: vi.fn(() => Promise.resolve(aggregate)),
    list: vi.fn(() => Promise.resolve([aggregate])),
    listForService: vi.fn(() => Promise.resolve([aggregate])),
    find: vi.fn(() => Promise.resolve(aggregate)),
    update: vi.fn(() => Promise.resolve(aggregate)),
    archive: vi.fn(() => Promise.resolve(aggregate)),
    ...overrides,
  };
}

describe('Bunshin use cases', () => {
  it('normalizes validated create input before persistence', async () => {
    const create = vi.fn(() => Promise.resolve(aggregate));
    const repo = repository({ create });
    await new CreateBunshin(repo).execute({
      workspaceId: 'workspace-1',
      actorUserId: 'user-1',
      name: ' Expert ',
      slug: ' Expert-One ',
      type: 'EXPERT',
      objectiveSummary: ' Help users ',
      audienceSummary: ' Teams ',
      personalitySummary: ' Calm ',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Expert',
        slug: 'expert-one',
        objectiveSummary: 'Help users',
      }),
    );
  });

  it('rejects invalid slugs before persistence', () => {
    const repo = repository();
    expect(() =>
      new CreateBunshin(repo).execute({
        workspaceId: 'workspace-1',
        actorUserId: 'user-1',
        name: 'Expert',
        slug: 'invalid_slug',
        type: 'EXPERT',
        objectiveSummary: 'Help users',
        audienceSummary: 'Teams',
        personalitySummary: 'Calm',
      }),
    ).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('keeps the complete service scope when listing service bunshins', async () => {
    const listForService = vi.fn(() => Promise.resolve([aggregate]));
    const scope = {
      workspaceId: 'workspace-1',
      groupId: 'service-1',
      actorUserId: 'user-1',
    };
    await expect(
      new ListServiceBunshins(repository({ listForService })).execute(scope),
    ).resolves.toEqual([aggregate]);
    expect(listForService).toHaveBeenCalledWith(scope);
  });

  it('maps inaccessible get, update, and archive results to NOT_FOUND', async () => {
    const repo = repository({
      find: vi.fn(() => Promise.resolve(null)),
      update: vi.fn(() => Promise.resolve(null)),
      archive: vi.fn(() => Promise.resolve(null)),
    });
    const reference = { workspaceId: 'workspace-1', actorUserId: 'user-1', bunshinId: 'missing' };
    await expect(new GetBunshin(repo).execute(reference)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      new UpdateBunshinProfile(repo).execute({ ...reference, name: 'New' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(new ArchiveBunshin(repo).execute(reference)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
