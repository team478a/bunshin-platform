import type { SocialImageQualityReview } from '../providers/openai-social-image-quality-review';

export const socialImagePagesToRetry = (review: SocialImageQualityReview, maximum = 2) => {
  const pages = review.pages.filter((page) => page.verdict === 'REVISE');
  return pages.length <= maximum ? pages : null;
};
