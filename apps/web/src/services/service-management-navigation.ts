const BUSINESS_DAILY_SECTION_HREFS = new Set([
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

export function selectServiceManagementSections<T extends { href: string }>(
  sections: readonly T[],
  input: {
    businessDaily: boolean;
    fortune: boolean;
    promptOnlyImages?: boolean;
    socialFeedback?: boolean;
  },
): T[] {
  return sections.filter((section) => {
    if (section.href === 'improvement-feedback') return input.socialFeedback === true;
    if (input.businessDaily) return BUSINESS_DAILY_SECTION_HREFS.has(section.href);
    if (input.fortune) return FORTUNE_SECTION_HREFS.has(section.href);
    if (input.promptOnlyImages && IMAGE_MANAGEMENT_SECTION_HREFS.has(section.href)) return false;
    return section.href !== 'fortune';
  });
}
