'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

type Proposal = {
  name: string;
  tagline: string;
  objectiveSummary: string;
  audienceSummary: string;
  personalitySummary: string;
};

export function ServiceBunshinProposals({ serviceSlug }: { serviceSlug: string }) {
  const router = useRouter();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const requested = useRef(false);

  const propose = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/services/${encodeURIComponent(serviceSlug)}/bunshins/proposals`,
        { method: 'POST' },
      );
      if (!response.ok) throw new Error('proposal request failed');
      const result = (await response.json()) as { data?: { proposals?: Proposal[] } };
      const proposed = result.data?.proposals;
      if (!proposed?.length) throw new Error('proposal response was empty');
      setProposals(proposed);
      setSelected(null);
    } catch {
      setError('3つの案を作れませんでした。もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  }, [serviceSlug]);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    void propose();
  }, [propose]);

  async function create() {
    const proposal = selected === null ? undefined : proposals[selected];
    if (!proposal) return;
    setBusy(true);
    setError('');
    const response = await fetch(`/api/services/${encodeURIComponent(serviceSlug)}/bunshins`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: proposal.name,
        objectiveSummary: proposal.objectiveSummary,
        audienceSummary: proposal.audienceSummary,
        personalitySummary: proposal.personalitySummary,
      }),
    });
    if (!response.ok) {
      setBusy(false);
      setError('投稿パートナーを作れませんでした。もう一度お試しください。');
      return;
    }
    const result = (await response.json()) as { data?: { id?: string } };
    const bunshinId = result.data?.id;
    if (!bunshinId) {
      setBusy(false);
      setError('投稿パートナーは作成されましたが、次の画面を開けませんでした。');
      return;
    }
    router.push(
      `/s/${encodeURIComponent(serviceSlug)}/bunshins/${encodeURIComponent(bunshinId)}?setup=1`,
    );
    router.refresh();
  }

  if (proposals.length === 0) {
    return (
      <div className="form-stack" aria-live="polite">
        <p>
          {busy
            ? '回答をもとに、あなた向けの投稿パートナーを準備しています…'
            : '投稿パートナーの候補を準備できませんでした。'}
        </p>
        {error && (
          <>
            <p role="alert">{error}</p>
            <button
              type="button"
              className="button button--primary button--full"
              onClick={() => void propose()}
            >
              もう一度準備する
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="form-stack">
      <p>一番近いものを選んでください。作ったあとでも直せます。</p>
      <div className="proposal-grid">
        {proposals.map((proposal, index) => (
          <button
            key={`${proposal.name}-${index}`}
            type="button"
            className={`proposal-card${selected === index ? ' is-selected' : ''}`}
            aria-pressed={selected === index}
            onClick={() => setSelected(index)}
          >
            <span className="proposal-card__number">0{index + 1}</span>
            <strong>{proposal.name}</strong>
            <em>{proposal.tagline}</em>
            <p>{proposal.personalitySummary}</p>
            <span className="proposal-card__select">
              {selected === index ? '✓ この案を選択中' : 'この案を選ぶ'}
            </span>
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="wizard-actions">
        <button
          type="button"
          className="button button--secondary"
          disabled={busy}
          onClick={() => void propose()}
        >
          作り直す
        </button>
        <button
          type="button"
          className="button button--primary"
          disabled={selected === null || busy}
          onClick={() => void create()}
        >
          {busy ? '作っています…' : 'この案で作る'}
        </button>
      </div>
    </div>
  );
}
