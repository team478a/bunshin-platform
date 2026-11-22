import type { Route } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  serviceCreditAmountLabel,
  serviceCreditLedgerSummary,
} from '../../../../src/services/service-credit-balance';
import { resolveAuthenticatedMemberServicePage } from '../../../../src/services/member-service-page';
import { isPromptOnlyImageService } from '../../../../src/services/service-image-policy';
import { PublicShell } from '../../../ui/public-shell';

export const dynamic = 'force-dynamic';

export default async function ServiceCreditsPage({
  params,
}: {
  params: Promise<{ serviceSlug: string }>;
}) {
  const { serviceSlug } = await params;
  const { actor, service } = await resolveAuthenticatedMemberServicePage(
    serviceSlug,
    `/s/${serviceSlug}/credits`,
  );
  if (isPromptOnlyImageService(service.configuration.slug)) {
    redirect(`/s/${service.configuration.slug}/home` as Route);
  }
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
          idempotencyKey: true,
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
  const accountScope = {
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    groupMembershipId: membership.id,
    userId: actor.userId,
  };
  const fortune = await db.prisma.fortuneServiceSetting.findFirst({
    where: { workspaceId: service.workspaceId, groupId: service.serviceId },
    select: {
      creditDisplayName: true,
      followUpCreditEnabled: true,
      followUpCreditCost: true,
      followUpCreditLimit: true,
    },
  });
  const name = fortune?.creditDisplayName ?? db.FORTUNE_FOLLOW_UP_CREDIT_NAME;
  const credits = fortune
    ? (await db.readFortuneFollowUpCreditBalance(db.prisma, accountScope, new Date())).available
    : (account?.availableCredits ?? 0);
  const ledger = account?.ledgerEntries ?? [];
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          {!fortune && <p className="eyebrow">画像作成回数</p>}
          <h1>{fortune ? name : '使える画像作成回数'}</h1>
          <p>
            {fortune
              ? 'この占いサービス内で使える紹介特典などの残高と履歴です。'
              : 'このサービスで画像を作る時に使える回数です。ほかのサービスの回数とは別に管理されます。'}
          </p>
        </header>
        <section className="settings-card">
          <p>{fortune ? '利用可能残高' : '今使える回数'}</p>
          <p style={{ fontSize: '2rem', fontWeight: 700 }}>{fortune ? credits : `${credits}回`}</p>
          {fortune ? (
            <>
              <p>
                {fortune.followUpCreditEnabled
                  ? `追加質問1回に${fortune.followUpCreditCost}使えます。1鑑定あたり${fortune.followUpCreditLimit}回まで交換できます。`
                  : '現在、追加質問のクレジット交換は停止しています。'}
              </p>
              <p>
                回答を保存したときに消費します。確保中と期限切れの分は、利用可能残高から差し引いて表示します。
              </p>
              <p>
                <Link href={`/s/${serviceSlug}/terms` as Route}>サービス利用規約</Link>
              </p>
              <Link className="button button--primary" href={`/s/${serviceSlug}/history` as Route}>
                過去の鑑定を開く
              </Link>
            </>
          ) : (
            <>
              <p>
                紹介特典などで増えます。画像を作る機能に使えるようになるまで、回数は減りません。
              </p>
              <Link className="button button--primary" href={`/s/${serviceSlug}/images` as Route}>
                投稿に使う画像を作る
              </Link>
            </>
          )}
        </section>
        <section className="settings-card">
          <h2>{fortune ? 'クレジットの履歴' : '回数の履歴'}</h2>
          {ledger.length === 0 ? (
            <p>
              {fortune
                ? 'クレジットの履歴はまだありません。'
                : 'まだ画像作成回数の履歴はありません。'}
            </p>
          ) : (
            <div className="service-activity-list">
              {ledger.map((entry) => (
                <article className="activity-progress" key={entry.id}>
                  <div className="activity-progress__summary">
                    <div>
                      <h3>
                        {serviceCreditLedgerSummary(
                          entry,
                          fortune ? 'fortune' : undefined,
                          entry.idempotencyKey.startsWith(db.FORTUNE_FOLLOW_UP_CREDIT_KEY),
                        )}
                      </h3>
                      <small>{entry.createdAt.toLocaleString('ja-JP')}</small>
                    </div>
                    <strong>
                      {fortune
                        ? `${entry.amount > 0 ? '+' : ''}${entry.amount}`
                        : serviceCreditAmountLabel(entry)}
                    </strong>
                  </div>
                  <p>この記録の後：{fortune ? entry.balanceAfter : `${entry.balanceAfter}回`}</p>
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
