import Link from 'next/link';
import type { Route } from 'next';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../../src/auth/current-user';
import {
  AesGcmAdminEmailSecretCrypto,
  currentAdminEmailEnvironment,
} from '../../../../../../src/email/secure-admin-email-configuration';
import { CommercialBillingReminderResend } from '../../../../../../src/email/commercial-billing-reminder';

export const dynamic = 'force-dynamic';

const workspaceSchema = z.object({ workspaceId: z.uuid() });
const contractSchema = z.object({
  workspaceId: z.uuid(),
  status: z.enum(['DRAFT', 'ACTIVE', 'SUSPENDED', 'ENDED']),
  billingMode: z.enum(['MANUAL_INVOICE', 'EXTERNAL_BILLING']),
  billingName: z.string().trim().min(1).max(200),
  billingEmail: z.email().max(320),
  paymentTermsDays: z.coerce.number().int().min(0).max(365),
  automaticRemindersEnabled: z
    .string()
    .optional()
    .transform((value) => value === 'on'),
  externalCustomerReference: z.string().trim().max(200).optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
});
const invoiceActionSchema = z.object({
  workspaceId: z.uuid(),
  invoiceId: z.uuid(),
  action: z.enum(['ISSUE', 'MARK_PAID', 'VOID']),
  externalInvoiceReference: z.string().trim().max(200).optional(),
  paymentReference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
});
const customQuoteSchema = z.object({
  workspaceId: z.uuid(),
  monthlyUsageId: z.uuid(),
  amountYen: z.coerce.number().int().positive().max(1_000_000_000),
  notes: z.string().trim().max(1000).optional(),
});
const reminderSchema = z.object({ workspaceId: z.uuid(), invoiceId: z.uuid() });

const EVENT_LABELS: Record<string, string> = {
  POST_VIEW: '投稿案を表示',
  POST_GENERATE: '投稿案を生成',
  POST_REGENERATE: '投稿案を再生成',
  DAILY_MISSION_VIEW: '今日やることを確認',
  WEEKLY_PLAN_VIEW: '週間計画を確認',
  CONTENT_APPROVE: '投稿内容を採用',
};

function yen(value: number | null): string {
  return value === null ? '個別見積' : `${value.toLocaleString('ja-JP')}円`;
}

function optionalDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(`${value}:00+09:00`);
  if (Number.isNaN(date.getTime())) throw new Error('invalid date');
  return date;
}

function dateTimeInput(value: Date | null | undefined): string {
  if (!value) return '';
  const local = new Date(value.getTime() + 9 * 60 * 60 * 1_000);
  return local.toISOString().slice(0, 16);
}

function invoiceStatusLabel(status: 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID', dueAt: Date | null) {
  if (status === 'ISSUED' && dueAt && dueAt < new Date()) return '支払期限超過';
  return { DRAFT: '下書き', ISSUED: '請求済み', PAID: '入金済み', VOID: '取消' }[status];
}

async function requireSuperAdmin() {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    actor.userId,
  );
  if (!admin || admin.role !== 'SUPER_ADMIN') notFound();
  return { actor, db };
}

async function finalizePreviousMonth(formData: FormData) {
  'use server';
  const input = workspaceSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/organizations?error=invalid');
  const { db } = await requireSuperAdmin();
  try {
    await new db.PrismaCommercialUsageService().finalizePreviousMonth(input.data.workspaceId);
    await new db.PrismaCommercialBillingService().prepareWorkspaceInvoices(input.data.workspaceId);
  } catch {
    redirect(`/admin/organizations/${input.data.workspaceId}/commercial?error=finalize`);
  }
  revalidatePath(`/admin/organizations/${input.data.workspaceId}/commercial`);
  redirect(`/admin/organizations/${input.data.workspaceId}/commercial?finalized=1`);
}

