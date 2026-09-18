import Link from 'next/link';
import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { getServerEnvironment } from '@bunshin/config';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import {
  AesGcmPaymentSecretCrypto,
  currentPaymentEnvironment,
  StripeAccountConnectionTestAdapter,
} from '../../../../../src/payments/secure-configuration';
import {
  paymentDate,
  paymentOperationsMessage,
  purchaseStatusLabel,
  yen,
} from '../../../../../src/payments/payment-operations';

export const dynamic = 'force-dynamic';

const saveSchema = z.object({
  workspaceId: z.uuid(),
  secretKey: z.string().trim().max(2000).optional(),
  webhookSecret: z.string().trim().max(2000).optional(),
  reason: z.string().trim().min(3).max(500),
});
const actionSchema = z.object({ workspaceId: z.uuid(), reason: z.string().trim().min(3).max(500) });

async function requirePaymentManager(workspaceId: string, userId: string) {
  const db = await import('@bunshin/database');
  const [workspace, platformAdmin, membership] = await Promise.all([
    db.prisma.workspace.findFirst({
      where: { id: workspaceId, type: 'ORGANIZATION', status: 'ACTIVE' },
      select: { id: true, name: true },
    }),
    new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(userId),
    db.prisma.workspaceMembership.findFirst({
      where: { workspaceId, userId, role: { in: ['OWNER', 'ADMIN'] }, status: 'ACTIVE' },
      select: { id: true },
    }),
  ]);
  if (!workspace || (!platformAdmin && !membership)) notFound();
  return { db, workspace };
}

async function actor() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

function paymentPath(workspaceId: string, result?: string): Route {
  return `/organizations/${workspaceId}/payment${result ? `?result=${result}` : ''}` as Route;
}

async function saveConfiguration(formData: FormData) {
  'use server';
  const user = await actor();
  const parsed = saveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/organizations?error=invalid-payment-setting');
  const { db } = await requirePaymentManager(parsed.data.workspaceId, user.userId);
  const environment = currentPaymentEnvironment();
  const current = await db.prisma.organizationPaymentConfiguration.findUnique({
    where: {
      workspaceId_environment_provider: {
        workspaceId: parsed.data.workspaceId,
        environment,
        provider: 'STRIPE',
      },
    },
  });
  const secretKey = parsed.data.secretKey || null;
  const webhookSecret = parsed.data.webhookSecret || null;
  if (!current && !secretKey)
    redirect(paymentPath(parsed.data.workspaceId, 'credentials-required'));
  if (secretKey && !/^sk_(test|live)_[A-Za-z0-9]+$/.test(secretKey))
    redirect(paymentPath(parsed.data.workspaceId, 'invalid-secret-key'));
  if (webhookSecret && !/^whsec_[A-Za-z0-9]+$/.test(webhookSecret))
    redirect(paymentPath(parsed.data.workspaceId, 'invalid-webhook-secret'));

  const crypto = new AesGcmPaymentSecretCrypto();
  const encryptedSecret = secretKey ? crypto.encrypt(secretKey) : null;
  const encryptedWebhook = webhookSecret ? crypto.encrypt(webhookSecret) : null;
  await db.prisma.$transaction(async (tx) => {
    const configuration = current
      ? await tx.organizationPaymentConfiguration.update({
          where: { id: current.id },
          data: {
            ...(encryptedSecret
              ? {
                  encryptedSecretKey: encryptedSecret.encryptedValue,
                  secretKeyMask: encryptedSecret.mask,
                  keyVersion: encryptedSecret.keyVersion,
                }
              : {}),
            ...(encryptedWebhook
              ? {
                  encryptedWebhookSecret: encryptedWebhook.encryptedValue,
                  webhookSecretMask: encryptedWebhook.mask,
                  keyVersion: encryptedWebhook.keyVersion,
                }
              : {}),
            status: 'DRAFT',
            accountReference: null,
            lastVerifiedAt: null,
            lastErrorCategory: null,
            updatedByUserId: user.userId,
          },
        })
      : await tx.organizationPaymentConfiguration.create({
          data: {
            workspaceId: parsed.data.workspaceId,
            environment,
            provider: 'STRIPE',
            encryptedSecretKey: encryptedSecret!.encryptedValue,
            secretKeyMask: encryptedSecret!.mask,
            encryptedWebhookSecret: encryptedWebhook?.encryptedValue ?? null,
            webhookSecretMask: encryptedWebhook?.mask ?? null,
            keyVersion: encryptedSecret!.keyVersion,
            updatedByUserId: user.userId,
          },
        });
    await tx.organizationPaymentConfigurationAudit.create({
      data: {
        workspaceId: parsed.data.workspaceId,
        configurationId: configuration.id,
        actorUserId: user.userId,
        action: current ? 'UPDATE_CREDENTIALS' : 'CREATE',
        reason: parsed.data.reason,
        changedFields: [
          ...(encryptedSecret ? ['secretKey'] : []),
          ...(encryptedWebhook ? ['webhookSecret'] : []),
          'status',
        ],
      },
    });
  });
  revalidatePath(paymentPath(parsed.data.workspaceId));
  redirect(paymentPath(parsed.data.workspaceId, 'saved'));
}

