import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('daily mission generation environment boundary', () => {
  it('owns scoped timezone and approved group knowledge resolution', () => {
    const environment = read('src/services/daily-mission-generation-environment.ts');

    expect(environment).toContain('PrismaLineNotificationPreferenceRepository().getScoped');
    expect(environment).toContain('new db.PrismaGroupKnowledgeRepository()');
    expect(environment).toContain('listApprovedChunksForGeneration({');
    expect(environment).toContain('groupId: input.campaign.productPack.groupId');
    expect(environment).toContain('productPackVersionId: input.campaign.productPack.versionId');
    expect(environment).toContain("timezone = preference.preference?.timezone ?? 'Asia/Tokyo'");
  });

  it('keeps generation orchestration dependent on the environment contract', () => {
    const generation = read('src/services/daily-mission-generation.ts');

    expect(generation).toContain('await loadDailyMissionGenerationEnvironment({');
    expect(generation).toContain('fallbackGroupKnowledge: serviceKnowledge?.groupKnowledge ?? []');
    expect(generation).not.toContain('new db.PrismaGroupKnowledgeRepository()');
    expect(generation).not.toContain('PrismaLineNotificationPreferenceRepository().getScoped');
  });
});
