import { describe, expect, it, vi } from 'vitest';
import {
  ActivateVideoDisclosurePolicy,
  CreateVideoDisclosurePolicyDraft,
  ResolveVideoDisclosurePolicy,
  type VideoDisclosurePolicy,
  type VideoDisclosurePolicyRepository,
} from '../src';

const policy: VideoDisclosurePolicy = {
  id: '11111111-1111-4111-8111-111111111111',
  environment: 'PRODUCTION',
  platform: 'INSTAGRAM',
  version: 2,
  status: 'ACTIVE',
  disclosureText: 'AIを使って台本を作成しました。',
  hashtags: ['#AI活用'],
  guidance: '投稿するときにAI生成コンテンツの表示設定を確認してください。',
  outputMetadata: { 'watashiworks.ai.script': 'true' },
  changeReason: '規約に合わせるため',
  activationReason: '本番へ反映するため',
  createdAt: new Date('2026-08-27T00:00:00Z'),
  activatedAt: new Date('2026-08-27T01:00:00Z'),
  supersededAt: null,
};

const repository = () => {
  const list = vi.fn().mockResolvedValue([policy]);
  const createDraft = vi.fn().mockResolvedValue({ ...policy, status: 'DRAFT' });
  const activate = vi.fn().mockResolvedValue(policy);
  const findActive = vi.fn().mockResolvedValue(policy);
  const store: VideoDisclosurePolicyRepository = { list, createDraft, activate, findActive };
  return { store, list, createDraft, activate, findActive };
};

describe('video disclosure policy', () => {
  it('normalizes a versioned draft without accepting unsafe metadata keys', async () => {
    const { store, createDraft } = repository();
    await new CreateVideoDisclosurePolicyDraft(store).execute({
      environment: 'PRODUCTION',
      platform: 'INSTAGRAM',
      disclosureText: ' AIを使って台本を作成しました。 ',
      hashtags: ['#AI活用', '#AI活用'],
      guidance: ' 投稿時に表示設定を確認してください。 ',
      outputMetadata: { 'watashiworks.ai.script': 'true' },
      changeReason: ' 規約に合わせるため ',
      actorUserId: '22222222-2222-4222-8222-222222222222',
    });
    expect(createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ hashtags: ['#AI活用'], changeReason: '規約に合わせるため' }),
    );
  });

  it('resolves only the active environment and platform policy as a snapshot', async () => {
    const { store, findActive } = repository();
    const result = await new ResolveVideoDisclosurePolicy(store).execute({
      environment: 'PRODUCTION',
      platform: 'INSTAGRAM',
    });
    expect(findActive).toHaveBeenCalledWith({
      environment: 'PRODUCTION',
      platform: 'INSTAGRAM',
    });
    expect(result).toMatchObject({ policyId: policy.id, policyVersion: 2 });
  });

  it('requires an explicit activation reason', () => {
    const { store, activate } = repository();
    expect(() =>
      new ActivateVideoDisclosurePolicy(store).execute({
        policyId: policy.id,
        environment: 'PRODUCTION',
        actorUserId: '22222222-2222-4222-8222-222222222222',
        activationReason: ' ',
      }),
    ).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(activate).not.toHaveBeenCalled();
  });
});
