import type { Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { currentUserProvider } from '../../../../../src/auth/current-user';
import { resolveManagedServiceContext } from '../../../../../src/services/public-service';
import { RULES } from './point-definitions';

const optionalBudgetSchema = z.preprocess(
  (value) => (value === '' ? null : value),
  z.coerce.number().int().min(1).max(10_000_000).nullable(),
);

const settingsSchema = z.object({
  serviceSlug: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(3).max(1000),
  MISSION_VIEWED_DAILY: z.coerce.number().int().min(1).max(10000),
  POSTED_DAILY: z.coerce.number().int().min(1).max(10000),
  POSTED_WEEKLY_3: z.coerce.number().int().min(1).max(10000),
  budget_MISSION_VIEWED_DAILY: optionalBudgetSchema,
  budget_POSTED_DAILY: optionalBudgetSchema,
  budget_POSTED_WEEKLY_3: optionalBudgetSchema,
});

const campaignSettingsSchema = z.object({
  serviceSlug: z.string().trim().min(1).max(80),
  campaignId: z.uuid(),
  reason: z.string().trim().min(3).max(1000),
});
const campaignRuleModeSchema = z.enum(['INHERIT', 'ACTIVE', 'SUSPENDED']);
const campaignRuleAmountSchema = z.coerce.number().int().min(1).max(10000);

export async function saveRules(formData: FormData) {
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
        include: { budget: true },
        orderBy: { version: 'desc' },
      });
      const grantedPointsByRule = new Map<string, number>();
      for (const rule of RULES) {
        const amount = parsed.data[rule.key];
        const maximumPoints = parsed.data[rule.budgetKey];
        const enabled = formData.get(`enabled_${rule.key}`) === 'on';
        const [latest, issued] = await Promise.all([
          tx.pointRuleVersion.aggregate({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              campaignId: null,
              ruleKey: rule.key,
            },
            _max: { version: true },
          }),
          tx.pointTransaction.aggregate({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              type: 'GRANT',
              ruleVersion: { ruleKey: rule.key, campaignId: null },
            },
            _sum: { amount: true },
          }),
        ]);
        const grantedPoints = issued._sum.amount ?? 0;
        grantedPointsByRule.set(rule.key, grantedPoints);
        if (maximumPoints !== null && maximumPoints < grantedPoints)
          throw new Error('BUDGET_BELOW_GRANTED');
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
            ...(maximumPoints === null
              ? {}
              : { budget: { create: { maximumPoints, grantedPoints } } }),
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
            maximumPoints: rule.budget?.maximumPoints ?? null,
            grantedPoints: rule.budget?.grantedPoints ?? null,
          })),
          afterData: RULES.map((rule) => ({
            ruleKey: rule.key,
            status: formData.get(`enabled_${rule.key}`) === 'on' ? 'ACTIVE' : 'SUSPENDED',
            grantAmount: parsed.data[rule.key],
            maximumPoints: parsed.data[rule.budgetKey],
            grantedPoints:
              parsed.data[rule.budgetKey] === null ? null : grantedPointsByRule.get(rule.key),
          })),
          reason: parsed.data.reason,
          performedByUserId: actor.userId,
          occurredAt: now,
        },
      });
    });
  } catch (error) {
    redirect(
      `${returnPath}?error=${error instanceof Error && error.message === 'BUDGET_BELOW_GRANTED' ? 'budget' : 'settings'}` as Route,
    );
  }
  revalidatePath(returnPath);
  redirect(`${returnPath}?saved=1` as Route);
}

