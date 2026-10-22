export interface SideHustleExcludedArea {
  readonly key: string;
  readonly label: string;
  readonly reason: string;
  readonly keywords: readonly string[];
}

export const SIDE_HUSTLE_EXCLUDED_AREAS: readonly SideHustleExcludedArea[] = Object.freeze(
  [
    {
      key: 'INVESTMENT_SPECULATION',
      label: '投資・FX・暗号資産・ギャンブル',
      reason: '元本割れの危険があり、副業支援の範囲を超えるため',
      keywords: [
        'FX',
        '暗号資産',
        '仮想通貨',
        '株式投資',
        '投資信託',
        'ギャンブル',
        'パチンコ',
        'スロット',
      ],
    },
    {
      key: 'MLM_REFERRAL_DRIVEN',
      label: 'MLM・ネットワークビジネス・紹介報酬が主目的のもの',
      reason: '人間関係や金銭のトラブルが起きやすいため',
      keywords: ['MLM', 'ネットワークビジネス', 'マルチ商法', '連鎖販売'],
    },
    {
      key: 'HIGH_PRICE_SCHOOL_RECRUITING',
      label: '高額スクール・情報商材の購入や勧誘が前提のもの',
      reason: '費用回収の見込みが立たず、勧誘トラブルにつながるため',
      keywords: ['情報商材', '高額スクール', '高額塾'],
    },
    {
      key: 'LICENSED_PROFESSIONAL_WORK',
      label: '資格や登録が必要な専門業務（士業、医療、不動産仲介など）',
      reason: '資格のない人が行えない業務を含むため',
      keywords: [
        '税理士業務',
        '行政書士業務',
        '社労士業務',
        '弁護士業務',
        '医療行為',
        '不動産仲介',
      ],
    },
    {
      key: 'REGULATED_MANUFACTURING',
      label: '食品・化粧品・医薬品等の製造販売',
      reason: '営業許可や製造販売業の許可が必要になるため',
      keywords: [
        '食品の製造販売',
        '化粧品の製造販売',
        '医薬品の製造販売',
        '手作り食品の販売',
        '手作り化粧品の販売',
      ],
    },
    {
      key: 'USED_GOODS_RESALE_SOURCING',
      label: '中古品を仕入れて転売すること',
      reason: '古物商許可が必要になるため。自宅の不用品を売ることは対象に含む',
      keywords: ['せどり', '仕入れて転売', '仕入れ転売', '転売ビジネス'],
    },
    {
      key: 'ADULT_CONTENT',
      label: '成人向けコンテンツ',
      reason: '本サービスの対象外のため',
      keywords: ['アダルト', '成人向け'],
    },
    {
      key: 'PERSONAL_DATA_OR_ACCOUNT_TRADING',
      label: '個人情報・アカウント・レビューの売買や代行投稿',
      reason: '規約違反や法令違反のおそれが高いため',
      keywords: [
        'アカウント売買',
        'レビュー代行',
        '口コミ代行',
        'フォロワー購入',
        '個人情報の販売',
      ],
    },
  ].map((area) => Object.freeze({ ...area, keywords: Object.freeze(area.keywords) })),
);

export const GUARANTEE_EXPRESSIONS = Object.freeze([
  '必ず稼げ',
  '確実に稼げ',
  '誰でも稼げ',
  '絶対',
  '保証',
  '月収',
  '万円稼',
] as const);

export const SIDE_HUSTLE_COMMON_NOTICES = Object.freeze([
  {
    kind: 'EMPLOYMENT',
    text: '勤務先の就業規則で副業が認められているか、始める前に確認してください。',
  },
  {
    kind: 'TAX',
    text: '収入が出た場合の申告の要否は、税務署や税理士に確認してください。',
  },
  {
    kind: 'ESTIMATE',
    text: '費用・時間・注意点はAIによる一般的な目安です。始める前にご自身でも確認してください。',
  },
] as const);

const normalized = (value: string) => value.normalize('NFKC').toLocaleLowerCase('ja-JP');

export function findSideHustleExcludedArea(text: string): SideHustleExcludedArea | null {
  const candidate = normalized(text);
  return (
    SIDE_HUSTLE_EXCLUDED_AREAS.find((area) =>
      area.keywords.some((keyword) => candidate.includes(normalized(keyword))),
    ) ?? null
  );
}

export function findSideHustleGuaranteeExpression(text: string): string | null {
  return GUARANTEE_EXPRESSIONS.find((expression) => text.includes(expression)) ?? null;
}
