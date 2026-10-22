'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SIDE_HUSTLE_COMMON_NOTICES, type SideHustleHearing } from '@bunshin/capability-training';

type Candidate = {
  name: string;
  summary: string;
  category: string;
  monetization: string;
  fitReasons: readonly { text: string }[];
  initialCost: string;
  monthlyCost: string;
  weeklyHoursMin: number;
  difficulty: number;
  requiredSkills: readonly string[];
  typicalFlow: readonly string[];
  risks: readonly string[];
  requirements: readonly { text: string }[];
};
type State = {
  hearing: { id: string; revision: number; hearing: SideHustleHearing } | null;
  proposal: {
    id: string;
    proposal: {
      status: string;
      reason: string;
      questions: readonly string[];
      candidates: readonly Candidate[];
    };
    screening: {
      entries: readonly {
        candidateIndex: number;
        name: string;
        verdict: string;
        reasons: readonly string[];
      }[];
    };
    removedCandidateCount: number;
  } | null;
  selection: { candidate: Candidate } | null;
};
type ApiEnvelope<T> = { data: T; error?: { message?: string } };
type SavedHearing = NonNullable<State['hearing']>;
type SavedProposal = NonNullable<State['proposal']>;
type SavedSelection = NonNullable<State['selection']>;
const choices: Record<string, readonly { label: string; value: string | number | null }[]> = {
  weeklyHours: [
    { label: '1時間くらい', value: 1 },
    { label: '3時間くらい', value: 3 },
    { label: '5時間くらい', value: 5 },
    { label: '7時間くらい', value: 7 },
    { label: '10時間くらい', value: 10 },
    { label: '15時間くらい', value: 15 },
    { label: '20時間以上', value: 20 },
  ],
  initialBudget: [
    { label: 'お金はかけたくない', value: 'NONE' },
    { label: '1万円未満', value: 'UNDER_10K' },
    { label: '5万円未満', value: 'UNDER_50K' },
    { label: '5万円以上でもよい', value: 'OVER_50K' },
  ],
  monthlyBudget: [
    { label: 'お金はかけたくない', value: 'NONE' },
    { label: '1万円未満', value: 'UNDER_10K' },
    { label: '5万円未満', value: 'UNDER_50K' },
    { label: '5万円以上でもよい', value: 'OVER_50K' },
  ],
  device: [
    { label: 'パソコンを使える', value: 'PC' },
    { label: 'スマートフォンだけ', value: 'SMARTPHONE_ONLY' },
  ],
  faceExposure: [
    { label: '顔を出してもよい', value: 'OK' },
    { label: '顔は出したくない', value: 'NG' },
  ],
  snsPosting: [
    { label: '発信してもよい', value: 'OK' },
    { label: '発信はしたくない', value: 'NG' },
  ],
  clientInteraction: [
    { label: 'やり取りしてもよい', value: 'OK' },
    { label: 'できれば避けたい', value: 'NG' },
  ],
  salesOutreach: [
    { label: 'してもよい', value: 'OK' },
    { label: 'できれば避けたい', value: 'NG' },
  ],
  inventory: [
    { label: '置いてもよい', value: 'OK' },
    { label: '置きたくない', value: 'NG' },
  ],
};
const questions: readonly {
  key: string;
  text: string;
  type: 'text' | 'select';
  optional: boolean;
  placeholder?: string;
}[] = [
  {
    key: 'goal',
    text: '副業で、どんなことを実現したいですか？',
    type: 'text',
    optional: false,
    placeholder:
      '少しでも収入を増やしたい／得意なことを活かしたい／将来の独立に向けて経験を積みたい',
  },
  {
    key: 'experience',
    text: 'これまでの仕事や趣味で、経験してきたことや得意なことを教えてください。',
    type: 'text',
    optional: true,
  },
  {
    key: 'interest',
    text: '興味があること、やってみたいことはありますか？',
    type: 'text',
    optional: true,
  },
  {
    key: 'weeklyHours',
    text: '副業に使える時間は、1週間でどのくらいですか？',
    type: 'select',
    optional: true,
  },
  {
    key: 'initialBudget',
    text: '始めるときに使ってもよい費用はどのくらいですか？',
    type: 'select',
    optional: true,
  },
  {
    key: 'monthlyBudget',
    text: '毎月かかる費用は、どのくらいまでなら大丈夫ですか？',
    type: 'select',
    optional: true,
  },
  { key: 'device', text: '副業に使える機器はどれですか？', type: 'select', optional: true },
  { key: 'faceExposure', text: '顔を出して活動してもよいですか？', type: 'select', optional: true },
  {
    key: 'snsPosting',
    text: '自分のSNSで発信することに抵抗はありますか？',
    type: 'select',
    optional: true,
  },
  {
    key: 'clientInteraction',
    text: '依頼主やお客さまとメッセージなどでやり取りしてもよいですか？',
    type: 'select',
    optional: true,
  },
  {
    key: 'salesOutreach',
    text: '自分から仕事を提案したり、営業したりしてもよいですか？',
    type: 'select',
    optional: true,
  },
  {
    key: 'inventory',
    text: '商品や在庫を家に置いてもよいですか？',
    type: 'select',
    optional: true,
  },
  {
    key: 'constraint',
    text: '避けたいことや、気になっていることはありますか？',
    type: 'text',
    optional: true,
    placeholder: '例：勤務先で副業が認められているか分からない、夜しか時間がない',
  },
];
const cautionText: Record<string, string> = {
  FACE_EXPOSURE_AVOIDABLE: '顔を出す場面があります。顔を出さないやり方を選べる場合があります。',
  SNS_POSTING_AVOIDABLE: 'SNSでの発信が役立つ場面があります。発信せずに進める方法もあります。',
  CLIENT_INTERACTION_AVOIDABLE: '依頼主やお客さまとのやり取りが発生する場合があります。',
  SALES_OUTREACH_AVOIDABLE: '自分から提案する場面があります。提案せずに始められる方法もあります。',
  INVENTORY_AVOIDABLE: '商品を手元に置く場合があります。在庫を持たないやり方もあります。',
};
const budgetLabel: Record<string, string> = {
  NONE: 'ほぼかからない',
  UNDER_10K: '1万円未満',
  UNDER_50K: '5万円未満',
  OVER_50K: '5万円以上',
};
const difficultyLabel: Record<number, string> = {
  1: 'はじめやすい',
  2: '少し慣れが必要',
  3: '準備と練習が必要',
};
const endpoint = (slug: string, id: string) =>
  `/api/services/${encodeURIComponent(slug)}/ai-training/enrollments/${encodeURIComponent(id)}/side-hustle`;
