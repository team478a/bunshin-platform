import { describe, expect, it } from 'vitest';
import {
  missionReasoningOptions,
  missionTransportFailure,
  readMissionProviderResponse,
} from '../src/providers/mission-provider-response';

describe('mission Provider response safety', () => {
  it.each(['gpt-5-mini', 'gpt-5-mini-2025-08-07'])(
    'sets bounded reasoning only for supported %s',
    (model) => {
      expect(missionReasoningOptions(model)).toEqual({ reasoning: { effort: 'low' } });
    },
  );
  it.each(['gpt-5.2', 'gpt-4.1', 'gpt-5-nano', 'custom-gpt-5-mini'])(
    'does not override %s',
    (model) => {
      expect(missionReasoningOptions(model)).toEqual({});
    },
  );
  it.each([429, 503, 400, 401])('preserves HTTP %s even for HTML', async (status) => {
    await expect(
      readMissionProviderResponse(new Response('<private>secret</private>', { status })),
    ).rejects.toMatchObject({
      code: 'AI_PROVIDER_UNAVAILABLE',
      cause: { httpStatus: status },
    });
  });
  it('records only bounded error code, not Provider body', async () => {
    try {
      await readMissionProviderResponse(
        new Response(
          JSON.stringify({ error: { code: 'invalid_json_schema', message: 'private-secret' } }),
          { status: 400 },
        ),
      );
      expect.fail('must reject');
    } catch (error) {
      expect(error).toMatchObject({
        cause: { httpStatus: 400, providerErrorCode: 'invalid_json_schema' },
      });
      expect(JSON.stringify(error)).not.toContain('private-secret');
    }
  });
  it.each([
    ['', 'EMPTY_RESPONSE'],
    ['{', 'INVALID_JSON'],
    ['null', 'INVALID_JSON'],
    [JSON.stringify({ status: 'incomplete', output: [] }), 'MALFORMED_RESPONSE'],
    [JSON.stringify({ output: {} }), 'MALFORMED_RESPONSE'],
    [JSON.stringify({ output: [null] }), 'MALFORMED_RESPONSE'],
    [
      JSON.stringify({ output: [{ content: [{ type: 'output_text', text: '{' }] }] }),
      'MALFORMED_OUTPUT',
    ],
    [
      JSON.stringify({ output: [{ content: [{ type: 'output_text', text: 'null' }] }] }),
      'MALFORMED_OUTPUT',
    ],
  ])('does not return partial content: %s', async (body, reason) => {
    await expect(readMissionProviderResponse(new Response(body))).rejects.toMatchObject({
      code: 'AI_PROVIDER_UNAVAILABLE',
      cause: { reason },
    });
  });
  it('distinguishes timeout from network and never retains the raw exception', () => {
    expect(
      missionTransportFailure(new DOMException('private-secret', 'TimeoutError')),
    ).toMatchObject({ cause: { reason: 'TIMEOUT' } });
    const error = missionTransportFailure(new Error('private-secret'));
    expect(error).toMatchObject({ cause: { reason: 'NETWORK_ERROR' } });
    expect(JSON.stringify(error)).not.toContain('private-secret');
  });
});
