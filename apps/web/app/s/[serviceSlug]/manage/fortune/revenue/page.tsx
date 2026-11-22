import type { Route } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@bunshin/database';
import { ApplicationError } from '@bunshin/shared';
import { z, ZodError } from 'zod';
import { currentUserProvider } from '../../../../../../src/auth/current-user';
import { fortuneOperatorScope } from '../../../../../../src/fortune/operator-scope';
import {
  currentRevenueMonth,
  fortuneRevenue,
  revenueMonth,
  saveAdvertisingSpend,
  saveVerifiedStripeFee,
} from '../../../../../../src/fortune/revenue';
import { PublicShell } from '../../../../../ui/public-shell';

export const dynamic = 'force-dynamic';
const yen = (amount: number | null) =>
  amount === null ? '未取得' : `${Math.round(amount).toLocaleString('ja-JP')}円`;
const percentage = (value: number | null) =>
  value === null ? '集計対象なし' : `${(value * 100).toFixed(1)}%`;

const funnel = {
  LP_VISIT: 'LP訪問',
  REGISTRATION: 'サービス登録',
  FREE_START: '無料占い開始',
  FREE_COMPLETE: '無料占い完了',
  PAID_OFFER: '有料鑑定の案内表示',
  PRODUCT_DETAIL: '商品詳細の閲覧',
  PURCHASE_CLICK: '購入ボタンクリック',
  CHECKOUT: 'Checkout開始',
  PAID: '決済成功',
  FAILED_OR_EXPIRED: '決済失敗・期限切れ',
  DELIVERED: '有料鑑定提供',
  RATING: '鑑定評価',
  REVISIT: '再訪',
  REPEAT: '追加購入',
  REFUND: '返金',
} as const;

