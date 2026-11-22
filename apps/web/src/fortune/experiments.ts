import 'server-only';
import type { PrismaClient } from '@bunshin/database';
import { ApplicationError } from '@bunshin/shared';
import { z } from 'zod';

type Scope = { workspaceId: string; groupId: string };

export const hypothesisKinds = [
  'SELF_UNDERSTANDING',
  'ACCESSORIES',
  'EXPERT_CONSULTATION',
] as const;
export const interestStatuses = ['INTERESTED', 'CONTACTED', 'REFERRED', 'CLOSED'] as const;
export const interestLabels = {
  INTERESTED: '関心登録',
  CONTACTED: '案内済み',
  REFERRED: '外部窓口へ案内済み',
  CLOSED: '対応終了',
};
export const initialHypotheses = {
  SELF_UNDERSTANDING: {
    name: '30日自己理解プログラム',
    proposedPriceYen: 2980,
    description: '30日間、自分の考えや選択を整理するプログラムの関心を募っています。',
  },
  ACCESSORIES: {
    name: '天然石・アクセサリー',
    proposedPriceYen: 9800,
    description: '受注生産の天然石・アクセサリーに関心がある方を募っています。',
  },
  EXPERT_CONSULTATION: {
    name: '専門家相談',
    proposedPriceYen: 8000,
    description: '提携先の専門家への相談を希望する方を募っています。料金は相談内容で変わります。',
  },
};

async function settingId(db: PrismaClient, scope: Scope) {
  const setting = await db.fortuneServiceSetting.findFirst({ where: scope, select: { id: true } });
  if (!setting) throw new ApplicationError('NOT_FOUND', '占い設定を確認できません。');
  return setting.id;
}

const money = z.coerce.number().int().min(0).max(1_000_000_000);
const optionalMoney = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  money.optional(),
);
const signedMoney = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.coerce.number().int().min(-1_000_000_000).max(1_000_000_000).optional(),
);
const https = z
  .string()
  .max(500)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  });

export async function saveFortuneHypothesis(db: PrismaClient, scope: Scope, input: unknown) {
  const { kind, ...data } = z
    .object({
      kind: z.enum(hypothesisKinds),
      name: z.string().trim().min(1).max(120),
      description: z.string().trim().min(1).max(500),
      proposedPriceYen: money,
      externalUrl: z.union([z.literal(''), https]).transform((value) => value || null),
      published: z.boolean(),
    })
    .parse(input);
  const key = { ...scope, kind };
  await db.fortuneProductHypothesis.upsert({
    where: { workspaceId_groupId_kind: key },
    create: { ...key, ...data, serviceSettingId: await settingId(db, scope) },
    update: data,
  });
}

export async function changeFortuneInterest(
  db: PrismaClient,
  scope: Scope & { memberUserId: string },
  input: unknown,
) {
  const data = z.object({ id: z.string().uuid(), interested: z.boolean() }).parse(input);
  const { memberUserId, ...service } = scope;
  if (!data.interested) {
    await db.fortuneProductInterest.deleteMany({
      where: { ...scope, hypothesisId: data.id },
    });
    return;
  }
  const [hypothesis, membership] = await Promise.all([
    db.fortuneProductHypothesis.findFirst({
      where: { ...service, id: data.id, published: true, serviceSetting: { enabled: true } },
      select: { id: true },
    }),
    db.groupMembership.findFirst({
      where: {
        ...service,
        userId: memberUserId,
        status: 'ACTIVE',
        serviceRole: 'PARTICIPANT',
        consentedAt: { not: null },
      },
      select: { id: true },
    }),
  ]);
  if (!hypothesis || !membership)
    throw new ApplicationError('NOT_FOUND', '関心登録を受け付けていません。');
  await db.fortuneProductInterest.createMany({
    data: { ...scope, hypothesisId: hypothesis.id, groupMembershipId: membership.id },
    skipDuplicates: true,
  });
}

export async function saveFortuneInterestStatus(db: PrismaClient, scope: Scope, input: unknown) {
  const { id, status } = z
    .object({ id: z.string().uuid(), status: z.enum(interestStatuses) })
    .parse(input);
  const result = await db.fortuneProductInterest.updateMany({
    where: { ...scope, id },
    data: { status },
  });
  if (result.count !== 1) throw new ApplicationError('NOT_FOUND', '関心登録を確認できません。');
}

const date = z.iso.date().transform((value) => new Date(`${value}T00:00:00Z`));
const evidence = z.object({
  priceYen: optionalMoney,
  advertisingYen: optionalMoney,
  purchases: optionalMoney,
  salesYen: optionalMoney,
  costsYen: optionalMoney,
  profitYen: signedMoney,
  lpVersion: z.string().trim().max(120),
  changes: z.string().trim().max(2000),
  observed: z.string().trim().max(2000),
  next: z.string().trim().max(1000),
  evaluation: z.enum(['PLANNED', 'RUNNING', 'INCONCLUSIVE', 'CONTINUE', 'STOP']),
});
export const experimentEvaluations = {
  PLANNED: '計画中',
  RUNNING: '実施中',
  INCONCLUSIVE: '要追加検証',
  CONTINUE: '継続',
  STOP: '終了',
};

export async function saveFortuneExperiment(db: PrismaClient, scope: Scope, input: unknown) {
  const {
    id,
    evidence: captured,
    ...fields
  } = z
    .object({
      id: z.string().uuid().optional(),
      title: z.string().trim().min(1).max(160),
      productLabel: z.string().trim().min(1).max(120),
      startsOn: date,
      endsOn: date,
      channel: z.string().trim().min(1).max(64),
      evidence,
    })
    .refine((value) => value.startsOn <= value.endsOn)
    .parse(input);
  const data = { ...fields, evidence: captured };
  if (!id) {
    await db.fortuneSalesExperiment.create({
      data: { ...scope, ...data, serviceSettingId: await settingId(db, scope) },
    });
    return;
  }
  const updated = await db.fortuneSalesExperiment.updateMany({ where: { ...scope, id }, data });
  if (updated.count !== 1)
    throw new ApplicationError('NOT_FOUND', '販売実証記録を確認できません。');
}

export function readFortuneExperimentEvidence(value: unknown) {
  return evidence.safeParse(value).data;
}
