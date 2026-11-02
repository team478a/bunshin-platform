import { describe, expect, it } from 'vitest';
import {
  groupServiceManagementSections,
  selectServiceManagementSections,
} from '../src/services/service-management-navigation';
import { serviceManagementSections } from '../app/s/[serviceSlug]/manage/service-management-view-model';

const sections = [
  { href: 'improvement-overview' },
  { href: 'improvement-feedback' },
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
  it('keeps training-only menus free of SNS operations without hiding explicitly mixed services', () => {
    const training = { businessDaily: false, fortune: false, aiTraining: true };
    const selected = selectServiceManagementSections(serviceManagementSections, training).map(
      (s) => s.href,
    );
    expect(selected).toContain('programs');
    expect(selected).toContain('training');
    expect(selected).not.toContain('post-approvals');
    expect(selected).not.toContain('90-day-report');
    expect(selected).not.toContain('recommendations');
    expect(
      selectServiceManagementSections(serviceManagementSections, {
        ...training,
        socialOperations: true,
      }).map((s) => s.href),
    ).toContain('post-approvals');
  });

  it('groups every existing service destination exactly once and hides empty categories', () => {
    const grouped = groupServiceManagementSections(serviceManagementSections);
    expect(grouped).toHaveLength(4);
    expect(grouped.flatMap((g) => g.items.map((s) => s.href)).sort()).toEqual(
      serviceManagementSections.map((s) => s.href).sort(),
    );
    expect(groupServiceManagementSections([{ href: 'settings' }]).map((g) => g.label)).toEqual([
      'サービス設定',
    ]);
  });

  it('does not advertise training operations without a scoped Program or training history', () => {
    const input = { businessDaily: false, fortune: false, aiTraining: false };
    expect(
      selectServiceManagementSections(serviceManagementSections, input).map((s) => s.href),
    ).not.toContain('training');
    expect(
      selectServiceManagementSections(serviceManagementSections, {
        ...input,
        trainingOverview: true,
      }).map((s) => s.href),
    ).toContain('training');
  });
  it('shows overview only after an explicit scoped capability/history probe', () => {
    for (const input of [
      { businessDaily: true, fortune: false },
      { businessDaily: false, fortune: true },
      { businessDaily: false, fortune: false },
    ]) {
      expect(selectServiceManagementSections(sections, input).map((s) => s.href)).not.toContain(
        'improvement-overview',
      );
      expect(
        selectServiceManagementSections(sections, { ...input, improvementOverview: true }).map(
          (s) => s.href,
        ),
      ).toContain('improvement-overview');
    }
  });
  it('shows feedback only for explicit SOCIAL capability/history, not a brand or other package alone', () => {
    for (const input of [
      { businessDaily: true, fortune: false },
      { businessDaily: false, fortune: false },
      { businessDaily: false, fortune: true },
    ]) {
      expect(
        selectServiceManagementSections(sections, input).map((section) => section.href),
      ).not.toContain('improvement-feedback');
      expect(
        selectServiceManagementSections(sections, { ...input, socialFeedback: true }).map(
          (section) => section.href,
        ),
      ).toContain('improvement-feedback');
    }
  });
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
