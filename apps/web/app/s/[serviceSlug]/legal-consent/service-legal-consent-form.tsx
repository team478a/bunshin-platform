'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Document = {
  id: string;
  type: 'TERMS' | 'PRIVACY' | 'COMMERCE_DISCLOSURE';
  version: number;
  title: string;
  content: string;
};

export function ServiceLegalConsentForm({
  serviceSlug,
  documents,
}: {
  serviceSlug: string;
  documents: Document[];
}) {
  const router = useRouter();
  const [accepted, setAccepted] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');

  async function submit() {
    setStatus('saving');
    try {
      const response = await fetch(
        `/api/services/${encodeURIComponent(serviceSlug)}/legal-consent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ legalDocumentIds: documents.map(({ id }) => id) }),
        },
      );
      if (!response.ok) {
        setStatus('error');
        return;
      }
      router.refresh();
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="service-participation">
      {documents.map((document) => (
        <section className="service-participation__document" key={document.id}>
          <details>
            <summary>
              {document.title}（第{document.version}版）を読む
            </summary>
            <div>{document.content}</div>
          </details>
          <label>
            <input
              type="checkbox"
              checked={accepted.includes(document.id)}
              onChange={(event) =>
                setAccepted((current) =>
                  event.target.checked
                    ? [...current, document.id]
                    : current.filter((id) => id !== document.id),
                )
              }
            />
            {document.title}に同意します
          </label>
        </section>
      ))}
      <button
        className="button button--primary button--full"
        type="button"
        disabled={status === 'saving' || !documents.every(({ id }) => accepted.includes(id))}
        onClick={() => void submit()}
      >
        {status === 'saving' ? '保存しています…' : '現在の文書へ同意する'}
      </button>
      {status === 'error' && (
        <p className="form-error" role="alert">
          保存できませんでした。文書が更新された可能性があります。画面を読み直してお試しください。
        </p>
      )}
    </div>
  );
}
