import { describe, expect, it } from 'vitest';
import { buildServiceLaunchReadiness } from '../src/services/service-launch-readiness';

const readyInput = {
  serviceSlug: 'sample-service',
  operatorName: '運営会社',
  contactEmail: 'help@example.com',
  registrationMode: 'PUBLIC' as const,
  emailEnabled: true,
  lineEnabled: false,
  onboardingQuestionCount: 3,
  publishedLegalTypes: ['TERMS', 'PRIVACY'],
  activeFeatureCount: 2,
  activeParticipantCount: 1,
  activeKnowledgeCount: 1,
  lineConfigurationReady: false,
};

describe('service launch readiness', () => {
  it('marks a fully prepared email service ready', () => {
    const items = buildServiceLaunchReadiness(readyInput);
    expect(items).toHaveLength(8);
    expect(items.every((item) => item.ready)).toBe(true);
  });

  it('requires a verified unpaused LINE configuration when LINE is enabled', () => {
    const items = buildServiceLaunchReadiness({
      ...readyInput,
      emailEnabled: false,
      lineEnabled: true,
      lineConfigurationReady: false,
    });
    expect(items.find((item) => item.key === 'LINE')?.ready).toBe(false);
    expect(items.find((item) => item.key === 'REGISTRATION')?.ready).toBe(true);
  });

  it('reports missing legal documents and participants separately', () => {
    const items = buildServiceLaunchReadiness({
      ...readyInput,
      publishedLegalTypes: ['TERMS'],
      activeParticipantCount: 0,
    });
    expect(items.find((item) => item.key === 'LEGAL')?.ready).toBe(false);
    expect(items.find((item) => item.key === 'PARTICIPANTS')?.ready).toBe(false);
  });

  it('requires the monetization path for a side-hustle service', () => {
    const items = buildServiceLaunchReadiness({
      ...readyInput,
      commercialContentRequired: true,
      trendResearchEnabled: true,
      trendProviderReady: false,
      activeProductPackCount: 1,
      activeCampaignCount: 0,
      activeTrackingLinkCount: 1,
    });
    expect(items).toHaveLength(12);
    expect(items.find((item) => item.key === 'TREND_RESEARCH')?.ready).toBe(false);
    expect(items.find((item) => item.key === 'PRODUCT')?.ready).toBe(true);
    expect(items.find((item) => item.key === 'CAMPAIGN')?.ready).toBe(false);
    expect(items.find((item) => item.key === 'TRACKING_LINK')?.ready).toBe(true);
  });
});
