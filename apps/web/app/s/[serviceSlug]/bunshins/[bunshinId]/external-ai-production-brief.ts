import type { DailyMissionView } from '../../../../(app)/bunshins/[bunshinId]/daily-mission-section';

const platformLabels: Record<NonNullable<DailyMissionView['platform']>, string> = {
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  X: 'X',
  THREADS: 'Threads',
  YOUTUBE_SHORTS: 'YouTube Shorts',
  OTHER: 'その他のSNS',
};

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function records(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === 'object' && !Array.isArray(item),
      )
    : [];
}

function contentSummary(mission: DailyMissionView) {
  const content = mission.content;
  const values = [
    text(content['body']),
    text(content['caption']),
    text(content['prompt']),
    text(content['imageInstruction']),
    text(content['shootingInstruction']),
  ].filter((value): value is string => value !== null);
  const slides = records(content['slides']).flatMap((slide, index) => {
    const headline = text(slide['headline']);
    const body = text(slide['body']);
    const visualScene = text(slide['visualScene']);
    return headline || body || visualScene
      ? [`${index + 1}枚目: ${[headline, body, visualScene].filter(Boolean).join(' / ')}`]
      : [];
  });
  const script = records(content['script']).flatMap((part) => {
    const seconds = text(part['seconds']);
    const role = text(part['role']);
    const line = text(part['text']);
    return line ? [`${[seconds, role].filter(Boolean).join(' ')}: ${line}`] : [];
  });
  return [...values, ...slides, ...script];
}

function recommendedMedia(mission: DailyMissionView) {
  if (mission.format === 'AI_VIDEO_PROMPT') {
    const settings =
      mission.content['videoSettings'] !== null &&
      typeof mission.content['videoSettings'] === 'object' &&
      !Array.isArray(mission.content['videoSettings'])
        ? (mission.content['videoSettings'] as Record<string, unknown>)
        : {};
    return `縦型動画。比率: ${text(settings['aspectRatio']) ?? '投稿案の指定に従う'}、長さ: ${typeof settings['durationSeconds'] === 'number' ? `${settings['durationSeconds']}秒` : '投稿案の指定に従う'}、雰囲気: ${text(settings['style']) ?? '本人の発信スタイルに合わせる'}`;
  }
  if (mission.format === 'LIVE_ACTION')
    return 'スマートフォンで撮る縦型の短い実写動画。台本の順番を保つ。';
  if (mission.format === 'IMAGE' || mission.format === 'SLIDE')
    return 'SNSで読みやすい縦長画像。投稿案にページ構成がある場合は、その枚数と順番を保つ。';
  const photoInstruction = text(mission.content['photoInstruction']);
  return photoInstruction
    ? `テキスト投稿と写真1枚。写真: ${photoInstruction}`
    : 'テキスト投稿。根拠のない写真や商品画像を追加しない。';
}

function linesOrNone(values: string[]) {
  return values.length ? values.map((value) => `- ${value}`) : ['- 指定なし。新しく作らない。'];
}

export function createExternalAiProductionBrief(mission: DailyMissionView) {
  const context = mission.productionBriefContext;
  const campaign = context?.campaign ?? null;
  const requiredDisclosures = new Set(campaign?.requiredDisclosures ?? []);
  if (mission.classification === 'ADVERTISEMENT') requiredDisclosures.add('#PR');
  const officialInformation = campaign
    ? [
        `企画名: ${campaign.name}`,
        `企画テーマ: ${campaign.theme}`,
        `対象: ${campaign.targetSummary}`,
        `商品・サービス概要: ${campaign.productSummary}`,
        `提供元: ${campaign.providerName}`,
        ...campaign.facts.map(({ label, value }) => `${label}: ${value}`),
        ...(mission.externalLinkUsage
          ? [
              `案内先: ${mission.externalLinkUsage.linkName}`,
              `本人用URL: ${mission.externalLinkUsage.insertedUrl}`,
            ]
          : []),
      ]
    : [];
  const allowedAssets =
    campaign?.allowedAssets.map(
      ({ label, url, usageTerms }) => `${label}: ${url}（利用条件: ${usageTerms}）`,
    ) ?? [];
  const prohibited = [
    ...(campaign?.prohibitedExpressions ?? []).map((value) => `「${value}」は使わない`),
    ...(campaign?.conditionalExpressions ?? []).map(
      ({ expression, condition }) => `「${condition}」に触れる場合は「${expression}」を含める`,
    ),
    '公式情報にない価格・効果・実績・在庫・体験を追加しない',
    '本人や第三者の個人情報を追加しない',
  ];
  const original = contentSummary(mission);

  return [
    '外部AI向け 制作指示（Muse・ChatGPT等で共通利用）',
    '',
    '【依頼】',
    '以下の投稿案を、内容と安全ルールを変えずに制作してください。公開や投稿は行わず、確認できる下書きだけを返してください。',
    '',
    '【投稿目的】',
    `- ${mission.topic}`,
    `- ねらい: ${mission.reason}`,
    '',
    '【対象SNS】',
    `- ${mission.platform ? platformLabels[mission.platform] : '未設定。投稿先を推測しない。'}`,
    '',
    '【本人の発信スタイル】',
    ...linesOrNone([mission.angle, ...(context?.personalStyle ?? [])].filter(Boolean)),
    '',
    '【公式の商品・イベント情報】',
    ...linesOrNone(officialInformation),
    '',
    '【使用を許可された素材】',
    ...linesOrNone(allowedAssets),
    '- 上記以外のロゴ、人物写真、商品画像、第三者素材を追加しない。',
    '',
    '【必須の広告表示】',
    ...linesOrNone([...requiredDisclosures]),
    '',
    '【禁止・条件付き表現】',
    ...prohibited.map((value) => `- ${value}`),
    '',
    '【推奨する画像・動画形式】',
    `- ${recommendedMedia(mission)}`,
    '',
    '【元の投稿案】',
    ...linesOrNone(original),
    '',
    '【出力時の確認】',
    '- 必須表示、URL、固有名詞、数値を省略・変更しない。',
    '- 不明な情報は補完せず「要確認」と示す。',
    '- 完成物と一緒に、守った必須表示と使用素材を短く列挙する。',
  ].join('\n');
}
