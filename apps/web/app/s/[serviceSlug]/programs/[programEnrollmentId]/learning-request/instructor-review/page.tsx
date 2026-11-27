import { randomUUID } from 'node:crypto';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { ApplicationError } from '@bunshin/shared';
import { currentUserProvider } from '../../../../../../../src/auth/current-user';
import { serviceAuthLoginPath } from '../../../../../../../src/auth/line-return';
import design from '../../../../../../../src/components/manaberu-learner.module.css';
import {
  instructorReviewApplication,
  instructorReviewOfferFocusLabel,
  instructorReviewStatusLabel,
} from '../../../../../../../src/services/instructor-review-contract';
import {
  beginInstructorReview,
  cancelInstructorReview,
  getInstructorReviewLearner,
  getIndividualInstructorReviewOffer,
  resumeInstructorReview,
} from '../../../../../../../src/services/instructor-review-runtime';
import { MANABERU_SERVICE_SLUG } from '../../../../../../../src/services/service-auth-brand';
import { InstructorReviewForm } from './instructor-review-form';

export const dynamic = 'force-dynamic';

const locationSchema = z
  .object({
    topicId: z.uuid().optional(),
    reviewId: z.uuid().optional(),
    individualOfferId: z.uuid().optional(),
    result: z
      .enum(['payment-return', 'payment-cancel', 'request-error', 'cancel-error'])
      .optional(),
  })
  .strict();

type ReviewLocation = z.output<typeof locationSchema>;

function reviewPath(
  learningPath: `/s/${string}/programs/${string}/learning-request`,
  location: ReviewLocation,
) {
  const query = new URLSearchParams();
  if (location.topicId) query.set('topicId', location.topicId);
  if (location.reviewId) query.set('reviewId', location.reviewId);
  if (location.individualOfferId) query.set('individualOfferId', location.individualOfferId);
  if (location.result) query.set('result', location.result);
  const path = `${learningPath}/instructor-review` as const;
  return query.size ? (`${path}?${query.toString()}` as const) : path;
}

const deadline = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  dateStyle: 'medium',
  timeStyle: 'short',
});

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' });

