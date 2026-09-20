import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  new URL('../app/(app)/admin/commercial-profitability/page.tsx', import.meta.url),
  'utf8',
);
const navigation = readFileSync(new URL('../app/ui/app-shell.tsx', import.meta.url), 'utf8');

describe('OEM profitability page boundary', () => {
  it('limits the cross-tenant view to a platform super administrator', () => {
    expect(page).toContain("admin.role !== 'SUPER_ADMIN'");
    expect(page).toContain('notFound()');
  });

  it('labels currency and incomplete cost coverage without presenting false profit', () => {
    expect(page).toContain('売上は円、AI原価は米ドル表示です');
    expect(page).toContain('利益額ではなく採算確認の資料');
    expect(page).toContain('原価未設定のAI処理');
  });

  it('is reachable from the system administration navigation', () => {
    expect(navigation).toContain("href: '/admin/commercial-profitability'");
  });
});
