import { ApplicationError } from '@bunshin/shared';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../../src/auth/current-user';
import { serviceAuthLoginPath } from '../../../../../../src/auth/line-return';
import {
  InstructorReviewProductSettings,
  InstructorReviewQueue,
} from '../../../../../../src/components/instructor-review-operations';
import { instructorReviewProduct } from '../../../../../../src/services/instructor-review-contract';
import {
  assignInstructorReview,
  configureInstructorReview,
  getInstructorReviewOperations,
  refundInstructorReview,
} from '../../../../../../src/services/instructor-review-runtime';
import { MANABERU_SERVICE_SLUG } from '../../../../../../src/services/service-auth-brand';
import { PublicShell } from '../../../../../ui/public-shell';

export const dynamic = 'force-dynamic';

const assignmentInput = z.object({
  reviewId: z.uuid(),
  instructorUserId: z.uuid(),
});
const reviewIdInput = z.uuid();

const notices = {
  configured: '講師レビューの受付設定を保存しました。',
  assigned: '担当講師を保存しました。',
  refundRequested: '返金を依頼しました。決済サービスで処理が確定すると状況に反映されます。',
  invalid: '入力内容を確認してください。',
  conflict: '現在の状態では操作できません。最新の依頼状況を確認してください。',
  unavailable: '処理を完了できませんでした。依頼状況を確認してから、もう一度お試しください。',
} as const;

type Result = keyof typeof notices;

function adminPath(slug: string) {
  return `/s/${slug}/manage/training/instructor-reviews` as const;
}

async function requireActor(serviceSlug: string) {
  if (serviceSlug !== MANABERU_SERVICE_SLUG) notFound();
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect(serviceAuthLoginPath(adminPath(serviceSlug)));
  return actor;
}

function readSettings(form: FormData) {
  return instructorReviewProduct.safeParse({
    enabled: form.get('enabled') === 'on',
    programIds: form.getAll('programIds'),
    priceYen: Number(form.get('priceYen')),
    description: form.get('description'),
    responseHours: Number(form.get('responseHours')),
    cancellationTerms: form.get('cancellationTerms'),
    instructorUserIds: form.getAll('instructorUserIds'),
    capacity: Number(form.get('capacity')),
  });
}

function actionError(error: unknown): Result {
  if (!(error instanceof ApplicationError)) throw error;
  if (error.code === 'NOT_FOUND' || error.code === 'FORBIDDEN') notFound();
  if (error.code === 'VALIDATION_ERROR') return 'invalid';
  if (error.code === 'CONFLICT') return 'conflict';
  if (error.code === 'CONFIGURATION_ERROR') return 'unavailable';
  throw error;
}

function returnToAdmin(serviceSlug: string, result: Result): never {
  redirect(`${adminPath(serviceSlug)}?result=${result}`);
}

async function saveSettings(serviceSlug: string, form: FormData) {
  'use server';
  const actor = await requireActor(serviceSlug);
  const settings = readSettings(form);
  if (!settings.success) returnToAdmin(serviceSlug, 'invalid');
  let result: Result = 'configured';
  try {
    await configureInstructorReview(serviceSlug, actor.userId, settings.data);
  } catch (error) {
    result = actionError(error);
  }
  returnToAdmin(serviceSlug, result);
}

async function saveAssignee(serviceSlug: string, form: FormData) {
  'use server';
  const actor = await requireActor(serviceSlug);
  const assignment = assignmentInput.safeParse({
    reviewId: form.get('reviewId'),
    instructorUserId: form.get('instructorUserId'),
  });
  if (!assignment.success) returnToAdmin(serviceSlug, 'invalid');
  let result: Result = 'assigned';
  try {
    await assignInstructorReview(
      serviceSlug,
      actor.userId,
      assignment.data.reviewId,
      assignment.data.instructorUserId,
    );
  } catch (error) {
    result = actionError(error);
  }
  returnToAdmin(serviceSlug, result);
}

async function requestRefund(serviceSlug: string, form: FormData) {
  'use server';
  const actor = await requireActor(serviceSlug);
  const reviewId = reviewIdInput.safeParse(form.get('reviewId'));
  if (!reviewId.success) returnToAdmin(serviceSlug, 'invalid');
  let result: Result = 'refundRequested';
  try {
    await refundInstructorReview(serviceSlug, actor.userId, reviewId.data);
  } catch (error) {
    result = actionError(error);
  }
  returnToAdmin(serviceSlug, result);
}

export default async function InstructorReviewOperationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const [{ serviceSlug }, { result }] = await Promise.all([params, searchParams]);
  const actor = await requireActor(serviceSlug);
  const data = await getInstructorReviewOperations(serviceSlug, actor.userId).catch(
    (error: unknown) => {
      if (error instanceof ApplicationError && ['FORBIDDEN', 'NOT_FOUND'].includes(error.code)) {
        notFound();
      }
      throw error;
    },
  );
  const notice = result && Object.hasOwn(notices, result) ? notices[result as Result] : null;
  return (
    <PublicShell showPlatformBrand={false}>
      <div className="app-page training-admin">
        <header className="app-page__heading">
          <h1>講師レビュー管理</h1>
          <p>
            <Link href={{ pathname: `/s/${serviceSlug}/manage/training` }}>
              研修ダッシュボードに戻る
            </Link>
          </p>
          <p>
            <Link href={{ pathname: `/s/${serviceSlug}/instructor-reviews` }}>
              講師用の回答画面
            </Link>
          </p>
        </header>
        {notice && <p role="status">{notice}</p>}
        <InstructorReviewQueue
          rows={data.rows}
          instructors={data.instructors}
          assignableInstructorIds={data.product?.instructorUserIds ?? []}
          assign={saveAssignee.bind(null, serviceSlug)}
          refund={requestRefund.bind(null, serviceSlug)}
        />
        <InstructorReviewProductSettings
          action={saveSettings.bind(null, serviceSlug)}
          product={data.product}
          programs={data.programs}
          instructors={data.instructors}
        />
      </div>
    </PublicShell>
  );
}
