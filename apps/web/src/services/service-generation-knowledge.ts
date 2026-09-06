import 'server-only';
import {
  GroupKnowledgeService,
  selectGroupKnowledgeChunksForPrompt,
  type GroupKnowledgeChunkRecord,
} from '@bunshin/application';

export interface ServiceGenerationKnowledgeScope {
  workspaceId: string;
  groupId: string;
  actorUserId: string;
}

export interface ServiceBusinessProfileForGeneration {
  industryKey: string;
  industryName: string;
  otherIndustryText: string | null;
  businessName: string;
  region: string | null;
  productService: string;
  primaryPurpose: string;
  targetAudience: string;
}

export function industrySafetyKnowledgeForPrompt(industryKey: string) {
  const common =
    '確認できない実績、効果、順位、価格、期限を作らない。効果を保証せず、利用者が登録した事実だけを使う。';
  const specific: Record<string, string> = {
    HEALTHCARE:
      '診断、治療、予防効果を断定しない。個人差を無視した表現、受診を妨げる表現、未確認の医療情報を使わない。',
    PROFESSIONAL:
      '個別案件の結果を保証せず、法律・税務・労務などの最終判断を促さない。必要に応じて専門家への個別相談を案内する。',
    FITNESS: '減量、体型、健康効果を保証せず、期間と数値を伴う未確認の成果表現を使わない。',
    REAL_ESTATE: '利回り、価格上昇、契約条件を保証せず、物件や取引条件の未確認情報を作らない。',
  };
  return {
    type: 'SERVICE_INDUSTRY_SAFETY',
    title: '業種別の表現ルール',
    content: [common, specific[industryKey]].filter(Boolean).join('\n'),
  };
}

export function businessProfileKnowledgeForPrompt(
  profile: ServiceBusinessProfileForGeneration | null,
) {
  if (!profile) return [];
  const industry =
    profile.industryName === 'その他' && profile.otherIndustryText
      ? profile.otherIndustryText
      : profile.industryName;
  return [
    {
      type: 'SERVICE_BUSINESS_PROFILE',
      title: '参加企業プロフィール',
      content: [
        `業種: ${industry}`,
        `店舗・会社名: ${profile.businessName}`,
        profile.region ? `活動地域: ${profile.region}` : null,
        `商品・サービス: ${profile.productService}`,
        `発信目的: ${profile.primaryPurpose}`,
        `対象顧客: ${profile.targetAudience}`,
      ]
        .filter(Boolean)
        .join('\n'),
    },
    industrySafetyKnowledgeForPrompt(profile.industryKey),
  ];
}

export function serviceKnowledgeForPrompt(chunks: GroupKnowledgeChunkRecord[]) {
  const selected = selectGroupKnowledgeChunksForPrompt(chunks);
  return {
    officialKnowledge: selected.map((chunk) => ({
      type: `SERVICE_${chunk.type}`,
      title: chunk.sourceLabel,
      content: chunk.content.trim(),
    })),
    groupKnowledge: selected.map((chunk) => ({
      chunkId: chunk.id,
      sourceId: chunk.sourceId,
      type: chunk.type,
      sourceLabel: chunk.sourceLabel,
      content: chunk.content.trim(),
    })),
  };
}

export async function loadServiceGenerationKnowledge(scope: ServiceGenerationKnowledgeScope) {
  const db = await import('@bunshin/database');
  const [chunks, businessProfile] = await Promise.all([
    new GroupKnowledgeService(
      new db.PrismaGroupKnowledgeRepository(),
    ).listApprovedChunksForGeneration({
      ...scope,
      productPackVersionId: null,
    }),
    db.prisma.serviceMemberBusinessProfile.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        groupId: scope.groupId,
        userId: scope.actorUserId,
        groupMembership: { status: 'ACTIVE' },
      },
      select: {
        otherIndustryText: true,
        businessName: true,
        region: true,
        productService: true,
        primaryPurpose: true,
        targetAudience: true,
        primaryIndustry: { select: { key: true, name: true } },
      },
    }),
  ]);
  const knowledge = serviceKnowledgeForPrompt(chunks);
  return {
    ...knowledge,
    officialKnowledge: [
      ...businessProfileKnowledgeForPrompt(
        businessProfile?.primaryIndustry
          ? {
              industryKey: businessProfile.primaryIndustry.key,
              industryName: businessProfile.primaryIndustry.name,
              otherIndustryText: businessProfile.otherIndustryText,
              businessName: businessProfile.businessName,
              region: businessProfile.region,
              productService: businessProfile.productService,
              primaryPurpose: businessProfile.primaryPurpose,
              targetAudience: businessProfile.targetAudience,
            }
          : null,
      ),
      ...knowledge.officialKnowledge,
    ],
  };
}
