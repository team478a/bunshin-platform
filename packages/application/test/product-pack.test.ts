import { describe, expect, it } from 'vitest';
import { ProductPackService, type ProductPackRepository } from '../src';

class Repository implements ProductPackRepository {
  createPack(input: Parameters<ProductPackRepository['createPack']>[0]) {
    return Promise.resolve(input);
  }
  createDraftVersion(input: Parameters<ProductPackRepository['createDraftVersion']>[0]) {
    return Promise.resolve(input);
  }
  publishVersion(input: Parameters<ProductPackRepository['publishVersion']>[0]) {
    return Promise.resolve(input);
  }
  assign(input: Parameters<ProductPackRepository['assign']>[0]) {
    return Promise.resolve(input);
  }
  revokeAssignment(input: Parameters<ProductPackRepository['revokeAssignment']>[0]) {
    return Promise.resolve(input);
  }
}

describe('ProductPackService', () => {
  const scope = { workspaceId: 'workspace-1', actorUserId: 'user-1' };

  it('requires structured official facts', async () => {
    const service = new ProductPackService(new Repository());
    await expect(
      service.createDraftVersion({
        ...scope,
        productPackId: 'pack-1',
        content: {
          summary: '概要',
          providerName: '提供者',
          targetCustomer: '対象者',
          facts: {},
          faq: [],
          suitableFor: [],
          unsuitableFor: [],
          rules: [],
          assets: [],
        },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('normalizes the pack name and records consent when assigned', async () => {
    const service = new ProductPackService(new Repository());
    await expect(
      service.createPack({ ...scope, groupId: 'group-1', name: ' 公式商品 ' }),
    ).resolves.toMatchObject({ name: '公式商品' });
    await expect(
      service.assign({ ...scope, productPackId: 'pack-1', versionId: 'v1', bunshinId: 'b1' }),
    ).resolves.toMatchObject({ consentedAt: expect.any(Date) });
  });
});
