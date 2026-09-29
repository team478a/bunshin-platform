import { notFound, redirect } from 'next/navigation';
import { ApplicationError } from '@bunshin/shared';
import { currentUserProvider } from '../../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../../src/services/public-service';
import {
  loadTrainingRetentionAdminPreview,
  loadTrainingUnresolvedEndDates,
} from '../../../../../../src/services/ai-training-retention-admin';
import { PublicShell } from '../../../../../ui/public-shell';
import { TrainingRetentionSummary } from './retention-summary';
import { TrainingEndDateCard } from '../training-end-date-card';

export const dynamic = 'force-dynamic';

export default async function TrainingRetentionPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(
      `/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/training/retention`)}`,
    );
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(
    (error: unknown) => {
      if (error instanceof ApplicationError && ['NOT_FOUND', 'FORBIDDEN'].includes(error.code))
        notFound();
      if (error instanceof Error && error.message === 'SERVICE_NOT_FOUND') notFound();
      throw error;
    },
  );
  if (!service) notFound();
  const checkedAt = new Date();
  const result = await loadTrainingRetentionAdminPreview({
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    actorUserId: actor.userId,
    now: checkedAt,
  });
  if (result.outcome === 'FORBIDDEN') notFound();
  const unresolved = await loadTrainingUnresolvedEndDates({
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    actorUserId: actor.userId,
  });
  if (unresolved.outcome === 'FORBIDDEN') notFound();
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page training-admin">
        <TrainingRetentionSummary serviceSlug={serviceSlug} checkedAt={checkedAt} result={result} />
        <section className="settings-card">
          <h2>終了日時が未確定の受講を個別確認</h2>
          <p>
            集計とは別の明示操作です。過去・アーカイブ済みの研修も対象です。証跡を確認できない受講は保留のままにしてください。
          </p>
          {unresolved.outcome === 'UNAVAILABLE' ? (
            <p>未確定の一覧を取得できませんでした。0件とは判定していません。</p>
          ) : unresolved.outcome === 'TOO_LARGE' ? (
            <p>
              対象が100受講または1000プログラムの上限を超えています。部分一覧からの確定操作は表示しません。
            </p>
          ) : unresolved.rows.length === 0 ? (
            <p>
              個別確定できる未確定の受講はありません。所有境界・終了日の保留がすべて解消されたことを意味しません。
            </p>
          ) : (
            unresolved.rows.map((row) => (
              <article key={`${row.enrollmentId}:${row.updatedAt}`}>
                <h3>
                  {row.participantLabel} — {row.programLabel}
                </h3>
                <p>受講ID：{row.enrollmentId}</p>
                <TrainingEndDateCard
                  serviceSlug={serviceSlug}
                  row={{ ...row, displayStatus: row.status, endsAt: null, endedAt: null }}
                />
              </article>
            ))
          )}
        </section>
      </main>
    </PublicShell>
  );
}
