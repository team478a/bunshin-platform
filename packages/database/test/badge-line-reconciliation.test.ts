import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../src/badge-line-notification.ts', import.meta.url)),
  'utf8',
);

describe('badge LINE reconciliation persistence', () => {
  it('keeps inspection environment-scoped and applies delivery eligibility gates', () => {
    expect(source).toContain('PrismaBadgeLineReconciliationRepository');
    expect(source).toContain('environment: input.environment');
    expect(source).toContain("routing.mode !== 'DISABLED'");
    expect(source).toContain("connection.friendshipStatus === 'FOLLOWING'");
    expect(source).toContain("jobType: 'BADGE_LINE_DELIVER'");
    expect(source).toContain("status: { in: ['PENDING', 'LEASED', 'RETRY_SCHEDULED'] }");
  });
});
