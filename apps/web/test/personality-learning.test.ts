import type { PersonalityLearningProposal } from '@bunshin/application';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const proposal: PersonalityLearningProposal = {
  id: 'proposal-1',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  status: 'PENDING',
  proposedContent: {
    tone: 'やさしい',
    formality: 'ふつう',
    energyLevel: '落ち着いている',
    expertiseLevel: '初心者向け',
    sentenceStyle: '短い文',
    firstPerson: 'わたし',
    forbiddenExpressions: [],
    preferredExpressions: [],
    visualDirection: null,
    facePolicy: 'FULL_ANONYMOUS',
  },
  reason: '短い文章が好まれました',
  evidenceIds: ['feedback-1', 'feedback-2', 'feedback-3'],
  basedOnVersionId: 'version-1',
  appliedVersionId: null,
  createdAt: new Date('2026-09-05T00:00:00Z'),
  decidedAt: null,
  revokedAt: null,
};

const state = vi.hoisted(() => ({
  currentUser: null as { userId: string } | null,
  list: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () =>
    Promise.resolve({ getCurrentUser: () => Promise.resolve(state.currentUser) }),
}));

vi.mock('../src/auth/request-security', async () => {
  const { ApplicationError } = await import('@bunshin/shared');
  return {
    requireSameOrigin(request: Request) {
      if (request.headers.get('origin') !== 'http://localhost:3000')
        throw new ApplicationError('FORBIDDEN', 'Request origin is invalid');
    },
  };
});

vi.mock('@bunshin/database', () => ({
  PrismaPersonalityLearningProposalRepository: class {
    list = state.list;
    approve = state.approve;
    reject = state.reject;
    revoke = state.revoke;
  },
}));

import {
  actOnPersonalityLearningProposalResponse,
  listPersonalityLearningProposalsResponse,
} from '../src/http/personality-learning';

const request = (method = 'GET', origin = 'http://localhost:3000') =>
  new Request('http://localhost:3000/api/proposals', { method, headers: { origin } });

describe('Personality learning HTTP contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    state.currentUser = { userId: 'user-1' };
    state.list.mockResolvedValue([proposal]);
    state.approve.mockResolvedValue({ proposal: { ...proposal, status: 'APPROVED' } });
    state.reject.mockResolvedValue({ ...proposal, status: 'REJECTED' });
    state.revoke.mockResolvedValue({ proposal: { ...proposal, status: 'REVOKED' } });
  });

  it('lists proposals without exposing evidence identifiers', async () => {
    const response = await listPersonalityLearningProposalsResponse(
      request(),
      'workspace-1',
      'bunshin-1',
    );
    const body = (await response.json()) as { data: Array<Record<string, unknown>> };
    expect(response.status).toBe(200);
    expect(body.data[0]).not.toHaveProperty('evidenceIds');
    expect(body.data[0]).toMatchObject({ evidenceCount: 3 });
  });

  it('allows an authenticated same-origin approval', async () => {
    const response = await actOnPersonalityLearningProposalResponse(
      request('POST'),
      'workspace-1',
      'bunshin-1',
      'proposal-1',
      'approve',
    );
    expect(response.status).toBe(200);
    expect(state.approve).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'user-1', proposalId: 'proposal-1' }),
    );
  });

  it('rejects cross-origin mutations', async () => {
    const response = await actOnPersonalityLearningProposalResponse(
      request('POST', 'https://attacker.example'),
      'workspace-1',
      'bunshin-1',
      'proposal-1',
      'reject',
    );
    expect(response.status).toBe(403);
    expect(state.reject).not.toHaveBeenCalled();
  });
});
