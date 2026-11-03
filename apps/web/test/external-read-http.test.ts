import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalReadError } from '@bunshin/application';
import type * as Observability from '@bunshin/observability';
const m = vi.hoisted(() => ({ services: vi.fn(), read: vi.fn(), bind: vi.fn(), log: vi.fn() }));
vi.mock('../src/services/external-read', () => ({ createExternalReadServices: m.services }));
vi.mock('@bunshin/observability', async (original) => ({
  ...(await original<typeof Observability>()),
  createLogger: () => ({ info: m.log }),
}));
import {
  GET,
  dynamic,
  runtime,
  maxDuration,
} from '../app/api/external/connections/[connectionId]/usage/route';
import { POST } from '../app/api/external/connections/[connectionId]/bind/route';
import { externalReadResponse } from '../src/http/external-read';
const id = '11111111-1111-4111-8111-111111111111';
const context = () => ({ params: Promise.resolve({ connectionId: id }) });
const request = (
  method = 'GET',
  headers: Record<string, string> = { authorization: 'Bearer synthetic' },
  suffix = '',
) =>
  new Request(`https://bunshin.example.invalid/api/external/connections/${id}/usage${suffix}`, {
    method,
    headers,
  });
beforeEach(() => {
  vi.resetAllMocks();
  m.services.mockResolvedValue({ usage: { execute: m.read }, binding: { execute: m.bind } });
  m.read.mockResolvedValue({
    version: 'external-member-usage-v1',
    postEvidence: 'SELF_REPORTED_NOT_VERIFIED',
    last7Days: { generated: 1 },
    last30Days: { generated: 2 },
  });
  m.bind.mockResolvedValue({
    connectionId: id,
    scope: { userId: 'private-owner' },
    credentialBindingHash: 'do-not-return',
  });
});
describe('Bearer-only minimal external read HTTP', () => {
  it('serves only the existing usage DTO without cookies, session provisioning or caller scope', async () => {
    const response = await GET(
      request('GET', {
        authorization: 'Bearer synthetic',
        cookie: 'irrelevant=ordinary-session',
        'x-request-id': 'synthetic-request',
      }),
      context(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: await m.read.mock.results[0]!.value,
      requestId: 'synthetic-request',
    });
    expect(m.read).toHaveBeenCalledWith('Bearer synthetic', {
      connectionId: id,
      requestId: 'synthetic-request',
    });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Authorization');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(m.bind).not.toHaveBeenCalled();
    expect({ runtime, dynamic, maxDuration }).toEqual({
      runtime: 'nodejs',
      dynamic: 'force-dynamic',
      maxDuration: 60,
    });
  });
  it('binds using the verified credential and returns only an acknowledgment', async () => {
    const response = await POST(request('POST'), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { saved: true } });
    expect(m.bind).toHaveBeenCalledWith('Bearer synthetic', id);
    expect(m.read).not.toHaveBeenCalled();
  });
  it.each([{}, { cookie: 'session=synthetic' }, { authorization: 'Basic synthetic' }])(
    'does not fall back to ordinary login: %j',
    async (headers) => {
      const response = await GET(request('GET', headers), context());
      expect(response.status).toBe(401);
      expect(m.read).not.toHaveBeenCalled();
      expect(response.headers.get('cache-control')).toContain('no-store');
    },
  );
  it('keeps endpoints unavailable when the catalog is empty', async () => {
    m.services.mockResolvedValue(null);
    const response = await GET(request(), context());
    expect(response.status).toBe(404);
    expect(m.read).not.toHaveBeenCalled();
    expect(m.bind).not.toHaveBeenCalled();
  });
  it.each([
    '?userId=other',
    '?clientId=other',
    '?operation=publish',
    '?limit=100000',
    '?serviceId=other',
  ])('rejects caller-selected scope or filters: %s', async (suffix) => {
    expect((await GET(request('GET', undefined, suffix), context())).status).toBe(400);
    expect(m.services).not.toHaveBeenCalled();
  });
  it('rejects malformed paths and POST bodies instead of accepting claimed principals', async () => {
    expect(
      (await GET(request(), { params: Promise.resolve({ connectionId: '../other' }) })).status,
    ).toBe(400);
    const withBody = new Request('https://bunshin.example.invalid/', {
      method: 'POST',
      headers: { authorization: 'Bearer synthetic', 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'other' }),
    });
    expect((await POST(withBody, context())).status).toBe(400);
    expect(m.services).not.toHaveBeenCalled();
  });
  it.each([
    ['DENIED', 403],
    ['INVALID', 400],
    ['TIMEOUT', 504],
    ['UNAVAILABLE', 503],
    ['LIMITED', 429],
  ] as const)(
    'returns fixed %s failures without credentials or raw exceptions',
    async (code, status) => {
      m.read.mockRejectedValue(new ExternalReadError(code));
      const response = await GET(request(), context());
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ error: { code } });
      expect(JSON.stringify(m.log.mock.calls)).not.toContain('Bearer synthetic');
    },
  );
  it('does not reveal unclassified errors or turn failures into empty successful data', async () => {
    m.read.mockRejectedValue(new Error('private token database error'));
    const response = await GET(request(), context());
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('private token');
    expect(JSON.stringify(m.log.mock.calls)).not.toContain('private token');
  });
  it('does not block successful usage when operational logging is unavailable', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      m.log.mockImplementation(() => {
        throw new Error('synthetic log unavailable');
      });
      expect((await GET(request(), context())).status).toBe(200);
      expect(warning).toHaveBeenCalledWith('external read operational log unavailable');
    } finally {
      warning.mockRestore();
    }
  });
  it('does not record payloads, scope, credential/session IDs or connection IDs', async () => {
    await GET(request(), context());
    const logged = m.log.mock.calls[0]![1] as Record<string, unknown>;
    expect(Object.keys(logged).sort()).toEqual(['latency', 'operation', 'requestId', 'status']);
    expect(JSON.stringify(logged)).not.toContain(id);
  });
  it('does not add an application-level daily quota or single-request lock', async () => {
    const responses = await Promise.all(
      Array.from({ length: 12 }, () => GET(request(), context())),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);
  });
  it('limits HTTP operations without entering the services', async () => {
    const response = await externalReadResponse(request('DELETE'), id, 'usage');
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(m.services).not.toHaveBeenCalled();
  });
});
