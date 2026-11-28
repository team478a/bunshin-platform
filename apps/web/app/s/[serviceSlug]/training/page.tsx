import design from '../../../../src/components/manaberu-learner.module.css';
import type { Route } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../src/auth/current-user';
import {
  readAiTrainingParticipation,
  recordAiTrainingUsageConsent,
} from '../../../../src/services/ai-training-consent';
import { aiTrainingConsentPolicy } from '../../../../src/services/ai-training-consent-policy';
import { learnerTrainingProgramName } from '../../../../src/services/training-program-display-name';
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
  const compactStatus = participation.isDynamicLearning;
  const showStatus = !compactStatus || participation.enrollments.length === 0;
  const ProgramHeading = showStatus ? 'h3' : 'h2';
  const policies = [...new Set(participation.enrollments.map(({ offerPolicy }) => offerPolicy))];
  const mixedPolicies = policies.length > 1;
  const pagePolicy = mixedPolicies
    ? aiTrainingConsentPolicy('AI_SKILL_V1')
    : aiTrainingConsentPolicy(policies[0] ?? 'AI_SKILL_V1');
  const currentCopy = (
    participation.isDynamicLearning ? pagePolicy.copy.dynamicStates : pagePolicy.copy.states
  )[participation.state];

  return (
    <PublicShell showPlatformBrand={false}>
      <main className={`app-page ${design.frame}`}>
        <header className="app-page__heading">
          <p className="eyebrow">{participation.serviceName}</p>
          <h1 id="ai-training-page-title">
            {mixedPolicies ? 'AIを使った支援への参加' : pagePolicy.copy.pageTitle}
          </h1>
        </header>
        <section
          className={showStatus ? 'settings-card' : 'form-stack'}
          aria-labelledby={showStatus ? 'ai-training-confirmation-title' : 'ai-training-page-title'}
        >
          {showStatus && (
            <>
              <h2 id="ai-training-confirmation-title">{currentCopy.title}</h2>
              <p>{currentCopy.message}</p>
            </>
          )}
          {participation.enrollments.map((enrollment) => {
            const policyCopy = aiTrainingConsentPolicy(enrollment.offerPolicy).copy;
            const enrollmentCopy = (
              enrollment.isDynamicLearning ? policyCopy.dynamicStates : policyCopy.states
            )[enrollment.state];
            const programName = learnerTrainingProgramName(serviceSlug, enrollment.programName);
            const shortConsent =
              enrollment.isDynamicLearning && enrollment.offerPolicy === 'AI_SKILL_V1';
            const consentDetails = enrollment.consentText && (
              <ul>
                {enrollment.consentText.split('\n').map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            );

            return (
              <article className="settings-card" key={enrollment.enrollmentId}>
                <ProgramHeading>{programName}</ProgramHeading>
                {programName !== enrollment.programName && (
                  <p>やりたいことに合わせて、AIの使い方を練習します。</p>
                )}
                {enrollment.state === 'CONSENT_REQUIRED' && enrollment.consentText ? (
                  <>
                    {shortConsent ? (
                      <>
                        <p>
                          課題の提案や評価のため、回答や学習内容を外部AIに送ります。個人情報や社外秘は入力しないでください。
                        </p>
                        <details>
                          <summary>AI利用の詳しい説明</summary>
                          {consentDetails}
                        </details>
                      </>
                    ) : (
                      <>
                        <p>AI利用について</p>
                        {consentDetails}
                      </>
                    )}
                    <form action={acceptAiTrainingConsent} className="form-stack">
                      <input type="hidden" name="serviceSlug" value={serviceSlug} />
                      <input type="hidden" name="enrollmentId" value={enrollment.enrollmentId} />
                      <label>
                        <input type="checkbox" name="accepted" value="yes" required />
                        {policyCopy.checkboxLabel}
                      </label>
                      <PendingSubmitButton
                        className="button button--primary"
                        pendingLabel="同意を保存しています…"
                      >
                        {policyCopy.submitLabel}
                      </PendingSubmitButton>
                    </form>
                  </>
                ) : (
                  <>
                    {(!compactStatus || enrollment.state !== 'READY') && (
                      <p>{enrollmentCopy.message}</p>
                    )}
                    {enrollment.state === 'READY' && (
                      <Link
                        className="button button--primary"
                        href={`/s/${serviceSlug}/programs/${enrollment.enrollmentId}` as Route}
                      >
                        {policyCopy.continueLabel}
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
