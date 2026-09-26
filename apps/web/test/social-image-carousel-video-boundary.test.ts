import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const socialImagesSource = readFileSync(
  new URL('../src/http/social-images.ts', import.meta.url),
  'utf8',
);
const carouselVideoSource = readFileSync(
  new URL('../src/http/social-image-carousel-video.ts', import.meta.url),
  'utf8',
);

describe('social image carousel video boundary', () => {
  it('keeps the existing HTTP export stable', () => {
    expect(socialImagesSource).toContain("from './social-image-carousel-video'");
    expect(socialImagesSource).toContain('createCarouselVideoResponse');
  });

  it('isolates video planning, rendering and delivery dependencies', () => {
    expect(carouselVideoSource).toContain('CreateVideoProject');
    expect(carouselVideoSource).toContain('ReplaceVideoPlan');
    expect(carouselVideoSource).toContain('QueueVideoRender');
    expect(carouselVideoSource).toContain('VIDEO_RENDER_JOB_TYPE');
    expect(carouselVideoSource).toContain('resolveCreatomateRuntimeConfiguration');
    expect(socialImagesSource).not.toContain('CreateVideoProject');
    expect(socialImagesSource).not.toContain('VIDEO_RENDER_JOB_TYPE');
    expect(socialImagesSource).not.toContain('resolveCreatomateRuntimeConfiguration');
  });
});
