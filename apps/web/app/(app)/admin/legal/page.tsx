import { ListLegalDocuments } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { notFound, redirect } from 'next/navigation';
import { currentUserProvider } from '../../../../src/auth/current-user';
import { LegalDocumentEditor } from './legal-document-editor';

export const dynamic = 'force-dynamic';

export default async function LegalAdminPage() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const db = await import('@bunshin/database');
  try {
    const documents = await new ListLegalDocuments(new db.PrismaLegalDocumentRepository()).execute(
      user.userId,
    );
    return (
      <main>
        <h1>法務文書管理</h1>
        <p>利用規約とプライバシーポリシーを版管理して公開します。</p>
        <LegalDocumentEditor
          initialDocuments={documents.map((value) => ({
            ...value,
            effectiveAt: value.effectiveAt?.toISOString() ?? null,
            publishedAt: value.publishedAt?.toISOString() ?? null,
          }))}
        />
      </main>
    );
  } catch (error) {
    if (error instanceof ApplicationError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
}
