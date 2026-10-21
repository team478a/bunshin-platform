import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as PersonaProviderModule from '../src/providers/openai-learning-persona-inference';

vi.mock('server-only', () => ({}));

const f = vi.hoisted(() => ({
  profile: vi.fn(),
  lastInference: vi.fn(),
  events: vi.fn(),
  provider: vi.fn(),
  runtime: vi.fn(),
}));

vi.mock('@bunshin/database', () => ({
  prisma: { programActionEvent: { findMany: f.events } },
  PrismaPersonalLearningPersonaRepository: class {
    profile = f.profile;
    lastSuccessfulInferenceAt = f.lastInference;
  },
}));
vi.mock('../src/ai/learning-provider-runtime', () => ({
  resolveLearningProviderRuntimeConfiguration: f.runtime,
  reserveLearningProviderRuntimeConfiguration: vi.fn(),
}));
vi.mock('../src/providers/openai-learning-persona-inference', async (importOriginal) => {
  const actual = await importOriginal<typeof PersonaProviderModule>();
  return { ...actual, generatePersonaInference: f.provider };
});

import { inferPersonalLearningPersonaAfterSuccess } from '../src/services/personal-learning-persona-inference';

describe('invalid offer policy persona boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv(
      'PERSONAL_LEARNING_LESSON_ADMISSION',
      JSON.stringify({
        workspaceId: 'workspace',
        groupId: 'group',
        model: 'synthetic',
        dailyCallLimit: 10,
        dailyCostLimitUsdMicros: 10000,
        maxRequestBytes: 4000,
        maxOutputTokens: 100,
      }),
    );
    f.profile.mockResolvedValue({ optedIn: true });
    f.lastInference.mockResolvedValue(null);
    f.events.mockResolvedValue([
      {
        id: 'event',
        eventType: 'PERSONAL_LEARNING_CONVERSATION_MESSAGE',
        metadata: { text: '学びたい' },
        createdAt: new Date('2026-10-21T00:00:00.000Z'),
      },
    ]);
    f.runtime.mockResolvedValue({ model: 'synthetic' });
  });

  it('returns SKIPPED before the persona AI Provider when policy resolution is invalid', async () => {
    const result = await inferPersonalLearningPersonaAfterSuccess({
      actor: {
        actorUserId: 'user',
        scope: {
          workspaceId: 'workspace',
          groupId: 'group',
          programEnrollmentId: 'enrollment',
          groupMembershipId: 'membership',
          userId: 'user',
        },
      },
      requestId: 'request',
      requestRevision: 1,
      offerPolicy: 'UNKNOWN_POLICY' as never,
    });

    expect(result).toEqual({ outcome: 'SKIPPED' });
    expect(f.provider).not.toHaveBeenCalled();
  });
});
