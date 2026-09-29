import { GetRequiredLegalConsents } from '@bunshin/application';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { currentUserProvider } from '../../src/auth/current-user';
import { PublicShell } from '../ui/public-shell';
import { PendingSubmitButton } from '../ui/pending-submit-button';
import {
  singleAuthAttemptId,
  readAuthReturnContext,
  authReturnPageRequest,
  consumeAuthReturnAttempt,
  authReturnDestination,
  AuthReturnContextError,
} from '../../src/auth/auth-return-attempt';

export const dynamic = 'force-dynamic';

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authAttempt?: string | string[] }>;
}) {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const query = await searchParams;
  const context = await (async () => {
    try {
      const id = singleAuthAttemptId(
        query.authAttempt === undefined
          ? []
          : Array.isArray(query.authAttempt)
            ? query.authAttempt
            : [query.authAttempt],
      );
      const request = authReturnPageRequest('/consent', new Headers(await headers()), id);
      return await readAuthReturnContext(request, id, {
        actorUserId: user.userId,
        allowUnscoped: true,
      });
    } catch {
      redirect('/login?error=auth-context');
    }
  })();
  const db = await import('@bunshin/database');
  const documents = await new GetRequiredLegalConsents(
    new db.PrismaLegalConsentRepository(),
  ).execute(user.userId);
  if (documents.length === 0 || documents.every((item) => item.consentedAt)) {
    const profile = await db.prisma.userRegistrationProfile.findUnique({
      where: { userId: user.userId },
      select: { status: true },
    });
    try {
      await consumeAuthReturnAttempt(context, user.userId);
    } catch (error) {
      if (error instanceof AuthReturnContextError) redirect('/login?error=auth-context');
      throw error;
    }
    redirect(authReturnDestination(context, profile?.status));
  }
  return (
    <PublicShell>
      <section className="consent-page" aria-labelledby="consent-title">
        <div className="page-heading">
          <p className="eyebrow">はじめる前に</p>
          <h1 id="consent-title">利用条件の確認</h1>
          <p>安心してご利用いただくため、現在の規約とプライバシーポリシーをご確認ください。</p>
        </div>
        <form action="/consent/accept" method="post">
          {context.attempt && <input type="hidden" name="authAttempt" value={context.attempt.id} />}
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
            <PendingSubmitButton
              className="button button--primary button--full"
              pendingLabel="同意を保存しています…"
            >
              同意してワタシワークスを利用する
            </PendingSubmitButton>
          </div>
        </form>
      </section>
    </PublicShell>
  );
}
