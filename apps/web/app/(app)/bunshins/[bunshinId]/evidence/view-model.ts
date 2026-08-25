export function parseOfficialClaims(value: string) {
  return Object.fromEntries(
    value
      .split('\n')
      .map((line) => line.split('=').map((part) => part.trim()))
      .filter(
        (parts): parts is [string, string] =>
          parts.length === 2 && Boolean(parts[0]) && Boolean(parts[1]),
      ),
  );
}
