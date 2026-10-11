import { dateInBusinessTimezone } from '@bunshin/application';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

const productKey = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z][A-Z0-9_]{1,39}$/));
const capabilityKey = z.string().regex(/^[A-Z][A-Z0-9_]{1,79}$/);

function capabilities(value: FormDataEntryValue | null) {
  return z
    .array(capabilityKey)
    .max(20)
    .parse(
      z
        .string()
        .parse(value)
        .split(/[\s,、]+/)
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean),
    );
}

function policyDate(value: FormDataEntryValue | null) {
  const date = z.string().date().parse(value);
  return new Date(`${date}T00:00:00.000Z`);
}

async function authority() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    actor.userId,
  );
  if (admin?.role !== 'SUPER_ADMIN') notFound();
  return { db, actor };
}

async function registerProduct(data: FormData) {
  'use server';
  const { db, actor } = await authority();
  if (data.get('confirmed') !== 'on') throw new Error('明示確認が必要です');
  await new db.PrismaOemBillingAdminService().registerProductPolicy({
    key: productKey.parse(data.get('key')),
    displayName: z.string().trim().min(1).max(120).parse(data.get('displayName')),
    freeOfferingAllowed: data.get('freeOfferingAllowed') === 'on',
    requiredCapabilities: capabilities(data.get('requiredCapabilities')),
    effectiveFrom: policyDate(data.get('effectiveFrom')),
    actorUserId: actor.userId,
    reason: z.string().trim().min(1).max(1000).parse(data.get('reason')),
  });
  redirect('/admin/commercial-billing/products');
}

async function revisePolicy(data: FormData) {
  'use server';
  const { db, actor } = await authority();
  if (data.get('confirmed') !== 'on') throw new Error('明示確認が必要です');
  await new db.PrismaOemBillingAdminService().reviseProductPolicy({
    productId: z.string().uuid().parse(data.get('productId')),
    expectedLatestPolicyId: z.string().uuid().parse(data.get('expectedLatestPolicyId')),
    freeOfferingAllowed: data.get('freeOfferingAllowed') === 'on',
    requiredCapabilities: capabilities(data.get('requiredCapabilities')),
    effectiveFrom: policyDate(data.get('effectiveFrom')),
    actorUserId: actor.userId,
    reason: z.string().trim().min(1).max(1000).parse(data.get('reason')),
  });
  redirect('/admin/commercial-billing/products');
}

async function retireProduct(data: FormData) {
  'use server';
  const { db, actor } = await authority();
  await new db.PrismaOemBillingAdminService().retireProduct({
    productId: z.string().uuid().parse(data.get('productId')),
    expectedLatestPolicyId: z.string().uuid().parse(data.get('expectedLatestPolicyId')),
    expectedUpdatedAt: new Date(z.string().datetime().parse(data.get('expectedUpdatedAt'))),
    actorUserId: actor.userId,
    reason: z.string().trim().min(1).max(1000).parse(data.get('reason')),
    confirmed: data.get('confirmed') === 'on',
  });
  redirect('/admin/commercial-billing/products');
}

function nextPolicyDate(latest: Date, today: string) {
  const next = new Date(latest);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10) > today ? next.toISOString().slice(0, 10) : today;
}

