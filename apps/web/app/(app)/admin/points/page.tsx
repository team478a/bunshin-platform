import { InspectPointBalances } from '@bunshin/application';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

export default async function PointBalanceAdminPage() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');

  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    user.userId,
  );
  if (!admin) notFound();

  const result = await new InspectPointBalances(
    new db.PrismaPointBalanceReconciliationRepository(db.prisma),
  ).execute({ limit: 100 });

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用</p>
        <h1>ポイント残高の確認</h1>
        <p>利用者に表示する残高と、ポイント履歴の合計を照合しました。</p>
      </header>

      <section className="settings-card" aria-labelledby="point-check-result-title">
        <h2 id="point-check-result-title">確認結果</h2>
        {result.mismatchCount === 0 ? (
          <p>
            <strong className="status-success">
              {result.accountsChecked}件すべて一致しています
            </strong>
          </p>
        ) : (
          <>
            <p>
              <strong className="status-warning">
                {result.accountsChecked}件中、{result.mismatchCount}件が一致していません
              </strong>
            </p>
            <p>対象を確認し、原因を調べるまでは手作業で残高を変更しないでください。</p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">利用者ID</th>
                    <th scope="col">表示残高</th>
                    <th scope="col">履歴の合計</th>
                    <th scope="col">差</th>
                  </tr>
                </thead>
                <tbody>
                  {result.mismatches.map((item) => (
                    <tr key={item.accountId}>
                      <td>{item.userId}</td>
                      <td>{item.storedBalance} WP</td>
                      <td>{item.ledgerBalance} WP</td>
                      <td>{item.difference} WP</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.mismatchCount > result.mismatches.length ? (
              <p>最初の{result.mismatches.length}件を表示しています。</p>
            ) : null}
          </>
        )}
      </section>

      <Link href="/admin" className="button button--secondary">
        運用設定へ戻る
      </Link>
    </main>
  );
}
