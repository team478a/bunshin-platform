import 'server-only';
import { CreateDailyMission, type BusinessContentCategory } from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';

const FALLBACK_VERSION = 'business-daily-ready-fallback-v3';

const angles = [
  'お客様からよく聞かれる質問を一つ選び、短く答える',
  '商品やサービスを始めた理由を、身近な言葉で紹介する',
  '利用前に知っておくと安心できることを一つ紹介する',
  '仕事の裏側や、品質のために大切にしていることを伝える',
  '季節に合わせて、お客様が今できる小さな行動を案内する',
  '利用したお客様が感じやすい変化を、保証せず具体的に説明する',
  'スタッフや事業の価値観が伝わる小さな出来事を紹介する',
] as const;

const categoryAngles: Record<BusinessContentCategory, string> = {
  HELPFUL_EXPERTISE: 'お客様が今日から使える、商品・サービス選びの小さなコツ',
  COMPANY_STAFF: '商品やサービスを届ける前に大切にしている準備や仕事の様子',
  FAQ_PROBLEM: 'お客様からよく聞かれる質問への、分かりやすい答え',
  CASE_STUDY: '商品やサービスが役立つ具体的な場面と、利用前に確認したいこと',
  PRODUCT_SERVICE: '商品やサービスの特徴と、どんな方に向いているか',
};

const photoDirections = [
  '商品やサービスの全体が分かる写真を、明るい場所で正面から撮ります',
  '準備中の手元や道具を一つ選び、少し斜め上から撮ります',
  'お客様が利用する場面を想像できる場所を、広めの構図で撮ります',
  '品質のために大切にしている細部へ近づき、アップで撮ります',
  '商品やサービスと一緒に使う物を一つ添え、横から撮ります',
  '入口、看板、パッケージなど目印になる物を中央に置いて撮ります',
  'スタッフが準備した成果物を、背景を整えて撮ります',
] as const;

function dailyIndex(missionDate: string): number {
  const value = new Date(`${missionDate}T00:00:00.000Z`).getTime();
  return Number.isFinite(value) ? Math.floor(value / 86_400_000) : 0;
}

function stableIndex(value: string): number {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  return hash;
}

function hashtag(value: string) {
  const normalized = value.replace(/[\s#・、。,.!！?？()（）/\\]+/g, '');
  return normalized ? `#${normalized.slice(0, 40)}` : null;
}

export function buildServiceDailyIdeaFallback(input: {
  missionDate: string;
  industry: string;
  businessName: string;
  productService: string;
  targetAudience: string;
  businessFeatures?: string | null;
  preferredTone?: string | null;
  category?: BusinessContentCategory | null;
  variationKey?: string;
}) {
  const participantVariation = stableIndex(input.variationKey ?? 'shared');
  const rotation = Math.abs(dailyIndex(input.missionDate));
  const angleIndex = (rotation + participantVariation) % angles.length;
  const photoIndex =
    (rotation * 3 + Math.floor(participantVariation / angles.length)) % angles.length;
  const dailyAngle = angles[angleIndex]!;
  const angle = input.category
    ? `${categoryAngles[input.category]}。今日は「${dailyAngle}」という切り口で伝える`
    : dailyAngle;
  const topic = `${input.targetAudience}へ伝える「${input.productService}」の話`;
  const feature = input.businessFeatures?.trim()
    ? `私たちは、${input.businessFeatures.trim()}を大切にしています。`
    : `${input.businessName}では、分かりやすいご案内を大切にしています。`;
  const hashtags = [
    hashtag(input.businessName),
    hashtag(input.industry),
    hashtag(input.productService),
  ].filter((value): value is string => Boolean(value));
  const body = `${input.targetAudience}の皆さまへ。\n\n今日は「${angle}」をご紹介します。\n\n${feature}\n\n${input.productService}について気になることがあれば、いつでもお気軽にご相談ください。`;
  return {
    version: FALLBACK_VERSION,
    topic,
    angle,
    reason: `${FALLBACK_VERSION}: AIを利用できない場合の審査済み予備案です。`,
    body,
    hashtags,
    photoInstruction: `「${input.productService}」に関係する被写体を使います。${photoDirections[photoIndex]}。周りの不要な物は片付けます。`,
  };
}

export function shouldUseServiceDailyIdeaFallback(error: unknown) {
  if (!(error instanceof ApplicationError)) return false;
  return (
    ['AI_PROVIDER_UNAVAILABLE', 'CONTENT_REJECTED', 'INTERNAL_ERROR'].includes(error.code) ||
    (error.code === 'FORBIDDEN' && error.message.includes('AI generation limit'))
  );
}

export async function createServiceDailyIdeaFallback(input: {
  workspaceId: string;
  groupId: string;
  bunshinId: string;
  actorUserId: string;
  missionDate: string;
  assistanceLevel?: 'IDEA_ONLY' | 'GUIDED' | 'READY_TO_USE';
}) {
  const db = await import('@bunshin/database');
  const [profile, socialProfile, weeklyItem] = await Promise.all([
    db.prisma.serviceMemberBusinessProfile.findFirst({
      where: {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        userId: input.actorUserId,
        groupMembership: { status: 'ACTIVE' },
      },
      select: {
        otherIndustryText: true,
        businessName: true,
        productService: true,
        targetAudience: true,
        businessFeatures: true,
        preferredTone: true,
        primaryIndustry: { select: { name: true } },
      },
    }),
    db.prisma.socialProfile.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        status: 'ACTIVE',
        bunshin: { groupId: input.groupId, ownerUserId: input.actorUserId },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    }),
    db.prisma.weeklyPlanItem.findFirst({
      where: {
        workspaceId: input.workspaceId,
        bunshinId: input.bunshinId,
        scheduledDate: new Date(`${input.missionDate}T00:00:00.000Z`),
        weeklyPlan: {
          status: 'CONFIRMED',
          bunshin: { groupId: input.groupId, ownerUserId: input.actorUserId },
        },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, businessContentCategory: true },
    }),
  ]);
  if (!profile?.primaryIndustry || !socialProfile) {
    throw new ApplicationError('NOT_FOUND', 'service business profile is unavailable');
  }
  const idea = buildServiceDailyIdeaFallback({
    missionDate: input.missionDate,
    industry: profile.otherIndustryText || profile.primaryIndustry.name,
    businessName: profile.businessName,
    productService: profile.productService,
    targetAudience: profile.targetAudience,
    businessFeatures: profile.businessFeatures,
    preferredTone: profile.preferredTone,
    category: weeklyItem?.businessContentCategory ?? null,
    variationKey: input.bunshinId,
  });
  return new CreateDailyMission(
    new db.PrismaDailyMissionRepository(),
    new db.PrismaBunshinCapabilityAssignmentRepository(),
  ).execute({
    ...input,
    socialProfileId: socialProfile.id,
    weeklyPlanItemId: weeklyItem?.id ?? null,
    missionDate: input.missionDate,
    format: 'TEXT',
    assistanceLevel: input.assistanceLevel ?? 'READY_TO_USE',
    estimatedMinutes: 5,
    topic: idea.topic,
    angle: idea.angle,
    reason: idea.reason,
    qualityScore: null,
    content: {
      body: idea.body,
      threadParts: [],
      cta: '気になることがあれば、コメントやメッセージでお気軽にお尋ねください。',
      caption: idea.body,
      hashtags: idea.hashtags,
      photoInstruction: idea.photoInstruction,
    },
  });
}
