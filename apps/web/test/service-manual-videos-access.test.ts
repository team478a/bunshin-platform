import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';

const m = vi.hoisted(() => ({ actor: vi.fn(), member: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('ROUTE_NOT_FOUND');
  },
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: m.actor }),
}));
vi.mock('../src/services/public-service', () => ({ resolveMemberServiceContext: m.member }));

import Page from '../app/s/[serviceSlug]/manual-videos/page';
import { MemberFeatureLinks } from '../app/s/[serviceSlug]/home/service-home-navigation-sections';

function service(templateKey: unknown = 'HASSY') {
  return {
    workspaceId: 'workspace-a',
    serviceId: 'service-a',
    configuration: {
      workspaceId: 'workspace-a',
      groupId: 'service-a',
      slug: 'hassy',
      brand: { primaryColor: '#123', secondaryColor: '#456', fontFamily: 'system-ui' },
      registration: {
        onboardingConfig: { templateKey, businessProfileEnabled: true },
        surveyConfig: {},
      },
    },
  };
}
const params = Promise.resolve({ serviceSlug: 'hassy' });

beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({ userId: 'user-a' });
  m.member.mockResolvedValue(service());
});

describe('manual video service boundary', () => {
  it('requires login before resolving a service', async () => {
    m.actor.mockResolvedValue(null);
    await expect(Page({ params })).rejects.toThrow('REDIRECT:/login?returnTo=');
    expect(m.member).not.toHaveBeenCalled();
  });
  it('resolves membership for the current user', async () => {
    expect(await Page({ params })).toBeTruthy();
    expect(m.member).toHaveBeenCalledWith('hassy', 'user-a');
  });
  it('rejects a service the current user cannot access', async () => {
    m.member.mockRejectedValue(new ApplicationError('NOT_FOUND', 'unavailable'));
    await expect(Page({ params })).rejects.toThrow('ROUTE_NOT_FOUND');
  });
  it.each(['CUSTOM', 'MANABERU_STYLE', null])('does not expose Hassy videos to %s', async (key) => {
    m.member.mockResolvedValue(service(key));
    await expect(Page({ params })).rejects.toThrow('ROUTE_NOT_FOUND');
  });
  it('rejects a mismatched service configuration', async () => {
    const value = service();
    value.configuration.groupId = 'service-b';
    m.member.mockResolvedValue(value);
    await expect(Page({ params })).rejects.toThrow('ROUTE_NOT_FOUND');
  });
  it.each([true, false])('shows the navigation only for the selected service: %s', (available) => {
    const html = renderToStaticMarkup(
      createElement(MemberFeatureLinks, {
        imageAvailable: false,
        isBusinessDailyService: true,
        manualVideosAvailable: available,
        isPersonalLearningService: false,
        isDynamicLearning: false,
        isPersonalLearningReady: false,
        personalLearningPathHref: null,
        isServiceOperator: false,
        promptOnlyImages: false,
        rewardsAvailable: false,
        serviceSlug: 'hassy',
        trackingLinkAvailable: false,
        videoAvailable: false,
      }),
    );
    expect(html.includes('/s/hassy/manual-videos')).toBe(available);
  });
});
