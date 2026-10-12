import { isTenantInvoiceOverdue, invoiceBillableUserCount } from '@bunshin/application';
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
  const [data, pricingSchedules] = await Promise.all([
    new db.PrismaCommercialBillingService().operationsDashboard(now),
    new db.PrismaCommercialUsageService().listPricingSchedules(),
  ]);
  const status = (await searchParams).status;
  const reminderFailureInvoiceIds = new Set(
    data.reminderFailures.map((failure) => failure.entityId),
  );
  const refundReviewByInvoiceId = new Map(
    data.refundReviews.map((review) => [review.invoiceId, review]),
  );
  const invoicesById = new Map(data.invoices.map((invoice) => [invoice.id, invoice]));
  const invoices = data.invoices.filter((invoice) => {
    if (status === 'OVERDUE') return isTenantInvoiceOverdue(invoice, now);
    if (status === 'REMINDER_FAILED') return reminderFailureInvoiceIds.has(invoice.id);
    if (status === 'REFUND_REVIEW') return refundReviewByInvoiceId.has(invoice.id);
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

      <section className="settings-card">
        <h2>OEM共通料金表</h2>
        <p>適用月の料金表で請求します。下書きは請求に利用しません。</p>
        <Link className="button" href="/admin/commercial-billing/pricing">
          段階・金額・公開予約を管理
        </Link>
        <p>登録済み料金表: {pricingSchedules.length}件</p>
      </section>

      <section className="settings-card">
        <h2>Service Productポリシー</h2>
        <p>ワタシワークスの商品、FREE提供可否、必要Capability、廃止状態を管理します。</p>
        <Link className="button" href="/admin/commercial-billing/products">
          商品ポリシーを管理
        </Link>
      </section>

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
        <div>
          <span>案内送信の要確認</span>
          <strong>{reminderFailureInvoiceIds.size}件</strong>
        </div>
        <div>
          <span>返金の要照合</span>
          <strong>{refundReviewByInvoiceId.size}件</strong>
        </div>
      </section>

      {data.reminderFailures.length > 0 ? (
        <section className="settings-card">
          <h2>自動案内メールの要確認</h2>
          <p>
            自動送信に失敗した請求があります。対象団体の画面で管理者メール設定を確認し、手動再送してください。
          </p>
          <ul className="summary-list">
            {data.reminderFailures.map((failure) => {
              const invoice = invoicesById.get(failure.entityId);
              if (!invoice) return null;
              return (
                <li key={failure.id}>
                  <span>
                    {invoice.workspace.name}／{invoice.invoiceNumber}／
                    {failure.action.startsWith('OVERDUE_') ? '期限超過案内' : '支払い案内'}（
                    {failure.occurredAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}）
                  </span>
                  <strong>
                    <Link href={`/admin/organizations/${invoice.workspaceId}/commercial`}>
                      確認・再送
                    </Link>
                  </strong>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {data.refundReviews.length > 0 ? (
        <section className="settings-card">
          <h2>Stripe返金の要照合</h2>
          <p>
            Stripeから返金通知を受信しました。内部請求状態は自動変更していません。Stripeの返金記録、契約証跡、会計処理を確認してください。
          </p>
          <ul className="summary-list">
            {data.refundReviews.map((review) => {
              const invoice = invoicesById.get(review.invoiceId);
              if (!invoice) return null;
              return (
                <li key={review.id}>
                  <span>
                    {invoice.workspace.name}／{invoice.invoiceNumber}／
                    {review.errorCategory === 'FULL_REFUND_REVIEW_REQUIRED'
                      ? '全額返金通知'
                      : '部分返金通知'}
                    （{review.receivedAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}）
                  </span>
                  <strong>
                    <Link href={`/admin/organizations/${invoice.workspaceId}/commercial`}>
                      請求を確認
                    </Link>
                  </strong>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

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
          <Link
            className="button button--secondary"
            href="/admin/commercial-billing?status=REMINDER_FAILED"
          >
            案内送信失敗（{reminderFailureInvoiceIds.size}）
          </Link>
          <Link
            className="button button--secondary"
            href="/admin/commercial-billing?status=REFUND_REVIEW"
          >
            返金要照合（{refundReviewByInvoiceId.size}）
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
                  <th>請求種別・対象</th>
                  <th>請求番号</th>
                  <th>MAU</th>
                  <th>課金対象人数</th>
                  <th>金額</th>
                  <th>状態</th>
                  <th>支払期限</th>
                  <th>自動案内</th>
                  <th>返金</th>
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
                      <td>
                        {invoice.kind === 'SETUP_FEE' ? (
                          <>
                            初期費用
                            <br />
                            {invoice.setupFeeCharge?.product.displayName ?? '商品確認要'}
                          </>
                        ) : (
                          <>月額／{invoice.periodStart.toISOString().slice(0, 7)}</>
                        )}
                      </td>
                      <td>{invoice.invoiceNumber}</td>
                      <td>
                        {invoice.kind === 'SETUP_FEE' ? '—' : invoice.mau.toLocaleString('ja-JP')}
                      </td>
                      <td>
                        {invoice.kind === 'SETUP_FEE'
                          ? '—'
                          : invoiceBillableUserCount(invoice).toLocaleString('ja-JP')}
                      </td>
                      <td>{yen(invoice.amountYen)}</td>
                      <td>{overdue ? '支払期限超過' : STATUS_LABELS[invoice.status]}</td>
                      <td>
                        {invoice.dueAt?.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) ??
                          '—'}
                      </td>
                      <td>{reminderFailureInvoiceIds.has(invoice.id) ? '要確認' : '—'}</td>
                      <td>
                        {refundReviewByInvoiceId.get(invoice.id)?.errorCategory ===
                        'FULL_REFUND_REVIEW_REQUIRED'
                          ? '全額・要照合'
                          : refundReviewByInvoiceId.has(invoice.id)
                            ? '部分・要照合'
                            : '—'}
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
