import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

function yen(value: number | null): string {
  return value === null ? '個別見積' : `${value.toLocaleString('ja-JP')}円`;
}

function invoiceStatusLabel(status: 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID', dueAt: Date | null) {
  if (status === 'ISSUED' && dueAt && dueAt < new Date()) return '支払期限超過';
  return { DRAFT: '準備中', ISSUED: '請求済み', PAID: '入金済み', VOID: '取消' }[status];
}

export default async function OrganizationUsagePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const workspaceId = z.uuid().safeParse((await params).workspaceId);
  if (!workspaceId.success) notFound();
  const db = await import('@bunshin/database');
  const [platformAdmin, membership] = await Promise.all([
    new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(actor.userId),
    db.prisma.workspaceMembership.findFirst({
      where: {
        workspaceId: workspaceId.data,
        userId: actor.userId,
        role: { in: ['OWNER', 'ADMIN'] },
        status: 'ACTIVE',
      },
      select: { id: true },
    }),
  ]);
  if (!platformAdmin && !membership) notFound();
  const [dashboard, billing] = await Promise.all([
    new db.PrismaCommercialUsageService().dashboard(workspaceId.data),
    new db.PrismaCommercialBillingService().dashboard(workspaceId.data),
  ]);
  if (!dashboard || !billing) notFound();

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">契約中の利用状況</p>
        <h1>{dashboard.workspace.name}の利用人数</h1>
        <p>今月、サービス機能を1回以上使った参加者の人数と現在の料金帯です。</p>
        <Link href={`/organizations/${dashboard.workspace.id}/manage`}>← 団体管理へ戻る</Link>
      </header>

      <section className="operations-overview" aria-label="今月の利用人数と料金">
        <div>
          <span>対象月</span>
          <strong>{dashboard.current.month}</strong>
        </div>
        <div>
          <span>今月の利用人数</span>
          <strong>
            {dashboard.current.mau} / {dashboard.current.pricing.upperLimit ?? '見積'}人
          </strong>
        </div>
        <div>
          <span>現在の月額</span>
          <strong>{yen(dashboard.current.pricing.priceYen)}</strong>
        </div>
        <div>
          <span>次の料金帯まで</span>
          <strong>
            {dashboard.current.pricing.remainingToNextTier === null
              ? 'お問い合わせください'
              : `あと${dashboard.current.pricing.remainingToNextTier}人`}
          </strong>
        </div>
      </section>

      <section className="settings-card">
        <h2>利用人数の数え方</h2>
        <p>
          投稿案の確認・生成・再生成・採用、今日やることや週間計画の確認など、対象機能を使った参加者を月内で1人として数えます。
        </p>
        <p>登録やログインだけの人、運営者・スタッフ・システム管理者は含みません。</p>
      </section>

      <section className="settings-card">
        <h2>契約・請求状況</h2>
        {!billing.organizationCommercialContract ? (
          <p>契約情報は準備中です。請求に関する確認はワタシワークス運営へお問い合わせください。</p>
        ) : (
          <>
            <p>
              契約状態：
              {
                { DRAFT: '準備中', ACTIVE: '契約中', SUSPENDED: '一時停止', ENDED: '終了' }[
                  billing.organizationCommercialContract.status
                ]
              }
            </p>
            <p>請求先：{billing.organizationCommercialContract.billingName}</p>
          </>
        )}
        {billing.tenantInvoices.filter((invoice) => invoice.status !== 'DRAFT').length === 0 ? (
          <p>請求記録はまだありません。</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>対象月</th>
                  <th>金額</th>
                  <th>状態</th>
                  <th>支払期限</th>
                </tr>
              </thead>
              <tbody>
                {billing.tenantInvoices
                  .filter((invoice) => invoice.status !== 'DRAFT')
                  .map((invoice) => (
                    <tr key={invoice.id}>
                      <td>{invoice.periodStart.toISOString().slice(0, 7)}</td>
                      <td>{yen(invoice.amountYen)}</td>
                      <td>{invoiceStatusLabel(invoice.status, invoice.dueAt)}</td>
                      <td>
                        {invoice.dueAt?.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) ??
                          '未発行'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="settings-card">
        <h2>月ごとの確定履歴</h2>
        {dashboard.history.length === 0 ? (
          <p>確定済みの月はまだありません。</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>対象月</th>
                  <th>利用人数</th>
                  <th>確定料金</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.history.map((row) => (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    <td>{row.mau.toLocaleString('ja-JP')}人</td>
                    <td>{yen(row.priceYen)}</td>
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
