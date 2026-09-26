import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');

describe('video operations planning repository module boundary', () => {
  it('preserves the public entry point while delegating each repository', () => {
    const entry = source('video-operations-planning.ts');

    expect(entry).toContain("from './video-render-operations'");
    expect(entry).toContain("from './video-render-completion'");
    expect(entry).toContain("from './video-planning-context'");
    expect(entry).not.toContain('export class');
  });

  it('keeps operations, completion, and planning context in focused modules', () => {
    const operations = source('video-render-operations.ts');
    const completion = source('video-render-completion.ts');
    const planning = source('video-planning-context.ts');

    expect(operations).toContain('class PrismaVideoRenderOperationsRepository');
    expect(operations).not.toContain('class PrismaVideoRenderCompletionRepository');
    expect(completion).toContain('class PrismaVideoRenderCompletionRepository');
    expect(completion).not.toContain('class PrismaVideoPlanningContextRepository');
    expect(planning).toContain('class PrismaVideoPlanningContextRepository');
    expect(planning).not.toContain('class PrismaVideoRenderOperationsRepository');
  });
});
