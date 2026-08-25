import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_EXTERNAL_LINK_PLACEMENT_TEMPLATE,
  ExternalLinkPlacementService,
  applyExternalLinkPlacement,
  defaultExternalLinkPlacement,
  validateExternalLinkPlacementTemplate,
  type ExternalLinkPlacementRepository,
} from '../src';

describe('external link placement template', () => {
  it('accepts the safe default and normalizes surrounding whitespace', () => {
    expect(
      validateExternalLinkPlacementTemplate(`  ${DEFAULT_EXTERNAL_LINK_PLACEMENT_TEMPLATE}  `),
    ).toBe(DEFAULT_EXTERNAL_LINK_PLACEMENT_TEMPLATE);
  });

  it.each([
    '詳しくはこちら',
    '{{referral_url}}\n{{referral_url}}',
    '{{other_value}}',
    '<script>{{referral_url}}</script>',
    'https://example.jp/{{referral_url}}',
  ])('rejects an unsafe template: %s', (template) => {
    expect(() => validateExternalLinkPlacementTemplate(template)).toThrow();
  });

  it('forces URL locking before persistence', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'placement-1' });
    const repository = {
      list: vi.fn(),
      upsert,
      resolveForGeneration: vi.fn(),
    } satisfies ExternalLinkPlacementRepository;
    const service = new ExternalLinkPlacementService(repository);
    await service.upsert({
      workspaceId: 'workspace-1',
      actorUserId: 'user-1',
      productPackVersionId: 'version-1',
      platform: 'X',
      format: 'TEXT',
      target: 'BODY',
      template: DEFAULT_EXTERNAL_LINK_PLACEMENT_TEMPLATE,
      status: 'ACTIVE',
    });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ urlLocked: true }));
  });

  it('TEXT本文へURLを決定的に追加し、元データを変更しない', () => {
    const original = { body: '今日の企画です。', caption: null };
    const result = applyExternalLinkPlacement({
      content: original,
      url: 'https://example.jp/item?ref=ABC',
      platform: 'X',
      format: 'TEXT',
      placement: defaultExternalLinkPlacement('TEXT'),
    });
    expect(result['body']).toBe(
      '今日の企画です。\n\n詳しくはこちら\nhttps://example.jp/item?ref=ABC',
    );
    expect(original.body).toBe('今日の企画です。');
  });

  it('URL差し込み後にSNS文字数を超える本文を拒否する', () => {
    expect(() =>
      applyExternalLinkPlacement({
        content: { body: 'あ'.repeat(260) },
        url: 'https://example.jp/item?ref=ABC',
        platform: 'X',
        format: 'TEXT',
        placement: defaultExternalLinkPlacement('TEXT'),
      }),
    ).toThrow();
  });
});
