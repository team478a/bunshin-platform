import { describe, expect, it } from 'vitest';
import { isPromptOnlyImageService } from '../src/services/service-image-policy';

describe('service image policy', () => {
  it('keeps 千ノ国メディア on the external prompt workflow', () => {
    expect(isPromptOnlyImageService('sennokuni-media')).toBe(true);
  });

  it('does not change image generation for other services', () => {
    expect(isPromptOnlyImageService('watashi-works-official')).toBe(false);
    expect(isPromptOnlyImageService('another-service')).toBe(false);
  });
});
