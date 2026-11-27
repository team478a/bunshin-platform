import { ApplicationError } from '@bunshin/shared';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { serviceAuthLoginPath } from '../../../../src/auth/line-return';
import { InstructorReviewReply } from '../../../../src/components/instructor-review-reply';
import { instructorReviewReply } from '../../../../src/services/instructor-review-contract';
import {
  answerInstructorReview,
  getAssignedInstructorReviews,
} from '../../../../src/services/instructor-review-runtime';
import { MANABERU_SERVICE_SLUG } from '../../../../src/services/service-auth-brand';
import { PublicShell } from '../../../ui/public-shell';

export const dynamic = 'force-dynamic';

function instructorPath(slug: string) {
  return `/s/${slug}/instructor-reviews`;
}

async function requireActor(serviceSlug: string) {
  if (serviceSlug !== MANABERU_SERVICE_SLUG) notFound();
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect(serviceAuthLoginPath(instructorPath(serviceSlug)));
  return actor;
}

async function submitReply(serviceSlug: string, form: FormData) {
  'use server';
  const actor = await requireActor(serviceSlug);
  const reply = instructorReviewReply.safeParse({
    reviewId: form.get('reviewId'),
    answer: form.get('answer'),
  });
  const path = instructorPath(serviceSlug);
  if (!reply.success) redirect(`${path}?result=invalid`);
  try {
    await answerInstructorReview(serviceSlug, actor.userId, reply.data.reviewId, reply.data.answer);
  } catch (error) {
    if (error instanceof ApplicationError) {
      if (error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND') notFound();
      if (error.code === 'CONFLICT') redirect(`${path}?result=conflict`);
    }
    throw error;
  }
  redirect(`${path}?result=answered`);
}

const notices = {
  answered: '回答を保存しました。受講者は研修画面から確認できます。',
  invalid: '回答の内容を確認してください。',
  conflict: '依頼の状態が更新されています。最新の状況を確認してください。',
} as const;

export default async function AssignedInstructorReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const [{ serviceSlug }, { result }] = await Promise.all([params, searchParams]);
  const actor = await requireActor(serviceSlug);
  const rows = await getAssignedInstructorReviews(serviceSlug, actor.userId).catch(
    (error: unknown) => {
      if (error instanceof ApplicationError && ['FORBIDDEN', 'NOT_FOUND'].includes(error.code)) {
        notFound();
      }
      throw error;
    },
  );
  const notice =
    result && Object.hasOwn(notices, result) ? notices[result as keyof typeof notices] : null;
  return (
    <PublicShell showPlatformBrand={false}>
      <div className="app-page">
        <header className="app-page__heading">
          <h1>担当する講師レビュー</h1>
          <Link href={{ pathname: `/s/${serviceSlug}/home` }}>サービスホームに戻る</Link>
        </header>
        {notice && <p role="status">{notice}</p>}
        {rows.length === 0 && <p>現在、担当する依頼はありません。</p>}
        {rows.map((review) => (
          <InstructorReviewReply
            key={review.id}
            id={review.id}
            title={review.title}
            focus={review.focus}
            excerpt={review.excerpt}
            sharedVersion={review.planRevision}
            reply={review.answer}
            action={submitReply.bind(null, serviceSlug)}
          />
        ))}
      </div>
    </PublicShell>
  );
}