export async function saveCampaignRules(formData: FormData) {
  'use server';
  const actor = await (await currentUserProvider()).getCurrentUser();
  if (!actor) redirect('/login');
  const parsed = campaignSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/groups');
  const returnPath = `/s/${parsed.data.serviceSlug}/manage/points` as Route;
  const settings = RULES.map((rule) => {
    const mode = campaignRuleModeSchema.safeParse(formData.get(`mode_${rule.key}`));
    const amount = campaignRuleAmountSchema.safeParse(formData.get(rule.key));
    const budget = optionalBudgetSchema.safeParse(formData.get(rule.budgetKey));
    return mode.success && amount.success && budget.success
      ? { rule, mode: mode.data, amount: amount.data, maximumPoints: budget.data }
      : null;
  });
  if (settings.some((setting) => setting === null))
    redirect(`${returnPath}?error=campaign-rules` as Route);
  try {
    const service = await resolveManagedServiceContext(parsed.data.serviceSlug, actor.userId);
    const db = await import('@bunshin/database');
    const now = new Date();
    await db.prisma.$transaction(async (tx) => {
      const [campaign, configuration] = await Promise.all([
        tx.campaign.findFirst({
          where: {
            id: parsed.data.campaignId,
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            status: { in: ['DRAFT', 'OPEN'] },
            endsAt: { gt: now },
          },
          select: { id: true, name: true, startsAt: true, endsAt: true },
        }),
        tx.serviceConfiguration.findFirst({
          where: { workspaceId: service.workspaceId, groupId: service.serviceId },
          select: { id: true },
        }),
      ]);
      if (!campaign || !configuration) throw new Error('CAMPAIGN_NOT_FOUND');
      const previous = await tx.pointRuleVersion.findMany({
        where: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          campaignId: campaign.id,
          ruleKey: { in: RULES.map((rule) => rule.key) },
          status: { in: ['ACTIVE', 'SUSPENDED'] },
        },
        include: { budget: true },
        orderBy: { version: 'desc' },
      });
      const after = [];
      for (const setting of settings) {
        if (!setting) continue;
        const { rule, mode, amount, maximumPoints } = setting;
        const [latest, issued] = await Promise.all([
          tx.pointRuleVersion.aggregate({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              campaignId: campaign.id,
              ruleKey: rule.key,
            },
            _max: { version: true },
          }),
          tx.pointTransaction.aggregate({
            where: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              campaignId: campaign.id,
              type: 'GRANT',
              ruleVersion: { ruleKey: rule.key },
            },
            _sum: { amount: true },
          }),
        ]);
        const grantedPoints = issued._sum.amount ?? 0;
        if (mode === 'ACTIVE' && maximumPoints !== null && maximumPoints < grantedPoints)
          throw new Error('BUDGET_BELOW_GRANTED');
        await tx.pointRuleVersion.updateMany({
          where: {
            workspaceId: service.workspaceId,
            groupId: service.serviceId,
            campaignId: campaign.id,
            ruleKey: rule.key,
            status: { in: ['DRAFT', 'ACTIVE', 'SUSPENDED'] },
          },
          data: { status: 'SUPERSEDED' },
        });
        if (mode !== 'INHERIT') {
          await tx.pointRuleVersion.create({
            data: {
              workspaceId: service.workspaceId,
              groupId: service.serviceId,
              campaignId: campaign.id,
              ruleKey: rule.key,
              version: (latest._max.version ?? 0) + 1,
              status: mode,
              grantAmount: amount,
              dailyLimit: rule.dailyLimit === null ? null : amount,
              weeklyLimit: rule.weeklyLimit === null ? null : amount,
              startsAt: campaign.startsAt > now ? campaign.startsAt : now,
              endsAt: campaign.endsAt,
              ...(mode === 'ACTIVE' && maximumPoints !== null
                ? { budget: { create: { maximumPoints, grantedPoints } } }
                : {}),
            },
          });
        }
        after.push({
          ruleKey: rule.key,
          mode,
          grantAmount: amount,
          maximumPoints: mode === 'ACTIVE' ? maximumPoints : null,
          grantedPoints: mode === 'ACTIVE' && maximumPoints !== null ? grantedPoints : null,
        });
      }
      await tx.serviceConfigurationAudit.create({
        data: {
          workspaceId: service.workspaceId,
          groupId: service.serviceId,
          configurationId: configuration.id,
          action: 'CAMPAIGN_POINT_RULES_UPDATED',
          beforeData: {
            campaignId: campaign.id,
            campaignName: campaign.name,
            rules: previous.map((rule) => ({
              ruleKey: rule.ruleKey,
              status: rule.status,
              grantAmount: rule.grantAmount,
              maximumPoints: rule.budget?.maximumPoints ?? null,
              grantedPoints: rule.budget?.grantedPoints ?? null,
            })),
          },
          afterData: { campaignId: campaign.id, campaignName: campaign.name, rules: after },
          reason: parsed.data.reason,
          performedByUserId: actor.userId,
          occurredAt: now,
        },
      });
    });
  } catch (error) {
    const code =
      error instanceof Error && error.message === 'BUDGET_BELOW_GRANTED'
        ? 'campaign-budget'
        : 'campaign-rules';
    redirect(`${returnPath}?error=${code}` as Route);
  }
  revalidatePath(returnPath);
  revalidatePath('/points');
  redirect(`${returnPath}?campaignRules=1` as Route);
}
