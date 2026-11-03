import type { Metadata, Route } from 'next';
import { redirect } from 'next/navigation';
import { PublicShell } from '../../ui/public-shell';
import { loadOAuthConsent } from '../../../src/services/oauth-consent';
import { OAuthConsentCard } from './card';
import Link from 'next/link';
import { oauthConsentPath } from '../../../src/auth/oauth-consent-path';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: '外部アプリとの接続 | ワタシワークス',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};
export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const id = query.authorization_id;
  const retryPath = typeof id === 'string' ? oauthConsentPath(id) : null;
  if (query.error === '1')
    return (
      <PublicShell narrow>
        <section className="auth-panel" role="alert">
          <h1>接続を完了できませんでした</h1>
          <p>接続元のアプリからやり直すか、もう一度接続内容をご確認ください。</p>
          {retryPath && (
            <Link
              className="button"
              href={{ pathname: '/oauth/consent', query: { authorization_id: id } }}
            >
              もう一度確認する
            </Link>
          )}
        </section>
      </PublicShell>
    );
  let value;
  try {
    if (typeof id !== 'string' || Object.keys(query).some((key) => key !== 'authorization_id'))
      throw new Error('invalid request');
    value = await loadOAuthConsent(id);
  } catch {
    return (
      <PublicShell narrow>
        <section className="auth-panel" role="alert">
          <h1>接続を確認できませんでした</h1>
          <p>接続元のアプリからやり直してください。</p>
        </section>
      </PublicShell>
    );
  }
  if (value.kind === 'login') redirect(`/login?returnTo=${encodeURIComponent(value.returnTo)}`);
  if (value.kind === 'redirect') redirect(value.url as Route);
  return (
    <PublicShell narrow>
      {value.kind === 'consent' ? (
        <OAuthConsentCard view={value.view} />
      ) : (
        <section className="auth-panel">
          <h1>外部接続は準備中です</h1>
          <p>通常のサービスは引き続きご利用いただけます。</p>
        </section>
      )}
    </PublicShell>
  );
}
