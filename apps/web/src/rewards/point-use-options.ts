import type { PointRewardCatalogItemRecord, PointRewardType } from '@bunshin/application';

type PointUseDestination = {
  href: string;
  actionLabel: string;
};

export type PointUseOption = PointRewardCatalogItemRecord & {
  href: string;
  actionLabel: string;
  pointsNeeded: number;
};

export function buildPointUseOptions(input: {
  catalog: PointRewardCatalogItemRecord[];
  availablePoints: number;
  destinations: Partial<Record<PointRewardType, PointUseDestination>>;
}): PointUseOption[] {
  return input.catalog.flatMap((item) => {
    const destination = input.destinations[item.rewardType];
    if (!destination) return [];
    return [
      {
        ...item,
        ...destination,
        pointsNeeded: Math.max(0, item.pointCost - input.availablePoints),
      },
    ];
  });
}
