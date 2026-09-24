export const RULES = [
  {
    key: 'MISSION_VIEWED_DAILY',
    budgetKey: 'budget_MISSION_VIEWED_DAILY',
    label: 'その日に初めて投稿案を見る',
    help: '1日1回まで付与します。',
    defaultAmount: 1,
    dailyLimit: 1,
    weeklyLimit: null,
  },
  {
    key: 'POSTED_DAILY',
    budgetKey: 'budget_POSTED_DAILY',
    label: 'SNSへ投稿した後に「投稿しました」を押す',
    help: '利用者の自己申告で、1日1回まで付与します。SNSへの実際の投稿は自動確認されません。',
    defaultAmount: 5,
    dailyLimit: 5,
    weeklyLimit: null,
  },
  {
    key: 'POSTED_WEEKLY_3',
    budgetKey: 'budget_POSTED_WEEKLY_3',
    label: '「投稿しました」の記録が1週間に3回になる',
    help: '自己申告の投稿記録を数え、1週間に1回まで付与します。',
    defaultAmount: 10,
    dailyLimit: null,
    weeklyLimit: 10,
  },
] as const;

export const REWARDS = [
  {
    type: 'ALTERNATIVE_PLAN_GENERATION',
    label: '別の投稿案を1回作る',
    help: '最新の投稿案の画面で、違う内容の案を作れます。',
    defaultCost: 30,
  },
  {
    type: 'SOCIAL_IMAGE_GENERATION',
    label: '投稿画像を1回作る',
    help: '画像作成機能を利用できる参加者だけに表示されます。',
    defaultCost: 50,
  },
] as const;

export const redemptionStatusLabels = {
  RESERVED: '処理中',
  CONFIRMED: '交換完了',
  RELEASED: '取り消し・ポイント返却',
  REFUNDED: 'ポイント返却済み',
} as const;
