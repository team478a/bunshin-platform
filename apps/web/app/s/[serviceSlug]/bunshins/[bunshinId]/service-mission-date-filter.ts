export function splitServiceMissionsByDate<T extends { missionDate: string }>(
  missions: T[],
  today: string,
) {
  return {
    todayMissions: missions.filter((mission) => mission.missionDate === today),
    pastMissions: missions.filter((mission) => mission.missionDate < today),
  };
}

export function splitServiceMissionsBySource<T extends { campaignId: string | null }>(
  missions: T[],
) {
  return {
    personalMissions: missions.filter((mission) => mission.campaignId === null),
    campaignMissions: missions.filter((mission) => mission.campaignId !== null),
  };
}
