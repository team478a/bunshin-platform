'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SIDE_HUSTLE_COMMON_NOTICES, type SideHustleHearing } from '@bunshin/capability-training';
import { CheckinDecisionSelect, CheckinDecisionSubmitButton } from './checkin-controls';

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
  hearing: {
    id: string;
    revision: number;
    hearing: SideHustleHearing;
    lastAnsweredQuestionIndex: number;
  } | null;
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
  selection: { id: string; candidate: Candidate } | null;
  roadmap: {
    id: string;
    roadmap: {
      reason: string;
      milestones: readonly {
        period: string;
        title: string;
        outcome: string;
        checkpoints: readonly string[];
        weeklyHours: number;
      }[];
    };
  } | null;
  revisionProposal?: NonNullable<State['roadmap']> | null;
  started: { topicId: string; requestId: string } | null;
  progress?: {
    topicId: string;
    status: string;
    period: string;
    periodStartedAt: string;
    verifiedPracticeCount: number;
    eligibility: { suggested: boolean; canAdvance: boolean; reason: string };
    roadmap: NonNullable<State['roadmap']>['roadmap'];
    lastCheckin: unknown;
  } | null;
  activeSideHustle: { id: string; title: string } | null;
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

export default function SideHustleClient({
  serviceSlug,
  programEnrollmentId,
}: {
  serviceSlug: string;
  programEnrollmentId: string;
}) {
  const [route] = useState({ serviceSlug, programEnrollmentId });
  const [state, setState] = useState<State>({
    hearing: null,
    proposal: null,
    selection: null,
    roadmap: null,
    revisionProposal: null,
    started: null,
    activeSideHustle: null,
  });
  const [hearing, setHearing] = useState<SideHustleHearing>(blankHearing());
  const [step, setStep] = useState(0);
  const [screen, setScreen] = useState<
    | 'intro'
    | 'questions'
    | 'review'
    | 'proposal'
    | 'followup'
    | 'selection'
    | 'selected'
    | 'roadmap'
    | 'roadmapRevision'
    | 'confirmStart'
    | 'started'
    | 'checkin'
    | 'confirmAdvance'
  >('intro');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [proposalOperationId, setProposalOperationId] = useState('');
  const [roadmapOperationId, setRoadmapOperationId] = useState('');
  const [revisionRoadmapOperationId, setRevisionRoadmapOperationId] = useState('');
  const [revisionConfirmOperationId, setRevisionConfirmOperationId] = useState('');
  const [revisionCheckinEventId, setRevisionCheckinEventId] = useState('');
  const [startOperationId, setStartOperationId] = useState('');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [followUpAnswer, setFollowUpAnswer] = useState('');
  const [candidateIndex, setCandidateIndex] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [checkpointResults, setCheckpointResults] = useState<string[]>([]);
  const [feeling, setFeeling] = useState('OK');
  const [checkinNote, setCheckinNote] = useState('');
  const [decision, setDecision] = useState('CONTINUE');
  const [checkinOperationId, setCheckinOperationId] = useState('');
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
      if (loaded.started) {
        const progressResponse = await fetch(
          api(`/progress?topicId=${encodeURIComponent(loaded.started.topicId)}`),
          { cache: 'no-store' },
        );
        const progressJson = (await progressResponse.json()) as ApiEnvelope<
          NonNullable<State['progress']>
        >;
        if (progressResponse.ok) {
          setState((currentState) => ({ ...currentState, progress: progressJson.data }));
          setCheckpointResults(
            progressJson.data.roadmap.milestones[
              Number(progressJson.data.period.slice(-1)) - 1
            ]?.checkpoints.map(() => 'NOT_YET') ?? [],
          );
        }
      }
      if (loaded.selection && !loaded.roadmap)
        setRoadmapOperationId((current) => current || crypto.randomUUID());
      if (loaded.hearing) {
        setHearing(loaded.hearing.hearing);
        setStep(Math.min(loaded.hearing.lastAnsweredQuestionIndex, questions.length - 1));
      }
      if (loaded.proposal?.proposal.status === 'NEEDS_CONTEXT' && loaded.hearing) {
        const followUps = loaded.hearing.hearing.followUps;
        const questionsForProposal = loaded.proposal.proposal.questions;
        const count = Math.min(followUps.length, questionsForProposal.length);
        const suffix = followUps.slice(-count);
        const answeredCount = suffix.every(
          (item, index) => item.question === questionsForProposal[index],
        )
          ? count
          : 0;
        setQuestionIndex(Math.min(answeredCount, questionsForProposal.length - 1));
      }
      if (loaded.started)
        setScreen(
          new URLSearchParams(window.location.search).has('checkin') ? 'checkin' : 'started',
        );
      else if (loaded.selection) setScreen('roadmap');
      else if (loaded.proposal) setScreen('proposal');
      else if (loaded.hearing)
        setScreen(
          loaded.hearing.lastAnsweredQuestionIndex >= questions.length ? 'review' : 'questions',
        );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '読み込めませんでした。');
    } finally {
      setBusy(false);
    }
  }, [api, route]);
  useEffect(() => {
    void load();
  }, [load]);
  const save = useCallback(
    async (
      value: SideHustleHearing,
      preserveProposal = false,
      lastAnsweredQuestionIndex = step,
    ) => {
      const response = await fetch(api('/hearing'), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hearing: value,
          expectedRevision: state.hearing?.revision ?? 0,
          lastAnsweredQuestionIndex,
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
    [api, state.hearing?.revision, step],
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
      await save(nextHearing, false, step + 1);
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
      const saved = await save(next, true, step);
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
      setRoadmapOperationId(crypto.randomUUID());
      setScreen('roadmap');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '選択を保存できませんでした。');
    } finally {
      setBusy(false);
    }
  };

  const createRoadmap = async (newOperationId?: string, forRevision = false) => {
    if (!state.selection) return;
    const operationId = newOperationId || roadmapOperationId || crypto.randomUUID();
    setRoadmapOperationId(operationId);
    setBusy(true);
    setError('');
    try {
      const response = await fetch(api('/roadmap'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          selectionEventId: state.selection.id,
          operationId,
        }),
      });
      const json = (await response.json()) as ApiEnvelope<NonNullable<State['roadmap']>>;
      if (!response.ok)
        throw new Error(
          json.error?.message ?? '地図を作れませんでした。時間をおいて、もう一度お試しください。',
        );
      setState((currentState) => ({ ...currentState, roadmap: json.data }));
      if (forRevision) setScreen('roadmapRevision');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : '地図を作れませんでした。時間をおいて、もう一度お試しください。',
      );
    } finally {
      setBusy(false);
    }
  };

  const createRoadmapRevision = async (
    newOperationId?: string,
    checkinEventId = revisionCheckinEventId,
  ) => {
    if (!state.started || !checkinEventId) return;
    const operationId = newOperationId || revisionRoadmapOperationId || crypto.randomUUID();
    setRevisionRoadmapOperationId(operationId);
    setBusy(true);
    setError('');
    try {
      const response = await fetch(api('/roadmap-revision'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topicId: state.started.topicId, checkinEventId, operationId }),
      });
      const json = (await response.json()) as ApiEnvelope<NonNullable<State['roadmap']>>;
      if (!response.ok)
        throw new Error(
          json.error?.message ?? '地図を作り直せませんでした。もう一度お試しください。',
        );
      setState((currentState) => ({ ...currentState, revisionProposal: json.data }));
      setScreen('roadmapRevision');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : '地図を作り直せませんでした。もう一度お試しください。',
      );
    } finally {
      setBusy(false);
    }
  };

  const submitCheckin = async (selectedDecision: string) => {
    if (!state.started || !state.progress) return;
    const operationId = checkinOperationId || crypto.randomUUID();
    setCheckinOperationId(operationId);
    setBusy(true);
    setError('');
    try {
      const response = await fetch(api('/checkin'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operationId,
          checkin: {
            topicId: state.started.topicId,
            period: state.progress.period,
            checkpointResults,
            feeling,
            note: checkinNote || null,
            decision: selectedDecision,
          },
        }),
      });
      const json = (await response.json()) as ApiEnvelope<unknown>;
      if (!response.ok) throw new Error(json.error?.message ?? '振り返りを保存できませんでした。');
      const saved = json.data as { checkinEventId?: string };
      if (selectedDecision === 'RESELECT') {
        setScreen('proposal');
        return;
      }
      if (selectedDecision === 'REVISE') {
        const roadmapId = revisionRoadmapOperationId || crypto.randomUUID();
        setRevisionRoadmapOperationId(roadmapId);
        setRevisionConfirmOperationId((current) => current || crypto.randomUUID());
        if (!saved.checkinEventId) throw new Error('振り返りを確認できませんでした。');
        setRevisionCheckinEventId(saved.checkinEventId);
        setState((currentState) => ({ ...currentState, revisionProposal: null }));
        setScreen('roadmapRevision');
        await createRoadmapRevision(roadmapId, saved.checkinEventId);
        return;
      }
      setConfirmed(false);
      setCheckinOperationId('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '振り返りを保存できませんでした。');
    } finally {
      setBusy(false);
    }
  };
  const confirmRoadmapRevision = async () => {
    if (!state.started || !state.revisionProposal || !revisionConfirmOperationId) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(api('/revision'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          topicId: state.started.topicId,
          revisionProposalEventId: state.revisionProposal.id,
          operationId: revisionConfirmOperationId,
          confirmed: true,
        }),
      });
      const json = (await response.json()) as ApiEnvelope<unknown>;
      if (!response.ok) throw new Error(json.error?.message ?? '地図を確定できませんでした。');
      setRevisionRoadmapOperationId('');
      setRevisionConfirmOperationId('');
      setRevisionCheckinEventId('');
      setCheckinOperationId('');
      setScreen('started');
      await load();
      setScreen('started');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '地図を確定できませんでした。');
    } finally {
      setBusy(false);
    }
  };
  const startSideHustle = async () => {
    if (!state.selection || !state.roadmap || !confirmed) return;
    const operationId = startOperationId || crypto.randomUUID();
    setStartOperationId(operationId);
    setBusy(true);
    setError('');
    try {
      const response = await fetch(api('/start'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          selectionEventId: state.selection.id,
          roadmapEventId: state.roadmap.id,
          operationId,
          confirmed: true,
        }),
      });
      const json = (await response.json()) as ApiEnvelope<{ topicId: string; learningUrl: string }>;
      if (!response.ok) throw new Error(json.error?.message ?? '開始できませんでした。');
      window.location.assign(json.data.learningUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '開始できませんでした。');
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
          {state.progress?.period !== 'MONTH_3' &&
            checkpointResults.some((item) => item !== 'DONE') && (
              <p>「まだ」「一部できた」の目安は、次の段階でも意識できるように引き継ぎます。</p>
            )}
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
          <p>今の条件では、安全に提案できる副業が見つかりませんでした。</p>
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
      {screen === 'roadmap' && state.selection && !state.roadmap && (
        <section>
          <h2>次は、90日の地図を作ります</h2>
          <p>
            選んだ副業を始めて続けるために、1か月ごとの目標を3つ作ります。毎日の課題は、進み具合に合わせて1つずつ用意します。
          </p>
          {busy ? (
            <p>地図を作っています。少しお待ちください。</p>
          ) : (
            <button onClick={() => void createRoadmap()}>90日の地図を作る</button>
          )}
          {error && (
            <>
              <p role="alert">{error}</p>
              <button disabled={busy} onClick={() => void createRoadmap()}>
                もう一度試す
              </button>
            </>
          )}
        </section>
      )}
      {screen === 'roadmap' && state.selection && state.roadmap && (
        <section>
          <h2>「{state.selection.candidate.name}」の90日の地図</h2>
          <p>1か月ごとの目安です。進み具合に合わせて見直せます。</p>
          {state.roadmap.roadmap.milestones.map((item, index) => (
            <article key={item.period}>
              <h3>
                {index + 1}か月目：{item.title}
              </h3>
              <p>
                <strong>目指す状態</strong>
                <br />
                {item.outcome}
              </p>
              <p>
                <strong>目安になること</strong>
              </p>
              <ul>
                {item.checkpoints.map((checkpoint) => (
                  <li key={checkpoint}>{checkpoint}</li>
                ))}
              </ul>
              <p>使う時間の目安：週{item.weeklyHours}時間くらい</p>
            </article>
          ))}
          <p>この地図は、収入や成果を約束するものではありません。</p>
          {error && <p role="alert">{error}</p>}
          <button
            disabled={busy}
            onClick={() => {
              setConfirmed(false);
              setStartOperationId(crypto.randomUUID());
              setScreen('confirmStart');
            }}
          >
            この計画で始める
          </button>{' '}
          <button disabled={busy} onClick={() => void createRoadmap(crypto.randomUUID())}>
            作り直す
          </button>
        </section>
      )}
      {screen === 'roadmapRevision' && state.selection && state.roadmap && state.progress && (
        <section>
          <h2>地図を見直します</h2>
          <p>
            終わった月はそのままにして、{Number(state.progress.period.slice(-1))}
            か月目から先を作り直します。
          </p>
          {!state.revisionProposal &&
            (busy ? (
              <p>地図を見直しています。少しお待ちください。</p>
            ) : (
              <button
                disabled={busy || !revisionCheckinEventId}
                onClick={() => void createRoadmapRevision()}
              >
                見直した地図を作る
              </button>
            ))}
          {state.revisionProposal && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: 16,
                }}
              >
                <section aria-label="いまの地図">
                  <h3>いまの地図</h3>
                  {state.roadmap.roadmap.milestones.map((item, index) => (
                    <article key={item.period}>
                      <h4>
                        {index + 1}か月目：{item.title}
                      </h4>
                      {index < Number(state.progress!.period.slice(-1)) - 1 && <p>終わった月</p>}
                      <p>{item.outcome}</p>
                    </article>
                  ))}
                </section>
                <section aria-label="見直した地図">
                  <h3>見直した地図</h3>
                  {state.revisionProposal.roadmap.milestones.map((item, index) => (
                    <article key={item.period}>
                      <h4>
                        {index + 1}か月目：{item.title}
                      </h4>
                      {index < Number(state.progress!.period.slice(-1)) - 1 && <p>終わった月</p>}
                      <p>{item.outcome}</p>
                      <ul>
                        {item.checkpoints.map((checkpoint) => (
                          <li key={checkpoint}>{checkpoint}</li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </section>
              </div>
              <p>{state.revisionProposal.roadmap.reason}</p>
            </>
          )}
          <p>この地図は、収入や成果を約束するものではありません。</p>
          {error && <p role="alert">{error}</p>}
          {state.revisionProposal && (
            <>
              <button disabled={busy} onClick={() => void confirmRoadmapRevision()}>
                この地図で進める
              </button>{' '}
              <button
                disabled={busy}
                onClick={() => {
                  const operationId = crypto.randomUUID();
                  setState((currentState) => ({ ...currentState, revisionProposal: null }));
                  void createRoadmapRevision(operationId);
                }}
              >
                作り直す
              </button>{' '}
              <button
                disabled={busy}
                onClick={() => {
                  setState((currentState) => ({ ...currentState, revisionProposal: null }));
                  setRevisionRoadmapOperationId('');
                  setRevisionConfirmOperationId('');
                  setRevisionCheckinEventId('');
                  setScreen('started');
                }}
              >
                今の地図のままにする
              </button>
            </>
          )}
        </section>
      )}
      {screen === 'confirmStart' && state.selection && state.roadmap && (
        <section role="dialog" aria-modal="true">
          <h2>この計画で始めますか？</h2>
          <p>1か月目の目標に向けて、最初の課題を用意します。地図はあとから見直せます。</p>
          {state.activeSideHustle &&
            state.activeSideHustle.title !== state.selection.candidate.name && (
              <p>
                いま進めている「{state.activeSideHustle.title}
                」は一時停止になります。記録は残ります。
              </p>
            )}
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            内容を確認しました
          </label>
          {error && <p role="alert">{error}</p>}
          <p>
            <button disabled={busy || !confirmed} onClick={() => void startSideHustle()}>
              始める
            </button>{' '}
            <button disabled={busy} onClick={() => setScreen('roadmap')}>
              戻る
            </button>
          </p>
        </section>
      )}
      {screen === 'started' && state.selection && (
        <section>
          <h2>進めている副業：{state.selection.candidate.name}</h2>
          {state.roadmap && (
            <article>
              <h3>「{state.selection.candidate.name}」の90日の地図</h3>
              <p>1か月ごとの目安です。進み具合に合わせて見直せます。</p>
              {state.roadmap.roadmap.milestones.map((item, index) => (
                <section key={item.period}>
                  <h4>
                    {index + 1}か月目：{item.title}
                  </h4>
                  <p>{item.outcome}</p>
                </section>
              ))}
              <p>この地図は、収入や成果を約束するものではありません。</p>
            </article>
          )}
          {state.progress && state.progress.period === 'COMPLETED' ? (
            <p>90日の地図を最後まで進めました</p>
          ) : (
            state.progress && (
              <>
                <p>
                  いまは{Number(state.progress.period.slice(-1))}か月目「
                  {
                    state.progress.roadmap.milestones[Number(state.progress.period.slice(-1)) - 1]
                      ?.title
                  }
                  」です
                </p>
                {state.progress.eligibility.suggested && (
                  <p>ここまでの進み具合を振り返ってみませんか？</p>
                )}
                <button
                  onClick={() => {
                    setCheckinOperationId('');
                    setScreen('checkin');
                  }}
                >
                  振り返る
                </button>
              </>
            )
          )}
          <p>
            <a
              href={`/s/${encodeURIComponent(route.serviceSlug)}/programs/${encodeURIComponent(route.programEnrollmentId)}/learning-request?topicId=${encodeURIComponent(state.started?.topicId ?? '')}`}
            >
              学習画面へ進む
            </a>
          </p>
          <button onClick={() => setScreen('proposal')}>別の副業を選び直す</button>
        </section>
      )}
      {screen === 'checkin' &&
        state.progress &&
        state.started &&
        state.progress.period !== 'COMPLETED' && (
          <section>
            <h2>{Number(state.progress.period.slice(-1))}か月目の振り返り</h2>
            <p>
              {Number(state.progress.period.slice(-1))}
              か月目の目安を、1つずつ確かめましょう。できていなくても大丈夫です。次にどうするかを一緒に決めます。
            </p>
            {state.progress.roadmap.milestones[
              Number(state.progress.period.slice(-1)) - 1
            ]?.checkpoints.map((checkpoint, index) => (
              <fieldset key={`${index}-${checkpoint}`}>
                <legend>{checkpoint}</legend>
                {[
                  ['DONE', 'できた'],
                  ['PARTLY', '一部できた'],
                  ['NOT_YET', 'まだ'],
                ].map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name={`checkpoint-${index}`}
                      checked={checkpointResults[index] === value}
                      onChange={() =>
                        setCheckpointResults((current) =>
                          current.map((item, i) => (i === index ? value! : item)),
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
            ))}
            <label>
              ここまで進めてみて、負担はどうでしたか？
              <select value={feeling} onChange={(event) => setFeeling(event.target.value)}>
                <option value="EASY">余裕があった</option>
                <option value="OK">ちょうどよかった</option>
                <option value="HARD">大変だった</option>
              </select>
            </label>
            <label>
              気づいたこと・困っていること（任意・200文字まで）
              <textarea
                maxLength={200}
                value={checkinNote}
                onChange={(event) => setCheckinNote(event.target.value)}
              />
            </label>
            <label>
              次にどうしますか？
              <CheckinDecisionSelect
                value={decision}
                month3={state.progress.period === 'MONTH_3'}
                canAdvance={state.progress.eligibility.canAdvance}
                onChange={setDecision}
              />
            </label>
            {!state.progress.eligibility.canAdvance && decision === 'ADVANCE' && (
              <p>
                {Number(state.progress.period.slice(-1))}
                か月目で確認できた実践がまだないため、次の段階へは進めません。まずは今の課題を進めてみましょう。
              </p>
            )}
            <CheckinDecisionSubmitButton
              busy={busy}
              decision={decision}
              canAdvance={state.progress.eligibility.canAdvance}
              onClick={() => {
                if (decision === 'ADVANCE') {
                  setCheckinOperationId(crypto.randomUUID());
                  setScreen('confirmAdvance');
                } else void submitCheckin(decision);
              }}
            />
          </section>
        )}
      {screen === 'confirmAdvance' && state.progress && (
        <section>
          <h2>
            {state.progress.period === 'MONTH_3'
              ? '90日の地図を終えますか？'
              : `${Number(state.progress.period.slice(-1)) + 1}か月目へ進みますか？`}
          </h2>
          <p>
            {state.progress.period === 'MONTH_3'
              ? '90日の地図を最後まで進めたことを記録します。学習と相談は、このまま続けられます。'
              : `次の課題から、${Number(state.progress.period.slice(-1)) + 1}か月目「${state.progress.roadmap.milestones[Number(state.progress.period.slice(-1))]?.title}」に向けた内容になります。いま進めている課題は、そのまま続けられます。`}
          </p>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            内容を確認しました
          </label>
          <button disabled={busy || !confirmed} onClick={() => void submitCheckin('ADVANCE')}>
            進む
          </button>{' '}
          <button disabled={busy} onClick={() => setScreen('checkin')}>
            戻る
          </button>
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
