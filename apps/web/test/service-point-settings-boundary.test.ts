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

describe('service point settings boundaries', () => {
  it('requires service management context and scopes every mutation', () => {
    expect(page).toContain('resolveManagedServiceContext');
    expect(page).toContain('workspaceId: service.workspaceId');
    expect(page).toContain('groupId: service.serviceId');
    expect(page).toContain("action: 'POINT_RULES_UPDATED'");
    expect(page).toContain("action: 'POINT_BONUS_GRANTED'");
    expect(page).toContain("action: 'POINT_BALANCE_CORRECTED'");
    expect(page).toContain("type: 'REVERSAL'");
    expect(page).toContain('availablePoints: { gte: parsed.data.amount }');
    expect(page).toContain('recoveryDue: 0');
    expect(page).toContain('tx.pointConsumptionLink.create');
    expect(page).toContain('parsed.data.userId === actor.userId');
    expect(page).toContain('memberships.filter(({ userId }) => userId !== actor.userId)');
    expect(page).toContain('運営者自身への付与はできません。');
  });

  it('does not apply an operator point form twice when iPhone resends it', () => {
    expect(page).toContain('operationId: z.uuid()');
    expect(page).toContain('name="operationId" value={randomUUID()}');
    expect(page).toContain('`operator-bonus:${parsed.data.operationId}`');
    expect(page).toContain('`operator-correction:${parsed.data.operationId}`');
    expect(page).toContain('accountId_idempotencyKey');
    expect(page).toContain('if (existing) return;');
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
});