export default async function InstructorReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string; programEnrollmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { serviceSlug, programEnrollmentId: enrollmentId } = await params;
  const parsed = locationSchema.safeParse(await searchParams);
  if (
    serviceSlug !== MANABERU_SERVICE_SLUG ||
    !z.uuid().safeParse(enrollmentId).success ||
    !parsed.success
  )
    notFound();
  const { topicId, reviewId, result, individualOfferId } = parsed.data;
  const learningPath = `/s/${serviceSlug}/programs/${enrollmentId}/learning-request` as const;
  const returnTo = reviewPath(learningPath, parsed.data);
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect(serviceAuthLoginPath(returnTo));

  const { current, offer, unavailable, review } = await getInstructorReviewLearner({
    serviceSlug,
    enrollmentId,
    userId: actor.userId,
    topicId: topicId ?? null,
    reviewId: reviewId ?? null,
  }).catch((error: unknown) => {
    if (error instanceof ApplicationError && ['NOT_FOUND', 'FORBIDDEN'].includes(error.code))
      notFound();
    throw error;
  });

  const reviewIdentity = review?.id;
  const currentTopic = current?.topicId ?? topicId ?? undefined;
  const individualOffer =
    individualOfferId && current && !review
      ? await getIndividualInstructorReviewOffer({
          serviceSlug,
          enrollmentId,
          userId: actor.userId,
          assignmentId: current.assignmentId,
          topicId: currentTopic ?? null,
        })
      : null;
  const selectedOffer =
    individualOffer?.kind === 'offer' && individualOffer.id === individualOfferId
      ? individualOffer
      : null;
  const staleOffer = individualOfferId && !selectedOffer;
  const samePractice = current && (!review || current.assignmentId === review.assignmentId);
  const practiceHref = `${learningPath}${currentTopic ? `?topicId=${currentTopic}` : ''}#practice-evidence`;
  const homeHref = `/s/${serviceSlug}/home`;

  async function begin(formData: FormData) {
    'use server';
    const learner = await (await currentUserProvider()).getCurrentUser();
    if (!learner) redirect(serviceAuthLoginPath(returnTo));
    const input = instructorReviewApplication.safeParse({
      assignmentId: formData.get('assignmentId'),
      productRevision: formData.get('productRevision'),
      idempotencyKey: formData.get('idempotencyKey'),
      topicId: formData.get('topicId') || null,
      focus: formData.get('focus'),
      excerpt: formData.get('excerpt'),
    });
    if (!input.success)
      redirect(
        reviewPath(learningPath, {
          topicId: currentTopic,
          individualOfferId,
          result: 'request-error',
        }),
      );
    let checkout: Awaited<ReturnType<typeof beginInstructorReview>>;
    try {
      checkout = await beginInstructorReview({
        serviceSlug,
        enrollmentId,
        userId: learner.userId,
        submission: input.data,
        ...(individualOfferId ? { individualOfferId } : {}),
      });
    } catch (error) {
      if (!(error instanceof ApplicationError)) throw error;
      if (error.code === 'NOT_FOUND' || error.code === 'FORBIDDEN') notFound();
      redirect(
        reviewPath(learningPath, {
          topicId: currentTopic,
          individualOfferId,
          result: 'request-error',
        }),
      );
    }
    redirect(checkout.url);
  }

  async function cancel() {
    'use server';
    const learner = await (await currentUserProvider()).getCurrentUser();
    if (!learner) redirect(serviceAuthLoginPath(returnTo));
    if (!reviewIdentity) notFound();
    try {
      await cancelInstructorReview({
        serviceSlug,
        enrollmentId,
        userId: learner.userId,
        reviewId: reviewIdentity,
      });
    } catch (error) {
      if (!(error instanceof ApplicationError)) throw error;
      if (error.code === 'NOT_FOUND' || error.code === 'FORBIDDEN') notFound();
      redirect(reviewPath(learningPath, { reviewId: reviewIdentity, result: 'cancel-error' }));
    }
    redirect(reviewPath(learningPath, { reviewId: reviewIdentity }));
  }

  async function resume() {
    'use server';
    const learner = await (await currentUserProvider()).getCurrentUser();
    if (!learner) redirect(serviceAuthLoginPath(returnTo));
    if (!reviewIdentity) notFound();
    let checkout: Awaited<ReturnType<typeof resumeInstructorReview>>;
    try {
      checkout = await resumeInstructorReview({
        serviceSlug,
        enrollmentId,
        userId: learner.userId,
        reviewId: reviewIdentity,
      });
    } catch (error) {
      if (!(error instanceof ApplicationError)) throw error;
      if (error.code === 'NOT_FOUND' || error.code === 'FORBIDDEN') notFound();
      redirect(reviewPath(learningPath, { reviewId: reviewIdentity, result: 'request-error' }));
    }
    redirect(checkout.url);
  }

  return (
    <main className={`${design.frame} ${design.flow}`}>
      <section className={design.panel}>
        <h1>講師に相談する（有料）</h1>
        <p>今取り組んでいる課題1件について、担当講師が文章をレビューします。</p>
        {(review?.title ?? current?.title) && <h2>{review?.title ?? current?.title}</h2>}
        {result === 'request-error' && (
          <p role="status">
            申込を開始できませんでした。受付の状況と表示されている条件をご確認ください。
          </p>
        )}
        {result === 'cancel-error' && (
          <p role="status">取消できませんでした。反映済みの対応状況をご確認ください。</p>
        )}
        {result === 'payment-return' && review?.status === 'PENDING_PAYMENT' && (
          <p role="status">決済結果の反映を待っています。確認でき次第、受付状況を更新します。</p>
        )}
        {result === 'payment-cancel' && review?.status === 'PENDING_PAYMENT' && (
          <p role="status">決済を中断しました。決済を続けるか、申込を取り消せます。</p>
        )}
        {review ? (
          <>
            <p role="status">{instructorReviewStatusLabel[review.status]}</p>
            <dl>
              <dt>税込総額</dt>
              <dd>{yen.format(review.priceYen)}</dd>
              <dt>レビュー内容</dt>
              <dd>{review.description}</dd>
              <dt>回答予定</dt>
              <dd>
                {review.dueAt
                  ? deadline.format(new Date(review.dueAt))
                  : `決済完了から ${review.responseHours} 時間以内`}
              </dd>
              <dt>キャンセル条件</dt>
              <dd>{review.cancellationTerms}</dd>
            </dl>
            {review.status === 'PENDING_PAYMENT' && (
              <>
                {result === 'payment-return' ? (
                  <a
                    className="button button--primary"
                    href={reviewPath(learningPath, { reviewId: review.id, result })}
                  >
                    受付状況を確認する
                  </a>
                ) : review.checkoutUrl ? (
                  <a className="button button--primary" href={review.checkoutUrl}>
                    決済を続ける
                  </a>
                ) : (
                  <form action={resume}>
                    <button className="button button--primary" type="submit">
                      決済を続ける
                    </button>
                  </form>
                )}
                <form action={cancel}>
                  <button className="button button--secondary" type="submit">
                    決済前の申込を取り消す
                  </button>
                </form>
              </>
            )}
            <h3>講師へ共有した内容</h3>
            <p>依頼した課題の版 {review.planRevision}</p>
            <p style={{ whiteSpace: 'pre-wrap' }}>{review.focus}</p>
            <p style={{ whiteSpace: 'pre-wrap' }}>{review.excerpt}</p>
            {review.answer && (
              <article aria-labelledby="instructor-answer">
                <h3 id="instructor-answer">講師からの回答</h3>
                <p style={{ whiteSpace: 'pre-wrap' }}>{review.answer}</p>
                {samePractice && (
                  <a className="button button--primary" href={practiceHref}>
                    同じ課題で修正して再提出する
                  </a>
                )}
              </article>
            )}
          </>
        ) : current && offer && !unavailable && !staleOffer ? (
          <InstructorReviewForm
            action={begin}
            offer={offer}
            assignmentId={current.assignmentId}
            productRevision={offer.revision}
            idempotencyKey={randomUUID()}
            topicId={current.topicId ?? topicId ?? null}
            initialExcerpt={current.draft}
            initialFocus={
              selectedOffer ? instructorReviewOfferFocusLabel[selectedOffer.focus] : undefined
            }
          />
        ) : (
          <p role="status">
            {unavailable ??
              (staleOffer
                ? 'この提案からは申し込めません。'
                : '現在、講師レビューを申し込めません。')}
          </p>
        )}
        <p>
          <a href={samePractice ? practiceHref : homeHref}>
            {samePractice ? '依頼画面を閉じて課題に戻る' : '学習ホームに戻る'}
          </a>
        </p>
      </section>
    </main>
  );
}
