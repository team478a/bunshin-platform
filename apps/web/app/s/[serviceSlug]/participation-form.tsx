'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface LegalDocument {
  id: string;
  type: 'TERMS' | 'PRIVACY';
  version: number;
  title: string;
  content: string;
}

export function ParticipationForm({
  serviceSlug,
  documents,
  requiresApproval,
  referralCode,
  referralClickId,
}: {
  serviceSlug: string;
  documents: LegalDocument[];
  requiresApproval: boolean;
  referralCode: string | null;
  referralClickId: string | null;
}) {
  const router = useRouter();
  const [accepted, setAccepted] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const allAccepted = documents.every(({ id }) => accepted.includes(id));

  async function submit() {
    setStatus('saving');
    const response = await fetch(`/api/services/${encodeURIComponent(serviceSlug)}/participation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        legalDocumentIds: documents.map(({ id }) => id),
        referralCode,
        referralClickId,
      }),
    });
    if (!response.ok) {
      setStatus('error');
      return;
    }
    router.refresh();
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
              checked={accepted.includes(document.id)}
              onChange={(event) =>
                setAccepted((current) =>
                  event.target.checked
                    ? [...current, document.id]
                    : current.filter((id) => id !== document.id),
                )
              }
              type="checkbox"
            />
            {document.title}に同意します
          </label>
        </section>
      ))}
      <button
        className="button button--primary button--full"
        disabled={!allAccepted || status === 'saving'}
        onClick={() => void submit()}
        type="button"
      >
        {status === 'saving'
          ? '送信しています…'
          : requiresApproval
            ? '参加を申し込む'
            : '参加してはじめる'}
      </button>
      {status === 'error' && (
        <p className="form-error" role="alert">
          申し込みを完了できませんでした。画面を読み直して、もう一度お試しください。
        </p>
      )}
    </div>
  );
}
