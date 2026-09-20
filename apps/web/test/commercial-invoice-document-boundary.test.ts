import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const handler = readFileSync(
  new URL('../src/http/commercial-invoice-document.ts', import.meta.url),
  'utf8',
);
const adminPage = readFileSync(
  new URL('../app/(app)/admin/organizations/[workspaceId]/commercial/page.tsx', import.meta.url),
  'utf8',
);
const organizationPage = readFileSync(
  new URL('../app/(app)/organizations/[workspaceId]/usage/page.tsx', import.meta.url),
  'utf8',
);

describe('commercial invoice document boundary', () => {
  it('requires either a platform administrator or the organization owner/admin', () => {
    expect(handler).toContain("role: { in: ['OWNER', 'ADMIN'] }");
    expect(handler).toContain('!platformAdmin && !membership');
    expect(handler).toContain("status: { in: ['ISSUED', 'PAID'] }");
    expect(handler).toContain('workspaceId');
    expect(handler).toContain('invoiceId');
  });

  it('serves a private PDF and records each download as an audit event', () => {
    expect(handler).toContain("'content-type': 'application/pdf'");
    expect(handler).toContain("'cache-control': 'private, no-store'");
    expect(handler).toContain("action: 'DOCUMENT_DOWNLOADED'");
  });

  it('shows download actions to both platform and organization operators', () => {
    expect(adminPage).toContain('請求書PDFをダウンロード');
    expect(organizationPage).toContain('PDFを保存');
  });
});
