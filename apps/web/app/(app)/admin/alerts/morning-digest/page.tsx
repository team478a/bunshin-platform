import { getServerEnvironment } from '@bunshin/config';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import {
  buildOpsMorningDigestContent,
  readOpsMorningDigestEmailReadiness,
} from '../../../../../src/admin/ops-morning-digest';
import { currentAdminEmailEnvironment } from '../../../../../src/email/secure-admin-email-configuration';

export const dynamic = 'force-dynamic';

const knownFailureCategories = new Set([
  'COLLECTION_FAILED',
  'EMAIL_CONFIGURATION_MISSING',
  'EMAIL_PROVIDER_FAILED',
  'EMAIL_DELIVERY_UNCONFIRMED',
]);

function previousDate(targetDate: string) {
  const date = new Date(`${targetDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function currentRunLabel(
  run: {
    status: string;
    leaseExpiresAt: Date | null;
    errorCategory: string | null;
  } | null,
) {
  if (!run) return '記録なし';
  if (run.status === 'SENT') return '送信済み';
  if (run.status === 'FAILED') {
    const category =
      run.errorCategory && knownFailureCategories.has(run.errorCategory)
        ? run.errorCategory
        : '分類なし';
    return `失敗：${category}`;
  }
  if (run.status === 'CLAIMED') {
    return run.leaseExpiresAt && run.leaseExpiresAt.getTime() <= Date.now()
      ? '実行中（期限切れclaim）'
      : '実行中';
  }
  return '確認できない';
}

function previousRunLabel(status: string, available: boolean) {
  if (!available) return '確認できない';
  if (status === 'SENT') return '送信済み';
  if (status === 'NOT_SENT') return '未送信';
  if (status === 'BEFORE_HISTORY') return '履歴開始前';
  return '確認できない';
}

function yesNo(value: boolean) {
  return value ? 'はい' : 'いいえ';
}

export default async function MorningDigestPreviewPage() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');

  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    actor.userId,
  );
  if (!admin) notFound();

  const now = new Date();
  const environment = getServerEnvironment();
  const digest = await buildOpsMorningDigestContent({
    actorUserId: actor.userId,
    now,
    tolerateReadFailures: true,
  });
  let run = null;
  let historyAvailable = digest.historyAvailable;
  try {
    const runs = new db.PrismaOpsMorningDigestRunRepository();
    run = await runs.runState({
      environment: currentAdminEmailEnvironment(),
      targetDate: digest.targetDate,
    });
  } catch {
    historyAvailable = false;
  }
  const emailReadiness = await readOpsMorningDigestEmailReadiness();
  const emailConfigured = emailReadiness.status === 'READY';
  const previousStatus = previousRunLabel(digest.previousDelivery, historyAvailable);
  const todayStatus = historyAvailable ? currentRunLabel(run) : '確認できない';

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用・読み取り専用</p>
        <h1>毎朝のまとめメールをプレビュー</h1>
        <p>件名と本文、送信開始前の準備状況を、画面を開いた時点の情報で表示します。</p>
      </header>

      {environment.APP_ENV !== 'production' ? (
        <section className="settings-card status-warning" role="status">
          <strong>本番環境ではありません。表示はこの環境のデータです。</strong>
        </section>
      ) : null}

      <section className="settings-card">
        <h2>プレビュー対象</h2>
        <dl className="ops-digest-preview__metadata" style={{ display: 'grid', gap: '0.75rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(8rem, 0.4fr) 1fr',
              gap: '0.75rem',
            }}
          >
            <dt>対象日（JST）</dt>
            <dd>{digest.targetDate}</dd>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(8rem, 0.4fr) 1fr',
              gap: '0.75rem',
            }}
          >
            <dt>前日の送信状況</dt>
            <dd>
              {previousStatus}（{previousDate(digest.targetDate)}）
            </dd>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(8rem, 0.4fr) 1fr',
              gap: '0.75rem',
            }}
          >
            <dt>プレビュー生成時刻</dt>
            <dd>{now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}（JST）</dd>
          </div>
        </dl>
      </section>

      <section className="settings-card">
        <h2>実際に送信する件名・本文</h2>
        <p>
          <strong>件名</strong>
        </p>
        <pre
          className="ops-digest-preview__subject"
          style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}
        >
          {digest.report.subject}
        </pre>
        <p>
          <strong>本文</strong>
        </p>
        <pre
          className="ops-digest-preview__body"
          style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}
        >
          {digest.report.body}
        </pre>
      </section>

      <section className="settings-card">
        <h2>送信の準備状況</h2>
        <dl className="ops-digest-preview__readiness" style={{ display: 'grid', gap: '0.75rem' }}>
          <div>
            <dt>OPS_DIGEST_ENABLED</dt>
            <dd>{yesNo(environment.OPS_DIGEST_ENABLED === 'true')}</dd>
          </div>
          <div>
            <dt>実行環境がproduction</dt>
            <dd>{yesNo(environment.APP_ENV === 'production')}</dd>
          </div>
          <div>
            <dt>管理用メール設定</dt>
            <dd>{emailReadiness.status === 'UNKNOWN' ? '確認できない' : yesNo(emailConfigured)}</dd>
          </div>
          {emailReadiness.recipientCount === null ? null : (
            <div>
              <dt>宛先数</dt>
              <dd>{emailReadiness.recipientCount}件</dd>
            </div>
          )}
          <div>
            <dt>送信記録テーブル</dt>
            <dd>{historyAvailable ? 'はい' : '確認できない'}</dd>
          </div>
        </dl>
        <h3>送信記録（読み取りのみ）</h3>
        <p>
          今日の対象日：{todayStatus}（{digest.targetDate}）
        </p>
        <p>
          前日：{previousStatus}（{previousDate(digest.targetDate)}）
        </p>
      </section>

      <section className="settings-card">
        <p className="status-warning">
          <strong>このページを開いても、メールは送信されず、送信記録も変わりません。</strong>
        </p>
        <p>この画面には送信・テスト送信・再送の操作はありません。</p>
        <Link className="button button--secondary" href="/admin/alerts">
          運用通知へ戻る
        </Link>
      </section>
    </main>
  );
}
