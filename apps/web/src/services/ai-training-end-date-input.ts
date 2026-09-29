// datetime-local is interpreted as explicit Japan time, never the device timezone.
export function trainingEndDateFromJst(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+09:00`);
  if (!Number.isFinite(date.getTime())) return null;
  const roundTrip = new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 16);
  return roundTrip === value ? date.toISOString() : null;
}
