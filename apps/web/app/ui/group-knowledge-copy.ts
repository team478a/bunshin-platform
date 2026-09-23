export const groupKnowledgeTypeLabel = {
  PDF: 'PDF',
  VIDEO: '動画',
  URL: 'Webページ',
  TEXT: '入力した文章',
} as const;

export const groupKnowledgeStatusLabel = {
  DRAFT: '読み取り待ち',
  PROCESSING: '読み取り中',
  REVIEW_REQUIRED: '内容の確認待ち',
  ACTIVE: '投稿づくりに利用中',
  FAILED: '読み取りに失敗',
  ARCHIVED: '利用停止',
} as const;

const failureMessage: Record<string, string> = {
  GROUP_KNOWLEDGE_PROVIDER_ERROR:
    '外部サービスが混み合っているか、一時的に接続できませんでした。もう一度読み取れます。',
  GROUP_KNOWLEDGE_VALIDATION_ERROR:
    '資料の内容または形式を読み取れませんでした。ファイルやURLを確認してください。',
  GROUP_KNOWLEDGE_FORBIDDEN: 'この資料を読み取る権限を確認できませんでした。',
  GROUP_KNOWLEDGE_NOT_FOUND: '登録した資料が見つかりませんでした。',
  GROUP_KNOWLEDGE_CONFLICT: '別の処理と重なりました。少し待ってからもう一度お試しください。',
  GROUP_KNOWLEDGE_WEB_RESPONSE_TOO_LARGE:
    'Webページ全体が2MBを超えています。必要な内容だけのページ、PDF、または文章で登録してください。',
  GROUP_KNOWLEDGE_WEB_TEXT_TOO_LARGE:
    'Webページの本文が長すぎます。内容を複数のページに分けて登録してください。',
  GROUP_KNOWLEDGE_VIDEO_TOO_LARGE:
    '動画が25MBを超えています。短く分けるか、画質を下げてから登録してください。',
  SOURCE_NOT_FOUND: '登録した資料が見つかりませんでした。',
  SOURCE_NOT_PROCESSABLE: 'この資料の形式には対応していません。',
};

export function friendlyGroupKnowledgeFailure(code: string) {
  return failureMessage[code] ?? '内容を読み取れませんでした。もう一度お試しください。';
}

export function groupKnowledgeUsageDateTime(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(new Date(value));
}
