import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ environment: 'development', service: vi.fn(), membership: vi.fn() }));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => ({ APP_ENV: f.environment }) }));
vi.mock('../src/services/public-service', () => ({ resolveMemberServiceContext: f.service }));
vi.mock('../src/services/ai-training-consent', () => ({
  requireAiTrainingUsageConsent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@bunshin/database', () => ({ prisma: { groupMembership: { findFirst: f.membership } } }));
import {
  personalLearningRequestEnabled,
  resolvePersonalLearningRequestActor,
} from '../src/services/personal-learning-request-access';
describe('learning request exposure and ownership', () => {
  beforeEach(() => {
    vi.stubEnv('PERSONAL_LEARNING_REQUEST_INTAKE', 'true');
    f.environment = 'development';
    f.service.mockResolvedValue({ workspaceId: 'workspace', serviceId: 'service' });
    f.membership.mockResolvedValue({ id: 'member' });
  });
  afterEach(() => vi.unstubAllEnvs());
  it('requires explicit non-production enablement', () => {
    expect(personalLearningRequestEnabled()).toBe(true);
    f.environment = 'staging';
    expect(personalLearningRequestEnabled()).toBe(true);
    f.environment = 'production';
    expect(personalLearningRequestEnabled()).toBe(false);
    f.environment = 'development';
    vi.stubEnv('PERSONAL_LEARNING_REQUEST_INTAKE', 'false');
    expect(personalLearningRequestEnabled()).toBe(false);
  });
  it('scope is server-resolved and normal participant only', async () => {
    const result = await resolvePersonalLearningRequestActor(
      'slug',
      '00000000-0000-4000-8000-000000000001',
      'user',
    );
    expect(result.scope).toMatchObject({
      workspaceId: 'workspace',
      groupId: 'service',
      userId: 'user',
      groupMembershipId: 'member',
    });
    expect(f.membership).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user',
          serviceRole: 'PARTICIPANT',
          status: 'ACTIVE',
        }),
      }),
    );
  });
  it('non-member denied', async () => {
    f.membership.mockResolvedValue(null);
    await expect(
      resolvePersonalLearningRequestActor('slug', '00000000-0000-4000-8000-000000000001', 'other'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
