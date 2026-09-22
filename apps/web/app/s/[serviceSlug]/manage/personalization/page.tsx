import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { personalizationAuditSummary } from '../../../../../src/services/personalization-audit-view-model';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { PublicShell } from '../../../../ui/public-shell';

export const dynamic = 'force-dynamic';

const dateLabel = (value: Date) =>
  new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    timeZone: 'Asia/Tokyo',
  }).format(value);

const countLabels = {
  memories: '本人情報',
  groupKnowledge: '公式情報',
  pastMissions: '過去投稿',
  activities: '操作履歴',
  variants: '別案選択',
  feedback: '評価',
  decisions: '採否',
  performance: '投稿結果',
} as const;

export default async function PersonalizationAuditPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const { serviceSlug } = await params;
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();
  const db = await import('@bunshin/database');
  const [missions, failures] = await Promise.all([
    db.prisma.dailyMission.findMany({
      where: {
        workspaceId: service.workspaceId,
        bunshin: { is: { groupId: service.serviceId } },
      },
      select: {
        id: true,
        missionDate: true,
        topic: true,
        qualityScore: true,
        bunshin: { select: { ownerUser: { select: { displayName: true } } } },
        generationContext: { select: { payload: true } },
        feedback: { select: { rating: true } },
        decision: { select: { decision: true, rejectionReason: true } },
      },
      orderBy: [{ missionDate: 'desc' }, { createdAt: 'desc' }],
      take: 40,
    }),
    db.prisma.dailyMissionGeneration.findMany({
      where: {
        workspaceId: service.workspaceId,
        status: 'FAILED',
        bunshinId: {
          in: await db.prisma.bunshin
            .findMany({
              where: { workspaceId: service.workspaceId, groupId: service.serviceId },
              select: { id: true },
            })
            .then((items) => items.map(({ id }) => id)),
        },
      },
      select: { id: true, missionDate: true, errorCategory: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),
  ]);

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>個別化の確認</h1>
          <p>
            投稿本文や本人の回答内容を表示せず、投稿案を作る際に使った情報の種類と生成経路を確認できます。
          </p>
        </header>

        {failures.length > 0 ? (
          <section className="settings-card">
            <h2>生成できなかった記録</h2>
            <p>通常成功と区別して記録された直近の失敗です。</p>
            <ul className="settings-status-list">
              {failures.map((failure) => (
                <li className="settings-status-item" key={failure.id}>
                  <strong>{dateLabel(failure.missionDate)}</strong>
                  <span>{failure.errorCategory ?? '原因を確認中'}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="settings-card">
          <h2>最近の投稿案と生成根拠</h2>
          {missions.length === 0 ? (
            <p>確認できる投稿案はまだありません。</p>
          ) : (
            <div className="settings-status-list">
              {missions.map((mission) => {
                const audit = personalizationAuditSummary(mission.generationContext?.payload);
                return (
                  <article className="settings-status-item" key={mission.id}>
                    <div>
                      <small>
                        {dateLabel(mission.missionDate)}・{mission.bunshin.ownerUser.displayName}
                      </small>
                      <h3>{mission.topic}</h3>
                      <p>
                        {audit.mode === 'AI'
                          ? 'AI生成'
                          : audit.mode === 'FALLBACK'
                            ? '予備生成'
                            : '生成経路の記録なし'}
                        ／品質 {audit.qualityVerdict}
                        {mission.qualityScore === null ? '' : `／評価 ${mission.qualityScore}`}
                      </p>
                      <p>
                        <strong>この投稿になった根拠：</strong>{' '}
                        {audit.sourceLabels.length > 0 ? audit.sourceLabels.join('、') : '記録なし'}
                      </p>
                      <p>
                        {Object.entries(audit.referenceCounts)
                          .filter(([, count]) => count > 0)
                          .map(
                            ([key, count]) =>
                              `${countLabels[key as keyof typeof countLabels]} ${count}件`,
                          )
                          .join('／') || '参照履歴なし'}
                      </p>
                      {audit.issueCodes.length > 0 ? (
                        <p>品質確認：{audit.issueCodes.join('、')}</p>
                      ) : null}
                      {mission.feedback || mission.decision ? (
                        <p>
                          利用者の反応：{mission.feedback?.rating ?? '評価なし'}／
                          {mission.decision?.decision ?? '選択なし'}
                          {mission.decision?.rejectionReason
                            ? `（${mission.decision.rejectionReason}）`
                            : ''}
                        </p>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        <Link href={`/s/${service.configuration.slug}/manage` as Route}>← 運営メニューへ戻る</Link>
      </main>
    </PublicShell>
  );
}
