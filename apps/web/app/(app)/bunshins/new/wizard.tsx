'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Proposal = {
  name: string;
  type: 'COPY' | 'EXPERT' | 'BRAND' | 'CHARACTER';
  tagline: string;
  objectiveSummary: string;
  audienceSummary: string;
  personalitySummary: string;
};
const questions = [
  {
    key: 'goal',
    title: 'BUNSHINに何を手伝ってほしいですか？',
    description: '今、一番近い目的を選んでください。',
    options: [
      ['CONSISTENCY', 'SNS発信を続けたい'],
      ['LEADS', '相談や問い合わせを増やしたい'],
      ['EXPERTISE', '専門知識を伝えたい'],
      ['SALES', '商品・サービスを紹介したい'],
      ['RECRUITING', '採用につなげたい'],
    ],
  },
  {
    key: 'audience',
    title: '主に誰へ届けたいですか？',
    description: '最初に思い浮かぶ相手で大丈夫です。',
    options: [
      ['BEGINNERS', 'その分野の初心者'],
      ['PEERS', '同業者・専門家'],
      ['SOLE_PROPRIETORS', '個人事業主'],
      ['EXECUTIVES', '経営者'],
      ['CUSTOMERS', '既存・見込み顧客'],
      ['UNDECIDED', 'まだ決まっていない'],
    ],
  },
  {
    key: 'tone',
    title: 'どんな印象で話してほしいですか？',
    description: 'あなたらしい、または目指したい雰囲気を選んでください。',
    options: [
      ['FRIENDLY', '親しみやすい'],
      ['TRUSTED', '信頼できる専門家'],
      ['PASSIONATE', '熱意がある'],
      ['CALM', '落ち着いて丁寧'],
      ['PLAYFUL', '明るく楽しい'],
    ],
  },
] as const;

export function BunshinWizard({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ goal: '', audience: '', tone: '' });
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const question = questions[step];

  async function propose() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/bunshins/proposals`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(answers),
        },
      );
      if (!response.ok) throw new Error('failed');
      const result = (await response.json()) as { data: { proposals: Proposal[] } };
      setProposals(result.data.proposals);
      setStep(3);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError('提案を作成できませんでした。もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (selected === null) return;
    const proposal = proposals[selected];
    if (!proposal) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/bunshins`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...proposal,
          tagline: undefined,
          slug: `bunshin-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
        }),
      });
      if (!response.ok) throw new Error('failed');
      const result = (await response.json()) as { data: { id: string } };
      router.push(
        `/bunshins/${result.data.id}?workspaceId=${encodeURIComponent(workspaceId)}` as Route,
      );
    } catch {
      setError('BUNSHINを作成できませんでした。もう一度お試しください。');
      setBusy(false);
    }
  }

  if (step < 3 && question) {
    const value = answers[question.key];
    return (
      <main className="app-page onboarding-page">
        <header className="onboarding-header">
          <div className="onboarding-header__meta">
            <span>質問 {step + 1} / 3</span>
            <span>選ぶだけでOK</span>
          </div>
          <div className="progress-bar">
            <span style={{ width: `${((step + 1) / 4) * 100}%` }} />
          </div>
        </header>
        <section className="wizard-card">
          <h1>{question.title}</h1>
          <p className="wizard-lead">{question.description}</p>
          <div className="onboarding-options">
            {question.options.map(([option, label]) => (
              <button
                key={option}
                type="button"
                className={value === option ? 'is-selected' : ''}
                aria-pressed={value === option}
                onClick={() => setAnswers((current) => ({ ...current, [question.key]: option }))}
              >
                <span>{label}</span>
                <small>{value === option ? '選択中' : '選択する'}</small>
              </button>
            ))}
          </div>
          <div className="wizard-actions">
            {step > 0 && (
              <button
                className="button button--secondary"
                type="button"
                onClick={() => setStep(step - 1)}
              >
                戻る
              </button>
            )}
            <button
              className="button button--primary"
              type="button"
              disabled={!value || busy}
              onClick={() => (step === 2 ? void propose() : setStep(step + 1))}
            >
              {step === 2 ? (busy ? '3案を考えています…' : 'AIに3案を考えてもらう') : '次へ'}
            </button>
          </div>
          {error && (
            <div className="notice notice--danger" role="alert">
              {error}
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="app-page onboarding-page">
      <header className="onboarding-header">
        <div className="onboarding-header__meta">
          <span>提案</span>
          <span>1つ選んでください</span>
        </div>
        <div className="progress-bar">
          <span style={{ width: '100%' }} />
        </div>
      </header>
      <section className="proposal-screen">
        <div className="page-heading">
          <p className="eyebrow">BUNSHINからの3つの案</p>
          <h1>あなたに合うBUNSHINを3つ考えました</h1>
          <p>一番近いものを選んでください。作成後にも調整できます。</p>
        </div>
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
        {error && (
          <div className="notice notice--danger" role="alert">
            {error}
          </div>
        )}
        <div className="wizard-actions">
          <button
            className="button button--secondary"
            type="button"
            disabled={busy}
            onClick={() => {
              setStep(0);
              setSelected(null);
            }}
          >
            回答を変える
          </button>
          <button
            className="button button--secondary"
            type="button"
            disabled={busy}
            onClick={() => void propose()}
          >
            3案を作り直す
          </button>
          <button
            className="button button--primary"
            type="button"
            disabled={selected === null || busy}
            onClick={() => void create()}
          >
            {busy ? '作成中…' : 'このBUNSHINを作る'}
          </button>
        </div>
      </section>
    </main>
  );
}
