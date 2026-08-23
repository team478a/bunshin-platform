import { GetAdminUserDetail } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { currentLineEnvironment } from '../../../../../src/line/secure-configuration';
import { dateTime, stageLabels } from '../view-model';

export const dynamic = 'force-dynamic';

const activityLabels: Record<string, string> = {
  VIEWED: '投稿案を確認',
  ACCEPTED: '投稿案を採用',
  REJECTED: '投稿案を見送り',
  COPIED_TEXT: '投稿文をコピー',
  COPIED_SLIDE: 'スライドをコピー',
  COPIED_VIDEO_PROMPT: '動画作成の説明をコピー',
  COPIED_SCRIPT: '撮影台本をコピー',
  POSTED: '投稿完了',
  FEEDBACK_GOOD: '「自分らしい」と回答',
  FEEDBACK_NEUTRAL: '「普通」と回答',
  FEEDBACK_BAD: '「違う」と回答',
};

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  let detail;
  try {
    detail = await new GetAdminUserDetail(new db.PrismaAdminOperationsRepository()).execute({
      actorUserId: actor.userId,
      userId: (await params).userId,
      environment: currentLineEnvironment(),
    });
  } catch (error) {
    if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  const user = detail.user;
  return (
    <main className="app-page">
      <p>
        <Link href="/admin/users">← ユーザー一覧へ戻る</Link>
      </p>
      <header className="app-page__heading">
        <p className="eyebrow">ユーザー詳細</p>
        <h1>{user.displayName}</h1>
        <p>{user.email ?? 'メールアドレスなし'}</p>
      </header>
      <section>
        <h2>利用状況</h2>
        <dl>
          <div>
            <dt>状態</dt>
            <dd>{user.status}</dd>
          </div>
          <div>
            <dt>現在の段階</dt>
            <dd>{stageLabels[user.stage]}</dd>
          </div>
          <div>
            <dt>登録日</dt>
            <dd>{dateTime(user.createdAt)}</dd>
          </div>
          <div>
            <dt>最終利用</dt>
            <dd>{dateTime(user.lastActiveAt)}</dd>
          </div>
          <div>
            <dt>LINE</dt>
            <dd>
              {user.lineConnected
                ? user.lineFollowing
                  ? '接続・友だち確認済み'
                  : '接続済み・友だち未確認'
                : '未接続'}
            </dd>
          </div>
          <div>
            <dt>確認事項</dt>
            <dd>{user.attentionReason ?? 'なし'}</dd>
          </div>
        </dl>
      </section>
      <section>
        <h2>BUNSHIN</h2>
        {detail.bunshins.length ? (
          <ul>
            {detail.bunshins.map((item) => (
              <li key={item.id}>
                {item.name} ／ {item.status} ／ {dateTime(item.createdAt)}
              </li>
            ))}
          </ul>
        ) : (
          <p>まだ作成されていません。</p>
        )}
      </section>
      <section>
        <h2>最近の利用履歴</h2>
        <p>投稿本文や秘密情報は表示しません。</p>
        {detail.timeline.length ? (
          <ol>
            {detail.timeline.map((item, index) => (
              <li key={`${item.occurredAt.toISOString()}-${index}`}>
                <time>{dateTime(item.occurredAt)}</time> {activityLabels[item.type] ?? item.label}
              </li>
            ))}
          </ol>
        ) : (
          <p>利用履歴はありません。</p>
        )}
      </section>
    </main>
  );
}
