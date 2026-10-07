import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../../src/services/public-service';
import { programPreparationTarget } from '../../../../../../src/services/personal-learning-program-preparation';
import { PublicShell } from '../../../../../ui/public-shell';
import { ProgramPreparationCard } from './card';

export const dynamic = 'force-dynamic';
export default async function ProgramPreparationPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(
      `/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/programs/personal-learning-preparation`)}`,
    );
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();
  const programId = programPreparationTarget(service);
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page stack">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>Personal Learning準備</h1>
          <p>対象Service: {serviceSlug}</p>
          <a href={`/s/${serviceSlug}/manage/programs`}>実践プログラムへ戻る</a>
        </header>
        {programId ? (
          <ProgramPreparationCard serviceSlug={serviceSlug} programId={programId} />
        ) : (
          <section className="card stack">
            <h2>作成操作は利用できません</h2>
            <p>環境担当者による設定・対象確認が必要です。この画面から設定は変更できません。</p>
            <p>
              PERSONAL_LEARNING_PILOT_OPERATIONS と PERSONAL_LEARNING_PRODUCTION_PREPARATION
              の対象一致、および両Pilot実行flagがOFFであることを確認してください。設定が不足・不一致の場合は作成しません。
            </p>
          </section>
        )}
      </main>
    </PublicShell>
  );
}
