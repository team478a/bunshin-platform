import { describe, expect, it } from 'vitest';
import { socialImagePagesToRetry } from '../src/jobs/social-image-generation-job-handler';
import type { SocialImageQualityReview } from '../src/providers/openai-social-image-quality-review';

const review = (revisions: number[]): SocialImageQualityReview => ({
  verdict: revisions.length ? 'REVISE' : 'PASS',
  pages: Array.from({ length: 5 }, (_, pageIndex) => ({
    pageIndex,
    verdict: revisions.includes(pageIndex) ? 'REVISE' : 'PASS',
    score: revisions.includes(pageIndex) ? 60 : 90,
    issueCodes: revisions.includes(pageIndex) ? ['POOR_COMPOSITION'] : [],
    repairInstruction: revisions.includes(pageIndex) ? 'Leave more negative space.' : '',
  })),
});

describe('socialImagePagesToRetry', () => {
  it('returns only failed pages when no more than two need repair', () => {
    expect(socialImagePagesToRetry(review([1, 3]))?.map((page) => page.pageIndex)).toEqual([1, 3]);
  });

  it('rejects the set when repairing it would exceed the generation cap', () => {
    expect(socialImagePagesToRetry(review([0, 2, 4]))).toBeNull();
  });
});
