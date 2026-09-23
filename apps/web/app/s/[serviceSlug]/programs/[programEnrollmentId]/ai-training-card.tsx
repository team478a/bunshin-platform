'use client';

import type {
  TrainingChallengeKey,
  TrainingGoalKey,
  TrainingTopicKey,
  TrainingUseCaseKey,
} from '@bunshin/capability-training';
import { useRef, useState, type FormEvent } from 'react';
import { AiTrainingEvaluationCard } from './ai-training-evaluation-card';
import { AiTrainingMissionCard } from './ai-training-mission-card';
import { AiTrainingSetupCard } from './ai-training-setup-card';
import type {
  TrainingAiLevel,
  TrainingEvaluation as Evaluation,
  TrainingInteractionType,
  TrainingParticipantState,
  TrainingRole,
} from './ai-training-types';

export type { TrainingParticipantState } from './ai-training-types';

export function AiTrainingCard({
  serviceSlug,
  initialState,
}: {
  serviceSlug: string;
  initialState: TrainingParticipantState;
}) {
  const [state, setState] = useState(initialState);
  const [role, setRole] = useState<TrainingRole>(initialState.profile?.role ?? 'OTHER');
  const [aiLevel, setAiLevel] = useState<TrainingAiLevel>(
    initialState.profile?.aiLevel ?? 'BEGINNER',
  );
  const [aiUseCases, setAiUseCases] = useState<TrainingUseCaseKey[]>(
    initialState.profile?.aiUseCases ?? ['NOT_YET'],
  );
  const [workChallenges, setWorkChallenges] = useState<TrainingChallengeKey[]>(
    initialState.profile?.workChallenges ?? [],
  );
  const [preferredTopics, setPreferredTopics] = useState<TrainingTopicKey[]>(
    initialState.profile?.preferredTopics ?? [],
  );
  const [dailyMinutes, setDailyMinutes] = useState<5 | 10 | 15>(
    initialState.profile?.dailyMinutes ?? 10,
  );
  const [learningGoalKey, setLearningGoalKey] = useState<TrainingGoalKey>(
    initialState.profile?.learningGoalKey ?? 'USE_AI_IN_DAILY_WORK',
  );
  const [setupStep, setSetupStep] = useState(1);
  const [answer, setAnswer] = useState('');
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [hintVisible, setHintVisible] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [postponed, setPostponed] = useState(false);
  const [interactionSaving, setInteractionSaving] = useState<TrainingInteractionType | null>(null);
  const [saving, setSaving] = useState(false);
  const [toolkitSaving, setToolkitSaving] = useState(false);
  const [toolkitSaved, setToolkitSaved] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const profileKey = useRef<string | null>(null);
  const answerKey = useRef<string | null>(null);
  const evaluationKey = useRef<string | null>(null);
  const interactionKeys = useRef<Partial<Record<TrainingInteractionType, string>>>({});
  const toolkitKey = useRef<string | null>(null);
  const action = state.action;

  const endpoint = `/api/services/${encodeURIComponent(serviceSlug)}/ai-training/enrollments/${state.enrollmentId}`;

  async function readPayload(response: Response) {
    const payload = (await response.json()) as {
      data?: unknown;
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(payload.error?.message ?? '処理を完了できませんでした。');
    return payload.data;
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    profileKey.current ??= crypto.randomUUID();
    try {
      if (!workChallenges.length || !preferredTopics.length) {
        throw new Error('困っていることと、学びたいテーマを1つ以上選んでください。');
      }
      const data = (await readPayload(
        await fetch(`${endpoint}/profile`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            role,
            aiLevel,
            aiUseCases,
            workChallenges,
            preferredTopics,
            dailyMinutes,
            learningGoalKey,
            idempotencyKey: profileKey.current,
          }),
        }),
      )) as { state: TrainingParticipantState };
      setState(data.state);
      profileKey.current = null;
      setMessage('設定を保存し、あなたに合う最初の課題を用意しました。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '設定を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  async function evaluateAnswer(answerId: string) {
    evaluationKey.current ??= crypto.randomUUID();
    const data = (await readPayload(
      await fetch(`${endpoint}/answers/${answerId}/evaluate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: evaluationKey.current }),
      }),
    )) as { evaluation: Evaluation };
    setEvaluation(data.evaluation);
    evaluationKey.current = null;
    setMessage('回答を確認しました。結果を見て、次へ進んでください。');
  }

  async function submitAnswer(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!action || action.mode !== 'WORK') return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      let answerId = action.submission?.answerId;
      if (!answerId) {
        if (!answer.trim()) throw new Error('回答を入力してください。');
        answerKey.current ??= crypto.randomUUID();
        const data = (await readPayload(
          await fetch(`${endpoint}/answers`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              missionAssignmentId: action.id,
              answer: answer.trim(),
              idempotencyKey: answerKey.current,
            }),
          }),
        )) as { answer: { id: string } };
        answerId = data.answer.id;
        answerKey.current = null;
        setState({
          ...state,
          action: {
            ...action,
            submission: { answerId, evaluationStatus: 'PENDING' },
          },
        });
      }
      await evaluateAnswer(answerId);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : '回答は保存されましたが、AI評価を完了できませんでした。',
      );
    } finally {
      setSaving(false);
    }
  }

  async function recordInteraction(interactionType: TrainingInteractionType) {
    if (!action || action.mode !== 'WORK') return;
    setInteractionSaving(interactionType);
    setError('');
    interactionKeys.current[interactionType] ??= crypto.randomUUID();
    try {
      await readPayload(
        await fetch(`${endpoint}/actions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            missionAssignmentId: action.id,
            interactionType,
            idempotencyKey: interactionKeys.current[interactionType],
          }),
        }),
      );
    } catch (cause) {
      delete interactionKeys.current[interactionType];
      setError(cause instanceof Error ? cause.message : '操作を記録できませんでした。');
    } finally {
      setInteractionSaving(null);
    }
  }

  async function saveToToolkit() {
    const answerId = state.action?.submission?.answerId;
    if (!answerId || evaluation?.result !== 'PASS') return;
    setToolkitSaving(true);
    setError('');
    toolkitKey.current ??= crypto.randomUUID();
    try {
      await readPayload(
        await fetch(`${endpoint}/toolkit`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ answerId, idempotencyKey: toolkitKey.current }),
        }),
      );
      toolkitKey.current = null;
      setToolkitSaved(true);
      setMessage('この回答をMy AI Toolkitへ保存しました。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '成果物を保存できませんでした。');
    } finally {
      setToolkitSaving(false);
    }
  }

  async function loadNextMission() {
    setSaving(true);
    setError('');
    try {
      const data = (await readPayload(
        await fetch(`${endpoint}/current`),
      )) as TrainingParticipantState;
      setState(data);
      setAnswer('');
      setEvaluation(null);
      setHintVisible(false);
      setHelpVisible(false);
      setPostponed(false);
      interactionKeys.current = {};
      setMessage('次の課題を表示しました。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '次の課題を取得できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  if (state.enrollmentStatus !== 'ACTIVE') {
    return (
      <section className="service-entry__card training-card training-card--center">
        <p className="eyebrow">研修完了</p>
        <h2>お疲れさまでした</h2>
        <p>この研修期間は終了しました。学んだ内容を、実際の仕事で少しずつ使ってみましょう。</p>
      </section>
    );
  }

  if (!state.profile) {
    return (
      <AiTrainingSetupCard
        setupStep={setupStep}
        setSetupStep={setSetupStep}
        role={role}
        setRole={setRole}
        aiLevel={aiLevel}
        setAiLevel={setAiLevel}
        aiUseCases={aiUseCases}
        setAiUseCases={setAiUseCases}
        workChallenges={workChallenges}
        setWorkChallenges={setWorkChallenges}
        preferredTopics={preferredTopics}
        setPreferredTopics={setPreferredTopics}
        dailyMinutes={dailyMinutes}
        setDailyMinutes={setDailyMinutes}
        learningGoalKey={learningGoalKey}
        setLearningGoalKey={setLearningGoalKey}
        saving={saving}
        error={error}
        setError={setError}
        saveProfile={saveProfile}
      />
    );
  }

  if (!action) {
    return (
      <section className="service-entry__card training-card training-card--center">
        <h2>次の課題を準備しています</h2>
        <p>少し待ってから、もう一度この画面を開いてください。</p>
      </section>
    );
  }

  if (evaluation) {
    return (
      <AiTrainingEvaluationCard
        serviceSlug={serviceSlug}
        state={state}
        evaluation={evaluation}
        message={message}
        error={error}
        toolkitSaving={toolkitSaving}
        toolkitSaved={toolkitSaved}
        saving={saving}
        saveToToolkit={saveToToolkit}
        loadNextMission={loadNextMission}
      />
    );
  }

  return (
    <AiTrainingMissionCard
      state={state}
      action={action}
      answer={answer}
      setAnswer={setAnswer}
      hintVisible={hintVisible}
      setHintVisible={setHintVisible}
      helpVisible={helpVisible}
      setHelpVisible={setHelpVisible}
      postponed={postponed}
      setPostponed={setPostponed}
      interactionSaving={interactionSaving}
      saving={saving}
      message={message}
      error={error}
      recordInteraction={recordInteraction}
      submitAnswer={submitAnswer}
    />
  );
}
