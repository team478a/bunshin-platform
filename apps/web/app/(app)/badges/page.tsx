import { GetBadgeUserDashboard, type BadgeUserItem } from '@bunshin/application';
import { redirect } from 'next/navigation';
import { currentUserProvider } from '../../../src/auth/current-user';
import { BadgeVisibilityControl } from './badge-visibility-control';
import { BadgeNotificationList } from './badge-notification-list';

export const dynamic = 'force-dynamic';

const acquiredReason: Record<string, string> = {
  BUNSHIN_CREATED: 'はじめて分身を作ったため',
  STRATEGY_APPROVED: '発信の作戦を決めたため',
  MISSION_VIEWED: '今日の企画を確認したため',
  MISSION_ACCEPTED: '企画を使うと決めたため',
  POSTED: '投稿を完了したため',
  FEEDBACK_RECORDED: '投稿の感想を伝えたため',
  IMAGE_COMPLETED: '投稿用の画像を作ったため',
};

function BadgeMark({ item }: { item: BadgeUserItem }) {
  return (
    <span
      className={`badge-mark${item.state === 'AWARDED' ? ' is-earned' : ''}`}
      aria-hidden="true"
    >
      ★
    </span>
  );
}

function Progress({ item }: { item: BadgeUserItem }) {
  return (
    <>
      <div
        className="progress-bar"
        role="progressbar"
        aria-valuenow={item.currentValue}
        aria-valuemin={0}
        aria-valuemax={item.targetValue}
      >
        <span style={{ width: `${item.progressPercent}%` }} />
      </div>
      <small>あと {Math.max(0, item.targetValue - item.currentValue)} 回</small>
    </>
  );
}

export default async function BadgesPage() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  const workspace = (await db.listActiveWorkspacesForUser(user.userId))[0];
  if (!workspace) redirect('/bunshins');
  let dashboard;
  try {
    dashboard = await new GetBadgeUserDashboard(
      new db.PrismaBadgeUserExperienceRepository(db.prisma),
    ).execute({ workspaceId: workspace.id, actorUserId: user.userId });
  } catch {
    return (
      <main className="app-page">
        <section className="settings-card">
          <h1>バッジを確認できません</h1>
          <p>時間をおいて、もう一度お試しください。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-page badge-page">
      <header className="app-page__heading">
        <p className="eyebrow">がんばったしるし</p>
        <h1>バッジ</h1>
        <p>できたことが増えると、バッジが集まります。</p>
      </header>

      <BadgeNotificationList
        workspaceId={workspace.id}
        initialNotifications={dashboard.notifications.map((item) => ({
          ...item,
          awardedAt: item.awardedAt.toISOString(),
          readAt: item.readAt?.toISOString() ?? null,
        }))}
      />

      <section className="settings-card" aria-labelledby="earned-badges">
        <h2 id="earned-badges">もらったバッジ</h2>
        {dashboard.acquired.length ? (
          <div className="badge-list">
            {dashboard.acquired.map((item) => (
              <article className="badge-card" key={item.badgeVersionId}>
                <BadgeMark item={item} />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <small>{acquiredReason[item.sourceType ?? ''] ?? '目標を達成したため'}</small>
                  {item.awardId && (
                    <BadgeVisibilityControl
                      workspaceId={workspace.id}
                      awardId={item.awardId}
                      initialVisibility={item.visibility}
                      initialGroupId={item.sharedGroupId}
                      groups={dashboard.shareableGroups}
                    />
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p>最初のバッジを目指して、今日の企画を見てみましょう。</p>
        )}
      </section>

      <section className="settings-card" aria-labelledby="badge-progress">
        <h2 id="badge-progress">もう少しでもらえるバッジ</h2>
        {dashboard.inProgress.length ? (
          <div className="badge-list">
            {dashboard.inProgress.map((item) => (
              <article className="badge-card" key={item.badgeVersionId}>
                <BadgeMark item={item} />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <Progress item={item} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p>進めているバッジはまだありません。</p>
        )}
      </section>

      <section className="settings-card" aria-labelledby="recommended-badges">
        <h2 id="recommended-badges">次におすすめ</h2>
        {dashboard.recommended.length ? (
          <div className="badge-list">
            {dashboard.recommended.map((item) => (
              <article className="badge-card badge-card--compact" key={item.badgeVersionId}>
                <BadgeMark item={item} />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p>いま受け取れるバッジはすべて集まりました。</p>
        )}
      </section>
      <p className="badge-privacy-note">
        バッジは、はじめは自分にだけ見えます。グループへ見せるかは、自分で選べます。
      </p>
    </main>
  );
}
