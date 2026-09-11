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
  });

  it('lets a scoped suspended rule override the global default', () => {
    expect(processor).toContain("status: { in: ['ACTIVE', 'SUSPENDED'] }");
    expect(processor).toContain("if (rule.status === 'SUSPENDED') continue");
  });
});
