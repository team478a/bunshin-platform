import type { Route } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@bunshin/database';
import { ApplicationError } from '@bunshin/shared';
import {
  availableFortuneProduct,
  fortunePurchaseHistory,
  startFortuneCheckout,
} from '../../../../src/fortune/commerce';
import { resolveFortunePage } from '../../../../src/fortune/page-context';
import { PublicShell } from '../../../ui/public-shell';

export const dynamic = 'force-dynamic';

const statusLabels = {
  PENDING: '決済確認待ち',
  PAID: '支払い確認済み',
  EXPIRED: '決済期限切れ',
  REFUNDED: '全額返金済み',
};

export default async function FortunePurchasePage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{ purchase?: string; result?: string }>;
}) {
  const { serviceSlug } = await params;
  const path = `/s/${serviceSlug}/fortune-purchase` as const;
  const today = `/s/${serviceSlug}/today` as const;
  const { actor, service } = await resolveFortunePage(serviceSlug, path);
  const scope = { workspaceId: service.workspaceId, groupId: service.serviceId };
  const [target, history, result] = await Promise.all([
    availableFortuneProduct(prisma, scope, actor.userId),
    fortunePurchaseHistory(prisma, scope, actor.userId),
    searchParams,
  ]);
  const selected = history.find(({ id }) => id === result.purchase);
  const available = history.some(({ status, deliveredAt }) => status === 'PAID' && !deliveredAt);
  const purchaseId = randomUUID();

  async function start(form: FormData) {
    'use server';
    const { actor, service } = await resolveFortunePage(serviceSlug, path);
    const revision = z.string().uuid().safeParse(form.get('revision'));
    if (!revision.success) redirect(`${path}?result=changed` as Route);
    let url: Awaited<ReturnType<typeof startFortuneCheckout>>;
    try {
      url = await startFortuneCheckout(
        prisma,
        {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          buyerUserId: actor.userId,
          serviceSlug,
        },
        { revision: revision.data, purchaseId },
      );
    } catch (error) {
      if (!(error instanceof ApplicationError)) throw error;
      redirect(`${path}?result=checkout-error` as Route);
    }
    redirect(url);
  }

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page fortune-page">
        <header className="app-page__heading">
          <h1>深層鑑定の購入</h1>
        </header>
        {result.result === 'cancel' && selected?.status === 'PENDING' && (
          <p role="status">お支払い画面から戻りました。購入手続きはここから再開できます。</p>
        )}
        {result.result === 'return' && selected?.status === 'PENDING' && (
          <p role="status">決済を確認しています。少し待ってからこのページを更新してください。</p>
        )}
        {result.result === 'checkout-error' && (
          <p role="alert">
            お支払いを開始できませんでした。購入履歴と最新の販売条件をご確認ください。
          </p>
        )}
        {result.result === 'changed' && <p role="alert">最新の販売条件をご確認ください。</p>}
        {available ? (
          <section className="settings-card">
            <h2>利用できる鑑定があります</h2>
            <Link className="button button--primary" href={`${today}?paid=1` as Route}>
              深層鑑定に進む
            </Link>
          </section>
        ) : target ? (
          <section className="settings-card">
            <h2>{target.product.name}</h2>
            <p>{target.product.description}</p>
            <dl>
              <dt>お支払い総額</dt>
              <dd>{target.product.amountYen.toLocaleString('ja-JP')}円（税込）</dd>
              <dt>提供回数</dt>
              <dd>鑑定1回・追加質問{target.product.followUpLimit}回</dd>
              <dt>支払方法・時期</dt>
              <dd>クレジットカード・申込時に一括決済</dd>
              <dt>提供時期</dt>
              <dd>{target.product.deliveryTerms}</dd>
              <dt>キャンセル・返金条件</dt>
              <dd>{target.product.refundTerms}</dd>
            </dl>
            <ul>
              <li>
                <Link href={`/s/${serviceSlug}/terms` as Route}>利用規約</Link>
              </li>
              <li>
                <Link href={`/s/${serviceSlug}/privacy` as Route}>プライバシーポリシー</Link>
              </li>
              <li>
                <Link href={`/s/${serviceSlug}/commerce` as Route}>特定商取引法に基づく表記</Link>
              </li>
            </ul>
            <form action={start}>
              <input type="hidden" name="revision" value={target.product.revision} />
              <button className="button button--primary" type="submit">
                Stripeでお支払いへ進む
              </button>
            </form>
          </section>
        ) : (
          <p>現在、鑑定の購入は受け付けていません。</p>
        )}
        <section className="settings-card">
          <h2>購入・利用履歴</h2>
          {history.length === 0 ? (
            <p>購入履歴はありません。</p>
          ) : (
            <ul>
              {history.map((item) => (
                <li key={item.id}>
                  <strong>{item.productName}</strong> {item.amountYen.toLocaleString('ja-JP')}円・
                  {item.status === 'PENDING' && item.paymentFailedAt
                    ? '決済失敗・再試行できます'
                    : statusLabels[item.status]}
                  {item.deliveredAt ? '・鑑定提供済み' : ''}
                  {item.refundedAmountYen > 0
                    ? `・返金 ${item.refundedAmountYen.toLocaleString('ja-JP')}円`
                    : ''}
                  <details>
                    <summary>購入時の提供条件</summary>
                    <p>{item.description}</p>
                    <p>{item.deliveryTerms}</p>
                    <p>{item.refundTerms}</p>
                    <p>追加質問{item.followUpLimit}回</p>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
        <Link href={today}>今日の占いに戻る</Link>
      </main>
    </PublicShell>
  );
}
