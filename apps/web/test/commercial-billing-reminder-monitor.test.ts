import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  new URL('../app/(app)/admin/commercial-billing/page.tsx', import.meta.url),
  'utf8',
);

describe('commercial billing reminder monitor', () => {
  it('shows unresolved reminder failures and links to tenant-scoped recovery', () => {
    expect(page).toContain('data.reminderFailures');
    expect(page).toContain('案内送信の要確認');
    expect(page).toContain('案内送信失敗');
    expect(page).toContain('/admin/organizations/${invoice.workspaceId}/commercial');
    expect(page).toContain("status === 'REMINDER_FAILED'");
  });
});
