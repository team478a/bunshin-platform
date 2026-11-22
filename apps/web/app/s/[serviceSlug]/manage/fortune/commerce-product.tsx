import type { Route } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@bunshin/database';
import { ZodError } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { fortunePurchaseHistory, updateFortuneProduct } from '../../../../../src/fortune/commerce';
import { fortuneOperatorScope } from '../../../../../src/fortune/operator-scope';

export async function FortuneCommerceProduct({
  serviceSlug,
  actorUserId,
  result,
}: {
  serviceSlug: string;
  actorUserId: string;
  result?: string;
}) {
  const service = await fortuneOperatorScope(serviceSlug, actorUserId);
  const scope = { workspaceId: service.workspaceId, groupId: service.serviceId };
  const [product, history] = await Promise.all([
    prisma.fortuneCommerceProduct.findFirst({ where: scope }),
    fortunePurchaseHistory(prisma, scope),
  ]);
  async function save(form: FormData) {
    'use server';
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) redirect('/login');
    const service = await fortuneOperatorScope(serviceSlug, actor.userId);
    const path = `/s/${serviceSlug}/manage/fortune`;
    try {
      await updateFortuneProduct(
        prisma,
        { workspaceId: service.workspaceId, groupId: service.serviceId },
        {
          name: form.get('name'),
          description: form.get('description'),
          amountYen: form.get('amountYen'),
          deliveryTerms: form.get('deliveryTerms'),
          refundTerms: form.get('refundTerms'),
          followUpLimit: form.get('followUpLimit'),
          enabled: form.get('enabled') === 'on',
        },
      );
    } catch (error) {
      if (!(error instanceof ZodError)) throw error;
      redirect(`${path}?commerce=invalid#fortune-commerce` as Route);
    }
    redirect(`${path}?commerce=saved#fortune-commerce` as Route);
  }

  return (
    <section className="settings-card" id="fortune-commerce">
      <h2>深層鑑定の販売</h2>
      <p>販売条件の変更は次回の購入から適用されます。</p>
      <p>
        売上を受け取るStripeの接続は、運営団体のオーナーまたは管理者が設定できます。
      </p>
      <p>
        <Link href={`/organizations/${service.workspaceId}/payment` as Route}>
          Stripeの決済設定を開く
        </Link>
      </p>
      {result === 'invalid' && <p role="alert">商品名、金額、提供条件を確認してください。</p>}
      {result === 'saved' && <p role="status">販売条件を保存しました。</p>}
      <form action={save} className="app-form">
        <label className="form-field">
          商品名
          <input name="name" maxLength={120} defaultValue={product?.name} required />
        </label>
        <label className="form-field">
          税込価格（円）
          <input
            name="amountYen"
            type="number"
            min={50}
            max={99_999_999}
            defaultValue={product?.amountYen}
            required
          />
        </label>
        <label className="form-field">
          提供内容
          <textarea
            name="description"
            maxLength={1000}
            defaultValue={product?.description}
            required
          />
        </label>
        <label className="form-field">
          提供時期
          <textarea
            name="deliveryTerms"
            maxLength={500}
            defaultValue={product?.deliveryTerms}
            required
          />
        </label>
        <label className="form-field">
          キャンセル・返金条件
          <textarea
            name="refundTerms"
            maxLength={500}
            defaultValue={product?.refundTerms}
            required
          />
        </label>
        <label className="form-field">
          追加質問の上限
          <input
            name="followUpLimit"
            type="number"
            min={0}
            max={2}
            defaultValue={product?.followUpLimit ?? 2}
            required
          />
        </label>
        <label>
          <input name="enabled" type="checkbox" defaultChecked={product?.enabled} />{' '}
          販売を受け付ける
        </label>
        <button className="button button--primary" type="submit">
          販売条件を保存
        </button>
      </form>
      <h3>直近の購入と提供状況</h3>
      {history.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>購入ID</th>
                <th>商品</th>
                <th>日時</th>
                <th>金額</th>
                <th>状況</th>
              </tr>
            </thead>
            <tbody>
              {history.map((purchase) => (
                <tr key={purchase.id}>
                  <td>{purchase.id}</td>
                  <td>
                    {purchase.productName}
                    {!purchase.liveMode ? '（テスト）' : ''}
                  </td>
                  <td>{purchase.createdAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</td>
                  <td>{purchase.amountYen.toLocaleString('ja-JP')}円</td>
                  <td>
                    {purchase.status === 'REFUNDED'
                      ? '全額返金済み'
                      : purchase.status === 'PAID'
                        ? purchase.deliveredAt
                          ? '提供済み'
                          : '未提供'
                        : purchase.status === 'EXPIRED'
                          ? '期限切れ'
                          : purchase.paymentFailedAt
                            ? '決済失敗'
                            : '決済待ち'}
                    {purchase.refundedAmountYen
                      ? `・返金 ${purchase.refundedAmountYen.toLocaleString('ja-JP')}円`
                      : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>購入履歴はありません。</p>
      )}
    </section>
  );
}
