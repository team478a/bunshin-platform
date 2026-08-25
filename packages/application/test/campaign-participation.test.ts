import { describe, expect, it } from 'vitest';
import { CampaignService, type CampaignRepository } from '../src';

class Repository implements CampaignRepository {
  last: unknown;
  listManaged() {
    return Promise.resolve([]);
  }
  createDraft(input: Parameters<CampaignRepository['createDraft']>[0]) {
    this.last = input;
    return Promise.resolve({ id: 'campaign' });
  }
  transition(input: Parameters<CampaignRepository['transition']>[0]) {
    this.last = input;
    return Promise.resolve({ id: input.campaignId });
  }
  listAvailable() {
    return Promise.resolve([]);
  }
  decide(input: Parameters<CampaignRepository['decide']>[0]) {
    this.last = input;
    return Promise.resolve({ id: 'participation', status: input.decision });
  }
}

const admin = { workspaceId: 'workspace', actorUserId: 'user' };

describe('CampaignService', () => {
  it('期間と上限を検証して下書きを作る', async () => {
    const repository = new Repository();
    await new CampaignService(repository).createDraft({
      ...admin,
      groupId: 'group',
      productPackVersionId: 'version',
      name: ' 募集 ',
      theme: ' テーマ ',
      targetSummary: ' 対象 ',
      participationLimit: 10,
      startsAt: new Date('2026-09-01T00:00:00Z'),
      endsAt: new Date('2026-09-02T00:00:00Z'),
      assetIds: ['asset', 'asset'],
    });
    expect(repository.last).toMatchObject({
      name: '募集',
      theme: 'テーマ',
      targetSummary: '対象',
      assetIds: ['asset'],
    });
  });

  it('終了が開始以前の募集を拒否する', async () => {
    await expect(
      new CampaignService(new Repository()).createDraft({
        ...admin,
        groupId: 'group',
        productPackVersionId: 'version',
        name: '募集',
        theme: 'テーマ',
        targetSummary: '対象',
        participationLimit: 1,
        startsAt: new Date('2026-09-02T00:00:00Z'),
        endsAt: new Date('2026-09-01T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('下書きから終了への飛び越しを拒否する', async () => {
    await expect(
      new CampaignService(new Repository()).transition({
        ...admin,
        campaignId: 'campaign',
        from: 'DRAFT',
        to: 'CLOSED',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('本人の保留判断を独立した状態として保存する', async () => {
    const repository = new Repository();
    await new CampaignService(repository).decide({
      workspaceId: 'personal',
      actorUserId: 'user',
      bunshinId: 'bunshin',
      campaignId: 'campaign',
      decision: 'ON_HOLD',
    });
    expect(repository.last).toMatchObject({ decision: 'ON_HOLD', reason: null });
  });
});