async function testConnection(formData: FormData) {
  'use server';
  const user = await actor();
  const parsed = actionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/organizations?error=invalid-payment-action');
  const { db } = await requirePaymentManager(parsed.data.workspaceId, user.userId);
  const configuration = await db.prisma.organizationPaymentConfiguration.findUnique({
    where: {
      workspaceId_environment_provider: {
        workspaceId: parsed.data.workspaceId,
        environment: currentPaymentEnvironment(),
        provider: 'STRIPE',
      },
    },
  });
  if (!configuration) notFound();
  const secretKey = new AesGcmPaymentSecretCrypto().decrypt(configuration.encryptedSecretKey);
  const result = await new StripeAccountConnectionTestAdapter().validate(secretKey);
  await db.prisma.$transaction([
    db.prisma.organizationPaymentConfiguration.update({
      where: { id: configuration.id },
      data: {
        status: result.success ? 'VERIFIED' : 'ERROR',
        accountReference: result.accountReference,
        lastVerifiedAt: new Date(),
        lastErrorCategory: result.errorCategory,
        updatedByUserId: user.userId,
      },
    }),
    db.prisma.organizationPaymentConfigurationAudit.create({
      data: {
        workspaceId: parsed.data.workspaceId,
        configurationId: configuration.id,
        actorUserId: user.userId,
        action: 'CONNECTION_TEST',
        reason: parsed.data.reason,
        changedFields: ['status', 'accountReference', 'lastVerifiedAt', 'lastErrorCategory'],
      },
    }),
  ]);
  revalidatePath(paymentPath(parsed.data.workspaceId));
  redirect(
    paymentPath(parsed.data.workspaceId, result.success ? 'verified' : 'verification-failed'),
  );
}

async function setActive(formData: FormData) {
  'use server';
  const user = await actor();
  const parsed = actionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/organizations?error=invalid-payment-action');
  const { db } = await requirePaymentManager(parsed.data.workspaceId, user.userId);
  const configuration = await db.prisma.organizationPaymentConfiguration.findUnique({
    where: {
      workspaceId_environment_provider: {
        workspaceId: parsed.data.workspaceId,
        environment: currentPaymentEnvironment(),
        provider: 'STRIPE',
      },
    },
  });
  if (!configuration) notFound();
  if (
    configuration.status !== 'VERIFIED' ||
    !configuration.lastVerifiedAt ||
    configuration.lastErrorCategory ||
    !configuration.encryptedWebhookSecret
  )
    redirect(
      paymentPath(
        parsed.data.workspaceId,
        configuration.encryptedWebhookSecret ? 'verification-required' : 'webhook-required',
      ),
    );
  await db.prisma.$transaction([
    db.prisma.organizationPaymentConfiguration.update({
      where: { id: configuration.id },
      data: { status: 'ACTIVE', updatedByUserId: user.userId },
    }),
    db.prisma.organizationPaymentConfigurationAudit.create({
      data: {
        workspaceId: parsed.data.workspaceId,
        configurationId: configuration.id,
        actorUserId: user.userId,
        action: 'ACTIVATE',
        reason: parsed.data.reason,
        changedFields: ['status'],
      },
    }),
  ]);
  revalidatePath(paymentPath(parsed.data.workspaceId));
  redirect(paymentPath(parsed.data.workspaceId, 'activated'));
}

