import { GetAdminAlerts } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { currentLineEnvironment } from '../../../../src/line/secure-configuration';

export const dynamic = 'force-dynamic';

const severityLabels = {
  CRITICAL: 'すぐに対応',
  WARNING: '確認が必要',
  INFO: '状況を確認',
} as const;

export default async function AdminAlertsPage() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  let center;
  try {
    center = await new GetAdminAlerts(new db.PrismaAdminAlertRepository()).execute({
      actorUserId: actor.userId,
      environment: currentLineEnvironment(),
    });
  } catch (error) {
    if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  const critical = center.alerts.filter((item) => item.severity === 'CRITICAL').length;
  const warnings = center.alerts.filter((item) => item.severity === 'WARNING').length;

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用</p>
        <h1>運用通知</h1>
        <p>今、対応が必要なことだけを表示します。問題がない項目は表示しません。</p>
      </header>
      <section className="settings-card">
        <h2>現在の状態</h2>
        {center.alerts.length === 0 ? (
          <p className="status-success">
            <strong>今すぐ確認する通知はありません。</strong>
          </p>
        ) : (
          <p>
            <strong className={critical ? 'status-warning' : 'status-success'}>
              すぐに対応：{critical}件
            </strong>{' '}
            ／ 確認が必要：{warnings}件 ／ その他：{center.alerts.length - critical - warnings}件
          </p>
        )}
        <p>
          <small>最終確認：{center.generatedAt.toLocaleString('ja-JP')}（画面を開いた時点）</small>
        </p>
      </section>
      {center.alerts.map((alert) => (
        <article className="settings-card" key={alert.code}>
          <p className="eyebrow">{severityLabels[alert.severity]}</p>
          <h2>
            {alert.title}
            {alert.count === null ? '' : `（${alert.count}件）`}
          </h2>
          <p>{alert.guidance}</p>
          <Link className="button button--secondary" href={alert.href}>
            設定を確認する
          </Link>
        </article>
      ))}
    </main>
  );
}