async function resolveScope(serviceSlug: string, path: string) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(path)}`);
  const service = await fortuneOperatorScope(serviceSlug, actor.userId);
  return { workspaceId: service.workspaceId, groupId: service.serviceId };
}

export default async function FortuneRevenuePage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{ month?: string; fx?: string; mode?: string; result?: string }>;
}) {
  const { serviceSlug } = await params;
  const query = await searchParams;
  const path = `/s/${serviceSlug}/manage/fortune/revenue`;

  const scope = await resolveScope(serviceSlug, path);
  const month = revenueMonth.safeParse(query.month).data ?? currentRevenueMonth();
  const fx = z.coerce.number().positive().max(10_000).safeParse(query.fx).data ?? null;
  const liveMode = query.mode !== 'test';
  const data = await fortuneRevenue(prisma, scope, { month, fx, liveMode });

  async function save(form: FormData) {
    'use server';
    const scope = await resolveScope(serviceSlug, path);
    const result = new URLSearchParams({ month, mode: liveMode ? 'live' : 'test' });
    if (fx !== null) result.set('fx', String(fx));
    try {
      const amountYen = form.get('amountYen');
      if (form.get('kind') === 'fee') {
        await saveVerifiedStripeFee(prisma, scope, {
          purchaseId: form.get('purchaseId'),
          amountYen,
        });
      } else {
        await saveAdvertisingSpend(prisma, scope, {
          month,
          channel: form.get('channel'),
          amountYen,
        });
      }
      result.set('result', 'saved');
    } catch (error) {
      if (!(error instanceof ZodError || error instanceof ApplicationError)) throw error;
      result.set('result', 'invalid');
    }
    redirect(`${path}?${result}` as Route);
  }

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <h1>占い収益分析</h1>
          <Link href={`/s/${serviceSlug}/manage/fortune` as Route}>占い管理へ戻る</Link>
        </header>
        <form className="settings-card" method="get">
          <label className="form-field">
            集計月（日本時間）
            <input type="month" name="month" defaultValue={month} required />
          </label>
          <label className="form-field">
            決済環境
            <select name="mode" defaultValue={liveMode ? 'live' : 'test'}>
              <option value="live">本番</option>
              <option value="test">Stripe テスト</option>
            </select>
          </label>
          <label className="form-field">
            参考換算レート（円／米ドル、任意）
            <input
              type="number"
              name="fx"
              min="0.01"
              max="10000"
              step="0.01"
              defaultValue={fx ?? undefined}
            />
          </label>
          <button className="button button--primary" type="submit">
            集計する
          </button>
        </form>
        <section className="settings-card">
          <h2>売上と採算</h2>
          <dl>
            <dt>売上高（決済確認額）</dt>
            <dd>{yen(data.total.gross)}</dd>
            <dt>有料購入者数</dt>
            <dd>{data.buyerCount}人</dd>
            <dt>初回購入率（当月の登録者のうち当月初回購入）</dt>
            <dd>{percentage(data.firstPurchaseRate)}</dd>
            <dt>再購入率（当月の購入者のうち過去の購入がある人）</dt>
            <dd>{percentage(data.repeatPurchaseRate)}</dd>
            <dt>無料から有料への転換率（当月の無料完了者のうち当月購入）</dt>
            <dd>{percentage(data.freeConversion)}</dd>
            <dt>当月の返金</dt>
            <dd>
              {data.refundCount}件・{yen(data.refundYen)}
            </dd>
            <dt>決済手数料（Stripe の実測入力）</dt>
            <dd>{yen(data.total.fees)}</dd>
            <dt>AI利用原価（使用量による推定）</dt>
            <dd>
              {data.total.allAiKnown || data.total.knownAi > 0
                ? `${data.total.knownAi.toFixed(4)} USD${data.total.allAiKnown ? '' : '（一部未取得）'}`
                : '未取得'}
            </dd>
            <dt>広告費（チャネル別の実績入力）</dt>
            <dd>{yen(data.adTotal)}</dd>
            <dt>顧客獲得費（CAC）</dt>
            <dd>{yen(data.cac)}</dd>
            <dt>1購入あたりの限界利益（推定）</dt>
            <dd>{yen(data.contributionPerOrder)}</dd>
          </dl>
          <p>
            限界利益は購入額から返金・決済手数料・AI原価を差し引きます。広告費は集客側で表示します。
          </p>
        </section>
        <section className="settings-card">
          <h2>商品別売上</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>商品</th>
                  <th>購入時の価格</th>
                  <th>件数</th>
                  <th>売上</th>
                  <th>限界利益（推定）</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((item) => (
                  <tr key={`${item.name}-${item.price}`}>
                    <td>{item.name}</td>
                    <td>{yen(item.price)}</td>
                    <td>{item.count}</td>
                    <td>{yen(item.gross)}</td>
                    <td>{yen(item.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="settings-card">
          <h2>集客チャネル別の収益</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>チャネル</th>
                  <th>LP訪問</th>
                  <th>初回購入者</th>
                  <th>初回購入／LP訪問</th>
                  <th>売上</th>
                  <th>広告費</th>
                  <th>CAC</th>
                  <th>広告費控除後（推定）</th>
                </tr>
              </thead>
              <tbody>
                {data.channels.map((item) => (
                  <tr key={item.channel}>
                    <td>{item.channel}</td>
                    <td>{item.visitsCount}</td>
                    <td>{item.acquired}</td>
                    <td>{percentage(item.acquisitionRate)}</td>
                    <td>{yen(item.gross)}</td>
                    <td>{yen(item.advertisingCost)}</td>
                    <td>{yen(item.cac)}</td>
                    <td>
                      {yen(
                        item.margin === null || item.advertisingCost === null
                          ? null
                          : item.margin - item.advertisingCost,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>LP訪問と初回購入は当月の件数比です。訪問と購入が別月に発生する場合があります。</p>
        </section>
        <section className="settings-card">
          <h2>顧客別の累計（集計月末まで）</h2>
          <dl>
            <dt>平均購入回数</dt>
            <dd>{data.purchasesPerCustomer?.toFixed(2) ?? '集計対象なし'}</dd>
            <dt>観測LTV（返金後の累計売上の顧客平均）</dt>
            <dd>{yen(data.observedLtvRevenue)}</dd>
            <dt>観測LTV（累計限界利益の顧客平均、推定原価を使用）</dt>
            <dd>{yen(data.observedLtvMargin)}</dd>
            <dt>将来LTVの推計</dt>
            <dd>未算出</dd>
          </dl>
        </section>
        <section className="settings-card">
          <h2>販売ファネル</h2>
          <dl>
            {Object.entries(funnel).map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{data.funnel[key] ?? 0}件</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="settings-card">
          <h2>広告費と決済手数料の入力</h2>
          {query.result === 'saved' && <p role="status">実績を保存しました。</p>}
          {query.result === 'invalid' && <p role="alert">対象と金額を確認してください。</p>}
          <form action={save} className="app-form">
            <input type="hidden" name="kind" value="advertising" />
            <label className="form-field">
              集計月のチャネル（UTM source と同じ値）
              <input name="channel" maxLength={64} required />
            </label>
            <label className="form-field">
              広告費（円）
              <input name="amountYen" type="number" min={0} required />
            </label>
            <button className="button button--secondary" type="submit">
              広告費を保存
            </button>
          </form>
          <form action={save} className="app-form">
            <input type="hidden" name="kind" value="fee" />
            <label className="form-field">
              購入ID
              <input name="purchaseId" required />
            </label>
            <label className="form-field">
              Stripeで確認した手数料（円）
              <input name="amountYen" type="number" min={0} required />
            </label>
            <button className="button button--secondary" type="submit">
              手数料を保存
            </button>
          </form>
        </section>
      </main>
    </PublicShell>
  );
}
