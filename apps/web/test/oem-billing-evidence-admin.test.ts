import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboard = readFileSync(
  new URL(
    '../app/(app)/admin/organizations/[workspaceId]/commercial/commercial-admin-dashboard.tsx',
    import.meta.url,
  ),
  'utf8',
);
const contract = readFileSync(
  new URL(
    '../app/(app)/admin/organizations/[workspaceId]/commercial/commercial-contract-section.tsx',
    import.meta.url,
  ),
  'utf8',
);
const organizationUsage = readFileSync(
  new URL('../app/(app)/organizations/[workspaceId]/usage/page.tsx', import.meta.url),
  'utf8',
);

describe('OEM billing evidence admin UI', () => {
  it('shows registration billing inputs and finalized snapshots without guessing missing history', () => {
    expect(dashboard).toContain('有料の正式登録 R');
    expect(dashboard).toContain('無料の実利用 A');
    expect(dashboard).toContain('R・Aの重複');
    expect(dashboard).toContain('最終課金人数 R∪A');
    expect(dashboard).toContain('月ごとの課金人数根拠');
    expect(dashboard).toContain('推測して補完しません');
    expect(contract).toContain('月次の課金対象人数を請求へつなぐ');
    expect(organizationUsage).toContain('有料提供の正式登録者と無料提供の実利用者を合算');
    expect(organizationUsage).toContain('正式登録期間中は課金対象です');
  });

  it('keeps review-required counts and prices unconfirmed', () => {
    expect(dashboard).toContain("current.billingState === 'REVIEW_REQUIRED'");
    expect(dashboard).toContain('課金対象人数は未確定です');
    expect(dashboard).toContain('0人やMAUで代用して請求を確定しないでください');
    expect(dashboard).toContain('要確認の理由を特定できません');
  });
});
