import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_EXTERNAL_LINK_PLACEMENT_TEMPLATE,
  ExternalLinkPlacementService,
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
});
