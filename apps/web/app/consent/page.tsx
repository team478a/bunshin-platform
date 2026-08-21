import { GetRequiredLegalConsents } from '@bunshin/application';
import { redirect } from 'next/navigation';
import { currentUserProvider } from '../../src/auth/current-user';

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
    <main className="consent-page">
      <h1>利用条件の確認</h1>
      <p>サービスを続けるには、現在の利用規約とプライバシーポリシーをご確認ください。</p>
      <form action="/consent/accept" method="post">
        {documents.map((document) => (
          <section className="legal-card" key={document.id}>
            <h2>{document.title}</h2>
            <p>バージョン {document.version}</p>
            <div className="legal-content">{document.content}</div>
            <label>
              <input name="documentId" type="checkbox" value={document.id} required />
              この内容に同意します
            </label>
          </section>
        ))}
        <button type="submit">同意してBUNSHINを利用する</button>
      </form>
    </main>
  );
}