async function saveContract(formData: FormData) {
  'use server';
  const input = contractSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/organizations?error=invalid');
  const { actor, db } = await requireSuperAdmin();
  try {
    await new db.PrismaCommercialBillingService().saveContract({
      ...input.data,
      actorUserId: actor.userId,
      externalCustomerReference: input.data.externalCustomerReference || null,
      startsAt: optionalDate(input.data.startsAt),
      endsAt: optionalDate(input.data.endsAt),
    });
  } catch {
    redirect(`/admin/organizations/${input.data.workspaceId}/commercial?error=contract`);
  }
  revalidatePath(`/admin/organizations/${input.data.workspaceId}/commercial`);
  redirect(`/admin/organizations/${input.data.workspaceId}/commercial?contractSaved=1`);
}

async function prepareInvoices(formData: FormData) {
  'use server';
  const input = workspaceSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/organizations?error=invalid');
  const { db } = await requireSuperAdmin();
  await new db.PrismaCommercialBillingService().prepareWorkspaceInvoices(input.data.workspaceId);
  revalidatePath(`/admin/organizations/${input.data.workspaceId}/commercial`);
  redirect(`/admin/organizations/${input.data.workspaceId}/commercial?prepared=1`);
}

async function transitionInvoice(formData: FormData) {
  'use server';
  const input = invoiceActionSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/organizations?error=invalid');
  const { actor, db } = await requireSuperAdmin();
  try {
    await new db.PrismaCommercialBillingService().transitionInvoice({
      workspaceId: input.data.workspaceId,
      invoiceId: input.data.invoiceId,
      action: input.data.action,
      actorUserId: actor.userId,
      externalInvoiceReference: input.data.externalInvoiceReference ?? null,
      paymentReference: input.data.paymentReference ?? null,
      notes: input.data.notes ?? null,
    });
  } catch {
    redirect(`/admin/organizations/${input.data.workspaceId}/commercial?error=invoice`);
  }
  revalidatePath(`/admin/organizations/${input.data.workspaceId}/commercial`);
  redirect(`/admin/organizations/${input.data.workspaceId}/commercial?invoiceUpdated=1`);
}

async function prepareCustomQuoteInvoice(formData: FormData) {
  'use server';
  const input = customQuoteSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/organizations?error=invalid');
  const { actor, db } = await requireSuperAdmin();
  try {
    await new db.PrismaCommercialBillingService().prepareCustomQuoteInvoice({
      ...input.data,
      actorUserId: actor.userId,
      notes: input.data.notes || null,
    });
  } catch {
    redirect(`/admin/organizations/${input.data.workspaceId}/commercial?error=customQuote`);
  }
  revalidatePath(`/admin/organizations/${input.data.workspaceId}/commercial`);
  revalidatePath('/admin/commercial-billing');
  redirect(`/admin/organizations/${input.data.workspaceId}/commercial?customQuoteSaved=1`);
}