function blankHearing(): SideHustleHearing {
  return {
    conditions: {
      initialBudget: null,
      monthlyBudget: null,
      weeklyHours: null,
      faceExposure: null,
      snsPosting: null,
      clientInteraction: null,
      salesOutreach: null,
      inventory: null,
      device: null,
    },
    freeText: { goal: null, experience: null, interest: null, constraint: null },
    followUps: [],
  };
}
function readAnswer(hearing: SideHustleHearing, key: string) {
  if (key === 'goal' || key === 'experience' || key === 'interest' || key === 'constraint')
    return hearing.freeText[key];
  return hearing.conditions[key as keyof SideHustleHearing['conditions']];
}
function updateAnswer(
  hearing: SideHustleHearing,
  key: string,
  value: string | number | null,
): SideHustleHearing {
  if (key === 'goal' || key === 'experience' || key === 'interest' || key === 'constraint')
    return { ...hearing, freeText: { ...hearing.freeText, [key]: value === '' ? null : value } };
  return { ...hearing, conditions: { ...hearing.conditions, [key]: value } };
}

export default function SideHustlePage({
  params,
}: {
  params: Promise<{ serviceSlug: string; programEnrollmentId: string }>;
}) {
  const [route, setRoute] = useState<{ serviceSlug: string; programEnrollmentId: string } | null>(
    null,
  );
  const [state, setState] = useState<State>({ hearing: null, proposal: null, selection: null });
  const [hearing, setHearing] = useState<SideHustleHearing>(blankHearing());
  const [step, setStep] = useState(0);
  const [screen, setScreen] = useState<
    'intro' | 'questions' | 'review' | 'proposal' | 'followup' | 'selection' | 'selected'
  >('intro');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [proposalOperationId, setProposalOperationId] = useState('');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [followUpAnswer, setFollowUpAnswer] = useState('');
  const [candidateIndex, setCandidateIndex] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const api = useCallback(
    (path = '') =>
      route ? `${endpoint(route.serviceSlug, route.programEnrollmentId)}${path}` : '',
    [route],
  );
  const load = useCallback(async () => {
    if (!route) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(api(), { cache: 'no-store' });
      const json = (await response.json()) as ApiEnvelope<State>;
      if (!response.ok) throw new Error(json.error?.message ?? '読み込めませんでした。');
      const loaded = json.data;
      setState(loaded);
      if (loaded.hearing) {
        setHearing(loaded.hearing.hearing);
        setStep(Math.min(12, loaded.hearing.revision));
      }
      if (loaded.selection) setScreen('selected');
      else if (loaded.proposal) setScreen('proposal');
      else if (loaded.hearing) setScreen('questions');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '読み込めませんでした。');
    } finally {
      setBusy(false);
    }
  }, [api, route]);
  useEffect(() => {
    void params.then(setRoute);
  }, [params]);
  useEffect(() => {
    void load();
  }, [load]);
  const save = useCallback(
    async (value: SideHustleHearing, preserveProposal = false) => {
      const response = await fetch(api('/hearing'), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hearing: value,
          expectedRevision: state.hearing?.revision ?? 0,
          operationId: crypto.randomUUID(),
        }),
      });
      const json = (await response.json()) as ApiEnvelope<SavedHearing>;
      if (!response.ok) throw new Error(json.error?.message ?? '保存できませんでした。');
      const next = json.data;
      setState((current) => ({
        ...current,
        hearing: next,
        ...(preserveProposal ? {} : { proposal: null }),
      }));
      return next;
    },
    [api, state.hearing?.revision],
  );
  const propose = useCallback(
    async (hearingState = state.hearing) => {
      if (!hearingState) return;
      setBusy(true);
      setError('');
      setScreen('proposal');
      const operationId = proposalOperationId || crypto.randomUUID();
      setProposalOperationId(operationId);
      try {
        const response = await fetch(api('/proposal'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            hearingEventId: hearingState.id,
            hearingRevision: hearingState.revision,
            operationId,
          }),
        });
        const json = (await response.json()) as ApiEnvelope<SavedProposal>;
        if (!response.ok)
          throw new Error(
            json.error?.message ?? '候補を作れませんでした。時間をおいて、もう一度お試しください。',
          );
        setState((current) => ({ ...current, proposal: json.data }));
        setQuestionIndex(0);
        setFollowUpAnswer('');
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : '候補を作れませんでした。時間をおいて、もう一度お試しください。',
        );
      } finally {
        setBusy(false);
      }
    },
    [api, proposalOperationId, state.hearing],
  );
  const update = (key: string, value: string | number | null) =>
    setHearing((current) => updateAnswer(current, key, value));
  const current = questions[step]!;
  const currentValue = readAnswer(hearing, current.key);
  const answerText = (key: string) => {
    const value = readAnswer(hearing, key);
    if (value === null) return 'わからない・あとで';
    const option = choices[key]?.find((choice) => choice.value === value);
    return option?.label ?? String(value);
  };
  const proposal = state.proposal;
  const candidate = useMemo(
    () =>
      candidateIndex === null
        ? null
        : (proposal?.proposal.candidates.find(
            (item) =>
              item.name ===
              proposal.screening.entries.find((entry) => entry.candidateIndex === candidateIndex)
                ?.name,
          ) ?? null),
    [candidateIndex, proposal],
  );
  const advance = async (value?: SideHustleHearing) => {
    const nextHearing = value ?? hearing;
    setBusy(true);
    setError('');
    try {
      await save(nextHearing);
      if (step < questions.length - 1) setStep((currentStep) => currentStep + 1);
      else setScreen('review');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存できませんでした。');
    } finally {
      setBusy(false);
    }
  };
  const answerFollowUp = async () => {
    if (!proposal || !state.hearing || !followUpAnswer.trim()) return;
    const next = {
      ...hearing,
      followUps: [
        ...hearing.followUps,
        { question: proposal.proposal.questions[questionIndex]!, answer: followUpAnswer.trim() },
      ],
    };
    setBusy(true);
    setError('');
    try {
      const saved = await save(next, true);
      setHearing(next);
      setFollowUpAnswer('');
      if (questionIndex + 1 < proposal.proposal.questions.length)
        setQuestionIndex((index) => index + 1);
      else {
        setProposalOperationId('');
        setState((currentState) => ({ ...currentState, proposal: null }));
        await propose(saved);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存できませんでした。');
      setBusy(false);
    }
  };
  const submitSelection = async () => {
    if (!proposal || candidateIndex === null || !confirmed) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(api('/selection'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          proposalEventId: proposal.id,
          candidateIndex,
          operationId: crypto.randomUUID(),
          confirmed: true,
        }),
      });
      const json = (await response.json()) as ApiEnvelope<SavedSelection>;
      if (!response.ok) throw new Error(json.error?.message ?? '選択を保存できませんでした。');
      setState((currentState) => ({ ...currentState, selection: json.data }));
      setScreen('selected');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '選択を保存できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  if (busy && !route)
    return (
      <main>
        <p>読み込んでいます。</p>
      </main>
    );
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 48px' }}>
      <h1>副業を一緒に選ぶ</h1>
      {error && <p role="alert">{error}</p>}
      {screen === 'intro' && (
        <section>
          <p>
            あなたに合う副業を一緒に考えるために、いくつか質問します。
            <br />
            答えにくい質問は「わからない・あとで」で飛ばせます。あとから直すこともできます。
            <br />
            氏名、勤務先名、住所、口座番号など、個人を特定できる情報は入力しないでください。
          </p>
          <button disabled={busy} onClick={() => setScreen('questions')}>
            はじめる
          </button>
        </section>
      )}
      {screen === 'questions' && (
        <section>
          <p>{step + 1} / 13</p>
          <button
            disabled={step === 0 || busy}
            onClick={() => setStep((value) => Math.max(0, value - 1))}
          >
            戻る
          </button>
          <h2>{current.text}</h2>
          {current.type === 'text' ? (
            <textarea
              maxLength={300}
              value={String(currentValue ?? '')}
              placeholder={current.placeholder}
              onChange={(event) => update(current.key, event.target.value)}
            />
          ) : (
            <div>
              {choices[current.key]?.map((choice) => (
                <button
                  key={String(choice.value)}
                  aria-pressed={currentValue === choice.value}
                  onClick={() => update(current.key, choice.value)}
                >
                  {choice.label}
                </button>
              ))}
              <button
                aria-pressed={currentValue === null}
                onClick={() => update(current.key, null)}
              >
                わからない・あとで
              </button>
            </div>
          )}
          <button
            disabled={
              busy ||
              (!current.optional && (typeof currentValue !== 'string' || !currentValue.trim()))
            }
            onClick={() => void advance()}
          >
            {step === 12 ? '回答を確認する' : '次へ'}
          </button>
        </section>
      )}
      {screen === 'review' && (
        <section>
          <h2>この内容で候補を考えます</h2>
          {questions.map((question, index) => (
            <p key={question.key}>
              {question.text}
              <br />
              {answerText(question.key)}{' '}
              <button
                onClick={() => {
                  setStep(index);
                  setScreen('questions');
                }}
              >
                直す
              </button>
            </p>
          ))}
          <button
            disabled={busy}
            onClick={() =>
              void (async () => {
                setBusy(true);
                setError('');
                try {
                  const saved = await save(hearing);
                  setProposalOperationId('');
                  await propose(saved);
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : '保存できませんでした。');
                  setBusy(false);
                }
              })()
            }
          >
            この内容で候補を考える
          </button>
        </section>
      )}
      {screen === 'proposal' && !proposal && (
        <section>
          <p>候補を考えています。少しお待ちください。</p>
          {error && (
            <button disabled={busy} onClick={() => void propose()}>
              もう一度試す
            </button>
          )}
        </section>
      )}
      {screen === 'proposal' && proposal?.proposal.status === 'NEEDS_CONTEXT' && (
        <section>
          <h2>もう少し教えてください</h2>
          <p>{proposal.proposal.questions[questionIndex]}</p>
          <textarea
            maxLength={300}
            value={followUpAnswer}
            onChange={(event) => setFollowUpAnswer(event.target.value)}
          />
          <button disabled={busy || !followUpAnswer.trim()} onClick={() => void answerFollowUp()}>
            答えて候補を考える
          </button>
        </section>
      )}
      {screen === 'proposal' && proposal?.proposal.status === 'NO_FIT' && (
        <section>
          <p>{proposal.proposal.reason}</p>
          <button onClick={() => setScreen('review')}>条件を見直す</button>
        </section>
      )}
      {screen === 'proposal' && proposal?.proposal.status === 'READY' && (
        <section>
          <h2>あなたに合いそうな副業の候補</h2>
          <p>
            ヒアリングの回答をもとに、AIが候補を考えました。費用や時間は一般的な目安です。気になる候補を比べて、1つ選んでください。
          </p>
          {proposal.screening.entries
            .filter((entry) => entry.verdict !== 'EXCLUDED')
            .map((entry) => {
              const item = proposal.proposal.candidates.find(
                (candidateItem) => candidateItem.name === entry.name,
              );
              if (!item) return null;
              return (
                <article
                  key={entry.candidateIndex}
                  style={{
                    border: '1px solid #ccc',
                    borderRadius: 12,
                    padding: 16,
                    marginBlock: 16,
                  }}
                >
                  {entry.verdict === 'CAUTION' && (
                    <div>
                      <strong>注意：</strong>
                      {entry.reasons
                        .filter((reason) => cautionText[reason])
                        .map((reason) => (
                          <p key={reason}>{cautionText[reason]}</p>
                        ))}
                    </div>
                  )}
                  <h3>{item.name}</h3>
                  <p>{item.summary}</p>
                  <h4>あなたに合いそうな理由</h4>
                  {item.fitReasons.map((reason, i) => (
                    <p key={i}>{reason.text}</p>
                  ))}
                  <p>
                    <strong>収入が生まれる仕組み</strong>
                    <br />
                    {item.monetization}
                  </p>
                  <p>
                    始めるときの費用（目安）：{budgetLabel[item.initialCost]}
                    <br />
                    毎月の費用（目安）：{budgetLabel[item.monthlyCost]}
                    <br />
                    必要な時間（目安）：週{item.weeklyHoursMin}時間くらいから
                    <br />
                    むずかしさ：{difficultyLabel[item.difficulty]}
                  </p>
                  <p>
                    <strong>必要なスキル</strong>
                    <br />
                    {item.requiredSkills.join('、')}
                  </p>
                  <p>
                    <strong>始めるまでの流れ</strong>
                  </p>
                  <ol>
                    {item.typicalFlow.map((stepText, i) => (
                      <li key={i}>{stepText}</li>
                    ))}
                  </ol>
                  <p>
                    <strong>気をつけること</strong>
                  </p>
                  <ul>
                    {item.risks.map((risk, i) => (
                      <li key={i}>{risk}</li>
                    ))}
                  </ul>
                  <p>
                    <strong>確認が必要なこと（AIによる目安）</strong>
                  </p>
                  <ul>
                    {item.requirements.map((requirement, i) => (
                      <li key={i}>{requirement.text}</li>
                    ))}
                  </ul>
                  <button
                    onClick={() => {
                      setCandidateIndex(entry.candidateIndex);
                      setConfirmed(false);
                      setScreen('selection');
                    }}
                  >
                    この副業にする
                  </button>
                </article>
              );
            })}
          <aside>
            {SIDE_HUSTLE_COMMON_NOTICES.map((notice) => (
              <p key={notice.kind}>{notice.text}</p>
            ))}
          </aside>
          {proposal.screening.entries.every((entry) => entry.verdict === 'EXCLUDED') && (
            <p>
              今の条件に合う候補が見つかりませんでした。予算や時間などの条件を見直すと、候補が見つかる場合があります。{' '}
              <button onClick={() => setScreen('review')}>条件を見直す</button>
            </p>
          )}
        </section>
      )}
      {screen === 'selection' && candidate && (
        <section role="dialog" aria-modal="true">
          <h2>「{candidate.name}」で始めますか？</h2>
          <p>選んだ副業で、これから始めるための計画を作ります。あとから選び直すこともできます。</p>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            内容と注意点を確認しました
          </label>
          <p>
            <button disabled={busy || !confirmed} onClick={() => void submitSelection()}>
              この副業で始める
            </button>
            <button disabled={busy} onClick={() => setScreen('proposal')}>
              戻る
            </button>
          </p>
        </section>
      )}
      {screen === 'selected' && state.selection && (
        <section>
          <h2>選んだ副業：{state.selection.candidate.name}</h2>
          <p>{state.selection.candidate.summary}</p>
          <p>次は、この副業で始めるための計画を作ります（準備中）。</p>
          <button onClick={() => setScreen('proposal')}>選び直す</button>
        </section>
      )}
    </main>
  );
}
