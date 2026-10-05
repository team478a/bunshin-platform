import type { Route } from 'next';

export const LINE_AUTH_RETURN_COOKIE = 'bunshin_line_auth_return';
export const LINE_AUTH_RETURN_MAX_AGE_SECONDS = 10 * 60;

const MAX_STATE_LENGTH = 2048;

const serviceSlugPattern = '[a-z0-9]+(?:-[a-z0-9]+)*';
const uuidPattern = '[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}';
const servicePagePattern = new RegExp(
  `^/s/${serviceSlugPattern}/(?:home|line|legal-consent|onboarding|bunshins(?:/new|/${uuidPattern}(?:/line)?)?|programs(?:/${uuidPattern}(?:/toolkit|/growth)?)?|today|activity|history|images|videos(?:/${uuidPattern})?|video-assets|settings|credits|commerce|roadmap|diagnosis|readings/${uuidPattern}|manual|help|tracking-link|90-day-report|manage(?:/(?:settings|members|legal|line|email|templates|campaigns|badges|points|credits|knowledge|characters|product-packs|external-tracking|referral-rewards|programs|program-goals|personalization|post-approvals|weekly-report|90-day-report|video-operations|video-deliveries|image-operations|improvement-feedback|training(?:/(?:expiry|retention|skills))?|fortune(?:/manual)?))?)$`,
);

export function serviceAuthLoginPath(returnTo: string): Route {
  const safe = safeLineAuthReturnPath(returnTo);
  return safe && serviceAuthReturnSlug(safe)
    ? (`/login?returnTo=${encodeURIComponent(safe)}` as Route)
    : '/login';
}

/** Navigation context only; destination pages must still authorize the actor. */
export function serviceAuthReturnSlug(value: string | null | undefined): string | null {
  const safe = safeLineAuthReturnPath(value);
  if (!safe) return null;
  const url = new URL(safe, 'https://bunshin.invalid');
  return (
    url.pathname.match(/^\/s\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/)?.[1] ??
    (url.pathname === '/account' ? url.searchParams.get('service') : null)
  );
}

export function requiresPlatformOnboarding(
  registrationStatus: string | null | undefined,
  returnTo: string | null | undefined,
): boolean {
  return (
    registrationStatus !== 'COMPLETED' &&
    !serviceAuthReturnSlug(returnTo) &&
    !videoAuthReturnProjectId(returnTo) &&
    !imageAuthReturnSampleId(returnTo)
  );
}

export function videoAuthReturnProjectId(value: string | null | undefined): string | null {
  return (
    value?.match(/^\/video-access\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i)?.[1] ?? null
  );
}

export function imageAuthReturnSampleId(value: string | null | undefined): string | null {
  return (
    value?.match(/^\/image-access\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i)?.[1] ?? null
  );
}

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
    // Reject encoded separators, dot segments and other normalization aliases.
    if (value.split('?')[0] !== url.pathname || url.pathname.includes('%')) return null;
    if (url.pathname === '/account') {
      const slug = url.searchParams.get('service');
      if (
        !slug ||
        !new RegExp(`^${serviceSlugPattern}$`).test(slug) ||
        url.searchParams.getAll('service').length !== 1 ||
        [...url.searchParams.keys()].some((key) => key !== 'service')
      )
        return null;
      return `/account?service=${slug}`;
    }
    if (servicePagePattern.test(url.pathname) && url.search === '') {
      return url.pathname;
    }
    if (videoAuthReturnProjectId(value)) return value;
    if (imageAuthReturnSampleId(value)) return value;
    if (/^\/groups\/invitations\/[A-Za-z0-9_-]{43}$/.test(url.pathname) && url.search === '')
      return url.pathname;
    if (/^\/organizations\/invitations\/[A-Za-z0-9_-]{43}$/.test(url.pathname) && url.search === '')
      return url.pathname;
    if (
      /^\/s\/[a-z0-9]+(?:-[a-z0-9]+)*\/join\/[A-Za-z0-9_-]{43}$/.test(url.pathname) &&
      url.search === ''
    )
      return url.pathname;
    if (/^\/s\/[a-z0-9]+(?:-[a-z0-9]+)*\/weekly-report$/.test(url.pathname)) {
      if ([...url.searchParams.keys()].some((key) => key !== 'week')) return null;
      const week = url.searchParams.get('week');
      if (week === null) return url.pathname;
      if (url.searchParams.getAll('week').length !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(week))
        return null;
      const date = new Date(`${week}T00:00:00.000Z`);
      if (
        Number.isNaN(date.valueOf()) ||
        date.toISOString().slice(0, 10) !== week ||
        date.getUTCDay() !== 1
      )
        return null;
      return `${url.pathname}?week=${week}`;
    }
    if (/^\/s\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.pathname) && url.search === '')
      return url.pathname;
    if (/^\/s\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.pathname)) {
      if ([...url.searchParams.keys()].some((key) => key !== 'ref' && key !== 'rc')) return null;
      const referralCode = url.searchParams.get('ref');
      const referralClickId = url.searchParams.get('rc');
      if (url.searchParams.getAll('ref').length !== 1 || url.searchParams.getAll('rc').length > 1)
        return null;
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
