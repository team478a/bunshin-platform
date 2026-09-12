import type { PointRewardCatalogItemRecord, PointRewardType } from '@bunshin/application';

type PointUseDestination = {
  href: string;
  actionLabel: string;
};

export type PointUseOption = PointRewardCatalogItemRecord & {
  href: string;
  actionLabel: string;
  pointsNeeded: number;
  blockedByRecovery: boolean;
};

export function buildPointUseOptions(input: {
  catalog: PointRewardCatalogItemRecord[];
  availablePoints: number;
  recoveryDue?: number;
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
        blockedByRecovery: (input.recoveryDue ?? 0) > 0,
      },
    ];
  });
}
