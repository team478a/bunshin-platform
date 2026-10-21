import type { Route } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../src/auth/current-user';
import {
  readAiTrainingParticipation,
  recordAiTrainingUsageConsent,
} from '../../../../src/services/ai-training-consent';
import { PublicShell } from '../../../ui/public-shell';
import { PendingSubmitButton } from '../../../ui/pending-submit-button';

export const dynamic = 'force-dynamic';

const actionSchema = z.object({
  serviceSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  enrollmentId: z.string().uuid(),
  accepted: z.literal('yes'),
});

export async function acceptAiTrainingConsent(formData: FormData) {
  'use server';
  const input = actionSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/groups');
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${input.data.serviceSlug}/training`)}`);
  await recordAiTrainingUsageConsent({
    serviceSlug: input.data.serviceSlug,
    userId: actor.userId,
    enrollmentId: input.data.enrollmentId,
  });
  redirect(`/s/${input.data.serviceSlug}/programs/${input.data.enrollmentId}` as Route);
}

const stateCopy = {
  PROGRAM_WAITING: {
    title: '研修プログラムの準備中です',
    message: '運営が研修プログラムを準備しています。準備ができると、この画面から確認できます。',
  },
  ENROLLMENT_WAITING: {
    title: '研修参加の準備待ちです',
    message:
      'サービスへの参加は完了しています。運営が研修Enrollmentと参加枠を準備すると、ここに表示されます。',
  },
  SEAT_WAITING: {
    title: '研修参加枠の準備待ちです',
    message:
      '運営があなたのEnrollmentに内部テスター枠を付与しています。枠が確認されるまでAI処理は行われません。',
  },
  CONSENT_REQUIRED: {
    title: '研修参加の確認',
    message:
      '参加枠が確認できました。AIを使った研修を始める前に、送信される情報と注意点を確認してください。',
  },
  READY: {
    title: '研修を開始できます',
    message: '参加枠とAI利用同意を確認しました。研修を続けられます。',
  },
} as const;
const dynamicStateCopy = {
  ...stateCopy,
  ENROLLMENT_WAITING: {
    title: '研修参加の準備待ちです',
    message: 'サービスへの参加は完了しています。運営が研修への参加手続きと参加枠を準備しています。',
  },
  SEAT_WAITING: {
    title: '研修参加枠の準備待ちです',
    message:
      '参加枠が準備できるまで、AIを使った学習は始まりません。準備ができると、この画面に表示されます。',
  },
} as const;

export default async function AiTrainingConfirmationPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/training`)}` as Route);
  const participation = await readAiTrainingParticipation(serviceSlug, actor.userId);
  const currentCopy = (participation.isDynamicLearning ? dynamicStateCopy : stateCopy)[
    participation.state
  ];

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">{participation.serviceName}</p>
          <h1>AI研修への参加</h1>
        </header>
        <section className="settings-card" aria-labelledby="ai-training-confirmation-title">
          <h2 id="ai-training-confirmation-title">{currentCopy.title}</h2>
          <p>{currentCopy.message}</p>
          {participation.enrollments.map((enrollment) => {
            const enrollmentCopy = (enrollment.isDynamicLearning ? dynamicStateCopy : stateCopy)[
              enrollment.state
            ];
            return (
              <article className="settings-card" key={enrollment.enrollmentId}>
                <h3>{enrollment.programName}</h3>
                {enrollment.state === 'CONSENT_REQUIRED' && enrollment.consentText ? (
                  <>
                    <p>AI利用について</p>
                    <ul>
                      {enrollment.consentText.split('\n').map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    <form action={acceptAiTrainingConsent} className="form-stack">
                      <input type="hidden" name="serviceSlug" value={serviceSlug} />
                      <input type="hidden" name="enrollmentId" value={enrollment.enrollmentId} />
                      <label>
                        <input type="checkbox" name="accepted" value="yes" required />
                        この研修で、外部のAIサービスを使うことに同意します
                      </label>
                      <PendingSubmitButton
                        className="button button--primary"
                        pendingLabel="同意を保存しています…"
                      >
                        同意して研修へ進む
                      </PendingSubmitButton>
                    </form>
                  </>
                ) : (
                  <>
                    <p>{enrollmentCopy.message}</p>
                    {enrollment.state === 'READY' && (
                      <Link
                        className="button button--primary"
                        href={`/s/${serviceSlug}/programs/${enrollment.enrollmentId}` as Route}
                      >
                        研修を続ける
                      </Link>
                    )}
                    {enrollment.consentedAt && (
                      <p>
                        同意済み（{new Date(enrollment.consentedAt).toLocaleDateString('ja-JP')}）
                      </p>
                    )}
                  </>
                )}
              </article>
            );
          })}
          <Link href={`/s/${serviceSlug}/home` as Route}>サービスホームへ戻る</Link>
        </section>
      </main>
    </PublicShell>
  );
}