async function pauseConfiguration(formData: FormData) {
  'use server';
  const user = await actor();
  const parsed = actionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/organizations?error=invalid-payment-action');
  const { db } = await requirePaymentManager(parsed.data.workspaceId, user.userId);
  const configuration = await db.prisma.organizationPaymentConfiguration.findUnique({
    where: {
      workspaceId_environment_provider: {
        workspaceId: parsed.data.workspaceId,
        environment: currentPaymentEnvironment(),
        provider: 'STRIPE',
      },
    },
  });
  if (!configuration) notFound();
  await db.prisma.$transaction([
    db.prisma.organizationPaymentConfiguration.update({
      where: { id: configuration.id },
      data: { status: 'DISABLED', updatedByUserId: user.userId },
    }),
    db.prisma.organizationPaymentConfigurationAudit.create({
      data: {
        workspaceId: parsed.data.workspaceId,
        configurationId: configuration.id,
        actorUserId: user.userId,
        action: 'DISABLE',
        reason: parsed.data.reason,
        changedFields: ['status'],
      },
    }),
  ]);
  revalidatePath(paymentPath(parsed.data.workspaceId));
  redirect(paymentPath(parsed.data.workspaceId, 'disabled'));
}

const results: Record<string, string> = {
  saved: '設定を下書き保存しました。次に接続確認をしてください。',
  verified: 'Stripeとの接続を確認しました。「決済接続を有効にする」を押すと使用できます。',
  'verification-failed': 'Stripeへ接続できませんでした。秘密鍵を確認して保存し直してください。',
  activated: 'この運営団体の決済設定を有効にしました。',
  disabled: 'この運営団体の決済設定を停止しました。',
  'credentials-required': '最初の登録ではStripeの秘密鍵が必要です。',
  'invalid-secret-key': 'Stripeの秘密鍵（sk_test_ または sk_live_ で始まる値）を入力してください。',
  'invalid-webhook-secret': 'Webhook署名シークレット（whsec_ で始まる値）を入力してください。',
  'verification-required': '接続確認が完了した設定だけ有効にできます。',
  'webhook-required': '決済を有効にする前にWebhook署名シークレットを登録してください。',
};
const statusLabel = {
  DRAFT: '下書き',
  VERIFIED: '接続確認済み',
  ACTIVE: '使用中',
  DISABLED: '停止中',
  ERROR: '接続エラー',
} as const;

