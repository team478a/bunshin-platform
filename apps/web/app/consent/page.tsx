import { GetRequiredLegalConsents } from '@bunshin/application';
import { redirect } from 'next/navigation';
import { currentUserProvider } from '../../src/auth/current-user';
import { PublicShell } from '../ui/public-shell';

export const dynamic = 'force-dynamic';

export default async function ConsentPage() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  const documents = await new GetRequiredLegalConsents(
    new db.PrismaLegalConsentRepository(),
  ).execute(user.userId);
  if (documents.length === 0 || documents.every((item) => item.consentedAt)) redirect('/bunshins');
  return (
    <PublicShell>
      <section className="consent-page" aria-labelledby="consent-title">
        <div className="page-heading">
          <p className="eyebrow">はじめる前に</p>
          <h1 id="consent-title">利用条件の確認</h1>
          <p>安心してご利用いただくため、現在の規約とプライバシーポリシーをご確認ください。</p>
        </div>
        <form action="/consent/accept" method="post">
          <div className="consent-documents">
            {documents.map((document) => (
              <section className="legal-card consent-document" key={document.id}>
                <header className="consent-document__header">
                  <h2>{document.title}</h2>
                  <span className="badge">第{document.version}版</span>
                </header>
                <div className="legal-content" tabIndex={0}>
                  {document.content}
                </div>
                <label className="check-row">
                  <input name="documentId" type="checkbox" value={document.id} required />
                  <span>この内容を確認し、同意します</span>
                </label>
              </section>
            ))}
          </div>
          <div className="sticky-action">
            <button className="button button--primary button--full" type="submit">
              同意してBUNSHINを利用する
            </button>
          </div>
        </form>
      </section>
    </PublicShell>
  );
}
