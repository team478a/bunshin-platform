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
    expect(page).toContain('migrateOfferingProductPolicy');
    expect(page).toContain('expectedLatestPolicyId');
    expect(page).toContain('expectedUpdatedAt');
    expect(page).toContain('expectedCurrentPolicyVersionId');
    expect(page).toContain('targetPolicyVersionId');
    expect(page).toContain('listOfferingPolicyHistory');
    expect(page).toContain('NEEDS_MIGRATION');
    expect(page).toContain('Organization・Service・商品');
  });

  it('states that revision and retirement do not mutate existing offerings or invoices', () => {
    expect(page).toContain('既存Offering・確定済み請求・参加者を自動変更しません');
    expect(page).toContain('新規割当だけを停止します');
    expect(page).toContain('既存Offeringと請求履歴を変更しないことを確認しました');
    expect(page).toContain('このOffering 1件だけをv');
    expect(page).toContain('参加者・請求履歴を変更しないことを確認しました');
    expect(page).toContain('終了済み期間も変更せず、監査記録として保持します');
  });
});