export default async function OrganizationPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const user = await actor();
  const workspaceId = z.uuid().safeParse((await params).workspaceId);
  if (!workspaceId.success) notFound();
  const { db, workspace } = await requirePaymentManager(workspaceId.data, user.userId);
  const [
    configuration,
    recentPurchases,
    purchaseCounts,
    paidAmount,
    failedWebhookEvents,
    failedWebhookCount,
  ] = await Promise.all([
    db.prisma.organizationPaymentConfiguration.findUnique({
      where: {
        workspaceId_environment_provider: {
          workspaceId: workspace.id,
          environment: currentPaymentEnvironment(),
          provider: 'STRIPE',
        },
      },
      select: {
        id: true,
        status: true,
        accountReference: true,
        secretKeyMask: true,
        webhookSecretMask: true,
        lastVerifiedAt: true,
        lastErrorCategory: true,
        updatedAt: true,
      },
    }),
    db.prisma.programPurchase.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        groupId: true,
        status: true,
        amountYen: true,
        createdAt: true,
        paidAt: true,
        expiredAt: true,
        refundedAt: true,
        buyer: { select: { displayName: true, email: true } },
      },
    }),
    db.prisma.programPurchase.groupBy({
      by: ['status'],
      where: { workspaceId: workspace.id },
      _count: { _all: true },
    }),
    db.prisma.programPurchase.aggregate({
      where: { workspaceId: workspace.id, paidAt: { not: null } },
      _sum: { amountYen: true },
    }),
    db.prisma.paymentWebhookEvent.findMany({
      where: { workspaceId: workspace.id, status: 'FAILED' },
      orderBy: { receivedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        eventType: true,
        errorCategory: true,
        receivedAt: true,
      },
    }),
    db.prisma.paymentWebhookEvent.count({
      where: { workspaceId: workspace.id, status: 'FAILED' },
    }),
  ]);
  const groupIds = [...new Set(recentPurchases.map((purchase) => purchase.groupId))];
  const groups =
    groupIds.length === 0
      ? []
      : await db.prisma.group.findMany({
          where: { workspaceId: workspace.id, id: { in: groupIds } },
          select: { id: true, name: true },
        });
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const countByStatus = new Map(purchaseCounts.map((row) => [row.status, row._count._all]));
  const waitingPurchaseCount =
    (countByStatus.get('CREATED') ?? 0) + (countByStatus.get('CHECKOUT_OPEN') ?? 0);
  const paidPurchaseCount = countByStatus.get('PAID') ?? 0;
  const refundedPurchaseCount = countByStatus.get('REFUNDED') ?? 0;
  const result = (await searchParams).result;
  const webhookUrl = configuration
    ? new URL(
        `/api/payments/stripe/${configuration.id}/webhook`,
        getServerEnvironment().APP_URL,
      ).toString()
    : null;

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">OEM決済設定</p>
        <h1>{workspace.name}の決済先</h1>
        <p>この団体が販売する有料サービスの売上を受け取るStripeを設定します。</p>
        <Link href={`/organizations/${workspace.id}/manage`}>← 団体管理へ戻る</Link>
      </header>

      {result && results[result] ? (
        <section className="settings-card" role="status">
          <strong>{results[result]}</strong>
        </section>
      ) : null}

      <section className="operations-overview" aria-label="決済設定の状態">
        <div>
          <span>決済サービス</span>
          <strong>Stripe</strong>
        </div>
        <div>
          <span>状態</span>
          <strong>{configuration ? statusLabel[configuration.status] : '未設定'}</strong>
        </div>
        <div>
          <span>Stripeアカウント</span>
          <strong>{configuration?.accountReference ?? '未確認'}</strong>
        </div>
        <div>
          <span>最終接続確認</span>
          <strong>
            {configuration?.lastVerifiedAt?.toLocaleString('ja-JP', {
              timeZone: 'Asia/Tokyo',
            }) ?? '未確認'}
          </strong>
        </div>
      </section>

      <section className="settings-card" aria-labelledby="payment-operations-title">
        <h2 id="payment-operations-title">決済の運用状況</h2>
        <p>{paymentOperationsMessage({ failedWebhookCount, waitingPurchaseCount })}</p>
        <div className="operations-overview" aria-label="売上と購入状況">
          <div>
            <span>決済完了総額（返金前）</span>
            <strong>{yen(paidAmount._sum.amountYen ?? 0)}</strong>
          </div>
          <div>
            <span>入金済み</span>
            <strong>{paidPurchaseCount.toLocaleString('ja-JP')}件</strong>
          </div>
          <div>
            <span>支払い待ち</span>
            <strong>{waitingPurchaseCount.toLocaleString('ja-JP')}件</strong>
          </div>
          <div>
            <span>全額返金</span>
            <strong>{refundedPurchaseCount.toLocaleString('ja-JP')}件</strong>
          </div>
        </div>
      </section>

      <section className="settings-card" aria-labelledby="recent-purchases-title">
        <h2 id="recent-purchases-title">最近の購入</h2>
        {recentPurchases.length === 0 ? (
          <p>購入記録はまだありません。</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>受付日時</th>
                  <th>購入者</th>
                  <th>サービス</th>
                  <th>金額</th>
                  <th>状態</th>
                  <th>状態更新日時</th>
                </tr>
              </thead>
              <tbody>
                {recentPurchases.map((purchase) => (
                  <tr key={purchase.id}>
                    <td>{paymentDate(purchase.createdAt)}</td>
                    <td>
                      {purchase.buyer.displayName}
                      {purchase.buyer.email ? <small>{purchase.buyer.email}</small> : null}
                    </td>
                    <td>{groupNames.get(purchase.groupId) ?? '削除済みのサービス'}</td>
                    <td>{yen(purchase.amountYen)}</td>
                    <td>{purchaseStatusLabel[purchase.status]}</td>
                    <td>
                      {paymentDate(
                        purchase.refundedAt ??
                          purchase.paidAt ??
                          purchase.expiredAt ??
                          purchase.createdAt,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="settings-card" aria-labelledby="failed-webhooks-title">
        <h2 id="failed-webhooks-title">要確認の決済通知</h2>
        {failedWebhookEvents.length === 0 ? (
          <p>処理に失敗した決済通知はありません。</p>
        ) : (
          <>
            <p>
              {failedWebhookCount.toLocaleString('ja-JP')}
              件の失敗記録があります。購入状態とStripeの取引を照合し、解消しない場合はワタシワークス運営へ連絡してください。
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>受信日時</th>
                    <th>通知</th>
                    <th>エラー分類</th>
                  </tr>
                </thead>
                <tbody>
                  {failedWebhookEvents.map((event) => (
                    <tr key={event.id}>
                      <td>{paymentDate(event.receivedAt)}</td>
                      <td>{event.eventType}</td>
                      <td>{event.errorCategory ?? '詳細確認が必要'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="settings-card">
        <h2>設定手順</h2>
        <ol>
          <li>Stripe管理画面でAPIの秘密鍵を確認します。</li>
          <li>下のフォームで保存し、「Stripeとの接続を確認する」を押します。</li>
          <li>接続確認後に「決済接続を有効にする」を押します。</li>
          <li>購入受付を始める前に、次の設定でWebhookを登録します。</li>
        </ol>
        {webhookUrl ? (
          <div className="settings-card__notice">
            <strong>Stripeに登録するWebhook URL</strong>
            <p className="break-all">{webhookUrl}</p>
            <p>
              送信イベントは checkout.session.completed、checkout.session.expired、 charge.refunded
              を選んでください。
            </p>
          </div>
        ) : null}
        <p>カード番号など購入者の決済情報は、この画面には入力しません。</p>
      </section>

      <section className="settings-card">
        <h2>{configuration ? '接続情報を変更する' : '接続情報を登録する'}</h2>
        {configuration ? (
          <p>
            登録済み：秘密鍵 {configuration.secretKeyMask}／Webhook署名{' '}
            {configuration.webhookSecretMask ?? '未登録'}。変更しない欄は空欄のままで構いません。
          </p>
        ) : null}
        <form action={saveConfiguration}>
          <input type="hidden" name="workspaceId" value={workspace.id} />
          <label>
            Stripe秘密鍵
            <input
              name="secretKey"
              type="password"
              autoComplete="new-password"
              required={!configuration}
              placeholder="sk_live_... または sk_test_..."
            />
          </label>
          <label>
            Webhook署名シークレット
            <input
              name="webhookSecret"
              type="password"
              autoComplete="new-password"
              placeholder="whsec_..."
            />
            <small>StripeでWebhook URLを登録した後に表示される whsec_ から始まる値です。</small>
          </label>
          <label>
            変更理由
            <input
              name="reason"
              required
              minLength={3}
              maxLength={500}
              placeholder="例：初回設定"
            />
          </label>
          <button className="button button--primary button--full" type="submit">
            接続情報を保存する
          </button>
        </form>
      </section>

      {configuration ? (
        <section className="settings-card">
          <h2>接続確認と使用状態</h2>
          {configuration.lastErrorCategory ? (
            <p>前回のエラー：{configuration.lastErrorCategory}</p>
          ) : null}
          <form action={testConnection}>
            <input type="hidden" name="workspaceId" value={workspace.id} />
            <input type="hidden" name="reason" value="運営団体管理画面から接続確認" />
            <button className="button button--secondary button--full" type="submit">
              Stripeとの接続を確認する
            </button>
          </form>
          {configuration.status === 'VERIFIED' ? (
            <form action={setActive}>
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <input type="hidden" name="reason" value="接続確認後に決済を有効化" />
              <button className="button button--primary button--full" type="submit">
                決済接続を有効にする
              </button>
            </form>
          ) : null}
          {configuration.status === 'ACTIVE' ? (
            <form action={pauseConfiguration}>
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <input type="hidden" name="reason" value="運営団体管理画面から決済を停止" />
              <button className="button button--danger button--full" type="submit">
                決済を停止する
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      <section className="settings-card">
        <h2>安全な管理</h2>
        <ul>
          <li>秘密鍵とWebhook署名シークレットは暗号化して保存します。</li>
          <li>保存後は値全体を画面へ再表示しません。</li>
          <li>保存・接続確認・有効化・停止は変更者と理由を記録します。</li>
          <li>この団体の所有者・管理者だけが設定できます。</li>
        </ul>
        <p>
          有効化後の購入はStripeの画面で行われ、署名を確認できた入金だけが利用開始に反映されます。全額返金とCheckout期限切れも自動で台帳へ反映します。
        </p>
      </section>
    </main>
  );
}
