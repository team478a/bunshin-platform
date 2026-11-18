import { describe, expect, it, vi } from 'vitest';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { createExternalAiMcpHandler } from '../src/mcp/external-ai-mcp';

const resource = new URL('https://app.example.invalid/api/mcp');
const authInfo: AuthInfo = {
  token: 'signed-token',
  clientId: 'client',
  scopes: [],
  expiresAt: 2_000_000_000,
  resource,
};
function request(method: string, params?: unknown) {
  return new Request(resource, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) }),
  });
}
function setup() {
  const memberActivity = { execute: vi.fn().mockResolvedValue({ version: 'usage' }) };
  const dailyPostIdeas = { execute: vi.fn().mockResolvedValue({ version: 'ideas' }) };
  const campaignBrief = { execute: vi.fn().mockResolvedValue({ version: 'campaign' }) };
  return {
    memberActivity,
    dailyPostIdeas,
    campaignBrief,
    handler: createExternalAiMcpHandler({ memberActivity, dailyPostIdeas, campaignBrief }),
  };
}
async function message(response: Response) {
  const text = await response.text();
  const data = text
    .split(/\r?\n/)
    .find((line) => line.startsWith('data: '))
    ?.slice(6);
  return JSON.parse(data ?? text) as Record<string, unknown>;
}

describe('external AI MCP surface', () => {
  it('advertises only the three read-only tools', async () => {
    const s = setup();
    const response = await s.handler.fetch(request('tools/list'), { authInfo });
    expect(response.status).toBe(200);
    const body = (await message(response)) as unknown as {
      result: { tools: Array<Record<string, unknown>> };
    };
    expect(body.result.tools.map((tool) => tool['name'])).toEqual([
      'get_member_activity',
      'get_daily_post_ideas',
      'get_campaign_brief',
    ]);
    expect(body.result.tools.every((tool) => tool['annotations'])).toBe(true);
  });

  it('derives the target from the bearer token and accepts no target arguments', async () => {
    const s = setup();
    const response = await s.handler.fetch(
      request('tools/call', { name: 'get_member_activity', arguments: {} }),
      { authInfo },
    );
    expect(response.status).toBe(200);
    expect(s.memberActivity.execute).toHaveBeenCalledWith(
      'Bearer signed-token',
      expect.stringMatching(/^[a-f0-9]{32}$/),
    );
    const denied = await s.handler.fetch(
      request('tools/call', {
        name: 'get_member_activity',
        arguments: { userId: '11111111-1111-4111-8111-111111111111' },
      }),
      { authInfo },
    );
    expect(denied.status).toBe(200);
    const body = (await message(denied)) as { error?: unknown; result?: { isError?: boolean } };
    expect(body.error ?? body.result?.isError).toBeTruthy();
    expect(s.memberActivity.execute).toHaveBeenCalledTimes(1);
  });
});
