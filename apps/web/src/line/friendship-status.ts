export async function lineFriendshipStatus(providerToken: string | null | undefined) {
  if (!providerToken || providerToken.length > 4096) return null;
  try {
    const response = await fetch('https://api.line.me/friendship/v1/status', {
      headers: { authorization: `Bearer ${providerToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const value = (await response.json()) as { friendFlag?: unknown };
    return typeof value.friendFlag === 'boolean' ? value.friendFlag : null;
  } catch {
    return null;
  }
}
