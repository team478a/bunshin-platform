import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ services: vi.fn() }));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({ APP_URL: 'https://app.example.invalid', APP_ENV: 'test' }),
}));
vi.mock('../src/auth/supabase', () => ({
  authConfiguration: () => ({ url: 'https://auth.example.invalid', key: 'public' }),
}));
vi.mock('../src/services/external-read', () => ({
  createExternalAiMcpServices: m.services,
}));

import {
  externalAiMcpResponse,
  externalAiProtectedResourceMetadata,
} from '../src/http/external-ai-mcp';

const resource = 'https://app.example.invalid/api/mcp';
const request = (headers: Record<string, string> = {}) =>
  new Request(resource, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });

beforeEach(() => vi.resetAllMocks());

describe('external AI MCP HTTP resource boundary', () => {
  it('publishes protected resource metadata without inventing OAuth scopes', () => {
    expect(externalAiProtectedResourceMetadata()).toEqual({
      resource,
      authorization_servers: ['https://auth.example.invalid/auth/v1'],
      bearer_methods_supported: ['header'],
      resource_name: 'ワタシワークス 外部AI読取',
    });
  });

  it('challenges missing credentials before database composition', async () => {
    const response = await externalAiMcpResponse(request());
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('resource_metadata=');
    expect(m.services).not.toHaveBeenCalled();
  });

  it('rejects foreign browser origins and invalid resource audiences', async () => {
    expect((await externalAiMcpResponse(request({ origin: 'https://evil.example' }))).status).toBe(
      400,
    );
    m.services.mockResolvedValue({ verifier: { verify: vi.fn().mockResolvedValue(null) } });
    expect(
      (await externalAiMcpResponse(request({ authorization: 'Bearer signed.token.value' }))).status,
    ).toBe(401);
  });
});
