export function splitServiceMissionsByDate<T extends { missionDate: string }>(
  missions: T[],
  today: string,
) {
  return {
    todayMissions: missions.filter((mission) => mission.missionDate === today),
    pastMissions: missions.filter((mission) => mission.missionDate < today),
  };
}
