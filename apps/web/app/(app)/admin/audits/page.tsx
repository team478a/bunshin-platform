import { ADMIN_AUDIT_CATEGORIES, ListAdminAuditLogs } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { currentLineEnvironment } from '../../../../src/line/secure-configuration';
import { auditActionLabel, auditCategoryLabels } from '../../../../src/admin/audit-display';
import { resolvePeriod } from '../users/view-model';

export const dynamic = 'force-dynamic';

export default async function AdminAuditsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; category?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const query = await searchParams;
  const period = resolvePeriod(query);
  const selectedCategory = ADMIN_AUDIT_CATEGORIES.find((category) => category === query.category);
  const db = await import('@bunshin/database');
  let result;
  try {
    result = await new ListAdminAuditLogs(new db.PrismaAdminAuditLogRepository()).execute({
      actorUserId: actor.userId,
      environment: currentLineEnvironment(),
      from: period.from,
      to: period.to,
      ...(selectedCategory ? { category: selectedCategory } : {}),
      limit: 500,
    });
  } catch (error) {
    if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  const params = new URLSearchParams({ from: period.fromInput, to: period.toInput });
  if (selectedCategory) params.set('category', selectedCategory);
  return (
    <main className="app-page validation-dashboard">
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用</p>
        <h1>変更履歴</h1>
        <p>誰が、いつ、どの運用設定を変更したかを確認します。秘密の値や投稿本文は表示しません。</p>
      </header>
      <form className="validation-filter" method="get">
        <label>
          開始日
          <input type="date" name="from" defaultValue={period.fromInput} />
        </label>
        <label>
          終了日
          <input type="date" name="to" defaultValue={period.toInput} />
        </label>
        <label>
          種類
          <select name="category" defaultValue={selectedCategory ?? ''}>
            <option value="">すべて</option>
            {ADMIN_AUDIT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {auditCategoryLabels[category]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">表示を更新</button>
      </form>
      <section className="settings-card">
        <h2>履歴を保存</h2>
        <a
          className="button button--secondary"
          href={`/api/admin/audits/export?${params.toString()}`}
        >
          CSVを保存
        </a>
      </section>
      <section aria-labelledby="audit-list">
        <h2 id="audit-list">変更記録</h2>
        <div className="validation-table-wrap">
          <table className="validation-table">
            <thead>
              <tr>
                <th>日時</th>
                <th>種類</th>
                <th>操作</th>
                <th>対象</th>
                <th>担当者</th>
                <th>理由</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((item) => (
                <tr key={`${item.category}-${item.id}`}>
                  <td>{item.occurredAt.toLocaleString('ja-JP')}</td>
                  <td>{auditCategoryLabels[item.category]}</td>
                  <td>{auditActionLabel(item.action)}</td>
                  <td>{item.targetLabel}</td>
                  <td>{item.actorDisplayName}</td>
                  <td>{item.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {result.items.length === 0 ? <p>条件に当てはまる変更記録はありません。</p> : null}
        {result.truncated ? (
          <p>最大500件を表示しています。期間または種類を絞ってください。</p>
        ) : null}
      </section>
    </main>
  );
}
