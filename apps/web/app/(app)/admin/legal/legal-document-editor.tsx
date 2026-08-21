'use client';
import { useState, type FormEvent } from 'react';

type DocumentValue = {
  id: string;
  type: 'TERMS' | 'PRIVACY';
  version: number;
  title: string;
  content: string;
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED';
  effectiveAt: string | null;
  publishedAt: string | null;
};

export function LegalDocumentEditor({ initialDocuments }: { initialDocuments: DocumentValue[] }) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/admin/legal-documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: form.get('type'),
        title: form.get('title'),
        content: form.get('content'),
      }),
    });
    const value = (await response.json()) as { data: DocumentValue; error?: { message?: string } };
    if (!response.ok) setError(value.error?.message ?? '保存できませんでした。');
    else {
      setDocuments((current) => [value.data, ...current]);
      event.currentTarget.reset();
    }
    setBusy(false);
  }

  async function publish(documentId: string, effectiveAt: string) {
    if (!effectiveAt) return setError('適用日時を入力してください。');
    setBusy(true);
    setError('');
    const response = await fetch(`/api/admin/legal-documents/${documentId}/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ effectiveAt: new Date(effectiveAt).toISOString() }),
    });
    const value = (await response.json()) as { data: DocumentValue; error?: { message?: string } };
    if (!response.ok) setError(value.error?.message ?? '公開できませんでした。');
    else
      setDocuments((current) =>
        current.map((item) =>
          item.id === documentId
            ? value.data
            : item.type === value.data.type && item.status === 'PUBLISHED'
              ? { ...item, status: 'RETIRED' }
              : item,
        ),
      );
    setBusy(false);
  }

  return (
    <section className="legal-admin">
      {error ? (
        <p className="danger" role="alert">
          {error}
        </p>
      ) : null}
      <form className="legal-form" onSubmit={(event) => void create(event)}>
        <label>
          種類
          <select name="type">
            <option value="TERMS">利用規約</option>
            <option value="PRIVACY">プライバシー</option>
          </select>
        </label>
        <label>
          タイトル
          <input name="title" required maxLength={200} />
        </label>
        <label>
          本文
          <textarea name="content" required maxLength={100000} rows={16} />
        </label>
        <button disabled={busy} type="submit">
          下書きを新規保存
        </button>
      </form>
      <ul className="legal-list">
        {documents.map((document) => (
          <li key={document.id} className="legal-card">
            <h2>{document.title}</h2>
            <p>
              {document.type} / v{document.version} / {document.status}
            </p>
            <pre>{document.content}</pre>
            {document.status === 'DRAFT' ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const effectiveAt = form.get('effectiveAt');
                  void publish(document.id, typeof effectiveAt === 'string' ? effectiveAt : '');
                }}
              >
                <label>
                  適用日時
                  <input name="effectiveAt" type="datetime-local" required />
                </label>
                <button disabled={busy} type="submit">
                  この版を公開
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
