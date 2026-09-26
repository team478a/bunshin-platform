import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readSource = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../src/${name}.ts`, import.meta.url)), 'utf8');

describe('badge processing module boundaries', () => {
  it('keeps common badge responsibilities behind the compatibility repository', () => {
    const entrypoint = readSource('badge-common-processor');
    expect(entrypoint).toContain('PrismaCommonBadgeCatalogRepository');
    expect(entrypoint).toContain('PrismaCommonBadgeAwardProcessor');
    expect(entrypoint).toContain('PrismaCommonBadgeLegacyMigrator');
    expect(entrypoint).not.toContain('$queryRaw');
    expect(readSource('badge-common-activity')).not.toContain('badgeAward.create');
  });

  it('separates group badge definitions from award decisions', () => {
    const entrypoint = readSource('badge-group-workflow');
    expect(entrypoint).toContain('PrismaBadgeGroupDefinitionWorkflow');
    expect(entrypoint).toContain('PrismaBadgeGroupAwardWorkflow');
    expect(entrypoint).not.toContain('badgeAward.upsert');
    expect(readSource('badge-group-definition-workflow')).not.toContain('badgeAward.upsert');
    expect(readSource('badge-group-award-workflow')).not.toContain('badgeVersion.create');
  });
});
