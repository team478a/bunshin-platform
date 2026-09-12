import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('../app/(app)/admin/rewards/page.tsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../app/(app)/admin/page.tsx', import.meta.url), 'utf8');

describe('rewards processing monitor page', () => {
  it('requires an active platform administrator', () => {
    expect(page).toContain("redirect('/login')");
    expect(page).toContain("status: 'ACTIVE'");
    expect(page).toContain('if (!admin) notFound()');
  });

  it('shows point and badge processing failures without source content', () => {
    expect(page).toContain('ポイント・バッジの自動反映');
    expect(page).toContain('pointProcessingEvent.count');
    expect(page).toContain('badgeProcessingEvent.count');
    expect(page).toContain("status: 'PROCESSING' as const");
    expect(page).toContain('10 * 60 * 1000');
    expect(page).toContain('失敗した処理は定期処理で自動再試行されます。');
    expect(page).not.toContain('sourceEventId}</td>');
    expect(page).not.toContain('failureCode}</td>');
  });

  it('shows stopped services and links from the admin home', () => {
    expect(page).toContain('ポイント付与を停止中のサービス');
    expect(page).toContain('pointIssuanceStopped: true');
    expect(admin).toContain('href="/admin/rewards"');
  });
});
