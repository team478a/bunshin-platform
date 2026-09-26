'use client';

import type {
  SocialActivityBarrierQuestion,
  SocialActivitySupportAction,
  SocialActivitySupportProgress,
} from '@bunshin/capability-social';
import { useRef, useState } from 'react';

type AnswerResponse = {
  data?: { supportProgress: SocialActivitySupportProgress | null };
  error?: { message?: string };
};
type SupportResponse = {
  data?: SocialActivitySupportProgress;
  error?: { message?: string };
};

export function ActivityBarrierCard({
  endpoint,
  initialQuestion,
  initialSupport,
}: {
  endpoint: string;
  initialQuestion: SocialActivityBarrierQuestion | null;
  initialSupport: SocialActivitySupportProgress | null;
}) {
  const [question, setQuestion] = useState(initialQuestion);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null | undefined>(undefined);
  const [support, setSupport] = useState(initialSupport);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  async function submit() {
    if (!question || selectedCaseId === undefined || pending) return;
    setPending(true);
    setMessage(null);
    try {
      idempotencyKey.current ??= crypto.randomUUID();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          caseIds: question.caseIds,
          selectedCaseId,
          idempotencyKey: idempotencyKey.current,
        }),
      });
      const payload = (await response.json()) as AnswerResponse;
      if (!response.ok) throw new Error(payload.error?.message ?? '回答を保存できませんでした。');
      setSupport(payload.data?.supportProgress ?? null);
      setQuestion(null);
      setMessage(
        payload.data?.supportProgress
          ? 'ありがとうございます。今の状況に合わせた進め方を用意しました。'
          : 'ありがとうございます。回答を保存しました。',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '回答を保存できませんでした。');
    } finally {
      setPending(false);
    }
  }

  async function transitionSupport(action: SocialActivitySupportAction) {
    if (!support || pending) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ supportId: support.id, action }),
      });
      const payload = (await response.json()) as SupportResponse;
      if (!response.ok) throw new Error(payload.error?.message ?? '状態を保存できませんでした。');
      if (payload.data?.status === 'ACCEPTED') {
        setSupport(payload.data);
        setMessage('始めたことを記録しました。終わったら「できました」を押してください。');
      } else {
        setSupport(null);
        setMessage(action === 'COMPLETE' ? 'できたことを記録しました。' : '今回は見送りました。');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '状態を保存できませんでした。');
    } finally {
      setPending(false);
    }
  }

  if (!question) {
    return (
      <section className="activity-barrier-card" aria-live="polite">
        {message ? <p className="success-message">{message}</p> : null}
        {support ? (
          <div className="activity-barrier-support">
            <p className="eyebrow">今日のサポート</p>
            <h2>{support.support.title}</h2>
            <p>{support.support.reason}</p>
            <ol>
              {support.support.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div className="activity-barrier-support__actions">
              {support.status === 'OFFERED' ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void transitionSupport('ACCEPT')}
                >
                  {pending ? '保存しています…' : 'このサポートを始める'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void transitionSupport('COMPLETE')}
                >
                  {pending ? '保存しています…' : 'できました'}
                </button>
              )}
              <button
                className="button button--secondary"
                type="button"
                disabled={pending}
                onClick={() => void transitionSupport('SKIP')}
              >
                今回は見送る
              </button>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="activity-barrier-card" aria-labelledby="activity-barrier-title">
      <p className="eyebrow">続けやすくするための確認</p>
      <h2 id="activity-barrier-title">{question.title}</h2>
      <p>{question.description}</p>
      <fieldset disabled={pending}>
        <legend className="sr-only">当てはまる項目を一つ選択</legend>
        {question.options.map((option) => (
          <label key={option.caseId}>
            <input
              type="radio"
              name="activity-barrier"
              value={option.caseId}
              checked={selectedCaseId === option.caseId}
              onChange={() => setSelectedCaseId(option.caseId)}
            />
            <span>{option.label}</span>
          </label>
        ))}
        <label>
          <input
            type="radio"
            name="activity-barrier"
            value="none"
            checked={selectedCaseId === null}
            onChange={() => setSelectedCaseId(null)}
          />
          <span>{question.noneLabel}</span>
        </label>
      </fieldset>
      <button
        type="button"
        disabled={selectedCaseId === undefined || pending}
        onClick={() => void submit()}
      >
        {pending ? '保存しています…' : '回答してサポートを見る'}
      </button>
      {message ? (
        <p className="notice" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
