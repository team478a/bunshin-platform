import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const generationSource = readFileSync(
  new URL('../src/services/mission-content-variant-generation.ts', import.meta.url),
  'utf8',
);
const contextSource = readFileSync(
  new URL('../src/services/mission-content-variant-context.ts', import.meta.url),
  'utf8',
);

describe('mission content variant context boundary', () => {
  it('keeps the generation service focused on orchestration', () => {
    expect(generationSource).toContain('loadMissionContentVariantContext({');
    expect(generationSource).not.toContain('new GetBunshin(');
    expect(generationSource).not.toContain('new ListBunshinMemories(');
    expect(generationSource).not.toContain('new GroupKnowledgeService(');
  });

  it('restores only the Bunshin-scoped inputs referenced by the original snapshot', () => {
    expect(contextSource).toContain('new GetBunshin(');
    expect(contextSource).toContain('new ListBunshinMemories(');
    expect(contextSource).toContain('snapshotMemoryById.has(id)');
    expect(contextSource).toContain('snapshotKnowledgeIds.has(id)');
    expect(contextSource).toContain('snapshotGroupKnowledgeIds.has(id)');
    expect(contextSource).toContain('original selected memory is unavailable');
    expect(contextSource).toContain('original group knowledge is unavailable');
  });
});
