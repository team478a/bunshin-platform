import { describe, expect, it } from 'vitest';
import { selectServiceManagementSections } from '../src/services/service-management-navigation';

const sections = [
  { href: 'members' },
  { href: 'knowledge' },
  { href: 'personalization' },
  { href: 'points' },
  { href: 'referral-rewards' },
  { href: 'credits' },
  { href: 'image-operations' },
  { href: 'line' },
  { href: 'settings' },
  { href: 'legal' },
  { href: 'fortune' },
] as const;

describe('service management navigation', () => {
  it('shows only the operating surfaces needed by the fortune package', () => {
    expect(
      selectServiceManagementSections(sections, { businessDaily: false, fortune: true }).map(
        (section) => section.href,
      ),
    ).toEqual(['members', 'line', 'settings', 'legal', 'fortune']);
  });

  it('does not mix fortune operations into an unrelated service', () => {
    expect(
      selectServiceManagementSections(sections, { businessDaily: false, fortune: false }).map(
        (section) => section.href,
      ),
    ).not.toContain('fortune');
  });

  it('keeps the existing business service menu isolated from fortune', () => {
    expect(
      selectServiceManagementSections(sections, { businessDaily: true, fortune: true }).map(
        (section) => section.href,
      ),
    ).toEqual(['members', 'knowledge', 'personalization', 'line', 'settings', 'legal']);
  });

  it('hides image generation operations for a prompt-only service', () => {
    expect(
      selectServiceManagementSections(sections, {
        businessDaily: false,
        fortune: false,
        promptOnlyImages: true,
      }).map((section) => section.href),
    ).toEqual(['members', 'knowledge', 'personalization', 'points', 'line', 'settings', 'legal']);
  });
});
