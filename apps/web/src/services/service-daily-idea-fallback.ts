import 'server-only';
import { CreateDailyMission } from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';

const FALLBACK_VERSION = 'business-daily-idea-fallback-v1';

const angles = [
  'お客様からよく聞かれる質問を一つ選び、短く答える',
  '商品やサービスを始めた理由を、身近な言葉で紹介する',
  '利用前に知っておくと安心できることを一つ紹介する',
  '仕事の裏側や、品質のために大切にしていることを伝える',
  '季節に合わせて、お客様が今できる小さな行動を案内する',
  '利用したお客様が感じやすい変化を、保証せず具体的に説明する',
  'スタッフや事業の価値観が伝わる小さな出来事を紹介する',
] as const;

export function buildServiceDailyIdeaFallback(input: {
  missionDate: string;
  industry: string;
  businessName: string;
  productService: string;
  targetAudience: string;
}) {
  const day = Number(input.missionDate.slice(-2));
  const angle = angles[Number.isFinite(day) ? day % angles.length : 0]!;
  const topic = `${input.industry}の発信アイデア`;
  return {
    version: FALLBACK_VERSION,
    topic,
    angle,
    reason: `${FALLBACK_VERSION}: AIを利用できない場合の審査済み予備案です。`,
    body: `${input.businessName}の今日の発信アイデアです。\n\nテーマ：${angle}\n\n「${input.productService}」について、${input.targetAudience}が理解しやすい具体例を一つ添えて紹介しましょう。効果を断定せず、実際に確認できる事実だけを使ってください。`,
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
      select: { id: true },
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
    assistanceLevel: 'READY_TO_USE',
    estimatedMinutes: 5,
    topic: idea.topic,
    angle: idea.angle,
    reason: idea.reason,
    qualityScore: null,
    content: {
      body: idea.body,
      threadParts: [],
      cta: '伝えたい内容に合わせて整え、ご自身のSNSで投稿してください。',
      caption: idea.body,
      hashtags: [],
    },
  });
}
