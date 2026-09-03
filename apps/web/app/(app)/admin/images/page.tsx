import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getServerEnvironment } from '@bunshin/config';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { currentAiProviderEnvironment } from '../../../../src/ai/secure-provider-configuration';
import { buildSocialImagePilotStatus } from '../../../../src/social-image-pilot-status';
import { ListSocialImagePilotEvidence } from '@bunshin/application';
import { ImagePilotEvidenceEditor } from './evidence-editor';
import { buildImagePilotReadiness } from './readiness-view-model';

export const dynamic = 'force-dynamic';

const settingsSchema = z
  .object({
    workspaceId: z.uuid(),
    groupId: z.uuid(),
    dailyLimit: z.coerce.number().int().min(1).max(10000),
    monthlyLimit: z.coerce.number().int().min(1).max(100000),
    memberMonthlyLimit: z.coerce.number().int().min(1).max(10000),
    defaultModel: z.string().trim().min(1).max(120),
    defaultQuality: z.string().trim().min(1).max(40),
    startsAt: z.string().max(40),
    endsAt: z.string().max(40),
    emergencyStop: z.enum(['false', 'true']),
    changeReason: z.string().trim().min(5).max(1000),
  })
  .refine(({ startsAt, endsAt }) => !startsAt || !endsAt || new Date(startsAt) < new Date(endsAt), {
    message: 'invalid period',
  });

const optionalDate = (value: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('invalid date');
  return parsed;
};

