import { prisma } from '@bunshin/database';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  CUSTOM_DOMAIN_HOST_HEADER,
  customDomainDestination,
  normalizeRequestHostname,
} from './src/services/custom-domain-routing';

export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(CUSTOM_DOMAIN_HOST_HEADER);
  const next = () => NextResponse.next({ request: { headers: requestHeaders } });
  const hostname = normalizeRequestHostname(request.headers.get('host'));
  if (!hostname) return next();
  const applicationHostname = normalizeRequestHostname(
    process.env.APP_URL ? new URL(process.env.APP_URL).host : null,
  );
  if (
    hostname === applicationHostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.vercel.app')
  )
    return next();

  const domain = await prisma.serviceCustomDomain.findFirst({
    where: {
      hostname,
      status: 'ACTIVE',
      configuration: {
        group: { status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
      },
    },
    select: { configuration: { select: { slug: true } } },
  });
  if (!domain) return next();
  requestHeaders.set(CUSTOM_DOMAIN_HOST_HEADER, hostname);
  if (
    request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname.startsWith('/auth/') ||
    request.nextUrl.pathname.startsWith('/api/')
  )
    return next();
  const destination = customDomainDestination(request.nextUrl.pathname, domain.configuration.slug);
  if (!destination) return next();
  const url = request.nextUrl.clone();
  url.pathname = destination;
  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)'],
};
