import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { personalizationAuditSummary } from '../../../../../src/services/personalization-audit-view-model';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { supportAlertModeViewModel } from '../../../../../src/services/support-alert-mode-view-model';
import { PublicShell } from '../../../../ui/public-shell';
import { transitionOemSupportCandidateAction } from './oem-support-candidate-actions';
import { retryOemSupportCandidateEmailAction } from './oem-support-email-actions';
import { updateSupportAlertPolicyAction } from './support-alert-policy-action';

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
  const [
    missions,
    failures,
    barrierSummary,
    supportCandidates,
    supportAlertPolicy,
    failedSupportEmails,
  ] = await Promise.all([
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
    db.getSocialActivityBarrierServiceSummary(db.prisma, {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
    }),
    db.listSocialActivityOemSupportCandidates(db.prisma, {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
    }),
    db.prisma.serviceSupportAlertPolicy.findUnique({
      where: { groupId: service.serviceId },
      select: { mode: true },
    }),
    db.prisma.socialActivityOemSupportCandidateEmailDelivery.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        configurationId: service.configuration.id,
        status: 'FAILED',
      },
      select: {
        id: true,
        recipientName: true,
        attemptCount: true,
        lastErrorCategory: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
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
          <h2>続けにくさとサポート状況</h2>
          <p>
            本人が回答して確定した項目だけを集計しています。個人の回答内容や投稿本文は表示しません。
          </p>
          <div className="admin-metric-grid">
            <article>
              <strong>{barrierSummary.cases.confirmed}</strong>
              <span>確認済み</span>
            </article>
            <article>
              <strong>{barrierSummary.support.offered + barrierSummary.support.accepted}</strong>
              <span>サポート中</span>
            </article>
            <article>
              <strong>{barrierSummary.support.completed}</strong>
              <span>できた記録</span>
            </article>
            <article>
              <strong>{barrierSummary.cases.suspected}</strong>
              <span>本人確認待ち</span>
            </article>
          </div>
          {barrierSummary.confirmedCategories.length === 0 ? (
            <p>本人が確認した項目はまだありません。</p>
          ) : (
            <ul className="settings-status-list">
              {barrierSummary.confirmedCategories.map((item) => (
                <li className="settings-status-item" key={item.category}>
                  <strong>{item.label}</strong>
                  <span>{item.count}件</span>
                </li>
              ))}
            </ul>
          )}
          <p>
            見送り {barrierSummary.support.skipped}件／解決済み {barrierSummary.cases.resolved}件
          </p>
        </section>

        {failedSupportEmails.length > 0 ? (
          <section className="settings-card">
            <h2>送信できなかった支援候補メール</h2>
            <p>設定や送信先を確認した後に、失敗したメールだけを再送予約できます。</p>
            <div className="settings-status-list">
              {failedSupportEmails.map((delivery) => (
                <article className="settings-status-item" key={delivery.id}>
                  <div>
                    <strong>{delivery.recipientName || '運営管理者'}</strong>
                    <p>
                      失敗分類：{delivery.lastErrorCategory ?? '原因不明'}／試行：
                      {delivery.attemptCount}回／最終更新：{dateLabel(delivery.updatedAt)}
                    </p>
                  </div>
                  <form action={retryOemSupportCandidateEmailAction}>
                    <input type="hidden" name="serviceSlug" value={service.configuration.slug} />
                    <input type="hidden" name="deliveryId" value={delivery.id} />
                    <button type="submit">再送を予約</button>
                  </form>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="settings-card">
          <h2>支援候補</h2>
          <form action={updateSupportAlertPolicyAction}>
            <input type="hidden" name="serviceSlug" value={service.configuration.slug} />
            <label>
              支援アラートの扱い
              <select name="mode" defaultValue={supportAlertPolicy?.mode ?? 'INTERNAL_ESCALATION'}>
                <option value="OPTIONAL_UPSELL">有料オプションの追加提案</option>
                <option value="INCLUDED_SUPPORT">契約内サポートとして対応</option>
                <option value="INTERNAL_ESCALATION">担当者への内部アラート</option>
                <option value="DISABLED">支援候補アラートを使用しない</option>
              </select>
            </label>
            <button type="submit">設定を保存</button>
          </form>
          <p>
            本人への無料支援後も改善しなかった場合だけ表示します。営業や契約は自動実行されません。
          </p>
          {supportCandidates.length === 0 ? (
            <p>現在、確認が必要な支援候補はありません。</p>
          ) : (
            <div className="settings-status-list">
              {supportCandidates.map((candidate) => {
                const snapshot = candidate.recommendationSnapshot as {
                  title?: string;
                  description?: string;
                  handlingMode?: string;
                };
                const handling = supportAlertModeViewModel(snapshot.handlingMode);
                return (
                  <article className="settings-status-item" key={candidate.id}>
                    <div>
                      <small>
                        {candidate.barrierCase.groupMembership.serviceMemberBusinessProfile
                          ?.businessName ?? '事業名未設定'}
                      </small>
                      <h3>{snapshot.title ?? '支援内容を確認'}</h3>
                      <p>{snapshot.description ?? ''}</p>
                      <p>
                        <strong>{handling.label}</strong>：{handling.description}
                      </p>
                      <p>
                        状態：{candidate.status}／検知日：{dateLabel(candidate.detectedAt)}
                      </p>
                    </div>
                    {candidate.status === 'OPEN' || candidate.status === 'ACCEPTED' ? (
                      <div className="button-row">
                        {candidate.status === 'OPEN' ? (
                          <form action={transitionOemSupportCandidateAction}>
                            <input
                              type="hidden"
                              name="serviceSlug"
                              value={service.configuration.slug}
                            />
                            <input type="hidden" name="candidateId" value={candidate.id} />
                            <input type="hidden" name="action" value="ACCEPT" />
                            <input type="hidden" name="reason" value={handling.acceptReason} />
                            <button type="submit">{handling.acceptLabel}</button>
                          </form>
                        ) : (
                          <form action={transitionOemSupportCandidateAction}>
                            <input
                              type="hidden"
                              name="serviceSlug"
                              value={service.configuration.slug}
                            />
                            <input type="hidden" name="candidateId" value={candidate.id} />
                            <input type="hidden" name="action" value="COMPLETE" />
                            <input type="hidden" name="reason" value="運営者が対応完了を確認" />
                            <button type="submit">対応完了</button>
                          </form>
                        )}
                        {candidate.status === 'OPEN' ? (
                          <form action={transitionOemSupportCandidateAction}>
                            <input
                              type="hidden"
                              name="serviceSlug"
                              value={service.configuration.slug}
                            />
                            <input type="hidden" name="candidateId" value={candidate.id} />
                            <input type="hidden" name="action" value="DISMISS" />
                            <input
                              type="hidden"
                              name="reason"
                              value="運営者が今回は対応しないと判断"
                            />
                            <button className="button-secondary" type="submit">
                              今回は対応しない
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>

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
