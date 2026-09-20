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

async function createPricingSchedule(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    actor.userId,
  );
  if (!admin || admin.role !== 'SUPER_ADMIN') notFound();
  const versionValue = formData.get('version');
  const effectiveFromValue = formData.get('effectiveFrom');
  const version = typeof versionValue === 'string' ? versionValue.trim() : '';
  const effectiveFrom = new Date(
    `${typeof effectiveFromValue === 'string' ? effectiveFromValue : ''}T00:00:00.000Z`,
  );
  const limits = [100, 300, 500, 1000, 3000];
  const keys = ['MAU_0_100', 'MAU_101_300', 'MAU_301_500', 'MAU_501_1000', 'MAU_1001_3000'];
  const tiers = limits.map((upperLimit, index) => ({
    tierKey: keys[index]!,
    upperLimit,
    priceYen: Number(formData.get(`price${upperLimit}`)),
  }));
  if (
    !version ||
    Number.isNaN(effectiveFrom.getTime()) ||
    tiers.some((tier) => !Number.isInteger(tier.priceYen) || tier.priceYen < 0)
  )
    redirect('/admin/commercial-billing?pricing=invalid');
  await new db.PrismaCommercialUsageService().createPricingSchedule({
    version,
    effectiveFrom,
    tiers,
    createdByUserId: actor.userId,
  });
  redirect('/admin/commercial-billing?pricing=created');
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
  const invoicesById = new Map(data.invoices.map((invoice) => [invoice.id, invoice]));
  const invoices = data.invoices.filter((invoice) => {
    if (status === 'OVERDUE') return isTenantInvoiceOverdue(invoice, now);
    if (status === 'REMINDER_FAILED') return reminderFailureInvoiceIds.has(invoice.id);
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
        <h2>MAU料金表</h2>
        <p>
          新しい料金は適用開始月以降に確定する利用量へ適用されます。確定済みの請求金額は変わりません。
        </p>
        <form action={createPricingSchedule} className="form-stack">
          <label>
            料金表バージョン
            <input name="version" required maxLength={80} placeholder="oem-mau-jpy-v2" />
          </label>
          <label>
            適用開始月
            <input name="effectiveFrom" required type="date" />
          </label>
          <div className="form-grid">
            <label>
              0〜100 MAU
              <input name="price100" required type="number" min="0" defaultValue="19800" />
            </label>
            <label>
              101〜300 MAU
              <input name="price300" required type="number" min="0" defaultValue="39800" />
            </label>
            <label>
              301〜500 MAU
              <input name="price500" required type="number" min="0" defaultValue="59800" />
            </label>
            <label>
              501〜1,000 MAU
              <input name="price1000" required type="number" min="0" defaultValue="99800" />
            </label>
            <label>
              1,001〜3,000 MAU
              <input name="price3000" required type="number" min="0" defaultValue="198000" />
            </label>
          </div>
          <p>3,001 MAU以上は従来どおり個別見積です。</p>
          <button className="button" type="submit">
            将来の料金表を登録
          </button>
        </form>
        {pricingSchedules.length > 0 ? (
          <ul className="summary-list">
            {pricingSchedules.map((schedule) => (
              <li key={schedule.id}>
                <span>{schedule.version}</span>
                <strong>{schedule.effectiveFrom.toISOString().slice(0, 10)}から</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p>登録済みの改定料金表はありません。現在は標準料金v1を使用しています。</p>
        )}
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
                  <th>自動案内</th>
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
                      <td>{reminderFailureInvoiceIds.has(invoice.id) ? '要確認' : '—'}</td>
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
