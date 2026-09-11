import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('../app/(app)/admin/points/page.tsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../app/(app)/admin/page.tsx', import.meta.url), 'utf8');

describe('point balance reconciliation admin page', () => {
  it('requires an authenticated super administrator', () => {
    expect(page).toContain("redirect('/login')");
    expect(page).toContain("role: 'SUPER_ADMIN'");
    expect(page).toContain('if (!admin) notFound()');
  });

  it('requires a reason and the inspected revision before repairing a balance', () => {
    expect(page).toContain('InspectPointBalances');
    expect(page).toContain('RepairPointBalance');
    expect(page).toContain('表示残高');
    expect(page).toContain('履歴の合計');
    expect(page).toContain('reason: z.string().trim().min(10).max(1000)');
    expect(page).toContain('name="expectedRevision"');
    expect(page).toContain('pointBalanceRepairAudit.findMany');
    expect(admin).toContain('href="/admin/points"');
  });
});
