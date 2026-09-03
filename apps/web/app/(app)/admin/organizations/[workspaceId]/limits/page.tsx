import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../../src/auth/current-user';

export const dynamic = 'force-dynamic';

const schema = z.object({
  workspaceId: z.uuid(),
  maxGroups: z.string().max(20),
  maxOperators: z.string().max(20),
  maxMembers: z.string().max(20),
  maxServices: z.string().max(20),
  monthlyAiGenerationLimit: z.string().max(20),
  monthlyImageGenerationLimit: z.string().max(20),
  monthlyVideoGenerationLimit: z.string().max(20),
  dedicatedLineEnabled: z.string().optional(),
  oemEnabled: z.string().optional(),
  customDomainEnabled: z.string().optional(),
  suspended: z.string().optional(),
  startsAt: z.string().max(40),
  endsAt: z.string().max(40),
  reason: z.string().trim().min(5).max(1000),
});

function optionalPositiveInteger(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 1_000_000)
    throw new Error('invalid limit');
  return number;
}

function optionalDate(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('invalid date');
  return date;
}

function localDateTime(value: Date | null): string {
  if (!value) return '';
  return value
    .toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo', hour12: false })
    .replace(' ', 'T')
    .slice(0, 16);
}

async function saveEntitlement(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const input = schema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/organizations?error=invalid');
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    actor.userId,
  );
  if (!admin || admin.role !== 'SUPER_ADMIN') notFound();
  try {
    const startsAt = optionalDate(input.data.startsAt);
    const endsAt = optionalDate(input.data.endsAt);
    if (startsAt && endsAt && startsAt >= endsAt) throw new Error('invalid period');
    const next = {
      maxGroups: optionalPositiveInteger(input.data.maxGroups),
      maxOperators: optionalPositiveInteger(input.data.maxOperators),
      maxMembers: optionalPositiveInteger(input.data.maxMembers),
      maxServices: optionalPositiveInteger(input.data.maxServices),
      monthlyAiGenerationLimit: optionalPositiveInteger(input.data.monthlyAiGenerationLimit),
      monthlyImageGenerationLimit: optionalPositiveInteger(input.data.monthlyImageGenerationLimit),
      monthlyVideoGenerationLimit: optionalPositiveInteger(input.data.monthlyVideoGenerationLimit),
      dedicatedLineEnabled: input.data.dedicatedLineEnabled === 'on',
      oemEnabled: input.data.oemEnabled === 'on',
      customDomainEnabled: input.data.customDomainEnabled === 'on',
      suspended: input.data.suspended === 'on',
      startsAt,
      endsAt,
    };
    await db.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.findFirst({
        where: { id: input.data.workspaceId, type: 'ORGANIZATION' },
        select: { id: true },
      });
      if (!workspace) throw new Error('workspace unavailable');
      const previous = await tx.organizationEntitlement.findUnique({
        where: { workspaceId: workspace.id },
      });
      const beforeData = previous
        ? {
            maxGroups: previous.maxGroups,
            maxOperators: previous.maxOperators,
            maxMembers: previous.maxMembers,
            maxServices: previous.maxServices,
            monthlyAiGenerationLimit: previous.monthlyAiGenerationLimit,
            monthlyImageGenerationLimit: previous.monthlyImageGenerationLimit,
            monthlyVideoGenerationLimit: previous.monthlyVideoGenerationLimit,
            dedicatedLineEnabled: previous.dedicatedLineEnabled,
            oemEnabled: previous.oemEnabled,
            customDomainEnabled: previous.customDomainEnabled,
            suspended: previous.suspended,
            startsAt: previous.startsAt?.toISOString() ?? null,
            endsAt: previous.endsAt?.toISOString() ?? null,
          }
        : undefined;
      const afterData = {
        ...next,
        startsAt: startsAt?.toISOString() ?? null,
        endsAt: endsAt?.toISOString() ?? null,
      };
      await tx.organizationEntitlement.upsert({
        where: { workspaceId: workspace.id },
        create: { workspaceId: workspace.id, updatedByUserId: actor.userId, ...next },
        update: { updatedByUserId: actor.userId, ...next },
      });
      await tx.organizationEntitlementAudit.create({
        data: {
          workspaceId: workspace.id,
          actorUserId: actor.userId,
          ...(beforeData ? { beforeData } : {}),
          afterData,
          reason: input.data.reason,
        },
      });
    });
  } catch {
    redirect(`/admin/organizations/${input.data.workspaceId}/limits?error=invalid`);
  }
  revalidatePath('/admin/organizations');
  revalidatePath(`/admin/organizations/${input.data.workspaceId}/limits`);
  redirect(`/admin/organizations/${input.data.workspaceId}/limits?saved=1`);
}

