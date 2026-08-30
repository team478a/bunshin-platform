'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function propose() {
    setBusy(true);
    setError('');
    const response = await fetch(
      `/api/services/${encodeURIComponent(serviceSlug)}/bunshins/proposals`,
      { method: 'POST' },
    );
    setBusy(false);
    if (!response.ok) {
      setError('3つの案を作れませんでした。もう一度お試しください。');
      return;
    }
    const result = (await response.json()) as { data: { proposals: Proposal[] } };
    setProposals(result.data.proposals);
    setSelected(null);
  }

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
    router.push(`/s/${serviceSlug}/bunshins`);
    router.refresh();
  }

  if (proposals.length === 0) {
    return (
      <div className="form-stack">
        <p>最初に答えた内容をもとに、あなた向けの案を3つ作ります。</p>
        <button
          className="button button--primary button--full"
          disabled={busy}
          onClick={() => void propose()}
        >
          {busy ? '3つの案を考えています…' : '3つの案を見る'}
        </button>
        {error && <p role="alert">{error}</p>}
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
        <button className="button button--secondary" disabled={busy} onClick={() => void propose()}>
          作り直す
        </button>
        <button
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
