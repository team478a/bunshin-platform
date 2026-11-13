import type { LineRichMenuLayout } from './default-rich-menu';

type ServiceScope = { workspaceId: string; groupId: string };

/**
 * 商品情報か発信企画があるServiceの専用LINEだけ、発信パートナー向けの4ボタンにする。
 * 新しい設定項目は作らず、管理トップの「日常の4業務」と同じくデータで判断する。
 */
export async function richMenuLayoutForService(
  db: {
    prisma: {
      productPack: { count(args: { where: ServiceScope }): Promise<number> };
      campaign: { count(args: { where: ServiceScope }): Promise<number> };
    };
  },
  workspaceId: string,
  groupId: string,
): Promise<LineRichMenuLayout> {
  const scope = { workspaceId, groupId };
  const [packs, campaigns] = await Promise.all([
    db.prisma.productPack.count({ where: scope }),
    db.prisma.campaign.count({ where: scope }),
  ]);
  return packs > 0 || campaigns > 0 ? 'PARTNER' : 'DEFAULT';
}
