import { NextResponse } from 'next/server';
import { LINE_AUTH_RETURN_COOKIE, safeLineAuthReturnPath } from './line-return';

/** A failed login must neither lose its own service nor inherit an older one. */
export function loginErrorResponse(request: Request, error: string, returnTo: string | null) {
  const destination = new URL('/login', request.url);
  destination.searchParams.set('error', error);
  const safe = safeLineAuthReturnPath(returnTo);
  if (safe) destination.searchParams.set('returnTo', safe);
  const response = NextResponse.redirect(destination, 303);
  response.cookies.set(LINE_AUTH_RETURN_COOKIE, '', { maxAge: 0, path: '/' });
  return response;
}
