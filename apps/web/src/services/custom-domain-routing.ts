const PORT = /:\d+$/;
export const CUSTOM_DOMAIN_HOST_HEADER = 'x-bunshin-custom-domain-host';

export function normalizeRequestHostname(value: string | null): string | null {
  const hostname = value?.split(',')[0]?.trim().toLowerCase().replace(PORT, '') ?? '';
  return hostname && hostname.length <= 253 ? hostname : null;
}

export function customDomainDestination(pathname: string, serviceSlug: string): string | null {
  const prefix = `/s/${serviceSlug}`;
  if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return null;
  if (pathname === '/') return prefix;
  if (pathname.startsWith('/s/')) {
    const suffix = pathname.split('/').slice(3).join('/');
    return suffix ? `${prefix}/${suffix}` : prefix;
  }
  return `${prefix}${pathname}`;
}
