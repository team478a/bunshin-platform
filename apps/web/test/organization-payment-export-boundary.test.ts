import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../src/http/organization-payment-export.ts', import.meta.url),
  'utf8',
);
const page = ['page.tsx', 'organization-payment-operations.tsx']
  .map((file) =>
    readFileSync(
      new URL(`../app/(app)/organizations/[workspaceId]/payment/${file}`, import.meta.url),
      'utf8',
    ),
  )
  .join('\n');

describe('organization payment export boundary', () => {
  it('requires an organization manager and scopes all exported data', () => {
    expect(source).toContain("role: { in: ['OWNER', 'ADMIN'] }");
    expect(source).toContain("type: 'ORGANIZATION'");
    expect(source).toContain('where: { workspaceId }');
    expect(source).toContain('where: { workspaceId, id: { in: groupIds } }');
    expect(source).toContain('take: 10_000');
  });

  it('exposes a direct mobile-download link from payment operations', () => {
    expect(page).toContain('/payments/export');
    expect(page).toContain('決済台帳をCSVで保存する');
  });
});
