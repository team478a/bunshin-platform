import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
import {
  dailyMissionErrorCategory,
  dailyMissionProviderFailureDetails,
} from '../src/services/daily-mission-ai-runtime';

describe('Daily Mission provider diagnostics', () => {
  it('classifies an HTTP provider failure without retaining its response body', () => {
    const error = new ApplicationError(
      'AI_PROVIDER_UNAVAILABLE',
      'daily mission planner provider failed',
      {
        provider: 'openai',
        httpStatus: 429,
        providerErrorCode: 'rate_limit_exceeded',
        responseBody: 'must never be logged',
      },
    );

    expect(dailyMissionProviderFailureDetails(error)).toEqual({
      providerHttpStatus: 429,
      providerErrorCode: 'rate_limit_exceeded',
    });
    expect(dailyMissionErrorCategory(error)).toBe('AI_PROVIDER_HTTP_429');
    expect(JSON.stringify(dailyMissionProviderFailureDetails(error))).not.toContain('responseBody');
  });

  it('classifies network and timeout failures with a bounded reason', () => {
    for (const reason of ['NETWORK_ERROR', 'TIMEOUT'] as const) {
      const error = new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'provider unavailable', {
        provider: 'openai',
        reason,
      });
      expect(dailyMissionProviderFailureDetails(error)).toEqual({
        providerFailureReason: reason,
      });
      expect(dailyMissionErrorCategory(error)).toBe(`AI_PROVIDER_${reason}`);
    }
  });

  it('drops untrusted diagnostics instead of logging arbitrary provider values', () => {
    const error = new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'provider unavailable', {
      reason: 'secret value',
      httpStatus: 999,
      providerErrorCode: 'invalid code with spaces and payload',
      apiKey: 'secret',
    });

    expect(dailyMissionProviderFailureDetails(error)).toEqual({});
    expect(dailyMissionErrorCategory(error)).toBe('AI_PROVIDER_UNAVAILABLE');
  });

  it('ignores non-provider application failures', () => {
    const error = new ApplicationError('CONTENT_REJECTED', 'quality gate failed');
    expect(dailyMissionProviderFailureDetails(error)).toBeNull();
    expect(dailyMissionErrorCategory(error)).toBe('CONTENT_REJECTED');
  });

  it('keeps the bounded final rebrief failure category for operations', () => {
    const error = new ApplicationError('CONTENT_REJECTED', 'final rebrief quality failed', {
      category: 'DECISION_REBRIEF_FAILED',
      privateContent: 'must not become the category',
    });
    expect(dailyMissionErrorCategory(error)).toBe('DECISION_REBRIEF_FAILED');
  });

  it.each([
    ['REVIEW_REQUIRED', 'DECISION_CONTEXT_REVIEW_REQUIRED'],
    ['BLOCKED', 'DECISION_CONTEXT_BLOCKED'],
  ] as const)(
    'keeps the bounded %s decision context category for operations',
    (status, category) => {
      const error = new ApplicationError('CONFLICT', 'decision context is not ready', {
        category,
        status,
        privateContent: 'must not become the category',
      });
      expect(dailyMissionErrorCategory(error)).toBe(category);
    },
  );
});
