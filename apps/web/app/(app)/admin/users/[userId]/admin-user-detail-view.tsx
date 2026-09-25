import Link from 'next/link';
import type { AdminUserDetailPageData } from './admin-user-detail-data';
import {
  MetricExclusionSection,
  SupportCasesSection,
  UserStatusSection,
} from './admin-user-operation-sections';
import { AdminUserHistorySections, AdminUserUsageSection } from './admin-user-summary-sections';

export function AdminUserDetailView({
  data,
  query,
}: {
  data: AdminUserDetailPageData;
  query: { saved?: string; error?: string };
}) {
  const { detail, administrators } = data;
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
      {query.saved === '1' ? <p className="notice notice--success">変更を保存しました。</p> : null}
      {query.error ? (
        <p className="notice notice--danger" role="alert">
          {query.error === 'protected'
            ? '管理者、退会済みユーザー、または現在と同じ状態は変更できません。'
            : query.error === 'forbidden'
              ? 'この操作を行う権限がありません。'
              : '変更を保存できませんでした。入力内容を確認してください。'}
        </p>
      ) : null}
      <AdminUserUsageSection user={user} />
      <MetricExclusionSection detail={detail} />
      <UserStatusSection detail={detail} />
      <SupportCasesSection detail={detail} administrators={administrators} />
      <AdminUserHistorySections detail={detail} />
    </main>
  );
}
