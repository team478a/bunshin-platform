import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ readState: vi.fn(), generate: vi.fn() }));

vi.mock('@bunshin/database', () => ({
  PrismaSideHustleHearingRepository: class {
    readState = mocks.readState;
  },
  prisma: {},
}));
vi.mock('../src/providers/openai-side-hustle-roadmap', () => ({
  generateSideHustleRoadmap: mocks.generate,
  sideHustleRoadmapBody: vi.fn(),
}));

import { prepareSideHustleRoadmap } from '../src/services/side-hustle-roadmap';

const actor = {
  actorUserId: '11111111-1111-4111-8111-111111111111',
  scope: {
    workspaceId: 'workspace',
    groupId: 'group',
    programEnrollmentId: 'enrollment',
    groupMembershipId: 'membership',
    userId: 'user',
  },
};

describe('side hustle roadmap service idempotency', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the saved roadmap for a resent operation without calling the AI Provider', async () => {
    const saved = {
      id: 'roadmap-event',
      selectionEventId: 'selection-event',
      operationId: 'operation-id',
      roadmap: { milestones: [] },
    };
    mocks.readState.mockResolvedValue({
      selection: { id: 'selection-event' },
      roadmap: saved,
    });

    await expect(
      prepareSideHustleRoadmap(actor as never, 'selection-event', 'operation-id'),
    ).resolves.toBe(saved);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
