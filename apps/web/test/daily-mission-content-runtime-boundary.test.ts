import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('daily mission content runtime boundary', () => {
  it('owns content and quality provider wiring with terminology application', () => {
    const runtime = read('src/services/daily-mission-content-runtime.ts');

    expect(runtime).toContain('new OpenAIMissionContentGenerator({');
    expect(runtime).toContain('new OpenAIMissionQualityChecker({');
    expect(runtime).toContain(
      'applyServiceContentTerminology(value.output, input.terminologyPolicy)',
    );
    expect(runtime).toContain('generateQualityCheckedMissionContent({');
  });

  it('keeps the generation orchestrator dependent on the content runtime contract', () => {
    const generation = read('src/services/daily-mission-generation.ts');

    expect(generation).toContain('await runDailyMissionContentGeneration({');
    expect(generation).toContain(
      'terminologyPolicy: serviceKnowledge?.contentTerminologyPolicy ?? null',
    );
    expect(generation).not.toContain('new OpenAIMissionContentGenerator');
    expect(generation).not.toContain('new OpenAIMissionQualityChecker');
    expect(generation).not.toContain('applyServiceContentTerminology(');
  });
});
