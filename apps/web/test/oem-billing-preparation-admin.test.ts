import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  new URL('../app/(app)/admin/organizations/[workspaceId]/commercial/page.tsx', import.meta.url),
  'utf8',
);
const section = readFileSync(
  new URL(
    '../app/(app)/admin/organizations/[workspaceId]/commercial/oem-billing-preparation-section.tsx',
    import.meta.url,
  ),
  'utf8',
);
const service = readFileSync(
  new URL('../../../packages/database/src/oem-billing-admin.ts', import.meta.url),
  'utf8',
);

describe('OEM billing initial history and cutover admin UI', () => {
  it('shows the evidence-backed preparation steps and read-only shadow comparison', () => {
    expect(section).toContain('初期履歴とcutover準備');
    expect(section).toContain('月次shadowを確認');
    expect(section).toContain('旧MAU');
    expect(section).toContain('最終課金人数 R∪A');
    expect(section).toContain('0人や旧MAUで補完せず');
    expect(page).toContain('.shadow({');
    expect(service).toContain("isolationLevel: 'RepeatableRead'");
  });

  it('requires explicit evidence confirmation for every mutation', () => {
    expect(page).toContain("confirmed: z.literal('on')");
    expect(page).toContain("historyReviewed: z.literal('on')");
    expect(section).toContain('契約資料で対象商品と提供区分を確認しました');
    expect(section).toContain('同意・参加承認と正式登録日時の証跡を確認しました');
    expect(section).toContain('契約書等の証跡で開始・終了日時を確認しました');
    expect(section).toContain('旧確定月を変更せず、指定した将来利用月から切り替えます');
  });

  it('uses session authority and the reauthorizing database service instead of browser actors', () => {
    expect(page).toContain('actorUserId: actor.userId');
    expect(page).not.toContain('name="actorUserId"');
    expect(service).toContain('await this.authorizeSuperAdmin(tx, input.actorUserId)');
    expect(service).toContain("type: 'ORGANIZATION'");
  });

  it('keeps cutover fail-closed until offerings, contracts and registrations are ready', () => {
    expect(section).toContain('readiness.readyToSchedule');
    expect(section).toContain('ここから変更・取消はできません');
    expect(service).toContain('missingOfferingCount === 0');
    expect(service).toContain('missingRegistrationCount === 0');
    expect(service).toContain('currentContractPeriods.length > 0');
    expect(service).toContain('billingPolicy === null');
  });

  it('offers append-only contract correction without changing finalized billing months', () => {
    expect(section).toContain('この契約期間を訂正');
    expect(section).toContain('元履歴を残して訂正版を追加します');
    expect(section).toContain('確定済み請求月に影響する訂正は保存できません');
    expect(section).toContain('過去の訂正前履歴を表示');
    expect(page).toContain('.correctContractPeriod({');
    expect(page).toContain('expectedStartsAt: new Date(input.data.expectedStartsAt)');
    expect(service).toContain("throw new Error('FINALIZED_BILLING_PERIOD_IMMUTABLE')");
    expect(service).toContain("action: 'CORRECTED'");
    expect(service).toContain('supersedesId: current.id');
  });
});
