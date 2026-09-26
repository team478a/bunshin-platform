import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readHttpModule = (name: string) => readFileSync(`src/http/${name}.ts`, 'utf8');

describe('video project HTTP module boundaries', () => {
  it('keeps the legacy route import module as a compatibility barrel', () => {
    const source = readHttpModule('video-projects');

    expect(source).toContain("from './video-project-create'");
    expect(source).toContain("from './video-project-plan'");
    expect(source).toContain("from './video-project-review'");
    expect(source).toContain("from './video-project-render'");
    expect(source).toContain("from './video-project-ai-scenes'");
    expect(source).not.toContain("from '@bunshin/database'");
  });

  it('keeps external generation concerns out of project creation and review', () => {
    const create = readHttpModule('video-project-create');
    const review = readHttpModule('video-project-review');

    expect(create).not.toContain('QueueVideoRender');
    expect(create).not.toContain('QueueVideoSceneGenerations');
    expect(review).not.toContain('resolveVideoAiRuntimeConfiguration');
    expect(review).not.toContain('resolveCreatomateRuntimeConfiguration');
  });

  it('keeps AI-scene provider cost authorization within its dedicated boundary', () => {
    const aiScenes = readHttpModule('video-project-ai-scenes');
    const render = readHttpModule('video-project-render');

    expect(aiScenes).toContain('AuthorizeVideoAiGenerationCost');
    expect(aiScenes).toContain('assertOrganizationGenerationQuota');
    expect(render).not.toContain('AuthorizeVideoAiGenerationCost');
  });
});
