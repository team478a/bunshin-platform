import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repository = readFileSync(join(process.cwd(), 'src/index.ts'), 'utf8');

describe('service content editor authorization', () => {
  it.each([
    'PrismaProductPackRepository',
    'PrismaGroupKnowledgeRepository',
    'PrismaCampaignRepository',
  ])('allows the content duty only inside %s', (className) => {
    const start = repository.indexOf(`export class ${className}`);
    const next = repository.indexOf('\nexport class ', start + 1);
    const section = repository.slice(start, next === -1 ? undefined : next);
    expect(section).toContain(
      "serviceRole: { in: ['SERVICE_OWNER', 'SERVICE_ADMIN', 'CONTENT_EDITOR'] }",
    );
    expect(section).toContain('serviceConfiguration: { isNot: null }');
    expect(section).toContain("status: 'ACTIVE'");
  });

  it.each(['PrismaExternalTrackingRepository', 'PrismaGroupLineConfigurationRepository'])(
    'does not broaden %s to content editors',
    (className) => {
      const start = repository.indexOf(`export class ${className}`);
      if (start === -1) return;
      const next = repository.indexOf('\nexport class ', start + 1);
      const section = repository.slice(start, next === -1 ? undefined : next);
      expect(section).not.toContain("'CONTENT_EDITOR'");
    },
  );
});
