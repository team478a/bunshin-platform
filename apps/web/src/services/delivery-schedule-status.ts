export type DeliveryScheduleState = 'READY' | 'PREPARING' | 'OFF';

export interface DeliveryScheduleStatus {
  state: DeliveryScheduleState;
  nextScheduledDate: string | null;
}

export function resolveDeliveryScheduleStatus(input: {
  today: string;
  scheduledDates: string[];
  missionDates: string[];
}): DeliveryScheduleStatus {
  const scheduledDates = [...new Set(input.scheduledDates)].sort();
  const nextScheduledDate = scheduledDates.find((date) => date > input.today) ?? null;
  if (input.missionDates.includes(input.today)) return { state: 'READY', nextScheduledDate };
  if (scheduledDates.includes(input.today)) return { state: 'PREPARING', nextScheduledDate };
  return { state: 'OFF', nextScheduledDate };
}
