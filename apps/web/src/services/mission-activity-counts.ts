export function uniqueMissionCount(items: { dailyMissionId: string }[]) {
  return new Set(items.map(({ dailyMissionId }) => dailyMissionId)).size;
}
