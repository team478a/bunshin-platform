const BUSINESS_DAILY_SECTION_HREFS = new Set([
  'referrals',
  '90-day-report',
  'weekly-report',
  'personalization',
  'members',
  'knowledge',
  'line',
  'email',
  'templates',
  'settings',
  'legal',
]);

const FORTUNE_SECTION_HREFS = new Set([
  'members',
  'line',
  'email',
  'templates',
  'settings',
  'legal',
  'fortune',
]);
const IMAGE_MANAGEMENT_SECTION_HREFS = new Set(['referral-rewards', 'credits', 'image-operations']);
const TRAINING_SECTION_HREFS = new Set([
  'members',
  'programs',
  'training',
  'knowledge',
  'line',
  'email',
  'templates',
  'settings',
  'legal',
]);

export function selectServiceManagementSections<T extends { href: string }>(
  sections: readonly T[],
  input: {
    businessDaily: boolean;
    fortune: boolean;
    aiTraining?: boolean;
    trainingOverview?: boolean;
    socialOperations?: boolean;
    promptOnlyImages?: boolean;
    socialFeedback?: boolean;
    improvementOverview?: boolean;
  },
): T[] {
  return sections.filter((section) => {
    if (section.href === 'improvement-overview') return input.improvementOverview === true;
    if (section.href === 'improvement-feedback') return input.socialFeedback === true;
    if (section.href === 'training')
      return input.aiTraining === true || input.trainingOverview === true;
    if (input.aiTraining && input.socialOperations !== true)
      return TRAINING_SECTION_HREFS.has(section.href);
    if (input.businessDaily) return BUSINESS_DAILY_SECTION_HREFS.has(section.href);
    if (input.fortune) return FORTUNE_SECTION_HREFS.has(section.href);
    if (input.promptOnlyImages && IMAGE_MANAGEMENT_SECTION_HREFS.has(section.href)) return false;
    return section.href !== 'fortune';
  });
}

export function groupServiceManagementSections<T extends { href: string }>(sections: readonly T[]) {
  const categories = [
    {
      label: '会員・契約管理',
      hrefs: [
        'members',
        'programs',
        'training',
        'points',
        'credits',
        'referrals',
        'referral-rewards',
      ],
    },
    {
      label: '配信・コンテンツ管理',
      hrefs: [
        'line',
        'email',
        'templates',
        'knowledge',
        'product-packs',
        'external-tracking',
        'post-approvals',
        'video-operations',
        'video-deliveries',
        'fortune',
      ],
    },
    { label: 'サービス設定', hrefs: ['settings', 'recommendations'] },
    {
      label: '詳細管理',
      hrefs: [
        'improvement-overview',
        'improvement-feedback',
        '90-day-report',
        'weekly-report',
        'personalization',
        'image-operations',
      ],
    },
  ];
  const primaryHrefs = new Set(
    categories.filter(({ label }) => label !== '詳細管理').flatMap(({ hrefs }) => hrefs),
  );
  return categories
    .map(({ label, hrefs }) => ({
      label,
      items: sections.filter(({ href }) =>
        label === '詳細管理' ? !primaryHrefs.has(href) : hrefs.includes(href),
      ),
    }))
    .filter(({ items }) => items.length > 0);
}
