import { notFound, redirect } from 'next/navigation';
import { ApplicationError } from '@bunshin/shared';
import { currentUserProvider } from '../../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../../src/services/public-service';
import { personalLearningPreparationAccess } from '../../../../../../src/services/personal-learning-preparation-access';
import { PublicShell } from '../../../../../ui/public-shell';
import { DefinitionReviewCard } from './card';

export const dynamic = 'force-dynamic';
export default async function DefinitionReviewPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(
      `/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/programs/learning-definition-review`)}`,
    );
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(
    (error: unknown) => {
      if (
        (error instanceof Error && error.message === 'SERVICE_NOT_FOUND') ||
        (error instanceof ApplicationError && error.code === 'NOT_FOUND')
      )
        return null;
      throw error;
    },
  );
  if (!service || !['SERVICE_OWNER', 'SERVICE_ADMIN'].includes(service.serviceRole)) notFound();
  let available = false;
  try {
    const authority = personalLearningPreparationAccess('PERSONAL_LEARNING_DEFINITION_ADMIN');
    available =
      !authority ||
      (authority.workspaceId === service.workspaceId && authority.groupId === service.serviceId);
  } catch (error) {
    if (!(error instanceof ApplicationError && error.code === 'NOT_FOUND')) throw error;
  }
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page stack">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>学習設計の承認準備</h1>
          <p>対象Service: {serviceSlug}</p>
          <a href={`/s/${serviceSlug}/manage/programs/personal-learning-preparation`}>
            Personal Learning準備へ戻る
          </a>
        </header>
        {available ? (
          <DefinitionReviewCard serviceSlug={serviceSlug} />
        ) : (
          <section className="card stack">
            <h2>承認操作は利用できません</h2>
            <p>
              環境担当者による設定・対象確認が必要です。この画面から設定を変更したり、Pilotを開始したりすることはできません。
            </p>
            <p>
              PERSONAL_LEARNING_DEFINITION_ADMIN、固定された準備対象、両Pilot実行flagの停止を確認してください。
            </p>
          </section>
        )}
      </main>
    </PublicShell>
  );
}
