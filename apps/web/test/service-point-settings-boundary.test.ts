import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  fileURLToPath(new URL('../app/s/[serviceSlug]/manage/points/page.tsx', import.meta.url)),
  'utf8',
);
const processor = readFileSync(
  fileURLToPath(new URL('../../../packages/database/src/index.ts', import.meta.url)),
  'utf8',
);
const schema = readFileSync(
  fileURLToPath(new URL('../../../packages/database/prisma/schema.prisma', import.meta.url)),
  'utf8',
);

describe('service point settings boundaries', () => {
  it('requires service management context and scopes every mutation', () => {
    expect(page).toContain('resolveManagedServiceContext');
    expect(page).toContain('workspaceId: service.workspaceId');
    expect(page).toContain('groupId: service.serviceId');
    expect(page).toContain("action: 'POINT_RULES_UPDATED'");
    expect(page).toContain("action: 'POINT_BONUS_GRANTED'");
    expect(page).toContain("action: 'POINT_RECOVERY_REGISTERED'");
    expect(page).toContain("action: 'POINT_RECOVERY_CANCELLED'");
    expect(processor).toContain("type: recoveryAdded > 0 ? 'RECOVERY' : 'REVERSAL'");
    expect(processor).toContain('recoveryDue: { increment: recoveryAdded }');
    expect(processor).toContain(
      'recoveredPoints = Math.min(account.availablePoints, input.amount)',
    );
    expect(processor).toContain('tx.pointConsumptionLink.create');
    expect(page).toContain('db.registerPointRecovery');
    expect(page).toContain('db.cancelPointRecovery');
    expect(page).toContain('parsed.data.userId === actor.userId');
    expect(page).toContain('memberships.filter(({ userId }) => userId !== actor.userId)');
    expect(page).toContain('運営者自身への付与はできません。');
  });

  it('lets the operator cancel one exact recovery with a reason and idempotency key', () => {
    expect(page).toContain('recoveryCancellationSchema');
    expect(page).toContain('recoveryTransactionId: z.uuid()');
    expect(page).toContain("sourceType: 'OPERATOR_RECOVERY'");
    expect(page).toContain('`operator-recovery-cancellation:${parsed.data.operationId}`');
    expect(page).toContain('回収を取り消す');
    expect(page).toContain('取り消す理由（本人にも表示されます）');
    expect(processor).toContain('OPERATOR_RECOVERY_CANCELLATION');
    expect(processor).toContain('recoveryDue: { decrement: recoveryDueCancelled }');
    expect(processor).toContain('availablePoints: { increment: recoveredPoints }');
  });

  it('does not apply an operator point form twice when iPhone resends it', () => {
    expect(page).toContain('operationId: z.uuid()');
    expect(page).toContain('name="operationId" value={randomUUID()}');
    expect(page).toContain('`operator-bonus:${parsed.data.operationId}`');
    expect(page).toContain('`operator-recovery:${parsed.data.operationId}`');
    expect(page).toContain('accountId_idempotencyKey');
    expect(page).toContain('if (existing) return;');
  });

  it('shows recovery debt and explains that future points settle it before redemption', () => {
    expect(page).toContain('誤付与ポイントを回収');
    expect(page).toContain('回収未済');
    expect(page).toContain('その後にもらうポイントは、回収未済分へ自動で充てられます。');
    expect(page).toContain('recoveryDue: true');
    expect(processor).toContain('applyPointCreditToAccount');
    expect(processor).toContain("type: 'RECOVERY'");
    expect(processor).toContain('recoveryDue: { decrement: recoveryApplied }');
  });

  it('lets a scoped suspended rule override the global default', () => {
    expect(processor).toContain("status: { in: ['ACTIVE', 'SUSPENDED'] }");
    expect(processor).toContain("if (rule.status === 'SUSPENDED') continue");
  });

  it('lets the operator set and monitor an issuance cap for each earning rule', () => {
    expect(page).toContain('budget_MISSION_VIEWED_DAILY: optionalBudgetSchema');
    expect(page).toContain('budget_POSTED_DAILY: optionalBudgetSchema');
    expect(page).toContain('budget_POSTED_WEEKLY_3: optionalBudgetSchema');
    expect(page).toContain("throw new Error('BUDGET_BELOW_GRANTED')");
    expect(page).toContain('{ budget: { create: { maximumPoints, grantedPoints } } }');
    expect(page).toContain("type: 'GRANT'");
    expect(page).toContain('ruleVersion: { ruleKey: rule.key, campaignId: null }');
    expect(page).toContain('この設定で発行できる合計上限');
    expect(page).toContain('空欄なら上限なし');
    expect(page).toContain('saved.budget.grantedPoints');
    expect(page).toContain('SNSへの実際の投稿は自動確認されません。');
  });

  it('lets the operator override, stop or inherit point rules for one campaign', () => {
    expect(page).toContain('saveCampaignRules');
    expect(page).toContain('募集ごとのポイントを設定');
    expect(page).toContain("z.enum(['INHERIT', 'ACTIVE', 'SUSPENDED'])");
    expect(page).toContain("status: { in: ['DRAFT', 'OPEN'] }");
    expect(page).toContain('campaignId: campaign.id');
    expect(page).toContain("action: 'CAMPAIGN_POINT_RULES_UPDATED'");
    expect(page).toContain("if (mode !== 'INHERIT')");
    expect(page).toContain('この募集では付与しない');
    expect(page).toContain('この募集で発行できる合計上限');
    expect(processor).toContain('Number(Boolean(right.campaignId))');
  });

  it('shows only service-scoped point activity and badge awards to the operator', () => {
    expect(page).toContain('db.prisma.pointAccount.findMany');
    expect(page).toContain('db.prisma.pointTransaction.groupBy');
    expect(page).toContain('db.prisma.badgeAward.groupBy');
    expect(page).toContain('groupId: service.serviceId');
    expect(page).toContain('参加者のポイント・バッジ状況');
    expect(page).toContain("status: 'ACTIVE'");
  });

  it('lets the operator stop and resume all point issuance with an audit reason', () => {
    expect(page).toContain("target: z.enum(['stop', 'resume'])");
    expect(page).toContain(
      "action: targetStopped ? 'POINT_ISSUANCE_STOPPED' : 'POINT_ISSUANCE_RESUMED'",
    );
    expect(page).toContain('pointIssuanceStopped: targetStopped');
    expect(page).toContain('ポイント付与を一括停止');
    expect(page).toContain('ポイント付与を再開');
    expect(page).toContain('disabled={pointConfiguration.pointIssuanceStopped}');
    expect(page).toContain("throw new Error('POINT_ISSUANCE_STOPPED')");
  });

  it('lets the operator set service-specific reward prices and availability', () => {
    expect(schema).toContain('model ServicePointRewardSetting');
    expect(schema).toContain('@@unique([workspaceId, groupId, rewardType])');
    expect(page).toContain('saveRewardSettings');
    expect(page).toContain('ポイントの使い道を設定');
    expect(page).toContain('使い道の設定を保存');
    expect(page).toContain('tx.servicePointRewardSetting.upsert');
    expect(page).toContain("action: 'POINT_REWARDS_UPDATED'");
    expect(page).toContain('updatedByUserId: actor.userId');
    expect(processor).toContain('applyPointRewardSettings');
    expect(processor).toContain('servicePointRewardSetting.findUnique');
    expect(processor).toContain('expectedPointCost !== pointCost');
    expect(processor).toContain('groupId: input.groupId ?? null');
  });
});
