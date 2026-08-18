import { describe, expect, it } from 'vitest';
import { ApplicationError, toApiError } from '../src';

describe('API error mapping', () => {
  it('maps known errors without exposing internal messages', () => {
    const result = toApiError(new ApplicationError('NOT_FOUND', 'sensitive detail'), 'req_1');
    expect(result).toEqual({
      status: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: '対象の情報を確認できませんでした。',
          requestId: 'req_1',
        },
      },
    });
  });

  it('maps unknown errors to a generic internal error', () => {
    expect(toApiError(new Error('database password'), 'req_2').body.error.code).toBe(
      'INTERNAL_ERROR',
    );
  });
});
