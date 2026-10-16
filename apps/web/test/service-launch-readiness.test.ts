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
  generationProviderReady: true,
};

describe('service launch readiness', () => {
  it('marks a fully prepared email service ready', () => {
    const items = buildServiceLaunchReadiness(readyInput);
    expect(items).toHaveLength(9);
    expect(items.every((item) => item.ready)).toBe(true);
  });

  it('describes initial onboarding as training preparation for AI Training services', () => {
    const items = buildServiceLaunchReadiness({ ...readyInput, isAiTrainingService: true });
    expect(items.find((item) => item.key === 'ONBOARDING')?.detail).toContain(
      'AI研修の動的な課題候補を個別に準備',
    );
    expect(items.find((item) => item.key === 'ONBOARDING')?.detail).not.toContain('投稿パートナー');
  });

  it('keeps the SNS onboarding explanation for other services', () => {
    const items = buildServiceLaunchReadiness({ ...readyInput, isAiTrainingService: false });
    expect(items.find((item) => item.key === 'ONBOARDING')?.detail).toBe(
      '参加者に合う投稿パートナーを作るための質問です。',
    );
  });

  it('requires the verified dedicated LINE and its default rich menu together', () => {
    const items = buildServiceLaunchReadiness({
      ...readyInput,
      emailEnabled: false,
      lineEnabled: true,
      lineMode: 'DEDICATED',
      linePilotEnabled: true,
      lineConfigurationReady: true,
      lineRichMenuReady: false,
    });
    expect(items.find((item) => item.key === 'LINE')?.ready).toBe(true);
    expect(items.find((item) => item.key === 'LINE_RICH_MENU')).toMatchObject({
      ready: false,
      path: '/s/sample-service/manage/line',
    });
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

  it('blocks launch when posting AI is not verified or LINE is disabled by policy', () => {
    const items = buildServiceLaunchReadiness({
      ...readyInput,
      emailEnabled: false,
      lineEnabled: true,
      lineMode: 'DISABLED',
      lineConfigurationReady: false,
      generationProviderReady: false,
    });
    expect(items.find((item) => item.key === 'GENERATION_AI')?.ready).toBe(false);
    expect(items.find((item) => item.key === 'LINE')).toMatchObject({
      ready: false,
      detail: expect.stringContaining('LINEの使い方'),
    });
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
    expect(items).toHaveLength(13);
    expect(items.find((item) => item.key === 'TREND_RESEARCH')?.ready).toBe(false);
    expect(items.find((item) => item.key === 'PRODUCT')?.ready).toBe(true);
    expect(items.find((item) => item.key === 'CAMPAIGN')?.ready).toBe(false);
    expect(items.find((item) => item.key === 'CAMPAIGN')?.path).toBe(
      '/s/sample-service/manage/campaigns',
    );
    expect(items.find((item) => item.key === 'TRACKING_LINK')?.ready).toBe(true);
  });

  it('uses the free business launch conditions without paid media or knowledge requirements', () => {
    const items = buildServiceLaunchReadiness({
      ...readyInput,
      emailEnabled: false,
      lineEnabled: true,
      lineConfigurationReady: true,
      activeKnowledgeCount: 0,
      businessDailyIdeas: {
        businessProfileEnabled: true,
        deliveryEnabled: true,
        cadence: 'DAILY',
        contentMode: 'READY_TO_USE',
        mediaMode: 'TEXT_ONLY',
      },
    });
    expect(items.find((item) => item.key === 'BUSINESS_PROFILE')?.ready).toBe(true);
    expect(items.find((item) => item.key === 'DAILY_DELIVERY')?.ready).toBe(true);
    expect(items.some((item) => item.key === 'KNOWLEDGE')).toBe(false);
    expect(items.every((item) => item.ready)).toBe(true);
  });

  it('blocks the free business launch when email or automatic paid media is enabled', () => {
    const items = buildServiceLaunchReadiness({
      ...readyInput,
      emailEnabled: true,
      lineEnabled: true,
      lineConfigurationReady: true,
      businessDailyIdeas: {
        businessProfileEnabled: true,
        deliveryEnabled: true,
        cadence: 'DAILY',
        contentMode: 'READY_TO_USE',
        mediaMode: 'IMAGE_AND_VIDEO',
      },
    });
    expect(items.find((item) => item.key === 'REGISTRATION')?.ready).toBe(false);
    expect(items.find((item) => item.key === 'DAILY_DELIVERY')?.ready).toBe(false);
  });
});
