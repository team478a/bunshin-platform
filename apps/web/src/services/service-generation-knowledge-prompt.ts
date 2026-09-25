import {
  selectGroupKnowledgeChunksForPrompt,
  type GroupKnowledgeChunkRecord,
} from '@bunshin/application';
import type {
  MissionExecutionResultType,
  ServiceBusinessProfileForGeneration,
} from './service-generation-knowledge-types';

export function executionResultKnowledgeForPrompt(
  results: Array<{
    type: MissionExecutionResultType;
    missionDate: string;
    topic: string;
  }>,
) {
  if (results.length === 0) return null;
  const labels: Record<MissionExecutionResultType, string> = {
    EXECUTION_COMPLETED: 'できた',
    EXECUTION_PARTIAL: '一部できた',
    EXECUTION_NOT_COMPLETED: 'できなかった',
    EXECUTION_HELP_NEEDED: 'やり方が分からなかった',
  };
  const latest = results[0]!;
  const nextGuidance =
    latest.type === 'EXECUTION_HELP_NEEDED'
      ? '次回は専門用語を使わず、スマートフォンで迷わずできる一つの操作まで具体的に説明する。'
      : latest.type === 'EXECUTION_NOT_COMPLETED'
        ? '次回は5分以内で終わる一つの行動へ小さくし、準備が必要な案を避ける。'
        : latest.type === 'EXECUTION_PARTIAL'
          ? '次回は前回できた部分を繰り返さず、残りを一つの短い行動にする。'
          : '次回も一つの具体的な行動に絞り、少しだけ次の段階へ進める。';
  return {
    type: 'SERVICE_RECENT_EXECUTION_RESULTS',
    title: '最近の実行結果',
    content: [
      ...results.map(
        (result) => `${result.missionDate}「${result.topic}」: ${labels[result.type]}`,
      ),
      `次回の調整: ${nextGuidance}`,
    ].join('\n'),
  };
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
        profile.websiteUrl ? `Webサイト: ${profile.websiteUrl}` : null,
        profile.businessFeatures ? `特徴・選ばれる理由: ${profile.businessFeatures}` : null,
        profile.priceInformation ? `価格・料金の情報: ${profile.priceInformation}` : null,
        profile.preferredTone ? `文章の雰囲気: ${profile.preferredTone}` : null,
        profile.requiredContent ? `必ず入れる内容: ${profile.requiredContent}` : null,
        profile.forbiddenContent ? `使わない内容・表現: ${profile.forbiddenContent}` : null,
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
