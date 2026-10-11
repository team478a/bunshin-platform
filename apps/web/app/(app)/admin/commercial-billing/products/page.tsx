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

async function migrateOfferingPolicy(data: FormData) {
  'use server';
  const { db, actor } = await authority();
  await new db.PrismaOemBillingAdminService().migrateOfferingProductPolicy({
    workspaceId: z.string().uuid().parse(data.get('workspaceId')),
    offeringId: z.string().uuid().parse(data.get('offeringId')),
    expectedCurrentPolicyVersionId: z
      .string()
      .uuid()
      .parse(data.get('expectedCurrentPolicyVersionId')),
    targetPolicyVersionId: z.string().uuid().parse(data.get('targetPolicyVersionId')),
    actorUserId: actor.userId,
    reason: z.string().trim().min(1).max(1000).parse(data.get('reason')),
    confirmed: data.get('confirmed') === 'on',
  });
  redirect('/admin/commercial-billing/products');
}

function capabilityDiff(current: readonly string[], target: readonly string[]) {
  const added = target.filter((capability) => !current.includes(capability));
  const removed = current.filter((capability) => !target.includes(capability));
  return { added, removed };
}

function nextPolicyDate(latest: Date, today: string) {
  const next = new Date(latest);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10) > today ? next.toISOString().slice(0, 10) : today;
}

const migrationState = z.enum(['ALL', 'NEEDS_MIGRATION', 'CURRENT']).catch('ALL');

