export const LINE_AUTH_RETURN_COOKIE = 'bunshin_line_auth_return';
export const LINE_AUTH_RETURN_MAX_AGE_SECONDS = 10 * 60;

const MAX_STATE_LENGTH = 2048;

export function missionReturnPath(token: string): string | null {
  if (token.length === 0 || token.length > MAX_STATE_LENGTH) return null;
  return `/today?state=${encodeURIComponent(token)}`;
}

export function safeLineAuthReturnPath(value: string | null | undefined): string | null {
  if (
    !value ||
    value.length > MAX_STATE_LENGTH ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return null;
  }

  try {
    const url = new URL(value, 'https://bunshin.invalid');
    if (url.origin !== 'https://bunshin.invalid' || url.hash) return null;
    if (/^\/groups\/invitations\/[A-Za-z0-9_-]{43}$/.test(url.pathname) && url.search === '')
      return url.pathname;
    if (
      /^\/s\/[a-z0-9]+(?:-[a-z0-9]+)*\/join\/[A-Za-z0-9_-]{43}$/.test(url.pathname) &&
      url.search === ''
    )
      return url.pathname;
    if (/^\/s\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.pathname) && url.search === '')
      return url.pathname;
    if (/^\/s\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.pathname)) {
      if ([...url.searchParams.keys()].some((key) => key !== 'ref' && key !== 'rc')) return null;
      const referralCode = url.searchParams.get('ref');
      const referralClickId = url.searchParams.get('rc');
      if (referralCode === null || !/^[A-Z0-9]{6,80}$/.test(referralCode)) return null;
      if (
        referralClickId !== null &&
        !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(referralClickId)
      )
        return null;
      return `${url.pathname}?${url.searchParams.toString()}`;
    }
    if (url.pathname !== '/today') return null;
    if ([...url.searchParams.keys()].some((key) => key !== 'state')) return null;
    if (url.searchParams.getAll('state').length !== 1) return null;
    return missionReturnPath(url.searchParams.get('state') ?? '');
  } catch {
    return null;
  }
}

export function lineAuthReturnFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== LINE_AUTH_RETURN_COOKIE) continue;
    try {
      return safeLineAuthReturnPath(decodeURIComponent(part.slice(separator + 1).trim()));
    } catch {
      return null;
    }
  }
  return null;
}
