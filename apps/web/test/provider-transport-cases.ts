import { ApplicationError } from '@bunshin/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Run against the real Adapter with injected fetch only; never use global fetch.
export function providerTransportCases(generate: (fetcher: typeof fetch) => Promise<unknown>) {
  describe('bounded transport', () => {
    afterEach(() => vi.restoreAllMocks());

    const response = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), { status });
    const envelope = (text: string) => ({
      status: 'completed',
      output: [{ content: [{ type: 'output_text', text }] }],
    });
    const failure = async (fetcher: typeof fetch) => {
      try {
        await generate(fetcher);
        throw new Error('expected provider failure');
      } catch (error) {
        expect(error).toBeInstanceOf(ApplicationError);
        expect(error).toMatchObject({ code: 'AI_PROVIDER_UNAVAILABLE' });
        expect(JSON.stringify(error)).not.toContain('sensitive-provider-detail');
        return error as ApplicationError;
      }
    };

    it('keeps missing usage UNKNOWN (null) and the existing default model', async () => {
      const fetcher = vi.fn().mockResolvedValue(response(envelope('{}')));
      expect(await generate(fetcher)).toMatchObject({
        model: 'gpt-5.2',
        inputTokens: null,
        outputTokens: null,
      });
      const init = fetcher.mock.calls[0]?.[1] as RequestInit;
      expect(JSON.parse(init.body as string)).toMatchObject({ model: 'gpt-5.2', store: false });
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it.each([400, 401, 403, 408, 429, 500, 503])(
      'preserves HTTP %i for existing Job classification without Adapter retry',
      async (status) => {
        const fetcher = vi
          .fn()
          .mockResolvedValue(
            response(
              { error: { code: 'rate_limit', message: 'sensitive-provider-detail' } },
              status,
            ),
          );
        expect((await failure(fetcher)).cause).toEqual({
          httpStatus: status,
          providerErrorCode: 'rate_limit',
        });
        expect(fetcher).toHaveBeenCalledTimes(1);
      },
    );

    it.each(['', '<html>sensitive-provider-detail</html>', '{bad json'])(
      'retains HTTP status even with non-JSON error body %s',
      async (body) => {
        const fetcher = vi.fn().mockResolvedValue(new Response(body, { status: 503 }));
        expect((await failure(fetcher)).cause).toEqual({ httpStatus: 503 });
        expect(fetcher).toHaveBeenCalledTimes(1);
      },
    );

    it('retains quota code without raw provider content', async () => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(
          response(
            { error: { code: 'insufficient_quota', message: 'sensitive-provider-detail' } },
            429,
          ),
        );
      expect((await failure(fetcher)).cause).toEqual({
        httpStatus: 429,
        providerErrorCode: 'insufficient_quota',
      });
    });

    it.each(['key sensitive-provider-detail', 'x'.repeat(101)])(
      'drops unbounded or unsafe provider error code',
      async (code) => {
        const fetcher = vi.fn().mockResolvedValue(response({ error: { code } }, 400));
        expect((await failure(fetcher)).cause).toEqual({ httpStatus: 400 });
      },
    );

    it.each([
      ['', 'EMPTY_RESPONSE'],
      ['{bad', 'INVALID_JSON'],
      ['null', 'INVALID_JSON'],
      ['[]', 'INVALID_JSON'],
      [JSON.stringify({ ...envelope('{}'), status: 'incomplete' }), 'MALFORMED_RESPONSE'],
      [JSON.stringify({ ...envelope('{}'), status: 'failed' }), 'MALFORMED_RESPONSE'],
      [JSON.stringify({ output: null }), 'MALFORMED_RESPONSE'],
      [JSON.stringify({ output: [{ content: null }] }), 'MALFORMED_RESPONSE'],
      [JSON.stringify(envelope('sensitive-provider-detail')), 'MALFORMED_OUTPUT'],
      [JSON.stringify(envelope('null')), 'MALFORMED_OUTPUT'],
      [JSON.stringify(envelope('[]')), 'MALFORMED_OUTPUT'],
    ])('rejects unsuccessful or malformed response (%s)', async (body, reason) => {
      const fetcher = vi.fn().mockResolvedValue(new Response(body));
      expect((await failure(fetcher)).cause).toEqual({ reason });
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it.each(['AbortError', 'TimeoutError', 'TypeError'])(
      'sanitizes fetch failure %s',
      async (name) => {
        const error = new Error('sensitive-provider-detail');
        error.name = name;
        const fetcher = vi.fn().mockRejectedValue(error);
        expect((await failure(fetcher)).cause).toEqual({
          reason: name === 'TypeError' ? 'NETWORK_ERROR' : 'TIMEOUT',
        });
        expect(fetcher).toHaveBeenCalledTimes(1);
      },
    );

    it('sanitizes response read failures', async () => {
      const value = response(envelope('{}'));
      vi.spyOn(value, 'text').mockRejectedValue(new Error('sensitive-provider-detail'));
      expect((await failure(vi.fn().mockResolvedValue(value))).cause).toEqual({
        reason: 'RESPONSE_READ_ERROR',
        httpStatus: 200,
      });
    });

    it.each(['HEADERS', 'BODY'] as const)(
      'uses one 55 second signal through stalled %s',
      async (phase) => {
        const controller = new AbortController();
        const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
        const stalled = () =>
          new Promise<never>((_resolve, reject) => {
            controller.signal.addEventListener(
              'abort',
              () => reject(controller.signal.reason as Error),
              {
                once: true,
              },
            );
          });
        let bodyStarted!: () => void;
        const bodyReady = new Promise<void>((resolve) => {
          bodyStarted = resolve;
        });
        const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
          expect(init?.signal).toBe(controller.signal);
          if (phase === 'HEADERS') return stalled();
          const value = response(envelope('{}'));
          vi.spyOn(value, 'text').mockImplementation(() => {
            const pending = stalled();
            bodyStarted();
            return pending;
          });
          return value;
        });
        const result = failure(fetcher);
        if (phase === 'BODY') await bodyReady;
        controller.abort(new DOMException('sensitive-provider-detail', 'TimeoutError'));
        expect((await result).cause).toEqual({ reason: 'TIMEOUT' });
        expect(timeout).toHaveBeenCalledWith(55_000);
        expect(fetcher).toHaveBeenCalledTimes(1);
      },
    );
  });
}
