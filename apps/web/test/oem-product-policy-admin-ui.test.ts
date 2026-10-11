import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  new URL('../app/(app)/admin/commercial-billing/products/page.tsx', import.meta.url),
  'utf8',
);

describe('OEM Service Product policy admin UI', () => {
  it('requires SUPER_ADMIN and exposes only explicit versioned operations', () => {
    expect(page).toContain("admin?.role !== 'SUPER_ADMIN'");
    expect(page).toContain('registerProductPolicy');
    expect(page).toContain('reviseProductPolicy');
    expect(page).toContain('retireProduct');
    expect(page).toContain('expectedLatestPolicyId');
    expect(page).toContain('expectedUpdatedAt');
  });

  it('states that revision and retirement do not mutate existing offerings or invoices', () => {
    expect(page).toContain('既存Offering・確定済み請求・参加者を自動変更しません');
    expect(page).toContain('新規割当だけを停止します');
    expect(page).toContain('既存Offeringと請求履歴を変更しないことを確認しました');
  });
});
