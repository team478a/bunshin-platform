import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const fake = vi.hoisted(() => ({
  programs: vi.fn(),
  environment: {
    APP_ENV: 'production',
    CRON_SECRET: 'n'.repeat(32),
    APP_URL: 'https://example.test',
  },
}));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => fake.environment }));
vi.mock('@bunshin/database', () => ({ prisma: { serviceProgram: { findMany: fake.programs } } }));

import { personalLearningNudgesCronResponse } from '../src/http/personal-learning-nudges-cron';

const source = readFileSync(
  new URL('../src/http/personal-learning-nudges-cron.ts', import.meta.url),
  'utf8',
);
const request = (authorization = `Bearer ${fake.environment.CRON_SECRET}`) =>
  new Request('https://example.test/api/internal/ai-training/learning-nudges', {
    headers: { authorization },
  });

describe('N-1 fixed LINE learning nudges cron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.environment.APP_ENV = 'production';
    fake.programs.mockResolvedValue([]);
  });

  it('requires cron authentication before scanning Programs', async () => {
    const response = await personalLearningNudgesCronResponse(request('Bearer invalid'));
    expect(response.status).toBe(401);
    expect(fake.programs).not.toHaveBeenCalled();
  });

  it('does nothing when there are no active nudge-enabled Programs', async () => {
    const response = await personalLearningNudgesCronResponse(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: 'COMPLETED', scanned: 0, sent: 0 });
  });

  it('keeps N-1 fixed copy as the fallback when the N-2 AI attempt is unavailable', () => {
    expect(source).toContain('personalLearningNudgeCopy(decision.situation, decision.ordinal)');
    expect(source).toContain('personalLearningNudgeQuickReplies(enrollment.id)');
    expect(source).toContain('generatePersonalLearningNudgeCopy');
    expect(source).toContain('personalLearningNudgeDeliveryMessage');
    expect(source).toContain('fixedCopy: outbox.text');
  });
});
