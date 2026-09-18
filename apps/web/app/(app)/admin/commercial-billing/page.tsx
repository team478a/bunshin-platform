import { isTenantInvoiceOverdue } from '@bunshin/application';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

const STATUS_LABELS = {
  DRAFT: '下書き',
  ISSUED: '請求済み',
  PAID: '入金済み',
  VOID: '取消',
} as const;

function yen(value: number): string {
  return `${value.toLocaleString('ja-JP')}円`;
}

export default async function CommercialBillingOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    actor.userId,
  );
  if (!admin || admin.role !== 'SUPER_ADMIN') notFound();

  const now = new Date();
  const data = await new db.PrismaCommercialBillingService().operationsDashboard(now);
  const status = (await searchParams).status;
  const invoices = data.invoices.filter((invoice) => {
    if (status === 'OVERDUE') return isTenantInvoiceOverdue(invoice, now);
    if (status === 'DRAFT' || status === 'ISSUED' || status === 'PAID' || status === 'VOID') {
      return invoice.status === status;
    }
    return true;
  });

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">OEM商用管理</p>
        <h1>請求・入金管理</h1>
        <p>全運営団体の請求状況を確認し、期限超過と未入金を見落とさないための画面です。</p>
      </header>

      <p className="notice">
        ここで管理する金額は内部請求台帳です。税務上の正式な請求書は外部の請求サービスで発行し、その番号を団体別画面へ記録してください。
      </p>

      <section className="operations-overview" aria-label="請求状況の集計">
        <div>
          <span>契約中の団体</span>
          <strong>{data.activeContracts}件</strong>
        </div>
        <div>
          <span>未入金</span>
          <strong>
            {data.summary.outstandingCount}件／{yen(data.summary.outstandingAmountYen)}
          </strong>
        </div>
        <div>
          <span>期限超過</span>
          <strong>
            {data.summary.overdueCount}件／{yen(data.summary.overdueAmountYen)}
          </strong>
        </div>
        <div>
          <span>下書き</span>
          <strong>
            {data.summary.draftCount}件／{yen(data.summary.draftAmountYen)}
          </strong>
        </div>
      </section>

      <section className="settings-card">
        <div className="management-section__heading">
          <div>
            <h2>請求一覧</h2>
            <p>表示中：{invoices.length.toLocaleString('ja-JP')}件</p>
          </div>
          <a className="button button--secondary" href="/api/admin/commercial-billing/export">
            経理用CSVをダウンロード
          </a>
        </div>
        <div className="button-row" aria-label="請求状態で絞り込み">
          <Link className="button button--secondary" href="/admin/commercial-billing">
            すべて
          </Link>
          <Link
            className="button button--secondary"
            href="/admin/commercial-billing?status=OVERDUE"
          >
            期限超過
          </Link>
          <Link className="button button--secondary" href="/admin/commercial-billing?status=ISSUED">
            未入金
          </Link>
          <Link className="button button--secondary" href="/admin/commercial-billing?status=DRAFT">
            下書き
          </Link>
          <Link className="button button--secondary" href="/admin/commercial-billing?status=PAID">
            入金済み
          </Link>
        </div>
        {invoices.length === 0 ? (
          <p>該当する請求はありません。</p>
        ) : (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>運営団体</th>
                  <th>対象月</th>
                  <th>請求番号</th>
                  <th>MAU</th>
                  <th>金額</th>
                  <th>状態</th>
                  <th>支払期限</th>
                  <th>確認</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const overdue = isTenantInvoiceOverdue(invoice, now);
                  return (
                    <tr key={invoice.id}>
                      <td>
                        <strong>{invoice.workspace.name}</strong>
                        <br />
                        {invoice.contract.billingEmail}
                      </td>
                      <td>{invoice.periodStart.toISOString().slice(0, 7)}</td>
                      <td>{invoice.invoiceNumber}</td>
                      <td>{invoice.mau.toLocaleString('ja-JP')}</td>
                      <td>{yen(invoice.amountYen)}</td>
                      <td>{overdue ? '支払期限超過' : STATUS_LABELS[invoice.status]}</td>
                      <td>
                        {invoice.dueAt?.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) ??
                          '—'}
                      </td>
                      <td>
                        <Link href={`/admin/organizations/${invoice.workspaceId}/commercial`}>
                          詳細・更新
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
