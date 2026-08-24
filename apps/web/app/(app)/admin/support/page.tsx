import { ListAdminSupportCases, type AdminSupportCase } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

const statuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;
const statusLabels = { OPEN: '未対応', IN_PROGRESS: '対応中', RESOLVED: '解決済み' } as const;
const priorityLabels = { LOW: '低', NORMAL: '通常', HIGH: '高', URGENT: '緊急' } as const;

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const query = await searchParams;
  const status = statuses.includes(query.status as (typeof statuses)[number])
    ? (query.status as AdminSupportCase['status'])
    : null;
  const db = await import('@bunshin/database');
  let cases;
  try {
    cases = await new ListAdminSupportCases(new db.PrismaAdminOperationsRepository()).execute({
      actorUserId: actor.userId,
      status,
    });
  } catch (error) {
    if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用</p>
        <h1>問い合わせ対応</h1>
        <p>未対応・対応中・解決済みの記録をまとめて確認します。</p>
      </header>
      <form method="get" className="validation-filter">
        <label>
          状態
          <select name="status" defaultValue={status ?? ''}>
            <option value="">すべて</option>
            {statuses.map((value) => (
              <option key={value} value={value}>
                {statusLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">表示を更新</button>
      </form>
      <section className="settings-card">
        <h2>対応一覧</h2>
        <div className="validation-table-wrap">
          <table className="validation-table">
            <thead>
              <tr>
                <th>優先度</th>
                <th>状態</th>
                <th>ユーザー</th>
                <th>件名</th>
                <th>担当</th>
                <th>更新</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((item) => (
                <tr key={item.id}>
                  <td>{priorityLabels[item.priority]}</td>
                  <td>{statusLabels[item.status]}</td>
                  <td>
                    <Link href={`/admin/users/${item.targetUserId}`}>{item.targetDisplayName}</Link>
                    <br />
                    <small>{item.targetEmail ?? 'メールなし'}</small>
                  </td>
                  <td>{item.subject}</td>
                  <td>{item.assigneeDisplayName ?? '未割当'}</td>
                  <td>{item.updatedAt.toLocaleString('ja-JP')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cases.length === 0 ? <p>条件に当てはまる問い合わせはありません。</p> : null}
      </section>
    </main>
  );
}
