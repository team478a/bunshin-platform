import { describe, expect, it } from 'vitest';

import { buildServiceOperationActions } from '../app/s/[serviceSlug]/manage/service-management-view-model';

type Input = Parameters<typeof buildServiceOperationActions>[0];

const input = (overrides: Partial<Input> = {}): Input => ({
  serviceSlug: 'sample-service',
  lineEnabled: true,
  lineMode: 'SHARED',
  sharedLineReadyCount: 1,
  dedicatedLinePilotEnabled: false,
  dedicatedLine: undefined,
  dedicatedLineReady: false,
  dedicatedRichMenuPublishCount: 0,
  failedLineDeliveries: 0,
  overdueLineDeliveries: 0,
  businessDailyService: false,
  pendingPostApprovalCount: 0,
  missingLinkWarning: null,
  feedbackSummary: { needsAttention: false, posted: 0, rated: 0 },
  knowledgeReviewCount: 0,
  knowledgeFailedCount: 0,
  failedVideoRenders: 0,
  failedAiCalls: 0,
  ...overrides,
});

describe('service management view model', () => {
  it('explains a registration and LINE delivery configuration conflict', () => {
    const actions = buildServiceOperationActions(input({ lineMode: 'DISABLED' }));

    expect(actions).toEqual([
      expect.objectContaining({
        title: 'LINEを使う設定と配信停止が矛盾しています',
        href: '/s/sample-service/manage/line',
      }),
    ]);
  });

  it('guides a dedicated LINE service through connection setup', () => {
    const actions = buildServiceOperationActions(
      input({ lineMode: 'DEDICATED', dedicatedLinePilotEnabled: true }),
    );

    expect(actions[0]).toEqual(
      expect.objectContaining({
        title: '公式LINEの準備ができていません',
        href: '/s/sample-service/manage/line',
      }),
    );
  });

  it('suppresses product and video alerts for the business daily service', () => {
    const actions = buildServiceOperationActions(
      input({
        businessDailyService: true,
        pendingPostApprovalCount: 2,
        missingLinkWarning: '専用URLがありません。',
        failedVideoRenders: 3,
        knowledgeReviewCount: 1,
        failedAiCalls: 1,
      }),
    );
    const titles = actions.map(({ title }) => title);

    expect(titles).not.toContain('商品投稿の確認待ち');
    expect(titles).not.toContain('商品投稿案に専用URLがありません');
    expect(titles).not.toContain('作成に失敗した動画');
    expect(titles).toContain('公式情報の確認待ち');
    expect(titles).toContain('AIの処理で確認が必要');
  });
});
