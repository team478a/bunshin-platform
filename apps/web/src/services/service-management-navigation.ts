const BUSINESS_DAILY_SECTION_HREFS = new Set([
  '90-day-report',
  'weekly-report',
  'members',
  'knowledge',
  'line',
  'settings',
  'legal',
]);

const FORTUNE_SECTION_HREFS = new Set(['members', 'line', 'settings', 'legal', 'fortune']);

export function selectServiceManagementSections<T extends { href: string }>(
  sections: readonly T[],
  input: { businessDaily: boolean; fortune: boolean },
): T[] {
  return sections.filter((section) => {
    if (input.businessDaily) return BUSINESS_DAILY_SECTION_HREFS.has(section.href);
    if (input.fortune) return FORTUNE_SECTION_HREFS.has(section.href);
    return section.href !== 'fortune';
  });
}
