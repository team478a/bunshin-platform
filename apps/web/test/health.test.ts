import { describe, expect, it } from 'vitest';
import { liveResponse } from '../src/http/live';

describe('live health check', () => {
  it('returns a request ID without exposing configuration', async () => {
    const response = liveResponse(
      new Request('http://localhost/api/health/live', {
        headers: { 'x-request-id': 'req_12345678' },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      service: 'web',
      requestId: 'req_12345678',
    });
  });
});
