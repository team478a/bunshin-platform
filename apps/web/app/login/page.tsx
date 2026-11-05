import type { Route } from 'next';
import { redirect } from 'next/navigation';
import {
  safeLineAuthReturnPath,
  serviceAuthLoginPath,
  serviceAuthReturnSlug,
} from '../../src/auth/line-return';
import LoginPageContent, { loginPageMetadata, type LoginPageQuery } from './login-page-content';

const loginErrors = new Set(['1', 'line', 'line-link', 'rate-limit', 'auth-context', 'email']);

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  return loginPageMetadata((await searchParams).returnTo);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginPageQuery>;
}) {
  const query = await searchParams;
  const returnTo = safeLineAuthReturnPath(query.returnTo);
  if (returnTo && serviceAuthReturnSlug(returnTo)) {
    const destination = new URL(serviceAuthLoginPath(returnTo), 'https://bunshin.invalid');
    if (query.sent === '1') destination.searchParams.set('sent', '1');
    if (query.error && loginErrors.has(query.error)) {
      destination.searchParams.set('error', query.error);
    }
    redirect(`${destination.pathname}${destination.search}` as Route);
  }
  return LoginPageContent({ searchParams: Promise.resolve(query) });
}
