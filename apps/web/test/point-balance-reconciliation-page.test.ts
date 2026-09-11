import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('../app/(app)/admin/points/page.tsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../app/(app)/admin/page.tsx', import.meta.url), 'utf8');

describe('point balance reconciliation admin page', () => {
  it('requires an authenticated platform administrator', () => {
    expect(page).toContain("redirect('/login')");
    expect(page).toContain('findActivePlatformAdminByUserId');
    expect(page).toContain('if (!admin) notFound()');
  });

  it('explains the result without changing balances', () => {
    expect(page).toContain('InspectPointBalances');
    expect(page).toContain('表示残高');
    expect(page).toContain('履歴の合計');
    expect(page).not.toContain('update');
    expect(admin).toContain('href="/admin/points"');
  });
});
