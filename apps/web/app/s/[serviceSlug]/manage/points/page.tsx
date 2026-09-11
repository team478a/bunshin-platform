import { randomUUID } from 'node:crypto';
import type { Route } from 'next';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { PublicShell } from '../../../../ui/public-shell';

export const dynamic = 'force-dynamic';

const RULES = [
  {
    key: 'MISSION_VIEWED_DAILY',
    label: '今日の企画をはじめて見る',
    help: '1日1回まで付与します。',
    defaultAmount: 1,
    dailyLimit: 1,
    weeklyLimit: null,
  },
  {
    key: 'POSTED_DAILY',
    label: '「投稿しました」を押す',
    help: '1日1回まで付与します。',
    defaultAmount: 5,
    dailyLimit: 5,
    weeklyLimit: null,
  },
  {
    key: 'POSTED_WEEKLY_3',
    label: '1週間に3回投稿する',
    help: '1週間に1回まで付与します。',
    defaultAmount: 10,
    dailyLimit: null,
    weeklyLimit: 10,
  },
] as const;

const settingsSchema = z.object({
  serviceSlug: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(3).max(1000),
  MISSION_VIEWED_DAILY: z.coerce.number().int().min(1).max(10000),
  POSTED_DAILY: z.coerce.number().int().min(1).max(10000),
  POSTED_WEEKLY_3: z.coerce.number().int().min(1).max(10000),
});

const bonusSchema = z.object({
  serviceSlug: z.string().trim().min(1).max(80),
  userId: z.uuid(),
  amount: z.coerce.number().int().min(1).max(10000),
  reason: z.string().trim().min(3).max(1000),
});

const expiryFrom = (now: Date) => {
  const after180Days = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(after180Days.getUTCFullYear(), after180Days.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );
};

async function saveRules(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/groups');
  const returnPath = `/s/${parsed.data.serviceSlug}/manage/points` as Route;
  try {
    const service = await resolveManagedServiceContext(parsed.data.serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const now = new Date();
    await db.prisma.$transaction(async (tx) => {
      const configuration = await tx.serviceConfiguration.findFirst({
        where: { workspaceId: service.workspaceId, groupId: service.serviceId },
        select: { id: true },
      });
      if (!configuration) throw new Error('SERVICE_NOT_FOUND');
      const previous = await tx.pointRuleVersion.findMany({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          campaignId: null,
          ruleKey: { in: RULES.map((rule) => rule.key) },
          status: { in: ['ACTIVE', 'SUSPENDED'] },
        },
        orderBy: { version: 'desc' },
      });
      for (const rule of RULES) {
        const amount = parsed.data[rule.key];
        const enabled = formData.get(`enabled_${rule.key}`) === 'on';
        const latest = await tx.pointRuleVersion.aggregate({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            campaignId: null,
            ruleKey: rule.key,
          },
          _max: { version: true },
        });
        await tx.pointRuleVersion.updateMany({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            campaignId: null,
            ruleKey: rule.key,
            status: { in: ['DRAFT', 'ACTIVE', 'SUSPENDED'] },
          },
          data: { status: 'SUPERSEDED' },
        });
        await tx.pointRuleVersion.create({
          data: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            ruleKey: rule.key,
            version: (latest._max.version ?? 0) + 1,
            status: enabled ? 'ACTIVE' : 'SUSPENDED',
            grantAmount: amount,
            dailyLimit: rule.dailyLimit === null ? null : amount,
            weeklyLimit: rule.weeklyLimit === null ? null : amount,
            startsAt: now,
          },
        });
      }
      await tx.serviceConfigurationAudit.create({
        data: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          configurationId: configuration.id,
          action: 'POINT_RULES_UPDATED',
          beforeData: previous.map((rule) => ({
            ruleKey: rule.ruleKey,
            status: rule.status,
            grantAmount: rule.grantAmount,
          })),
          afterData: RULES.map((rule) => ({
            ruleKey: rule.key,
            status: formData.get(`enabled_${rule.key}`) === 'on' ? 'ACTIVE' : 'SUSPENDED',
            grantAmount: parsed.data[rule.key],
          })),
          reason: parsed.data.reason,
          performedByUserId: actor.userId,
          occurredAt: now,
        },
      });
    });
  } catch {
    redirect(`${returnPath}?error=settings` as Route);
  }
  revalidatePath(returnPath);
  redirect(`${returnPath}?saved=1` as Route);
}

