import type { LegalDocumentType } from '@bunshin/application';

export async function LegalPage({ type }: { type: LegalDocumentType }) {
  const db = await import('@bunshin/database');
  const document = await new db.PrismaLegalDocumentRepository().findPublished(type);
  if (!document)
    return (
      <main>
        <h1>{type === 'TERMS' ? '利用規約' : 'プライバシーポリシー'}</h1>
        <p>現在準備中です。</p>
      </main>
    );
  return (
    <main className="legal-public">
      <h1>{document.title}</h1>
      <p>
        第{document.version}版 / 適用日:{' '}
        {document.effectiveAt?.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })}
      </p>
      <div>{document.content}</div>
    </main>
  );
}
