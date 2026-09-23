import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('daily mission result persistence boundary', () => {
  it('owns mission and generation evidence assembly', () => {
    const resultPersistence = read('src/services/daily-mission-result-persistence.ts');

    expect(resultPersistence).toContain('return persistGeneratedDailyMission({');
    expect(resultPersistence).toContain('availableSourceTypes: personalizationSourceTypes(');
    expect(resultPersistence).toContain('recentMissionIds: input.recentMissionIds');
    expect(resultPersistence).toContain(
      'groupKnowledgeIds: input.finalizedContent.groupKnowledgeIds',
    );
    expect(resultPersistence).toContain('qualityIssueCodes,');
    expect(resultPersistence).toContain('repairCount,');
  });

  it('keeps generation orchestration dependent on the result persistence contract', () => {
    const generation = read('src/services/daily-mission-generation.ts');

    expect(generation).toContain('await persistDailyMissionGenerationResult({');
    expect(generation).toContain('planning: planningContext');
    expect(generation).toContain('recentMissionIds: recentMissions.map(({ id }) => id)');
    expect(generation).not.toContain('availableSourceTypes: personalizationSourceTypes(');
    expect(generation).not.toContain('return persistGeneratedDailyMission({');
  });
});
