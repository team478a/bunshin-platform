import type { ServiceManagementHomeModel } from '../app/s/[serviceSlug]/manage/service-management-home-data';
import { serviceManagementSections } from '../app/s/[serviceSlug]/manage/service-management-view-model';
import { selectServiceManagementSections } from '../src/services/service-management-navigation';
import { buildBusinessPilotMetrics } from '../src/services/business-pilot-metrics';
import { sumBusinessOutcomes } from '../src/services/business-outcomes';
import { buildPerformanceFeedbackSummary } from '../src/services/performance-feedback-summary';
import { buildSideHustleContentFunnel } from '../src/services/side-hustle-content-funnel';

export function serviceHomeFixture(training = true): ServiceManagementHomeModel {
  return {
    configuration: {
      id: 'config-a',
      workspaceId: 'workspace-a',
      groupId: 'service-a',
      slug: training ? 'training-a' : 'social-a',
      displayName: training ? 'マナベルスタイル' : 'ハッシー',
      description: '',
      operatorName: '運営者',
      contactEmail: 'example@example.com',
      visibility: 'PUBLIC',
      poweredByEnabled: false,
      startsAt: null,
      endsAt: null,
      termsUrl: null,
      privacyUrl: null,
      brand: {
        logoUrl: null,
        iconUrl: null,
        faviconUrl: null,
        primaryColor: '#123456',
        secondaryColor: '#ffffff',
        fontFamily: 'sans-serif',
      },
      registration: {
        mode: 'PUBLIC',
        emailEnabled: true,
        lineEnabled: false,
        inviteCodeEnabled: false,
        referralEnabled: false,
        onboardingConfig: null,
        surveyConfig: null,
      },
    },
    isBusinessDailyService: false,
    isAiTrainingService: training,
    socialOperations: !training,
    participantCount: 2,
    visibleSections: selectServiceManagementSections(serviceManagementSections, {
      businessDaily: false,
      fortune: false,
      aiTraining: training,
      socialOperations: !training,
    }),
    summary: {
      readyCount: 1,
      readiness: [
        {
          key: 'BASIC',
          label: 'サービスの基本情報',
          ready: true,
          detail: '登録済み',
          path: '/s/training-a/manage/settings',
        },
      ],
      sentLineDeliveries: 2,
      failedLineDeliveries: 0,
      postedMissions: 0,
      missionsCreated: 0,
      acceptedMissions: 0,
      rejectedMissions: 0,
      copiedMissions: 0,
      trendMissions: 0,
      successfulAiCalls: 0,
      failedAiCalls: 0,
      businessMetrics: buildBusinessPilotMetrics({
        participants: [],
        events: [],
        now: new Date('2026-11-03T00:00:00Z'),
        missions: 0,
        viewed: 0,
        accepted: 0,
        copied: 0,
        posted: 0,
        lineSent: 0,
        lineOpened: 0,
      }),
      businessOutcomes: sumBusinessOutcomes([]),
      sideHustleFunnel: buildSideHustleContentFunnel({
        productMissions: 0,
        linkedMissions: 0,
        copiedMissions: 0,
        postedMissions: 0,
      }),
      feedbackSummary: buildPerformanceFeedbackSummary({ posted: 0, good: 0, neutral: 0, bad: 0 }),
      operationActions: [],
    },
  };
}