async function grantBonus(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const parsed = bonusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/groups');
  const returnPath = `/s/${parsed.data.serviceSlug}/manage/points` as Route;
  try {
    const service = await resolveManagedServiceContext(parsed.data.serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const now = new Date();
    await db.prisma.$transaction(async (tx) => {
      const [member, configuration] = await Promise.all([
        tx.groupMembership.findFirst({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            userId: parsed.data.userId,
            status: 'ACTIVE',
          },
          select: { userId: true },
        }),
        tx.serviceConfiguration.findFirst({
          where: { workspaceId: service.workspaceId, groupId: service.serviceId },
          select: { id: true },
        }),
      ]);
      if (!member || !configuration) throw new Error('MEMBER_NOT_FOUND');
      const account = await tx.pointAccount.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: service.workspaceId,
            userId: member.userId,
          },
        },
        create: { workspaceId: service.workspaceId, userId: member.userId },
        update: {},
      });
      const idempotencyKey = `operator-bonus:${randomUUID()}`;
      await tx.pointTransaction.create({
        data: {
          accountId: account.id,
          workspaceId: service.workspaceId,
          userId: member.userId,
          groupId: service.serviceId,
          type: 'GRANT',
          amount: parsed.data.amount,
          idempotencyKey,
          sourceType: 'OPERATOR_BONUS',
          sourceId: actor.userId,
          expiresAt: expiryFrom(now),
          createdAt: now,
        },
      });
      const updated = await tx.pointAccount.update({
        where: { id: account.id },
        data: {
          availablePoints: { increment: parsed.data.amount },
          revision: { increment: 1 },
        },
        select: { availablePoints: true },
      });
      await tx.serviceConfigurationAudit.create({
        data: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          configurationId: configuration.id,
          action: 'POINT_BONUS_GRANTED',
          beforeData: { availablePoints: account.availablePoints },
          afterData: {
            userId: member.userId,
            amount: parsed.data.amount,
            availablePoints: updated.availablePoints,
            idempotencyKey,
          },
          reason: parsed.data.reason,
          performedByUserId: actor.userId,
          occurredAt: now,
        },
      });
    });
  } catch {
    redirect(`${returnPath}?error=bonus` as Route);
  }
  revalidatePath(returnPath);
  redirect(`${returnPath}?bonus=1` as Route);
}

