import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readState: vi.fn(),
  readProgress: vi.fn(),
  readProposal: vi.fn(),
  generate: vi.fn(),
  resolveOffer: vi.fn(),
}));
vi.mock('@bunshin/database', () => ({
  PrismaSideHustleHearingRepository: class {
    readState = mocks.readState;
    readProgress = mocks.readProgress;
    readRoadmapRevisionProposal = mocks.readProposal;
  },
  prisma: {},
}));
vi.mock('../src/providers/openai-side-hustle-roadmap', () => ({
  generateSideHustleRoadmap: mocks.generate,
  sideHustleRoadmapRevisionBody: vi.fn(() => '{}'),
}));
vi.mock('../src/services/personal-learning-extended-scope', () => ({
  resolvePersonalLearningOfferContext: mocks.resolveOffer,
}));

import { prepareSideHustleRoadmapRevision } from '../src/services/side-hustle-roadmap-revision';

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

describe('side-hustle roadmap revision retries', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an operation replay before reading progress or invoking the provider', async () => {
    const saved = { id: 'revision-event', operationId: 'operation', roadmap: { milestones: [] } };
    mocks.readState.mockResolvedValue({
      started: { topicId: 'topic' },
      selection: { id: 'selection' },
      roadmap: { id: 'base', roadmap: {} },
    });
    mocks.readProposal.mockResolvedValue(saved);
    await expect(
      prepareSideHustleRoadmapRevision(actor as never, {
        topicId: 'topic',
        checkinEventId: 'checkin',
        operationId: 'operation',
      }),
    ).resolves.toBe(saved);
    expect(mocks.readProgress).not.toHaveBeenCalled();
    expect(mocks.resolveOffer).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
