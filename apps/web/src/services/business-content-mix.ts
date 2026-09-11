import type { BusinessContentCategory } from '@bunshin/capability-social';

export const BUSINESS_CONTENT_MIX: ReadonlyArray<{
  category: BusinessContentCategory;
  label: string;
  percentage: number;
  guidance: string;
}> = [
  {
    category: 'HELPFUL_EXPERTISE',
    label: '役立つ情報・専門知識',
    percentage: 30,
    guidance: '対象顧客が今日使える知識やコツを、専門用語を避けて説明する。',
  },
  {
    category: 'COMPANY_STAFF',
    label: '会社・スタッフの日常',
    percentage: 20,
    guidance: '仕事の様子、準備、考え方、人柄が伝わる題材にする。',
  },
  {
    category: 'FAQ_PROBLEM',
    label: 'よくある質問・悩み',
    percentage: 20,
    guidance: '顧客からよく聞かれる質問や迷いに、具体的に答える。',
  },
  {
    category: 'CASE_STUDY',
    label: '実績・事例',
    percentage: 15,
    guidance:
      '登録済みの事実だけを使い、変化、工夫、利用場面を紹介する。事実がなければ一般的な利用例にする。',
  },
  {
    category: 'PRODUCT_SERVICE',
    label: '商品・サービス',
    percentage: 15,
    guidance: '売り込みだけにせず、対象顧客の悩みと商品・サービスの特徴を結びつける。',
  },
];

const weightedCycle: BusinessContentCategory[] = [
  'HELPFUL_EXPERTISE',
  'COMPANY_STAFF',
  'FAQ_PROBLEM',
  'HELPFUL_EXPERTISE',
  'CASE_STUDY',
  'PRODUCT_SERVICE',
  'HELPFUL_EXPERTISE',
  'COMPANY_STAFF',
  'FAQ_PROBLEM',
  'HELPFUL_EXPERTISE',
  'CASE_STUDY',
  'PRODUCT_SERVICE',
  'HELPFUL_EXPERTISE',
  'COMPANY_STAFF',
  'FAQ_PROBLEM',
  'HELPFUL_EXPERTISE',
  'CASE_STUDY',
  'PRODUCT_SERVICE',
  'COMPANY_STAFF',
  'FAQ_PROBLEM',
];

export function buildBusinessContentSchedule(input: {
  weekStartDate: string;
  cadence: 'DAILY' | 'WEEKDAYS';
}) {
  const start = new Date(`${input.weekStartDate}T00:00:00.000Z`);
  const count = input.cadence === 'DAILY' ? 7 : 5;
  const weekNumber = Math.floor(start.valueOf() / (7 * 86_400_000));
  const cycleStart = (weekNumber * count) % weightedCycle.length;
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index);
    return {
      scheduledDate: date.toISOString().slice(0, 10),
      category: weightedCycle[(cycleStart + index) % weightedCycle.length]!,
    };
  });
}

export function businessContentMixKnowledge() {
  return {
    type: 'SERVICE_BUSINESS_CONTENT_MIX',
    title: '1週間の投稿内容の配分',
    content: BUSINESS_CONTENT_MIX.map(
      (item) => `${item.label} ${item.percentage}%: ${item.guidance}`,
    ).join('\n'),
  };
}