async function savePilot(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const input = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) redirect('/admin/images?error=invalid');
  const db = await import('@bunshin/database');
  const admin = await db.prisma.platformAdmin.findFirst({
    where: { userId: actor.userId, role: 'SUPER_ADMIN', status: 'ACTIVE' },
    select: { id: true },
  });
  if (!admin) notFound();
  const memberIds = [...new Set(formData.getAll('memberId').map(String))];
  try {
    await db.prisma.$transaction(
      async (tx) => {
        const group = await tx.group.findFirst({
          where: {
            id: input.data.groupId,
            workspaceId: input.data.workspaceId,
            status: 'ACTIVE',
            featurePolicies: {
              some: { featureKey: 'SOCIAL.IMAGE_GENERATION', status: 'ENABLED' },
            },
          },
          select: { id: true },
        });
        if (!group) throw new Error('group unavailable');
        const eligible = await tx.groupMembership.findMany({
          where: {
            id: { in: memberIds },
            workspaceId: input.data.workspaceId,
            groupId: input.data.groupId,
            status: 'ACTIVE',
            consentedAt: { not: null },
            featureAssignments: {
              some: { featureKey: 'SOCIAL.IMAGE_GENERATION', status: 'ENABLED' },
            },
          },
          select: { id: true },
        });
        if (eligible.length !== memberIds.length) throw new Error('member unavailable');
        const latest = await tx.socialImageGenerationPilot.findFirst({
          where: { groupId: input.data.groupId },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        await tx.socialImageGenerationPilot.updateMany({
          where: { groupId: input.data.groupId, status: 'ACTIVE' },
          data: { status: 'SUPERSEDED' },
        });
        const pilot = await tx.socialImageGenerationPilot.create({
          data: {
            workspaceId: input.data.workspaceId,
            groupId: input.data.groupId,
            version: (latest?.version ?? 0) + 1,
            status: 'ACTIVE',
            startsAt: optionalDate(input.data.startsAt),
            endsAt: optionalDate(input.data.endsAt),
            dailyLimit: input.data.dailyLimit,
            monthlyLimit: input.data.monthlyLimit,
            memberMonthlyLimit: input.data.memberMonthlyLimit,
            defaultModel: input.data.defaultModel,
            defaultQuality: input.data.defaultQuality,
            emergencyStop: input.data.emergencyStop === 'true',
            changeReason: input.data.changeReason,
            createdByUserId: actor.userId,
            updatedByUserId: actor.userId,
          },
        });
        if (eligible.length)
          await tx.socialImagePilotEnrollment.createMany({
            data: eligible.map((member) => ({
              workspaceId: input.data.workspaceId,
              groupId: input.data.groupId,
              pilotId: pilot.id,
              groupMembershipId: member.id,
              status: 'ACTIVE',
              consentedAt: new Date(),
            })),
          });
      },
      { isolationLevel: 'Serializable' },
    );
  } catch {
    redirect(`/admin/images?groupId=${input.data.groupId}&error=failed`);
  }
  revalidatePath('/admin/images');
  revalidatePath(`/groups/${input.data.groupId}/image-operations`);
  redirect(`/admin/images?groupId=${input.data.groupId}&saved=1`);
}

const dateTimeValue = (value: Date | null | undefined) =>
  value
    ? value
        .toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo', hour12: false })
        .replace(' ', 'T')
        .slice(0, 16)
    : '';

export default async function ImagePilotAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ groupId?: string; saved?: string; error?: string }>;
}) {
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const db = await import('@bunshin/database');
  const admin = await db.prisma.platformAdmin.findFirst({
    where: { userId: actor.userId, status: 'ACTIVE' },
    select: { role: true },
  });
  if (!admin) notFound();
  const groups = await db.prisma.group.findMany({
    where: {
      status: 'ACTIVE',
      featurePolicies: { some: { featureKey: 'SOCIAL.IMAGE_GENERATION', status: 'ENABLED' } },
    },
    select: { id: true, workspaceId: true, name: true, workspace: { select: { name: true } } },
    orderBy: { name: 'asc' },
  });
  const query = await searchParams;
  const selected = groups.find((group) => group.id === query.groupId) ?? groups[0];
  const pilot = selected
    ? await db.prisma.socialImageGenerationPilot.findFirst({
        where: { workspaceId: selected.workspaceId, groupId: selected.id, status: 'ACTIVE' },
        include: {
          enrollments: { where: { status: 'ACTIVE' }, select: { groupMembershipId: true } },
        },
        orderBy: { version: 'desc' },
      })
    : null;
  const evidence =
    selected && pilot
      ? await new ListSocialImagePilotEvidence(
          new db.PrismaSocialImagePilotEvidenceRepository(),
        ).execute({
          workspaceId: selected.workspaceId,
          groupId: selected.id,
          pilotId: pilot.id,
          actorUserId: actor.userId,
        })
      : [];
  const members = selected
    ? await db.prisma.groupMembership.findMany({
        where: { workspaceId: selected.workspaceId, groupId: selected.id, status: 'ACTIVE' },
        select: {
          id: true,
          consentedAt: true,
          user: { select: { displayName: true, email: true } },
          featureAssignments: {
            where: { featureKey: 'SOCIAL.IMAGE_GENERATION', status: 'ENABLED' },
            select: { id: true },
          },
        },
        orderBy: { user: { displayName: 'asc' } },
      })
    : [];
  const enrolled = new Set(pilot?.enrollments.map((item) => item.groupMembershipId) ?? []);
  const provider = await db.prisma.aiProviderConfiguration.findFirst({
    where: {
      environment: currentAiProviderEnvironment(),
      provider: 'OPENAI',
      status: 'ACTIVE',
    },
    orderBy: { version: 'desc' },
    select: {
      apiKeyMask: true,
      lastVerifiedAt: true,
      globallyPaused: true,
      lastErrorCategory: true,
    },
  });
  const environment = getServerEnvironment();
  const now = new Date();
  const effectiveStatus = buildSocialImagePilotStatus({ pilot, evidence, now });
  const readiness = buildImagePilotReadiness({
    now,
    pilot,
    enrolledCount: enrolled.size,
    provider: provider
      ? {
          apiKeyConfigured: Boolean(provider.apiKeyMask),
          lastVerifiedAt: provider.lastVerifiedAt,
          globallyPaused: provider.globallyPaused,
          lastErrorCategory: provider.lastErrorCategory,
        }
      : null,
    storageConfigured: Boolean(
      (process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? environment.SUPABASE_AUTH_ADMIN_URL) &&
      environment.SUPABASE_SERVICE_ROLE_KEY,
    ),
  });
  const requestCounts = selected
    ? await db.prisma.socialImageGenerationRequest.groupBy({
        by: ['status'],
        where: { workspaceId: selected.workspaceId, groupId: selected.id },
        _count: { _all: true },
      })
    : [];
  const count = (status: string) =>
    requestCounts.find((item) => item.status === status)?._count._all ?? 0;
  const total = requestCounts.reduce((sum, item) => sum + item._count._all, 0);
  const requestIds = selected
    ? await db.prisma.socialImageGenerationRequest.findMany({
        where: { workspaceId: selected.workspaceId, groupId: selected.id },
        select: { id: true },
        take: 500,
      })
    : [];
  const requestIdSet = new Set(requestIds.map((item) => item.id));
  const imageUsage = selected
    ? await db.prisma.aiUsageEvent.findMany({
        where: { workspaceId: selected.workspaceId, taskType: 'SOCIAL_IMAGE_GENERATION' },
        select: { idempotencyKey: true, estimatedCostUsdMicros: true },
        orderBy: { occurredAt: 'desc' },
        take: 2000,
      })
    : [];
  const costMicros = imageUsage.reduce((sum, item) => {
    const requestId = item.idempotencyKey.split(':')[1];
    return requestId && requestIdSet.has(requestId)
      ? sum + (item.estimatedCostUsdMicros ?? 0n)
      : sum;
  }, 0n);
  const costUsd = (Number(costMicros) / 1_000_000).toFixed(2);

  return (
    <main className="app-page">
      <header className="app-page__heading">
        <p className="eyebrow">管理者専用</p>
        <h1>画像生成の試験運用</h1>
        <p>試すグループと参加者を限定し、上限設定や緊急停止を画面から行えます。</p>
      </header>
      {query.saved === '1' ? <p className="notice notice--success">設定を保存しました。</p> : null}
      {query.error ? (
        <p className="notice notice--danger">
          保存できませんでした。入力と利用機能の設定を確認してください。
        </p>
      ) : null}
      <section className="settings-card">
        <h2>試すグループ</h2>
        {groups.length ? (
          <form method="get">
            <select name="groupId" defaultValue={selected?.id}>
              {groups.map((group) => (
                <option value={group.id} key={group.id}>
                  {group.workspace.name}／{group.name}
                </option>
              ))}
            </select>{' '}
            <button type="submit">表示する</button>
          </form>
        ) : (
          <p>
            画像生成を許可したグループがありません。先に{' '}
            <Link href="/admin/groups">グループ管理</Link>で利用機能を設定してください。
          </p>
        )}
      </section>
      {selected ? (
        <>
          <section className="settings-card">
            <h2>現在の状態</h2>
            <p>
              設定：{pilot ? `第${pilot.version}版` : '未設定'} ／ 運転：
              <strong>{effectiveStatus.label}</strong>
            </p>
            {effectiveStatus.state === 'PREPARING' ? (
              <p>人による開始前確認があと{effectiveStatus.remainingChecks}件必要です。</p>
            ) : null}
            <p>
              参加者：{enrolled.size}人 ／ 生成受付：{total}件 ／ 完成：{count('READY_FOR_REVIEW')}
              件 ／ 失敗：{count('FAILED')}件
            </p>
            <p>記録済みの概算AI原価：${costUsd}</p>
            <p>
              <Link href={`/groups/${selected.id}/image-operations`}>
                グループ向け利用レポートを見る
              </Link>
            </p>
          </section>
          {pilot ? (
            <ImagePilotEvidenceEditor
              workspaceId={selected.workspaceId}
              groupId={selected.id}
              pilotId={pilot.id}
              canEdit={admin.role === 'SUPER_ADMIN'}
              initialEvidence={evidence.map((item) => ({
                ...item,
                occurredAt: item.occurredAt.toISOString(),
              }))}
            />
          ) : (
            <section className="settings-card">
              <h2>開始前に人が確認すること</h2>
              <p>先に試験設定を保存すると、確認項目を記録できるようになります。</p>
            </section>
          )}
          <section className="settings-card">
            <h2>開始前の自動確認</h2>
            <p>
              判定：
              <strong className={readiness.ready ? 'status-success' : 'status-warning'}>
                {readiness.ready
                  ? '自動確認は完了しています'
                  : `${readiness.blockerCount}件の対応が必要です`}
              </strong>
            </p>
            <p>
              この確認だけでは本番開始になりません。スマートフォン確認、予算、評価担当者、保持期間は
              人が確認して記録します。
            </p>
            <ul className="admin-check-list">
              {readiness.items.map((item) => (
                <li key={item.key}>
                  <strong>{item.ready ? '完了' : '要対応'}：</strong> {item.label}
                  <br />
                  {item.detail}{' '}
                  {!item.ready ? <Link href={item.href}>{item.actionLabel}</Link> : null}
                </li>
              ))}
            </ul>
          </section>
          <section className="settings-card">
            <h2>試験設定を更新</h2>
            <p>保存すると新しい設定版を作り、古い版を終了します。最高管理者だけが変更できます。</p>
            {admin.role === 'SUPER_ADMIN' ? (
              <form className="form-stack" action={savePilot}>
                <input type="hidden" name="workspaceId" value={selected.workspaceId} />
                <input type="hidden" name="groupId" value={selected.id} />
                <label className="field">
                  <span className="field__label">1日のグループ上限</span>
                  <input
                    className="field__control"
                    type="number"
                    name="dailyLimit"
                    min="1"
                    required
                    defaultValue={pilot?.dailyLimit ?? 10}
                  />
                </label>
                <label className="field">
                  <span className="field__label">1か月のグループ上限</span>
                  <input
                    className="field__control"
                    type="number"
                    name="monthlyLimit"
                    min="1"
                    required
                    defaultValue={pilot?.monthlyLimit ?? 100}
                  />
                </label>
                <label className="field">
                  <span className="field__label">参加者1人の月間上限</span>
                  <input
                    className="field__control"
                    type="number"
                    name="memberMonthlyLimit"
                    min="1"
                    required
                    defaultValue={pilot?.memberMonthlyLimit ?? 20}
                  />
                </label>
                <label className="field">
                  <span className="field__label">画像モデル</span>
                  <input
                    className="field__control"
                    name="defaultModel"
                    required
                    defaultValue={pilot?.defaultModel ?? 'gpt-image-1'}
                  />
                </label>
                <label className="field">
                  <span className="field__label">品質</span>
                  <select
                    className="field__control"
                    name="defaultQuality"
                    defaultValue={pilot?.defaultQuality ?? 'low'}
                  >
                    <option value="low">低（試験向け・安価）</option>
                    <option value="medium">中</option>
                    <option value="high">高</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">開始日時（空欄ならすぐ）</span>
                  <input
                    className="field__control"
                    type="datetime-local"
                    name="startsAt"
                    defaultValue={dateTimeValue(pilot?.startsAt)}
                  />
                </label>
                <label className="field">
                  <span className="field__label">終了日時（空欄なら期限なし）</span>
                  <input
                    className="field__control"
                    type="datetime-local"
                    name="endsAt"
                    defaultValue={dateTimeValue(pilot?.endsAt)}
                  />
                </label>
                <label className="field">
                  <span className="field__label">運転状態</span>
                  <select
                    className="field__control"
                    name="emergencyStop"
                    defaultValue={pilot?.emergencyStop ? 'true' : 'false'}
                  >
                    <option value="false">利用する</option>
                    <option value="true">すぐに全員を停止する</option>
                  </select>
                </label>
                <fieldset>
                  <legend>試験に参加する人</legend>
                  {members.map((member) => {
                    const eligible = Boolean(
                      member.consentedAt && member.featureAssignments.length,
                    );
                    return (
                      <label key={member.id} style={{ display: 'block', marginBlock: '0.5rem' }}>
                        <input
                          type="checkbox"
                          name="memberId"
                          value={member.id}
                          defaultChecked={enrolled.has(member.id)}
                          disabled={!eligible}
                        />{' '}
                        {member.user.displayName}（{member.user.email}）
                        {eligible ? '' : '―参加同意または機能設定が必要'}
                      </label>
                    );
                  })}
                </fieldset>
                <label className="field">
                  <span className="field__label">変更理由</span>
                  <textarea
                    className="field__control"
                    name="changeReason"
                    required
                    minLength={5}
                    placeholder="例：社内テストを10人で開始するため"
                  />
                </label>
                <button className="button" type="submit">
                  新しい設定版として保存
                </button>
              </form>
            ) : (
              <p>この画面では確認だけできます。変更は最高管理者が行います。</p>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
