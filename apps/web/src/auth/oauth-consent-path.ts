/** Opaque Provider request ID; no caller-supplied callback URL or target user. */
export function oauthConsentPath(id: string): string | null {
  return /^[A-Za-z0-9_-]{1,128}$/.test(id)
    ? `/oauth/consent?authorization_id=${encodeURIComponent(id)}`
    : null;
}
export function safeOAuthConsentReturn(value: string | null | undefined): string | null {
  if (!value?.startsWith('/oauth/consent?')) return null;
  const url = new URL(value, 'https://bunshin.invalid');
  if (
    url.hash ||
    url.searchParams.getAll('authorization_id').length !== 1 ||
    [...url.searchParams.keys()].some((key) => key !== 'authorization_id')
  )
    return null;
  const path = oauthConsentPath(url.searchParams.get('authorization_id') ?? '');
  return path === value ? path : null;
}
