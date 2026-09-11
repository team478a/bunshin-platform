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
  });

  it('lets a scoped suspended rule override the global default', () => {
    expect(processor).toContain("status: { in: ['ACTIVE', 'SUSPENDED'] }");
    expect(processor).toContain("if (rule.status === 'SUSPENDED') continue");
  });

  it('shows only service-scoped point activity and badge awards to the operator', () => {
    expect(page).toContain('db.prisma.pointAccount.findMany');
    expect(page).toContain('db.prisma.pointTransaction.groupBy');
    expect(page).toContain('db.prisma.badgeAward.groupBy');
    expect(page).toContain('groupId: service.serviceId');
    expect(page).toContain('参加者のポイント・バッジ状況');
    expect(page).toContain("status: 'ACTIVE'");
  });
});
