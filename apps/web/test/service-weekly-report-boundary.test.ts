import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('service weekly report boundaries', () => {
  it('keeps participant and manager reports behind their scoped resolvers', async () => {
    const participant = await readFile(
      new URL('../app/s/[serviceSlug]/weekly-report/page.tsx', import.meta.url),
      'utf8',
    );
    const manager = await readFile(
      new URL('../app/s/[serviceSlug]/manage/weekly-report/page.tsx', import.meta.url),
      'utf8',
    );
    expect(participant).toContain('memberServiceMetadata');
    expect(participant).not.toContain('resolvePublicServiceContext');
    expect(participant).toContain('userId: actor.userId');
    expect(participant).toContain('期限が近いポイントがあります');
    expect(participant).toContain('ポイントの期限と履歴を見る');
    expect(participant).toContain('今週のお客様の反応');
    expect(participant).toContain('来週は、これを意識しましょう');
    expect(participant).toContain('最近記録した数字');
    expect(manager).toContain('resolveManagedServiceContext');
    expect(manager).toContain('投稿本文や本人の素材内容は表示しません');
    expect(manager).toContain('90日計画');
    expect(manager).toContain('最後の投稿');
    expect(manager).toContain('今週のお客様の反応');
  });

  it('prefills a LINE message without participant counts or memory content', async () => {
    const linePage = await readFile(
      new URL('../app/s/[serviceSlug]/manage/line/page.tsx', import.meta.url),
      'utf8',
    );
    expect(linePage).toContain('今週のふり返りができました');
    expect(linePage).toContain('/weekly-report');
    expect(linePage).not.toContain('report.materials');
  });
});
