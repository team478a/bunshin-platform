import { describe, expect, it, vi } from 'vitest';
import { fortuneLineMenuKind, richMenuLayoutForService } from '../src/line/rich-menu-layout';

function db(packs: number, campaigns: number) {
  return {
    prisma: {
      productPack: { count: vi.fn(() => Promise.resolve(packs)) },
      campaign: { count: vi.fn(() => Promise.resolve(campaigns)) },
    },
  };
}

describe('dedicated LINE rich menu layout', () => {
  it.each([
    [0, 0, 'DEFAULT'],
    [1, 0, 'PARTNER'],
    [0, 1, 'PARTNER'],
  ] as const)('packs=%s campaigns=%s uses %s', async (packs, campaigns, layout) => {
    const client = db(packs, campaigns);
    await expect(richMenuLayoutForService(client, 'workspace-a', 'service-a')).resolves.toBe(
      layout,
    );
    expect(client.prisma.productPack.count).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace-a', groupId: 'service-a' },
    });
  });
});

it('limits the Oracle artwork to the owned Fortune service', () => {
  const onboarding = { fortunePackage: { key: 'FORTUNE_DAILY_GUIDANCE', version: 2 } };
  expect(fortuneLineMenuKind('watashi-fortune', onboarding)).toBe('ORACLE');
  expect(fortuneLineMenuKind('other-fortune', onboarding)).toBe('FORTUNE');
  expect(fortuneLineMenuKind('watashi-fortune', {})).toBeUndefined();
  expect(fortuneLineMenuKind('posting', {})).toBeUndefined();
});
