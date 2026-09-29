import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';

const m = vi.hoisted(() => ({
  actor: vi.fn(),
  member: vi.fn(),
  membership: vi.fn(),
  runtime: vi.fn(),
  generate: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://example.com' }),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: m.actor }),
}));
vi.mock('../src/services/public-service', () => ({ resolveMemberServiceContext: m.member }));
vi.mock('@bunshin/database', () => ({ prisma: { groupMembership: { findFirst: m.membership } } }));
vi.mock('../src/ai/runtime-provider-configuration', () => ({
  resolveOpenAiRuntimeConfiguration: m.runtime,
}));
vi.mock('../src/providers/openai-bunshin-proposal-generator', () => ({
  OpenAIBunshinProposalGenerator: class {
    generate = m.generate;
  },
}));
import { serviceBunshinProposalsResponse } from '../src/http/service-bunshin-proposals';

function request(origin = 'https://example.com') {
  return new Request('https://example.com/api/services/private-a/bunshin-proposals', {
    method: 'POST',
    headers: { origin },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({ userId: 'member-a' });
  m.member.mockResolvedValue({ workspaceId: 'workspace-a', serviceId: 'service-a' });
  m.membership.mockResolvedValue({
    serviceOnboardingResponse: { answers: [{ question: '目的', answer: '自Serviceだけの回答' }] },
    serviceMemberBusinessProfile: null,
  });
  m.runtime.mockRejectedValue(new Error('provider unavailable'));
});
describe('participant creation proposals', () => {
  it('uses only the private service actor membership and retains fallback creation', async () => {
    const result = await serviceBunshinProposalsResponse(request(), 'private-a');
    expect(result.status).toBe(200);
    expect(m.member).toHaveBeenCalledWith('private-a', 'member-a');
    expect(m.membership).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-a',
          groupId: 'service-a',
          userId: 'member-a',
          status: 'ACTIVE',
        }),
      }),
    );
    const json = await result.json();
    expect(json.data.source).toBe('FALLBACK');
    expect(json.data.proposals).toHaveLength(3);
    expect(json.data.proposals[0].objectiveSummary).toContain('自Serviceだけの回答');
    expect(m.generate).not.toHaveBeenCalled();
  });
  it('does not resolve or read any service for anonymous requests', async () => {
    m.actor.mockResolvedValue(null);
    expect((await serviceBunshinProposalsResponse(request(), 'private-a')).status).toBe(401);
    expect(m.member).not.toHaveBeenCalled();
    expect(m.membership).not.toHaveBeenCalled();
  });
  it('rejects nonmembers or unavailable services before reading answers or using AI', async () => {
    m.member.mockRejectedValue(new ApplicationError('NOT_FOUND', 'service not found'));
    expect((await serviceBunshinProposalsResponse(request(), 'other')).status).toBe(404);
    expect(m.membership).not.toHaveBeenCalled();
    expect(m.runtime).not.toHaveBeenCalled();
  });
  it('rechecks membership before proposals and does not borrow other answers', async () => {
    m.membership.mockResolvedValue(null);
    expect((await serviceBunshinProposalsResponse(request(), 'private-a')).status).toBe(404);
    expect(m.runtime).not.toHaveBeenCalled();
  });
  it('requires this service onboarding answers', async () => {
    m.membership.mockResolvedValue({
      serviceOnboardingResponse: null,
      serviceMemberBusinessProfile: null,
    });
    expect((await serviceBunshinProposalsResponse(request(), 'private-a')).status).toBe(400);
    expect(m.runtime).not.toHaveBeenCalled();
  });
  it('rejects cross-origin proposals before membership or provider access', async () => {
    expect(
      (await serviceBunshinProposalsResponse(request('https://attacker.example'), 'private-a'))
        .status,
    ).toBe(403);
    expect(m.member).not.toHaveBeenCalled();
    expect(m.runtime).not.toHaveBeenCalled();
  });
  it('does not reuse scope when another service is selected', async () => {
    m.member.mockResolvedValue({ workspaceId: 'workspace-b', serviceId: 'service-b' });
    expect((await serviceBunshinProposalsResponse(request(), 'private-b')).status).toBe(200);
    expect(m.membership).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-b',
          groupId: 'service-b',
          userId: 'member-a',
        }),
      }),
    );
  });
});