async function sendInvoiceReminder(formData: FormData) {
  'use server';
  const input = reminderSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/organizations?error=invalid');
  const { actor, db } = await requireSuperAdmin();
  const returnPath = `/admin/organizations/${input.data.workspaceId}/commercial` as Route;
  const now = new Date();
  const invoice = await db.prisma.tenantInvoice.findFirst({
    where: {
      id: input.data.invoiceId,
      workspaceId: input.data.workspaceId,
      status: 'ISSUED',
      dueAt: { not: null },
    },
    select: {
      id: true,
      invoiceNumber: true,
      amountYen: true,
      dueAt: true,
      checkoutUrl: true,
      checkoutExpiresAt: true,
      contract: { select: { billingName: true, billingEmail: true } },
    },
  });
  if (!invoice?.dueAt) redirect(`${returnPath}?error=reminder-target` as Route);
  const repository = new db.PrismaAdminEmailConfigurationRepository();
  const configuration = await repository.active({ environment: currentAdminEmailEnvironment() });
  if (!configuration) redirect(`${returnPath}?error=reminder-email` as Route);
  const overdue = invoice.dueAt < now;
  const reminderKind = overdue ? 'OVERDUE' : 'INITIAL';
  const localDate = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  try {
    await new CommercialBillingReminderResend().send({
      apiKey: new AesGcmAdminEmailSecretCrypto().decrypt(configuration.encryptedApiKey),
      from: configuration.configuration.fromEmail,
      to: invoice.contract.billingEmail,
      invoiceNumber: invoice.invoiceNumber,
      billingName: invoice.contract.billingName,
      amountYen: invoice.amountYen,
      dueAt: invoice.dueAt,
      checkoutUrl:
        invoice.checkoutUrl && invoice.checkoutExpiresAt && invoice.checkoutExpiresAt > now
          ? invoice.checkoutUrl
          : null,
      overdue,
      idempotencyKey: `commercial-${invoice.id}-${reminderKind}-${localDate}`,
    });
    await db.prisma.commercialBillingAudit.create({
      data: {
        workspaceId: input.data.workspaceId,
        actorUserId: actor.userId,
        entityType: 'INVOICE',
        entityId: invoice.id,
        action: overdue ? 'OVERDUE_REMINDER_SENT' : 'PAYMENT_GUIDANCE_SENT',
        afterData: {
          recipient: invoice.contract.billingEmail,
          reminderKind,
          sentAt: now.toISOString(),
        },
      },
    });
  } catch {
    redirect(`${returnPath}?error=reminder-send` as Route);
  }
  revalidatePath(returnPath);
  redirect(`${returnPath}?reminderSent=1` as Route);
}