export default async function ServicePointSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{ saved?: string; bonus?: string; error?: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/points`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();
  const db = await import('@bunshin/database');
  const [versions, memberships, history] = await Promise.all([
    db.prisma.pointRuleVersion.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        campaignId: null,
        ruleKey: { in: RULES.map((rule) => rule.key) },
        status: { in: ['ACTIVE', 'SUSPENDED'] },
      },
      orderBy: [{ ruleKey: 'asc' }, { version: 'desc' }],
    }),
    db.prisma.groupMembership.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        status: 'ACTIVE',
      },
      select: {
        userId: true,
        user: { select: { displayName: true, email: true } },
        serviceRole: true,
      },
      orderBy: { user: { displayName: 'asc' } },
    }),
    db.prisma.serviceConfigurationAudit.findMany({
      where: {
        workspaceId: service.workspaceId,
        groupId: service.serviceId,
        action: { in: ['POINT_RULES_UPDATED', 'POINT_BONUS_GRANTED'] },
      },
      select: {
        id: true,
        action: true,
        afterData: true,
        reason: true,
        occurredAt: true,
        performedBy: { select: { displayName: true, email: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: 30,
    }),
  ]);
  const current = new Map<string, (typeof versions)[number]>();
  for (const version of versions)
    if (!current.has(version.ruleKey)) current.set(version.ruleKey, version);
  const query = await searchParams;
  const memberName = new Map(
    memberships.map((membership) => [
      membership.userId,
      membership.user.displayName || membership.user.email || '参加者',
    ]),
  );

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>ポイントとバッジ</h1>
          <p>このサービスで使うポイント数とバッジを、運営者が設定できます。</p>
          <a href={`/s/${serviceSlug}/manage`}>← 管理メニューへ戻る</a>
        </header>
        {query.saved ? (
          <p className="notice notice--success">ポイント設定を保存しました。</p>
        ) : null}
        {query.bonus ? (
          <p className="notice notice--success">ボーナスポイントを付与しました。</p>
        ) : null}
        {query.error ? (
          <p className="notice notice--danger">
            保存できませんでした。入力内容を確認してください。
          </p>
        ) : null}

        <section className="settings-card">
          <h2>ポイントのため方を設定</h2>
          <p>
            チェックを外すと、その条件からはポイントが付かなくなります。変更前の履歴も残ります。
          </p>
          <form action={saveRules} className="form-stack">
            <input type="hidden" name="serviceSlug" value={serviceSlug} />
            {RULES.map((rule) => {
              const saved = current.get(rule.key);
              return (
                <fieldset className="settings-card" key={rule.key}>
                  <legend>
                    <strong>{rule.label}</strong>
                  </legend>
                  <label className="field">
                    <span className="field__label">利用する</span>
                    <input
                      name={`enabled_${rule.key}`}
                      type="checkbox"
                      defaultChecked={!saved || saved.status === 'ACTIVE'}
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">もらえるポイント</span>
                    <input
                      className="field__control"
                      name={rule.key}
                      type="number"
                      min="1"
                      max="10000"
                      defaultValue={saved?.grantAmount ?? rule.defaultAmount}
                      required
                    />
                  </label>
                  <small>{rule.help}</small>
                </fieldset>
              );
            })}
            <label className="field">
              <span className="field__label">変更理由</span>
              <textarea
                className="field__control"
                name="reason"
                minLength={3}
                maxLength={1000}
                required
              />
            </label>
            <button className="button" type="submit">
              ポイント設定を保存
            </button>
          </form>
        </section>

        <section className="settings-card">
          <h2>参加者へボーナスを付与</h2>
          <p>イベントやお礼など、運営判断でポイントを追加できます。理由と実行者を記録します。</p>
          <form action={grantBonus} className="form-stack">
            <input type="hidden" name="serviceSlug" value={serviceSlug} />
            <label className="field">
              <span className="field__label">参加者</span>
              <select className="field__control" name="userId" required>
                {memberships.map((membership) => (
                  <option key={membership.userId} value={membership.userId}>
                    {membership.user.displayName || membership.user.email || membership.userId}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">追加するポイント</span>
              <input
                className="field__control"
                name="amount"
                type="number"
                min="1"
                max="10000"
                required
              />
            </label>
            <label className="field">
              <span className="field__label">付与する理由</span>
              <textarea
                className="field__control"
                name="reason"
                minLength={3}
                maxLength={1000}
                required
              />
            </label>
            <button className="button" type="submit">
              ボーナスを付与
            </button>
          </form>
        </section>

        <section className="settings-card">
          <h2>バッジを設定・付与</h2>
          <p>このサービス専用のバッジを作り、参加者を選んで付与できます。</p>
          <a className="button button--secondary" href={`/s/${serviceSlug}/manage/badges`}>
            バッジ管理を開く
          </a>
        </section>

        <section className="settings-card">
          <h2>最近の変更履歴</h2>
          {history.length === 0 ? (
            <p>まだ変更はありません。</p>
          ) : (
            <ul>
              {history.map((item) => {
                const data =
                  item.afterData &&
                  typeof item.afterData === 'object' &&
                  !Array.isArray(item.afterData)
                    ? (item.afterData as Record<string, unknown>)
                    : {};
                const target = typeof data.userId === 'string' ? memberName.get(data.userId) : null;
                const amount = typeof data.amount === 'number' ? data.amount : '';
                return (
                  <li key={item.id}>
                    <strong>
                      {item.action === 'POINT_RULES_UPDATED'
                        ? '獲得条件を変更'
                        : `${target ?? '参加者'}へ ${amount} WP付与`}
                    </strong>
                    <br />
                    {item.occurredAt.toLocaleString('ja-JP')}／
                    {item.performedBy.displayName || item.performedBy.email || '運営者'}／
                    {item.reason}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </PublicShell>
  );
}
