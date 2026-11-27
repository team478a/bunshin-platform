import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InstructorReviewPage from '../app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/instructor-review/page';

const f = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  read: vi.fn(),
  individualOffer: vi.fn(),
  begin: vi.fn(),
  cancel: vi.fn(),
  resume: vi.fn(),
  redirect: vi.fn<(url: string) => never>((url) => {
    throw new Error('redirect ' + url);
  }),
  notFound: vi.fn<() => never>(() => {
    throw new Error('not found');
  }),
}));
vi.mock('next/navigation', () => ({ redirect: f.redirect, notFound: f.notFound }));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: f.getCurrentUser }),
}));
vi.mock('../src/services/instructor-review-runtime', () => ({
  getInstructorReviewLearner: f.read,
  getIndividualInstructorReviewOffer: f.individualOffer,
  beginInstructorReview: f.begin,
  cancelInstructorReview: f.cancel,
  resumeInstructorReview: f.resume,
}));

const enrollmentId = '11111111-1111-4111-8111-111111111111';
const reviewId = '22222222-2222-4222-8222-222222222222';
const topicId = '33333333-3333-4333-8333-333333333333';
const assignmentId = '44444444-4444-4444-8444-444444444444';
const review = {
  id: reviewId,
  assignmentId,
  title: '営業週報をまとめる',
  status: 'ANSWERED',
  focus: '要点が伝わるか',
  excerpt: '今週の商談について',
  answer: '商談の結果を先に書きましょう。',
  dueAt: new Date('2026-11-26T12:00:00Z'),
  checkoutUrl: null,
  priceYen: 3000,
  description: '課題1件の文章レビュー',
  responseHours: 48,
  cancellationTerms: '決済前は取消できます。',
  planRevision: 1,
  topicId,
};

const readPage = (
  query: Record<string, string | string[] | undefined>,
  serviceSlug = 'manaberu-style',
) =>
  InstructorReviewPage({
    params: Promise.resolve({ serviceSlug, programEnrollmentId: enrollmentId }),
    searchParams: Promise.resolve(query),
  });

describe('learner instructor review route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.getCurrentUser.mockResolvedValue({ userId: 'learner' });
    f.read.mockResolvedValue({ current: null, review, offer: null, unavailable: null });
  });

  it('preserves the review and topic through branded login without loading any personal data', async () => {
    f.getCurrentUser.mockResolvedValue(null);
    const path = `/s/manaberu-style/programs/${enrollmentId}/learning-request/instructor-review?topicId=${topicId}&reviewId=${reviewId}`;
    await expect(readPage({ topicId, reviewId })).rejects.toThrow('redirect');
    expect(f.redirect).toHaveBeenCalledExactlyOnceWith(
      `/s/manaberu-style/login?returnTo=${encodeURIComponent(path)}`,
    );
    expect(f.read).not.toHaveBeenCalled();
  });

  it('shows an owned answer after the active practice has ended', async () => {
    const html = renderToStaticMarkup(await readPage({ reviewId }));
    expect(f.read).toHaveBeenCalledExactlyOnceWith({
      serviceSlug: 'manaberu-style',
      enrollmentId,
      userId: 'learner',
      topicId: null,
      reviewId,
    });
    expect(html).toContain(review.answer);
    expect(html).toContain('講師からの回答');
    expect(html).not.toContain('同じ課題で修正して再提出する');
    expect(html).not.toContain('申し込んで決済へ進む');
  });

  it('returns an in-term learner to the same topic for revision', async () => {
    f.read.mockResolvedValue({
      current: { assignmentId, title: review.title, topicId, draft: review.excerpt },
      review,
      offer: null,
      unavailable: null,
    });
    const html = renderToStaticMarkup(await readPage({ reviewId }));
    expect(html).toContain(
      `/s/manaberu-style/programs/${enrollmentId}/learning-request?topicId=${topicId}#practice-evidence`,
    );
    expect(html).toContain('同じ課題で修正して再提出する');
  });

  it('lets a pending reviewer resume Checkout after an interrupted session without PII in the URL', async () => {
    f.read.mockResolvedValue({
      current: { assignmentId, title: review.title, topicId, draft: review.excerpt },
      review: { ...review, status: 'PENDING_PAYMENT', answer: null, dueAt: null },
      offer: null,
      unavailable: null,
    });
    const html = renderToStaticMarkup(await readPage({ reviewId, result: 'payment-cancel' }));
    expect(html).toContain('決済を続ける');
    expect(html).toContain('決済前の申込を取り消す');
    expect(html).not.toContain('講師からの回答');
    expect(f.begin).not.toHaveBeenCalled();
    expect(f.resume).not.toHaveBeenCalled();
    expect(f.cancel).not.toHaveBeenCalled();
  });

  it('rejects duplicate and cross-service entry before querying for a review', async () => {
    await expect(readPage({ reviewId: [reviewId, reviewId] })).rejects.toThrow('not found');
    await expect(readPage({ reviewId }, 'outside-service')).rejects.toThrow('not found');
    expect(f.read).not.toHaveBeenCalled();
  });

  it('opens the existing application with the offered focus and rejects a stale offer', async () => {
    const individualOfferId = '55555555-5555-4555-8555-555555555555';
    f.read.mockResolvedValue({
      current: { assignmentId, title: review.title, topicId, draft: review.excerpt },
      review: null,
      offer: { ...review, revision: reviewId },
      unavailable: null,
    });
    f.individualOffer.mockResolvedValueOnce({
      kind: 'offer',
      id: individualOfferId,
      focus: 'CLARITY',
    });
    const html = renderToStaticMarkup(await readPage({ individualOfferId, topicId }));
    expect(html).toContain('読み手に伝わる表現に整える');
    expect(html).toContain('申込内容を確認');
    f.individualOffer.mockResolvedValueOnce(null);
    const stale = renderToStaticMarkup(await readPage({ individualOfferId, topicId }));
    expect(stale).toContain('この提案からは申し込めません');
    expect(stale).not.toContain('申込内容を確認');
  });
});