export default async function OrganizationCommercialPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{
    finalized?: string;
    error?: string;
    contractSaved?: string;
    prepared?: string;
    invoiceUpdated?: string;
    customQuoteSaved?: string;
    reminderSent?: string;
  }>;
}) {
  const workspaceId = z.uuid().safeParse((await params).workspaceId);
  if (!workspaceId.success) notFound();
  const [{ db }, query] = await Promise.all([requireSuperAdmin(), searchParams]);
  const [dashboard, billing] = await Promise.all([
    new db.PrismaCommercialUsageService().dashboard(workspaceId.data),
    new db.PrismaCommercialBillingService().dashboard(workspaceId.data),
  ]);
  if (!dashboard || !billing) notFound();
  const { current } = dashboard;

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">OEM商用管理</p>
        <h1>{dashboard.workspace.name}の利用量・料金</h1>
        <p>参加者が実際にサービスを使った人数を、運営団体単位で月ごとに集計します。</p>
        <Link href="/admin/organizations">← 運営団体一覧へ戻る</Link>
      </header>

      {!dashboard.workspace.oemEnabled ? (
        <p className="notice notice--danger">
          OEM利用が許可されていません。「契約・利用上限」でOEMを有効にすると請求対象として運用できます。
        </p>
      ) : null}
      {query.finalized === '1' ? (
        <p className="notice notice--success">前月の利用人数と料金を確定しました。</p>
      ) : null}
      {query.contractSaved === '1' ? (
        <p className="notice notice--success">契約・請求先を保存しました。</p>
      ) : null}
      {query.prepared === '1' ? (
        <p className="notice notice--success">確定済みの利用から請求記録を作成しました。</p>
      ) : null}
      {query.invoiceUpdated === '1' ? (
        <p className="notice notice--success">請求状態を更新しました。</p>
      ) : null}
      {query.customQuoteSaved === '1' ? (
        <p className="notice notice--success">個別見積の金額で請求記録を作成しました。</p>
      ) : null}
      {query.reminderSent === '1' ? (
        <p className="notice notice--success">請求先へメールを送信し、履歴を保存しました。</p>
      ) : null}
      {query.error ? (
        <p className="notice notice--danger">
          {query.error === 'reminder-email'
            ? '送信できる管理者メール設定がありません。管理者メールの接続確認と利用開始を確認してください。'
            : query.error === 'reminder-target'
              ? 'この請求は案内メールを送れる状態ではありません。請求状態と支払期限を確認してください。'
              : query.error === 'reminder-send'
                ? '請求案内メールを送信できませんでした。メール設定と送信サービスの状態を確認してください。'
                : '保存または更新できませんでした。入力内容と現在の状態を確認してください。'}
        </p>
      ) : null}

      <section className="operations-overview" aria-label="今月の商用利用状況">
        <div>
          <span>対象月</span>
          <strong>{current.month}</strong>
        </div>
        <div>
          <span>今月のMAU</span>
          <strong>
            {current.mau} / {current.pricing.upperLimit ?? '見積'}人
          </strong>
        </div>
        <div>
          <span>現在の月額</span>
          <strong>{yen(current.pricing.priceYen)}</strong>
        </div>
        <div>
          <span>次の料金帯まで</span>
          <strong>
            {current.pricing.remainingToNextTier === null
              ? '個別見積'
              : `あと${current.pricing.remainingToNextTier}人`}
          </strong>
        </div>
      </section>

      <section className="settings-card">
        <h2>OEM契約と請求先</h2>
        <p>
          MAU課金を請求へつなぐための契約情報です。税務上の請求書や決済は外部サービスで発行し、その番号と入金状態を下の請求台帳で管理します。
        </p>
        <form className="form-stack" action={saveContract}>
          <input type="hidden" name="workspaceId" value={dashboard.workspace.id} />
          <label className="field">
            <span className="field__label">契約状態</span>
            <select
              className="field__control"
              name="status"
              defaultValue={billing.organizationCommercialContract?.status ?? 'DRAFT'}
            >
              <option value="DRAFT">準備中</option>
              <option value="ACTIVE">契約中</option>
              <option value="SUSPENDED">一時停止</option>
              <option value="ENDED">終了</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">請求方法</span>
            <select
              className="field__control"
              name="billingMode"
              defaultValue={billing.organizationCommercialContract?.billingMode ?? 'MANUAL_INVOICE'}
            >
              <option value="MANUAL_INVOICE">請求書・手作業</option>
              <option value="EXTERNAL_BILLING">外部決済サービス</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">請求先名</span>
            <input
              className="field__control"
              name="billingName"
              required
              maxLength={200}
              defaultValue={
                billing.organizationCommercialContract?.billingName ??
                billing.legalName ??
                billing.name
              }
            />
          </label>
          <label className="field">
            <span className="field__label">請求先メール</span>
            <input
              className="field__control"
              name="billingEmail"
              type="email"
              required
              maxLength={320}
              defaultValue={
                billing.organizationCommercialContract?.billingEmail ?? billing.contactEmail ?? ''
              }
            />
          </label>
          <label className="field">
            <span className="field__label">支払期限（日数）</span>
            <input
              className="field__control"
              name="paymentTermsDays"
              type="number"
              min={0}
              max={365}
              required
              defaultValue={billing.organizationCommercialContract?.paymentTermsDays ?? 30}
            />
          </label>
          <label className="field">
            <span className="field__label">外部顧客番号（任意）</span>
            <input
              className="field__control"
              name="externalCustomerReference"
              maxLength={200}
              defaultValue={billing.organizationCommercialContract?.externalCustomerReference ?? ''}
            />
          </label>
          <div className="form-grid form-grid--two">
            <label className="field">
              <span className="field__label">契約開始（任意）</span>
              <input
                className="field__control"
                name="startsAt"
                type="datetime-local"
                defaultValue={dateTimeInput(billing.organizationCommercialContract?.startsAt)}
              />
            </label>
            <label className="field">
              <span className="field__label">契約終了（任意）</span>
              <input
                className="field__control"
                name="endsAt"
                type="datetime-local"
                defaultValue={dateTimeInput(billing.organizationCommercialContract?.endsAt)}
              />
            </label>
          </div>
          <button className="button" type="submit">
            契約・請求先を保存
          </button>
        </form>
      </section>

      <section className="settings-card">
        <h2>MAUに含める利用</h2>
        <p>
          単なる登録やログインは含めません。参加者が次の機能を利用した月だけ、1人として数えます。同じ人が何度使っても月内は1人です。
        </p>
        {current.eventCounts.length === 0 ? (
          <p>今月は対象となる利用がまだありません。</p>
        ) : (
          <ul className="summary-list">
            {current.eventCounts.map((event) => (
              <li key={event.eventType}>
                <span>{EVENT_LABELS[event.eventType] ?? event.eventType}</span>
                <strong>{event.count.toLocaleString('ja-JP')}回</strong>
              </li>
            ))}
          </ul>
        )}
        <p className="field__hint">運営者、スタッフ、システム管理者の操作は除外されます。</p>
      </section>

      <section className="settings-card">
        <h2>請求・入金管理</h2>
        <p>確定MAUから重複しない請求記録を作成し、外部請求書の発行と入金を追跡します。</p>
        <form action={prepareInvoices}>
          <input type="hidden" name="workspaceId" value={dashboard.workspace.id} />
          <button
            className="button"
            type="submit"
            disabled={billing.organizationCommercialContract?.status !== 'ACTIVE'}
          >
            確定済みの月から請求記録を作る
          </button>
        </form>
        {billing.tenantMonthlyUsage.length > 0 ? (
          <div className="settings-stack">
            <h3>個別見積の金額を確定</h3>
            <p>3,001 MAU以上の月は、合意した税抜・税込条件に沿った請求総額を入力します。</p>
            {billing.tenantMonthlyUsage.map((usage) => (
              <form
                className="form-stack service-template-preview"
                action={prepareCustomQuoteInvoice}
                key={usage.id}
              >
                <input type="hidden" name="workspaceId" value={billing.id} />
                <input type="hidden" name="monthlyUsageId" value={usage.id} />
                <strong>
                  {usage.periodStart.toISOString().slice(0, 7)}／{usage.mau.toLocaleString('ja-JP')}{' '}
                  MAU
                </strong>
                <label className="field">
                  <span className="field__label">合意した請求総額（円）</span>
                  <input
                    className="field__control"
                    name="amountYen"
                    type="number"
                    min="1"
                    max="1000000000"
                    required
                  />
                </label>
                <label className="field field--checkbox">
                  <input
                    name="automaticRemindersEnabled"
                    type="checkbox"
                    defaultChecked={
                      billing.organizationCommercialContract?.automaticRemindersEnabled
                    }
                  />
                  <span>支払期限の3日前と期限超過後に、請求先へ案内メールを自動送信する</span>
                </label>
                <p>
                  初期状態は停止です。管理者メールの接続確認が完了している場合だけ送信します。同じ請求・同じ段階の案内は1回だけです。
                </p>
                <label className="field">
                  <span className="field__label">見積条件・メモ（任意）</span>
                  <input className="field__control" name="notes" maxLength={1000} />
                </label>
                <button className="button" type="submit">
                  この金額で請求記録を作る
                </button>
              </form>
            ))}
          </div>
        ) : null}
        {billing.tenantInvoices.length === 0 ? (
          <p>請求記録はまだありません。契約を「契約中」にして、月次利用を確定してください。</p>
        ) : (
          <div className="settings-stack">
            {billing.tenantInvoices.map((invoice) => (
              <section className="service-template-preview" key={invoice.id}>
                <h3>
                  {invoice.periodStart.toISOString().slice(0, 7)} / {yen(invoice.amountYen)}
                </h3>
                <p>
                  請求番号：{invoice.invoiceNumber} ／ MAU：{invoice.mau.toLocaleString('ja-JP')}人
                  ／ 状態：
                  {invoiceStatusLabel(invoice.status, invoice.dueAt)}
                </p>
                {invoice.dueAt ? (
                  <p>
                    支払期限：
                    {invoice.dueAt.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                  </p>
                ) : null}
                {invoice.status === 'DRAFT' ? (
                  <form className="form-stack" action={transitionInvoice}>
                    <input type="hidden" name="workspaceId" value={billing.id} />
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                    <input type="hidden" name="action" value="ISSUE" />
                    <label className="field">
                      <span className="field__label">外部請求書番号（任意）</span>
                      <input
                        className="field__control"
                        name="externalInvoiceReference"
                        maxLength={200}
                      />
                    </label>
                    <label className="field">
                      <span className="field__label">メモ（任意）</span>
                      <input className="field__control" name="notes" maxLength={1000} />
                    </label>
                    <button className="button" type="submit">
                      請求済みにする
                    </button>
                  </form>
                ) : null}
                {invoice.status === 'ISSUED' ? (
                  <>
                    <form className="form-stack" action={sendInvoiceReminder}>
                      <input type="hidden" name="workspaceId" value={billing.id} />
                      <input type="hidden" name="invoiceId" value={invoice.id} />
                      <p>
                        送信先：{billing.organizationCommercialContract?.billingEmail ?? '未設定'}
                      </p>
                      <button className="button button--secondary" type="submit">
                        {invoice.dueAt && invoice.dueAt < new Date()
                          ? '期限超過の案内をメールする'
                          : '支払い案内をメールする'}
                      </button>
                    </form>
                    <form className="form-stack" action={transitionInvoice}>
                      <input type="hidden" name="workspaceId" value={billing.id} />
                      <input type="hidden" name="invoiceId" value={invoice.id} />
                      <input type="hidden" name="action" value="MARK_PAID" />
                      <label className="field">
                        <span className="field__label">入金参照番号（任意）</span>
                        <input className="field__control" name="paymentReference" maxLength={200} />
                      </label>
                      <button className="button" type="submit">
                        入金済みにする
                      </button>
                    </form>
                  </>
                ) : null}
                {invoice.status === 'DRAFT' || invoice.status === 'ISSUED' ? (
                  <form action={transitionInvoice}>
                    <input type="hidden" name="workspaceId" value={billing.id} />
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                    <input type="hidden" name="action" value="VOID" />
                    <button className="button button--secondary" type="submit">
                      この請求を取り消す
                    </button>
                  </form>
                ) : null}
              </section>
            ))}
          </div>
        )}
      </section>

      <section className="settings-card">
        <h2>前月を請求用に確定</h2>
        <p>
          月末を過ぎた利用人数を保存します。一度確定した月は、後から利用履歴や権限が変わっても金額を変更しません。
        </p>
        <form action={finalizePreviousMonth}>
          <input type="hidden" name="workspaceId" value={dashboard.workspace.id} />
          <button className="button" type="submit">
            前月のMAUと料金を確定する
          </button>
        </form>
      </section>

      <section className="settings-card">
        <h2>確定履歴</h2>
        {dashboard.history.length === 0 ? (
          <p>確定済みの月はまだありません。</p>
        ) : (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>対象月</th>
                  <th>MAU</th>
                  <th>料金</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.history.map((row) => (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    <td>{row.mau.toLocaleString('ja-JP')}人</td>
                    <td>{yen(row.priceYen)}</td>
                    <td>{row.status === 'FINALIZED' ? '確定' : '集計中'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="settings-card">
        <h2>契約・請求の変更履歴</h2>
        {billing.commercialBillingAudits.length === 0 ? (
          <p>変更履歴はまだありません。</p>
        ) : (
          <ul className="summary-list">
            {billing.commercialBillingAudits.map((audit) => (
              <li key={audit.id}>
                <span>
                  {audit.entityType === 'CONTRACT' ? '契約' : '請求'}：
                  {{
                    CREATED: '作成',
                    AUTO_CREATED: '自動作成',
                    UPDATED: '更新',
                    ISSUE: '請求済み',
                    MARK_PAID: '入金済み',
                    VOID: '取消',
                    PAYMENT_GUIDANCE_SENT: '支払い案内メール送信',
                    OVERDUE_REMINDER_SENT: '期限超過メール送信',
                  }[audit.action] ?? audit.action}
                </span>
                <strong>
                  {audit.occurredAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