export default async function OemProductPolicyPage() {
  const { db, actor } = await authority();
  const products = await new db.PrismaOemBillingAdminService().listProductPolicies(actor.userId);
  const today = dateInBusinessTimezone(new Date());

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">OEM商用管理</p>
        <h1>Service Productポリシー</h1>
        <p>ワタシワークスの商品、FREE提供可否、必要Capabilityを明示管理します。</p>
        <Link href="/admin/commercial-billing">請求管理へ</Link>
      </header>

      <p className="notice">
        改定は新しい不変バージョンを追加します。既存Offering・確定済み請求・参加者を自動変更しません。廃止は新規割当だけを停止します。
      </p>

      <section className="settings-card">
        <h2>新しいService Productを登録</h2>
        <form action={registerProduct} className="form-stack">
          <label>
            商品キー
            <input name="key" required maxLength={40} pattern="[A-Z][A-Z0-9_]{1,39}" />
          </label>
          <label>
            表示名
            <input name="displayName" required maxLength={120} />
          </label>
          <label>
            適用開始日
            <input name="effectiveFrom" type="date" required min={today} defaultValue={today} />
          </label>
          <label>
            必要Capability（カンマまたは改行区切り）
            <textarea name="requiredCapabilities" maxLength={1600} />
          </label>
          <label>
            <input name="freeOfferingAllowed" type="checkbox" /> FREE提供を許可する
          </label>
          <label>
            登録理由
            <textarea name="reason" required maxLength={1000} />
          </label>
          <label>
            <input name="confirmed" type="checkbox" required />
            商品キー・適用日・FREE可否・必要Capabilityを確認しました
          </label>
          <button className="button">商品を登録</button>
        </form>
      </section>

      {products.map((product) => {
        const latest = product.policyVersions[0]!;
        return (
          <section className="settings-card" key={product.id}>
            <div className="management-section__heading">
              <div>
                <h2>{product.displayName}</h2>
                <p>
                  {product.key}／{product.status === 'ACTIVE' ? '有効' : '廃止済み'}／現在のOffering{' '}
                  {product._count.offeringPeriods}件
                </p>
              </div>
            </div>

            <details>
              <summary>ポリシー履歴（{product.policyVersions.length}件）</summary>
              <ol>
                {product.policyVersions.map((policy) => (
                  <li key={policy.id}>
                    v{policy.version}／{policy.effectiveFrom.toISOString().slice(0, 10)}／FREE
                    {policy.freeOfferingAllowed ? '可' : '不可'}／必要Capability:{' '}
                    {policy.requiredCapabilities.join(', ') || 'なし'}
                    <br />
                    理由: {policy.reason}／操作者: {policy.createdByUserId ?? 'migration'}
                  </li>
                ))}
              </ol>
            </details>

            {product.status === 'ACTIVE' ? (
              <>
                <details>
                  <summary>ポリシーを将来日から改定</summary>
                  <form action={revisePolicy} className="form-stack">
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="expectedLatestPolicyId" value={latest.id} />
                    <label>
                      適用開始日
                      <input
                        name="effectiveFrom"
                        type="date"
                        required
                        min={nextPolicyDate(latest.effectiveFrom, today)}
                        defaultValue={nextPolicyDate(latest.effectiveFrom, today)}
                      />
                    </label>
                    <label>
                      必要Capability
                      <textarea
                        name="requiredCapabilities"
                        maxLength={1600}
                        defaultValue={latest.requiredCapabilities.join(', ')}
                      />
                    </label>
                    <label>
                      <input
                        name="freeOfferingAllowed"
                        type="checkbox"
                        defaultChecked={latest.freeOfferingAllowed}
                      />{' '}
                      FREE提供を許可する
                    </label>
                    <label>
                      改定理由
                      <textarea name="reason" required maxLength={1000} />
                    </label>
                    <label>
                      <input name="confirmed" type="checkbox" required />
                      既存Offeringを自動変更しないことを確認しました
                    </label>
                    <button className="button">不変ポリシー版を追加</button>
                  </form>
                </details>

                <details>
                  <summary>新規割当を停止</summary>
                  <form action={retireProduct} className="form-stack">
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="expectedLatestPolicyId" value={latest.id} />
                    <input
                      type="hidden"
                      name="expectedUpdatedAt"
                      value={product.updatedAt.toISOString()}
                    />
                    <p>
                      現在のOffering {product._count.offeringPeriods}
                      件は終了しません。個別に移行・終了してください。
                    </p>
                    <label>
                      廃止理由
                      <textarea name="reason" required maxLength={1000} />
                    </label>
                    <label>
                      <input name="confirmed" type="checkbox" required />
                      新規割当のみ停止し、既存Offeringと請求履歴を変更しないことを確認しました
                    </label>
                    <button className="button button--secondary">商品を廃止</button>
                  </form>
                </details>
              </>
            ) : (
              <p>
                廃止日時: {product.retiredAt?.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                ／理由: {product.retiredReason}
              </p>
            )}
          </section>
        );
      })}
    </main>
  );
}
