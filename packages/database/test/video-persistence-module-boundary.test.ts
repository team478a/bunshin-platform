import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('video persistence module boundaries', () => {
  it('separates media quota, scene generation, and rendering repositories', () => {
    const barrel = source('../src/video-generation-render.ts');
    expect(barrel).toContain("from './video-media-quota-repository'");
    expect(barrel).toContain("from './video-scene-generation-repository'");
    expect(barrel).toContain("from './video-render-repository'");
    expect(barrel).not.toContain('export class');
  });

  it('keeps the video project repository as a compatibility facade', () => {
    const facade = source('../src/video-project-delivery.ts');
    expect(facade).toContain('PrismaVideoProjectCreationRepository');
    expect(facade).toContain('PrismaVideoProjectPlanningRepository');
    expect(facade).toContain('PrismaVideoProjectReviewRepository');
    expect(facade).not.toContain('$transaction');
    expect(facade).toContain("export { PrismaVideoDeliveryRepository } from './video-deliveries'");
  });
});
