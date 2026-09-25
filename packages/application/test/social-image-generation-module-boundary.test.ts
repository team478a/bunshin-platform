import { describe, expect, it } from 'vitest';

import * as core from '../src/social-image-generation-core';
import * as mediaReview from '../src/social-image-media-review';
import * as mediaStorage from '../src/social-image-media-storage';
import * as request from '../src/social-image-generation-request';

describe('social image generation module boundaries', () => {
  it('preserves compatibility exports from the original module', () => {
    expect(core.CreateSocialImageGenerationRequest).toBe(
      request.CreateSocialImageGenerationRequest,
    );
    expect(core.DecideSocialImageMedia).toBe(mediaReview.DecideSocialImageMedia);
    expect(core.StoreSocialImageMediaFiles).toBe(mediaStorage.StoreSocialImageMediaFiles);
  });

  it('keeps request, review, and storage operations separate', () => {
    expect(request.CreateSocialImageGenerationRequest).toBeTypeOf('function');
    expect('DecideSocialImageMedia' in request).toBe(false);
    expect(mediaReview.DecideSocialImageMedia).toBeTypeOf('function');
    expect('StoreSocialImageMediaFiles' in mediaReview).toBe(false);
    expect(mediaStorage.StoreSocialImageMediaFiles).toBeTypeOf('function');
    expect('TransitionSocialImageGenerationRequest' in mediaStorage).toBe(false);
  });
});
