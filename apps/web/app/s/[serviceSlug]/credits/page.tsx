import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import {
  serviceCreditAmountLabel,
  serviceCreditLedgerSummary,
} from '../../../../src/services/service-credit-balance';
import { resolvePublicServiceContext } from '../../../../src/services/public-service';
import { PublicShell } from '../../../ui/public-shell';

export const dynamic = 'force-dynamic';

export default async function ServiceCreditsPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const service = await resolvePublicServiceContext(serviceSlug).catch(() => null);
  if (!service) notFound();
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor)
    redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/credits`)}` as Route);
  const db = await import('@bunshin/database');
  const membership = await db.prisma.groupMembership.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      userId: actor.userId,
      status: 'ACTIVE',
      group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
    },
    select: { id: true },
  });
  if (!membership) redirect(`/s/${serviceSlug}` as Route);
  const account = await db.prisma.serviceCreditAccount.findFirst({
    where: {
      workspaceId: service.workspaceId,
      groupId: service.serviceId,
      groupMembershipId: membership.id,
      userId: actor.userId,
    },
    select: {
      availableCredits: true,
      ledgerEntries: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          type: true,
          sourceType: true,
          amount: true,
          balanceAfter: true,
          expiresAt: true,
          createdAt: true,
        },
      },
    },
  });
  const credits = account?.availableCredits ?? 0;
  const ledger = account?.ledgerEntries ?? [];
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">画像作成回数</p>
          <h1>使える画像作成回数</h1>
          <p>
            このサービスで画像を作る時に使える回数です。ほかのサービスの回数とは別に管理されます。
          </p>
        </header>
        <section className="settings-card">
          <p>今使える回数</p>
          <p style={{ fontSize: '2rem', fontWeight: 700 }}>{credits}回</p>
          <p>紹介特典などで増えます。画像を作る機能に使えるようになるまで、回数は減りません。</p>
          <Link className="button button--primary" href={`/s/${serviceSlug}/images` as Route}>
            投稿に使う画像を作る
          </Link>
        </section>
        <section className="settings-card">
          <h2>回数の履歴</h2>
          {ledger.length === 0 ? (
            <p>まだ画像作成回数の履歴はありません。</p>
          ) : (
            <div className="service-activity-list">
              {ledger.map((entry) => (
                <article className="activity-progress" key={entry.id}>
                  <div className="activity-progress__summary">
                    <div>
                      <h3>{serviceCreditLedgerSummary(entry)}</h3>
                      <small>{entry.createdAt.toLocaleString('ja-JP')}</small>
                    </div>
                    <strong>{serviceCreditAmountLabel(entry)}</strong>
                  </div>
                  <p>この記録の後：{entry.balanceAfter}回</p>
                  {entry.expiresAt && entry.type === 'GRANT' && (
                    <small>使える期限：{entry.expiresAt.toLocaleDateString('ja-JP')}</small>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
        <Link href={`/s/${serviceSlug}/home` as Route}>サービスホームへ戻る</Link>
      </main>
    </PublicShell>
  );
}