export default async function OrganizationLimitsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const workspaceId = z.uuid().safeParse((await params).workspaceId);
  if (!workspaceId.success) notFound();
  const db = await import('@bunshin/database');
  const admin = await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(
    actor.userId,
  );
  if (!admin || admin.role !== 'SUPER_ADMIN') notFound();
  const [organization, query] = await Promise.all([
    db.prisma.workspace.findFirst({
      where: { id: workspaceId.data, type: 'ORGANIZATION' },
      select: {
        id: true,
        name: true,
        organizationEntitlement: true,
        _count: {
          select: {
            groups: { where: { status: 'ACTIVE' } },
            memberships: { where: { status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } } },
            serviceConfigurations: true,
          },
        },
      },
    }),
    searchParams,
  ]);
  if (!organization) notFound();
  const setting = organization.organizationEntitlement;

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">システム管理者</p>
        <h1>{organization.name}の契約・利用上限</h1>
        <p>運営団体が利用できる範囲を決めます。空欄の数値は上限なしです。</p>
        <Link href="/admin/organizations">← 運営団体一覧へ戻る</Link>
      </header>
      {query.saved === '1' ? <p className="notice notice--success">設定を保存しました。</p> : null}
      {query.error ? (
        <p className="notice notice--danger">
          保存できませんでした。入力値と期間を確認してください。
        </p>
      ) : null}
      <section className="operations-overview" aria-label="現在の利用数">
        <div>
          <span>グループ</span>
          <strong>{organization._count.groups}件</strong>
        </div>
        <div>
          <span>運営者</span>
          <strong>{organization._count.memberships}人</strong>
        </div>
        <div>
          <span>サービス</span>
          <strong>{organization._count.serviceConfigurations}件</strong>
        </div>
      </section>
      <section className="settings-card">
        <h2>団体へ許可する範囲</h2>
        <form className="form-stack" action={saveEntitlement}>
          <input type="hidden" name="workspaceId" value={organization.id} />
          <div className="admin-form-grid">
            {[
              ['maxGroups', '作成できるグループ数', setting?.maxGroups],
              ['maxOperators', '運営者数', setting?.maxOperators],
              ['maxMembers', '参加者数', setting?.maxMembers],
              ['maxServices', '作成できるサービス数', setting?.maxServices],
              ['monthlyAiGenerationLimit', '月間AI生成数', setting?.monthlyAiGenerationLimit],
              [
                'monthlyImageGenerationLimit',
                '月間画像生成数',
                setting?.monthlyImageGenerationLimit,
              ],
              [
                'monthlyVideoGenerationLimit',
                '月間動画生成数',
                setting?.monthlyVideoGenerationLimit,
              ],
            ].map(([name, label, value]) => (
              <label className="field" key={String(name)}>
                <span className="field__label">{label}</span>
                <input
                  className="field__control"
                  type="number"
                  min="1"
                  max="1000000"
                  name={String(name)}
                  defaultValue={value === null || value === undefined ? '' : String(value)}
                />
              </label>
            ))}
          </div>
          <label>
            <input
              type="checkbox"
              name="dedicatedLineEnabled"
              defaultChecked={setting?.dedicatedLineEnabled ?? false}
            />{' '}
            団体・サービス専用LINEを許可
          </label>
          <label>
            <input
              type="checkbox"
              name="oemEnabled"
              defaultChecked={setting?.oemEnabled ?? false}
            />{' '}
            OEM・独自ブランドを許可
          </label>
          <label>
            <input
              type="checkbox"
              name="customDomainEnabled"
              defaultChecked={setting?.customDomainEnabled ?? false}
            />{' '}
            独自ドメインを許可
          </label>
          <label>
            <input type="checkbox" name="suspended" defaultChecked={setting?.suspended ?? false} />{' '}
            団体の新規設定・作成を一時停止
          </label>
          <div className="admin-form-grid">
            <label className="field">
              <span className="field__label">契約開始日時</span>
              <input
                className="field__control"
                type="datetime-local"
                name="startsAt"
                defaultValue={localDateTime(setting?.startsAt ?? null)}
              />
            </label>
            <label className="field">
              <span className="field__label">契約終了日時</span>
              <input
                className="field__control"
                type="datetime-local"
                name="endsAt"
                defaultValue={localDateTime(setting?.endsAt ?? null)}
              />
            </label>
          </div>
          <label className="field">
            <span className="field__label">変更理由</span>
            <textarea
              className="field__control"
              name="reason"
              required
              minLength={5}
              maxLength={1000}
              placeholder="例：契約プランを登録するため"
            />
          </label>
          <button className="button" type="submit">
            契約・利用上限を保存する
          </button>
        </form>
      </section>
    </main>
  );
}