export default async function OemProductPolicyPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; product?: string; state?: string }>;
}) {
  const { db, actor } = await authority();
  const service = new db.PrismaOemBillingAdminService();
  const query = await searchParams;
  const searchQuery = z.string().trim().max(120).catch('').parse(query.q);
  const selectedProduct = productKey.optional().catch(undefined).parse(query.product);
  const selectedState = migrationState.parse(query.state);
  const filter = {
    ...(searchQuery ? { query: searchQuery } : {}),
    ...(selectedProduct ? { productKey: selectedProduct } : {}),
  };
  const [products, unfilteredOfferingMigrations, offeringHistory] = await Promise.all([
    service.listProductPolicies(actor.userId),
    service.listOfferingPolicyMigrations(actor.userId, filter),
    service.listOfferingPolicyHistory(actor.userId, filter),
  ]);
  const today = dateInBusinessTimezone(new Date());
  const offeringMigrations = unfilteredOfferingMigrations.filter((offering) => {
    const hasEffectiveNewerVersion = offering.product.policyVersions.some(
      (policy) =>
        offering.product.status === 'ACTIVE' &&
        policy.version > offering.productPolicyVersion.version &&
        policy.effectiveFrom.toISOString().slice(0, 10) <= today,
    );
    if (selectedState === 'NEEDS_MIGRATION') return hasEffectiveNewerVersion;
    if (selectedState === 'CURRENT') return !hasEffectiveNewerVersion;
    return true;
  });
  const currentExportParams = new URLSearchParams({ scope: 'current', state: selectedState });
  const historyExportParams = new URLSearchParams({ scope: 'history' });
  for (const params of [currentExportParams, historyExportParams]) {
    if (searchQuery) params.set('q', searchQuery);
    if (selectedProduct) params.set('product', selectedProduct);
  }

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
        <h2>Offeringを検索・絞り込み</h2>
        <form className="form-stack" method="get">
          <label>
            Organization・Service・商品
            <input name="q" defaultValue={searchQuery} maxLength={120} />
          </label>
          <label>
            Service Product
            <select name="product" defaultValue={selectedProduct ?? ''}>
              <option value="">すべて</option>
              {products.map((product) => (
                <option key={product.id} value={product.key}>
                  {product.displayName}（{product.key}）
                </option>
              ))}
            </select>
          </label>
          <label>
            移行状態
            <select name="state" defaultValue={selectedState}>
              <option value="ALL">すべて</option>
              <option value="NEEDS_MIGRATION">現在適用できる新版あり</option>
              <option value="CURRENT">現時点で移行不要</option>
            </select>
          </label>
          <button type="submit" className="button button--secondary">
            表示を更新
          </button>
        </form>
        <p>現在のOffering: {offeringMigrations.length}件（最大200件）</p>
        <p>
          <a href={`/api/admin/commercial-billing/offering-policies/export?${currentExportParams}`}>
            現在の移行レビュー対象をCSVで保存
          </a>
          {' ／ '}
          <a href={`/api/admin/commercial-billing/offering-policies/export?${historyExportParams}`}>
            期間台帳の履歴をCSVで保存
          </a>
        </p>
        <p>10,000件を超える場合は一部だけを保存せず、検索条件による絞り込みを求めます。</p>
      </section>

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

            <details>
              <summary>既存Offeringへ新版を個別適用</summary>
              {offeringMigrations
                .filter((offering) => offering.productId === product.id)
                .map((offering) => {
                  const targets = offering.product.policyVersions.filter(
                    (policy) => policy.version > offering.productPolicyVersion.version,
                  );
                  return (
                    <article className="settings-card" key={offering.id}>
                      <h3>
                        {offering.group.serviceConfiguration?.displayName ?? offering.group.name}
                      </h3>
                      <p>
                        Organization: {offering.group.workspace.name}／Service:{' '}
                        {offering.group.serviceConfiguration?.slug ?? offering.groupId}
                      </p>
                      <p>
                        現在: v{offering.productPolicyVersion.version}／{offering.classification}
                        ／FREE
                        {offering.productPolicyVersion.freeOfferingAllowed ? '可' : '不可'}
                        ／必要Capability:{' '}
                        {offering.productPolicyVersion.requiredCapabilities.join(', ') || 'なし'}
                      </p>
                      {targets.length === 0 ? (
                        <p>適用できる新版はありません。</p>
                      ) : (
                        targets.map((target) => {
                          const diff = capabilityDiff(
                            offering.productPolicyVersion.requiredCapabilities,
                            target.requiredCapabilities,
                          );
                          const effective = target.effectiveFrom.toISOString().slice(0, 10);
                          const canApply = product.status === 'ACTIVE' && effective <= today;
                          return (
                            <section key={target.id}>
                              <h4>
                                移行先 v{target.version}（{effective}適用）
                              </h4>
                              <p>
                                FREE可否:{' '}
                                {offering.productPolicyVersion.freeOfferingAllowed ? '可' : '不可'}→
                                {target.freeOfferingAllowed ? '可' : '不可'}／追加Capability:{' '}
                                {diff.added.join(', ') || 'なし'}／削除Capability:{' '}
                                {diff.removed.join(', ') || 'なし'}
                              </p>
                              {!canApply ? (
                                <p>適用開始日前、または廃止商品のため、現在は移行できません。</p>
                              ) : (
                                <form action={migrateOfferingPolicy} className="form-stack">
                                  <input
                                    type="hidden"
                                    name="workspaceId"
                                    value={offering.workspaceId}
                                  />
                                  <input type="hidden" name="offeringId" value={offering.id} />
                                  <input
                                    type="hidden"
                                    name="expectedCurrentPolicyVersionId"
                                    value={offering.productPolicyVersionId}
                                  />
                                  <input
                                    type="hidden"
                                    name="targetPolicyVersionId"
                                    value={target.id}
                                  />
                                  <label>
                                    移行理由
                                    <textarea name="reason" required maxLength={1000} />
                                  </label>
                                  <label>
                                    <input name="confirmed" type="checkbox" required />
                                    このOffering 1件だけをv{target.version}
                                    へ移行し、参加者・請求履歴を変更しないことを確認しました
                                  </label>
                                  <button className="button button--secondary">
                                    このOfferingだけを移行
                                  </button>
                                </form>
                              )}
                            </section>
                          );
                        })
                      )}
                    </article>
                  );
                })}
              {offeringMigrations.every((offering) => offering.productId !== product.id) ? (
                <p>現在のOfferingはありません。</p>
              ) : null}
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

      <section className="settings-card">
        <h2>Offering移行履歴</h2>
        <p>
          Organization・Service・商品の検索条件に一致する期間台帳を新しい順に表示します。終了済み期間も変更せず、監査記録として保持します。
        </p>
        {offeringHistory.truncated ? (
          <p className="notice">200件を超えています。検索条件を追加して絞り込んでください。</p>
        ) : null}
        {offeringHistory.entries.length === 0 ? (
          <p>該当する履歴はありません。</p>
        ) : (
          <div className="validation-table-wrap">
            <table className="validation-table">
              <thead>
                <tr>
                  <th>Organization / Service</th>
                  <th>商品・版</th>
                  <th>分類</th>
                  <th>期間</th>
                  <th>操作者・理由</th>
                </tr>
              </thead>
              <tbody>
                {offeringHistory.entries.map((period) => (
                  <tr key={period.id}>
                    <td>
                      {period.group.workspace.name}
                      <br />
                      {period.group.serviceConfiguration?.displayName ?? period.group.name}（
                      {period.group.serviceConfiguration?.slug ?? period.groupId}）
                    </td>
                    <td>
                      {period.product.displayName}（{period.productPolicy}）v
                      {period.productPolicyVersion.version}
                    </td>
                    <td>{period.classification}</td>
                    <td>
                      {period.startsAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                      {' 〜 '}
                      {period.endsAt
                        ? period.endsAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
                        : '現在'}
                    </td>
                    <td>
                      {period.actorDisplayName ?? period.actorUserId}
                      <br />
                      {period.reason}
                    </td>
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
