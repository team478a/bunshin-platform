import { ApplicationError } from '@bunshin/shared';
import { describe, expect, it } from 'vitest';
import { dailyMissionGenerationError } from '../src/http/daily-mission-generation-error';

describe('daily mission generation errors', () => {
  it.each([
    ['daily mission already exists', 'ALREADY_EXISTS', '作成済み'],
    ['approved strategy is required', 'STRATEGY_REQUIRED', '方針がまだ決まっていません'],
    ['daily mission generation is in progress', 'GENERATION_IN_PROGRESS', '作成中'],
  ])('distinguishes conflict: %s', (message, reason, publicMessage) => {
    const result = dailyMissionGenerationError(
      new ApplicationError('CONFLICT', message),
      'req-test',
    );
    expect(result.status).toBe(409);
    expect(result.body.error).toMatchObject({ reason, requestId: 'req-test' });
    expect(result.body.error.message).toContain(publicMessage);
    if (reason !== 'ALREADY_EXISTS') expect(result.body.error.message).not.toContain('作成済み');
  });

  it('explains a missing scheduled day', () => {
    const result = dailyMissionGenerationError(
      new ApplicationError('NOT_FOUND', 'confirmed weekly plan item not found for date'),
      'req-test',
    );
    expect(result.status).toBe(404);
    expect(result.body.error).toMatchObject({
      reason: 'WEEKLY_PLAN_REQUIRED',
      requestId: 'req-test',
    });
  });

  it.each([
    new Error('private internal data'),
    new ApplicationError('CONFLICT', 'private internal data'),
    new ApplicationError('FORBIDDEN', 'approved strategy is required'),
  ])('does not expose unknown failures or classify by message alone', (error) => {
    const result = dailyMissionGenerationError(error, 'req-test');
    expect(result.body.error).not.toHaveProperty('reason');
    expect(result.body.error.message).not.toContain(error.message);
    expect(result.body.error.requestId).toBe('req-test');
  });
});
