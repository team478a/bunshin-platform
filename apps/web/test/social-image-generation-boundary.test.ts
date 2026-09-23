import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const socialImagesSource = readFileSync(
  new URL('../src/http/social-images.ts', import.meta.url),
  'utf8',
);
const generationSource = readFileSync(
  new URL('../src/http/social-image-generation.ts', import.meta.url),
  'utf8',
);
const sharedSource = readFileSync(
  new URL('../src/http/social-image-http-shared.ts', import.meta.url),
  'utf8',
);

describe('social image generation boundary', () => {
  it('keeps the existing HTTP export stable', () => {
    expect(socialImagesSource).toContain("from './social-image-generation'");
    expect(socialImagesSource).toContain('createSocialImageResponse');
  });

  it('isolates charging, quota and generation job responsibilities', () => {
    expect(generationSource).toContain('ConsumeServiceCreditForSocialImage');
    expect(generationSource).toContain('TryConsumeBadgeEntitlement');
    expect(generationSource).toContain('ReservePointReward');
    expect(generationSource).toContain('reserveServiceMediaGeneration');
    expect(generationSource).toContain('SOCIAL_IMAGE_GENERATION_JOB_TYPE');
    expect(socialImagesSource).not.toContain('ReservePointReward');
    expect(socialImagesSource).not.toContain('SOCIAL_IMAGE_GENERATION_JOB_TYPE');
  });

  it('shares bounded request parsing, actor lookup and response projection', () => {
    expect(sharedSource).toContain('size > 4_100_000');
    expect(sharedSource).toContain('currentUserProvider');
    expect(sharedSource).toContain('socialImageRequestDto');
  });
});
