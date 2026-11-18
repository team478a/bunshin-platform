import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../app/(app)/admin/images/comparison/page.tsx', import.meta.url),
  'utf8',
);
const mobileFixture = readFileSync(
  new URL('./browser/image-provider-comparison/main.tsx', import.meta.url),
  'utf8',
);

describe('image provider comparison admin page', () => {
  it('requires an active platform administrator and exposes no mutation action', () => {
    expect(source).toContain("status: 'ACTIVE'");
    expect(source).toContain('if (!admin) notFound()');
    expect(source).not.toContain("'use server'");
    expect(source).not.toContain('fetch(');
  });

  it('clearly distinguishes synthetic fixtures from real API evidence', () => {
    expect(source).toContain('実APIの生成結果や実運用の品質証拠ではありません');
    expect(source).toContain('本番自動切替には使用しません');
    expect(source).toContain('実API比較は費用承認後');
  });

  it('links provider operations back to the existing settings screen', () => {
    expect(source).toContain('href="/admin/ai"');
    expect(source).toContain('モデル・料金・上限・停止状態');
  });

  it('keeps wide comparison tables in scroll containers for the 390px fixture', () => {
    expect(source.match(/className="table-scroll"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(mobileFixture).toContain('maxWidth: 390');
    expect(mobileFixture.match(/className="table-scroll"/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
