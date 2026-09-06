import { describe, expect, it } from 'vitest';
import { missionGenerationResult } from '../app/ui/mission-generation-result';

describe('mission generation feedback', () => {
  it.each(['STRATEGY_REQUIRED', 'GENERATION_IN_PROGRESS', undefined])(
    'does not claim an existing mission for %s',
    async (reason) => {
      const result = await missionGenerationResult(
        Response.json(
          { error: { message: '処理を完了できません。', requestId: 'server-id', reason } },
          { status: 409 },
        ),
        'client-id',
      );
      expect(result.refresh).toBe(false);
      expect(result.message).not.toContain('作成済み');
      expect(result.message).toContain('受付番号: server-id');
    },
  );
  it('refreshes only a confirmed duplicate', async () => {
    const result = await missionGenerationResult(
      Response.json({ error: { reason: 'ALREADY_EXISTS', message: '作成済み' } }, { status: 409 }),
      'client-id',
    );
    expect(result.refresh).toBe(true);
    expect(result.message).toContain('受付番号: client-id');
  });
  it('preserves an ID for a non-JSON platform error', async () => {
    const result = await missionGenerationResult(
      new Response('upstream error', { status: 504 }),
      'client-id',
    );
    expect(result).toEqual({
      refresh: false,
      message: '投稿案を作れませんでした。（受付番号: client-id）',
    });
  });
  it('refreshes a successfully created mission', async () => {
    expect(
      await missionGenerationResult(Response.json({ data: {} }, { status: 201 }), 'client-id'),
    ).toEqual({ message: '今日の投稿案を作りました。', refresh: true });
  });
});
