export interface SideHustleContentFunnelInput {
  productMissions: number;
  linkedMissions: number;
  copiedMissions: number;
  postedMissions: number;
}

export function buildSideHustleContentFunnel(input: SideHustleContentFunnelInput) {
  const stages = [
    { key: 'PRODUCT_MISSION', label: '商品投稿案', count: input.productMissions },
    { key: 'LINKED_MISSION', label: '専用URL付き', count: input.linkedMissions },
    { key: 'COPIED', label: 'コピー', count: input.copiedMissions },
    { key: 'POSTED', label: '投稿完了', count: input.postedMissions },
  ] as const;
  return {
    stages,
    missingLinkWarning:
      input.productMissions > 0 && input.linkedMissions === 0
        ? '商品投稿案はありますが、専用URL付きの投稿案がありません。商品・キャンペーンと専用URLの設定を確認してください。'
        : null,
  };
}
