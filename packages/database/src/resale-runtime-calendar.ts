function zonedParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(value);
  const result = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: result['year']!,
    month: result['month']!,
    day: result['day']!,
    hour: result['hour']!,
    minute: result['minute']!,
    second: result['second']!,
  };
}

export function addProgramCalendarDays(value: Date, days: number, timeZone: string) {
  const local = zonedParts(value, timeZone);
  const targetWall = Date.UTC(
    local.year,
    local.month - 1,
    local.day + days,
    local.hour,
    local.minute,
    local.second,
    value.getUTCMilliseconds(),
  );
  let candidate = new Date(targetWall);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = zonedParts(candidate, timeZone);
    const observedWall = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
      value.getUTCMilliseconds(),
    );
    candidate = new Date(candidate.getTime() + targetWall - observedWall);
  }
  return candidate;
}
