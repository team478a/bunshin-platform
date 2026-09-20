'use client';

import { useRef, useState, type FormEvent } from 'react';

type TrainingRole = 'SALES' | 'OFFICE' | 'MANAGER' | 'OTHER';
type TrainingAiLevel = 'BEGINNER' | 'INTERMEDIATE';

export type TrainingParticipantState = {
  enrollmentId: string;
  programName: string;
  enrollmentStatus: 'ACTIVE' | 'COMPLETED' | 'EXPIRED';
  startsAt: string;
  endsAt: string | null;
  profile: { role: TrainingRole; aiLevel: TrainingAiLevel } | null;
  action: {
    id: string;
    sequence: number;
    actionKey: string;
    mode: 'WORK' | 'WAIT';
    status: 'PRESENTED' | 'STARTED';
    display: {
      title: string;
      reason: string;
      task: string;
      instructions: string[];
      estimatedMinutes: number | null;
    };
    reevaluateAt: string | null;
    submission: {
      answerId: string;
      evaluationStatus: 'PENDING' | 'READY' | 'FAILED';
    } | null;
  } | null;
};

type Evaluation = {
  result: 'PASS' | 'REVIEW';
  understanding: number;
  strengths: string[];
  weaknesses: string[];
  nextRecommendation: string;
};

const roleLabels: Record<TrainingRole, string> = {
  SALES: '営業・接客',
  OFFICE: '事務・バックオフィス',
  MANAGER: '管理職・リーダー',
  OTHER: 'その他',
};

const levelLabels: Record<TrainingAiLevel, string> = {
  BEGINNER: 'ほとんど使ったことがない',
  INTERMEDIATE: '何度か使ったことがある',
};

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
  const [answer, setAnswer] = useState('');
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const profileKey = useRef<string | null>(null);
  const answerKey = useRef<string | null>(null);
  const evaluationKey = useRef<string | null>(null);
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
      const data = (await readPayload(
        await fetch(`${endpoint}/profile`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ role, aiLevel, idempotencyKey: profileKey.current }),
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
      <section className="service-entry__card training-card" aria-labelledby="training-setup-title">
        <p className="eyebrow">最初に2つだけ教えてください</p>
        <h2 id="training-setup-title">あなたに合う研修を準備します</h2>
        <p>回答に合わせて、今日取り組む課題を変えます。</p>
        <form
          className="form-stack"
          onSubmit={(event) => {
            void saveProfile(event);
          }}
        >
          <fieldset className="training-choice-group">
            <legend>今の仕事に近いもの</legend>
            {(Object.keys(roleLabels) as TrainingRole[]).map((value) => (
              <label key={value} className="training-choice">
                <input
                  type="radio"
                  name="role"
                  value={value}
                  checked={role === value}
                  onChange={() => setRole(value)}
                />
                <span>{roleLabels[value]}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="training-choice-group">
            <legend>AI・ChatGPTの経験</legend>
            {(Object.keys(levelLabels) as TrainingAiLevel[]).map((value) => (
              <label key={value} className="training-choice">
                <input
                  type="radio"
                  name="aiLevel"
                  value={value}
                  checked={aiLevel === value}
                  onChange={() => setAiLevel(value)}
                />
                <span>{levelLabels[value]}</span>
              </label>
            ))}
          </fieldset>
          {error ? <p className="notice notice--error">{error}</p> : null}
          <button className="button button--primary button--full" disabled={saving}>
            {saving ? '準備しています…' : '今日の研修を始める'}
          </button>
        </form>
      </section>
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
      <section
        className="service-entry__card training-card"
        aria-labelledby="training-result-title"
      >
        <p className="eyebrow">回答の確認結果</p>
        <h2 id="training-result-title">
          {evaluation.result === 'PASS' ? 'できています' : 'もう一度、短く復習しましょう'}
        </h2>
        <div className="training-score" aria-label={`理解度 ${evaluation.understanding}点`}>
          <strong>{evaluation.understanding}</strong>
          <span>理解度 / 100</span>
        </div>
        {evaluation.strengths.length ? (
          <div className="training-feedback training-feedback--good">
            <h3>できているところ</h3>
            <ul>
              {evaluation.strengths.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {evaluation.weaknesses.length ? (
          <div className="training-feedback">
            <h3>次に意識するところ</h3>
            <ul>
              {evaluation.weaknesses.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="training-recommendation">{evaluation.nextRecommendation}</p>
        {message ? <p className="notice notice--success">{message}</p> : null}
        <button
          className="button button--primary button--full"
          type="button"
          onClick={() => {
            void loadNextMission();
          }}
          disabled={saving}
        >
          {saving ? '更新しています…' : '次の課題を見る'}
        </button>
      </section>
    );
  }

  return (
    <section className="service-entry__card training-card" aria-labelledby="training-action-title">
      <div className="resale-action-card__meta">
        <span>あなた向け課題</span>
        {action.display.estimatedMinutes !== null ? (
          <span>目安 {action.display.estimatedMinutes}分</span>
        ) : null}
      </div>
      <p className="eyebrow">今日やること</p>
      <h2 id="training-action-title">{action.display.title}</h2>
      <p className="training-reason">{action.display.reason}</p>
      <div className="training-task">
        <strong>課題</strong>
        <p>{action.display.task}</p>
      </div>
      {action.display.instructions.length ? (
        <ol className="resale-action-card__steps">
          {action.display.instructions.map((instruction) => (
            <li key={instruction}>{instruction}</li>
          ))}
        </ol>
      ) : null}
      {action.mode === 'WAIT' ? (
        <div className="notice resale-action-card__wait">
          <strong>今日は新しい課題はありません</strong>
          <p>
            {action.reevaluateAt
              ? `${new Intl.DateTimeFormat('ja-JP', {
                  month: 'numeric',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                }).format(new Date(action.reevaluateAt))}ごろに次の課題を確認します。`
              : '次の課題が用意されるまで、そのままお待ちください。'}
          </p>
        </div>
      ) : action.submission ? (
        <div className="training-pending">
          <p>回答は保存されています。AIによる確認を再開できます。</p>
          {error ? <p className="notice notice--error">{error}</p> : null}
          <button
            className="button button--primary button--full"
            type="button"
            onClick={() => {
              void submitAnswer();
            }}
            disabled={saving}
          >
            {saving ? '確認しています…' : '回答の確認を再開する'}
          </button>
        </div>
      ) : (
        <form
          className="form-stack"
          onSubmit={(event) => {
            void submitAnswer(event);
          }}
        >
          <label className="field">
            <span className="field__label">あなたの回答</span>
            <textarea
              className="field__control training-answer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              maxLength={10_000}
              rows={8}
              placeholder="ここに回答を書いてください"
              required
            />
          </label>
          {message ? <p className="notice notice--success">{message}</p> : null}
          {error ? <p className="notice notice--error">{error}</p> : null}
          <button className="button button--primary button--full" disabled={saving}>
            {saving ? '回答を確認しています…' : '回答を送って確認する'}
          </button>
          <p className="training-form-note">回答はAIが確認し、次に必要な課題を選ぶ参考にします。</p>
        </form>
      )}
    </section>
  );
}
