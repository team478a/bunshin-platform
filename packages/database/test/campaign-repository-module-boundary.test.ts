import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(join(process.cwd(), 'src', file), 'utf8');

describe('campaign repository module boundary', () => {
  it.each([
    ['advertising-safety.ts', 'PrismaAdvertisingSafetyRepository'],
    ['campaign.ts', 'PrismaCampaignRepository'],
    ['campaign-safety.ts', 'PrismaCampaignSafetyRepository'],
  ])('keeps %s focused on %s', (file, repository) => {
    const content = source(file);
    expect(content).toContain(`export class ${repository}`);
    expect(content.match(/export class Prisma\w+Repository/g)).toEqual([
      `export class ${repository}`,
    ]);
  });

  it('exports all three repositories from the database package', () => {
    const index = source('index.ts');
    expect(index).toContain(
      "export { PrismaAdvertisingSafetyRepository } from './advertising-safety';",
    );
    expect(index).toContain("export { PrismaCampaignRepository } from './campaign';");
    expect(index).toContain("export { PrismaCampaignSafetyRepository } from './campaign-safety';");
  });
});
