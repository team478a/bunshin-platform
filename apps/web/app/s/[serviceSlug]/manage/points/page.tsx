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

const correctionSchema = z.object({
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
    if (parsed.data.userId === actor.userId) throw new Error('SELF_REWARD_NOT_ALLOWED');
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

async function correctPoints(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const parsed = correctionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/groups');
  const returnPath = `/s/${parsed.data.serviceSlug}/manage/points` as Route;
  try {
    const service = await resolveManagedServiceContext(parsed.data.serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const now = new Date();
    await db.prisma.$transaction(async (tx) => {
      const [member, configuration, account] = await Promise.all([
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
        tx.pointAccount.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: service.workspaceId,
              userId: parsed.data.userId,
            },
          },
          select: { id: true },
        }),
      ]);
      if (!member || !configuration || !account) throw new Error('MEMBER_OR_ACCOUNT_NOT_FOUND');
      const changed = await tx.pointAccount.updateMany({
        where: {
          id: account.id,
          availablePoints: { gte: parsed.data.amount },
          recoveryDue: 0,
        },
        data: {
          availablePoints: { decrement: parsed.data.amount },
          revision: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new Error('INSUFFICIENT_POINTS');
      const updated = await tx.pointAccount.findUniqueOrThrow({
        where: { id: account.id },
        select: { availablePoints: true },
      });
      const idempotencyKey = `operator-correction:${randomUUID()}`;
      const transaction = await tx.pointTransaction.create({
        data: {
          accountId: account.id,
          workspaceId: service.workspaceId,
          userId: member.userId,
          groupId: service.serviceId,
          type: 'REVERSAL',
          amount: -parsed.data.amount,
          idempotencyKey,
          sourceType: 'OPERATOR_CORRECTION',
          sourceId: actor.userId,
          createdAt: now,
        },
      });
      const grants = await tx.pointTransaction.findMany({
        where: {
          accountId: account.id,
          type: { in: ['GRANT', 'REFUND'] },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        include: { consumptions: true },
      });
      grants.sort((left, right) =>
        left.expiresAt === null
          ? right.expiresAt === null
            ? left.createdAt.getTime() - right.createdAt.getTime()
            : 1
          : right.expiresAt === null
            ? -1
            : left.expiresAt.getTime() - right.expiresAt.getTime(),
      );
      let remaining = parsed.data.amount;
      for (const grant of grants) {
        const used = grant.consumptions.reduce((sum, link) => sum + link.amount, 0);
        const available = grant.amount - used;
        if (available <= 0) continue;
        const amount = Math.min(remaining, available);
        await tx.pointConsumptionLink.create({
          data: {
            consumptionTransactionId: transaction.id,
            grantTransactionId: grant.id,
            amount,
          },
        });
        remaining -= amount;
        if (remaining === 0) break;
      }
      if (remaining !== 0) throw new Error('POINT_LEDGER_BALANCE_MISMATCH');
      await tx.serviceConfigurationAudit.create({
        data: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          configurationId: configuration.id,
          action: 'POINT_BALANCE_CORRECTED',
          beforeData: { availablePoints: updated.availablePoints + parsed.data.amount },
          afterData: {
            userId: member.userId,
            amount: -parsed.data.amount,
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
    redirect(`${returnPath}?error=correction` as Route);
  }
  revalidatePath(returnPath);
  revalidatePath('/points');
  revalidatePath(`/s/${parsed.data.serviceSlug}/activity`);
  redirect(`${returnPath}?corrected=1` as Route);
}

export default async function ServicePointSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<{ saved?: string; bonus?: string; corrected?: string; error?: string }>;
}) {
  const { serviceSlug } = await params;
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(`/s/${serviceSlug}/manage/points`)}`);
  const service = await resolveManagedServiceContext(serviceSlug, actor.userId).catch(() => null);
  if (!service) notFound();
  const db = await import('@bunshin/database');
  const memberships = await db.prisma.groupMembership.findMany({
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
  });
  const memberUserIds = memberships.map(({ userId }) => userId);
  const bonusRecipients = memberships.filter(({ userId }) => userId !== actor.userId);
  const [versions, history, pointAccounts, servicePointTransactions, badgeAwards] =
    await Promise.all([
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
      db.prisma.serviceConfigurationAudit.findMany({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          action: {
            in: ['POINT_RULES_UPDATED', 'POINT_BONUS_GRANTED', 'POINT_BALANCE_CORRECTED'],
          },
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
      db.prisma.pointAccount.findMany({
        where: { workspaceId: service.workspaceId, userId: { in: memberUserIds } },
        select: { userId: true, availablePoints: true, updatedAt: true },
      }),
      db.prisma.pointTransaction.groupBy({
        by: ['userId'],
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          userId: { in: memberUserIds },
        },
        _sum: { amount: true },
        _max: { createdAt: true },
      }),
      db.prisma.badgeAward.groupBy({
        by: ['userId'],
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          userId: { in: memberUserIds },
          status: 'ACTIVE',
        },
        _count: { _all: true },
        _max: { awardedAt: true },
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
  const pointAccountByUser = new Map(pointAccounts.map((account) => [account.userId, account]));
  const pointChangeByUser = new Map<string, number>();
  const badgeCountByUser = new Map<string, number>();
  const latestActivityByUser = new Map<string, Date>();
  for (const transaction of servicePointTransactions) {
    pointChangeByUser.set(transaction.userId, transaction._sum.amount ?? 0);
    if (transaction._max.createdAt)
      latestActivityByUser.set(transaction.userId, transaction._max.createdAt);
  }
  for (const award of badgeAwards) {
    badgeCountByUser.set(award.userId, award._count._all);
    const latest = latestActivityByUser.get(award.userId);
    if (award._max.awardedAt && (!latest || award._max.awardedAt > latest))
      latestActivityByUser.set(award.userId, award._max.awardedAt);
  }
  for (const account of pointAccounts) {
    const latest = latestActivityByUser.get(account.userId);
    if (!latest || account.updatedAt > latest)
      latestActivityByUser.set(account.userId, account.updatedAt);
  }

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
        {query.corrected ? (
          <p className="notice notice--success">ポイントを訂正しました。</p>
        ) : null}
        {query.error ? (
          <p className="notice notice--danger">
            {query.error === 'correction'
              ? '訂正できませんでした。現在の残高以下のポイント数を入力してください。'
              : '保存できませんでした。入力内容を確認してください。'}
          </p>
        ) : null}

        <section className="settings-card">
          <h2>参加者のポイント・バッジ状況</h2>
          <p>
            現在のWPは、この参加者が同じワークスペースで使える共通残高です。「サービス内の増減」とバッジは、このサービスの活動だけを表示します。
          </p>
          <p>運用記録はCSVで保存できます。ExcelやGoogleスプレッドシートで開けます。</p>
          <div className="button-row">
            <a
              className="button button--secondary"
              href={`/api/services/${encodeURIComponent(serviceSlug)}/rewards-export?kind=summary`}
            >
              参加者一覧を保存
            </a>
            <a
              className="button button--secondary"
              href={`/api/services/${encodeURIComponent(serviceSlug)}/rewards-export?kind=points`}
            >
              ポイント履歴を保存
            </a>
            <a
              className="button button--secondary"
              href={`/api/services/${encodeURIComponent(serviceSlug)}/rewards-export?kind=badges`}
            >
              バッジ履歴を保存
            </a>
            <a
              className="button button--secondary"
              href={`/api/services/${encodeURIComponent(serviceSlug)}/rewards-export?kind=audit`}
            >
              運営操作履歴を保存
            </a>
          </div>
          {memberships.length === 0 ? (
            <p>参加者はまだいません。</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>参加者</th>
                    <th>現在のWP</th>
                    <th>サービス内の増減</th>
                    <th>獲得バッジ</th>
                    <th>最終更新</th>
                  </tr>
                </thead>
                <tbody>
                  {memberships.map((membership) => {
                    const account = pointAccountByUser.get(membership.userId);
                    const change = pointChangeByUser.get(membership.userId) ?? 0;
                    const latest = latestActivityByUser.get(membership.userId);
                    return (
                      <tr key={membership.userId}>
                        <td>
                          <strong>
                            {membership.user.displayName ||
                              membership.user.email ||
                              membership.userId}
                          </strong>
                          <br />
                          <small>
                            {membership.serviceRole === 'SERVICE_OWNER'
                              ? 'サービス所有者'
                              : membership.serviceRole === 'SERVICE_ADMIN'
                                ? '運営管理者'
                                : membership.serviceRole === 'CONTENT_EDITOR'
                                  ? 'コンテンツ担当者'
                                  : '参加者'}
                          </small>
                        </td>
                        <td>{(account?.availablePoints ?? 0).toLocaleString('ja-JP')} WP</td>
                        <td>
                          {change > 0 ? '+' : ''}
                          {change.toLocaleString('ja-JP')} WP
                        </td>
                        <td>{badgeCountByUser.get(membership.userId) ?? 0}個</td>
                        <td>{latest ? latest.toLocaleString('ja-JP') : 'まだありません'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

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
          <p>運営者自身への付与はできません。</p>
          {bonusRecipients.length === 0 ? (
            <p>付与できる参加者はまだいません。</p>
          ) : (
            <form action={grantBonus} className="form-stack">
              <input type="hidden" name="serviceSlug" value={serviceSlug} />
              <label className="field">
                <span className="field__label">参加者</span>
                <select className="field__control" name="userId" required>
                  {bonusRecipients.map((membership) => (
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
          )}
        </section>

        <section className="settings-card">
          <h2>ポイントの誤付与を訂正</h2>
          <p>
            間違えて多く付与した分を減らします。元の履歴は削除されず、訂正理由と操作した運営者が記録されます。
          </p>
          <form action={correctPoints} className="form-stack">
            <input type="hidden" name="serviceSlug" value={serviceSlug} />
            <label className="field">
              <span className="field__label">参加者</span>
              <select className="field__control" name="userId" required>
                {memberships.map((membership) => (
                  <option key={membership.userId} value={membership.userId}>
                    {membership.user.displayName || membership.user.email || membership.userId}
                    （現在
                    {pointAccountByUser.get(membership.userId)?.availablePoints ?? 0} WP）
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">減らすポイント</span>
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
              <span className="field__label">訂正する理由</span>
              <textarea
                className="field__control"
                name="reason"
                minLength={3}
                maxLength={1000}
                required
              />
            </label>
            <button className="button button--secondary" type="submit">
              ポイントを訂正
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
                        : item.action === 'POINT_BALANCE_CORRECTED'
                          ? `${target ?? '参加者'}のポイントを ${Math.abs(Number(amount))} WP訂正`
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
