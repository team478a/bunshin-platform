import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('../app/(app)/admin/alerts/page.tsx', import.meta.url), 'utf8');

describe('admin alerts page', () => {
  it('labels commercial billing alerts as invoice review actions', () => {
    expect(page).toContain("alert.href.startsWith('/admin/commercial-billing')");
    expect(page).toContain('請求を確認する');
  });
});
