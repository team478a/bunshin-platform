import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

function yen(value: number | null): string {
  return value === null ? '個別見積' : `${value.toLocaleString('ja-JP')}円`;
}

function usd(micros: number): string {
  return `$${(micros / 1_000_000).toLocaleString('ja-JP', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default async function CommercialProfitabilityPage() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    actor.userId,
  );
  if (!admin || admin.role !== 'SUPER_ADMIN') notFound();

  const rows = await new db.PrismaCommercialUsageService().profitabilityDashboard(new Date());
  const totalRevenueYen = rows.reduce((sum, row) => sum + (row.revenueYen ?? 0), 0);
  const totalAiCostUsdMicros = rows.reduce((sum, row) => sum + row.aiCostUsdMicros, 0);
  const unpricedAiCalls = rows.reduce((sum, row) => sum + row.unpricedAiCalls, 0);

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">OEM商用管理</p>
        <h1>OEM採算確認</h1>
        <p>今月のMAU売上と、記録済みのAI見積原価を運営団体ごとに確認します。</p>
      </header>

      <p className="notice">
        売上は円、AI原価は米ドル表示です。為替、決済手数料、人件費、画像・動画など別基盤の原価は含まれないため、利益額ではなく採算確認の資料として利用してください。
      </p>

      <section className="operations-overview" aria-label="今月のOEM採算集計">
        <div>
          <span>OEM運営団体</span>
          <strong>{rows.length.toLocaleString('ja-JP')}件</strong>
        </div>
        <div>
          <span>MAU料金見込み</span>
          <strong>{yen(totalRevenueYen)}</strong>
        </div>
        <div>
          <span>AI見積原価</span>
          <strong>{usd(totalAiCostUsdMicros)}</strong>
        </div>
        <div>
          <span>原価未設定のAI処理</span>
          <strong>{unpricedAiCalls.toLocaleString('ja-JP')}件</strong>
        </div>
      </section>

      <section className="settings-card">
        <div className="management-section__heading">
          <div>
            <h2>運営団体別の今月の状況</h2>
            <p>{rows[0]?.month ?? '今月'}の実利用を集計しています。</p>
          </div>
          <Link className="button button--secondary" href="/admin/commercial-billing">
            請求・入金管理へ
          </Link>
        </div>
        {rows.length === 0 ? (
          <p>OEM運営団体はありません。</p>
        ) : (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>運営団体</th>
                  <th>MAU</th>
                  <th>料金見込み</th>
                  <th>AI見積原価</th>
                  <th>AI処理</th>
                  <th>要確認</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.workspaceId}>
                    <td>
                      <strong>{row.workspaceName}</strong>
                      <br />
                      <Link href={`/admin/organizations/${row.workspaceId}/commercial`}>
                        契約・請求を確認
                      </Link>
                    </td>
                    <td>{row.mau.toLocaleString('ja-JP')}</td>
                    <td>{yen(row.revenueYen)}</td>
                    <td>{usd(row.aiCostUsdMicros)}</td>
                    <td>
                      原価あり {row.pricedAiCalls.toLocaleString('ja-JP')}件
                      <br />
                      原価なし {row.unpricedAiCalls.toLocaleString('ja-JP')}件
                    </td>
                    <td>{row.unpricedAiCalls > 0 ? 'AI単価を確認' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
