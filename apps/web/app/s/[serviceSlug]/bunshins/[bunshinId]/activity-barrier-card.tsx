'use client';

import type {
  SocialActivityBarrierQuestion,
  SocialActivitySupport,
} from '@bunshin/capability-social';
import { useRef, useState } from 'react';

type AnswerResponse = {
  data?: { support: SocialActivitySupport | null };
  error?: { message?: string };
};

export function ActivityBarrierCard({
  endpoint,
  initialQuestion,
}: {
  endpoint: string;
  initialQuestion: SocialActivityBarrierQuestion;
}) {
  const [question, setQuestion] = useState(initialQuestion);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null | undefined>(undefined);
  const [support, setSupport] = useState<SocialActivitySupport | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  async function submit() {
    if (selectedCaseId === undefined || pending) return;
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
      setSupport(payload.data?.support ?? null);
      setQuestion({ ...question, options: [] });
      setMessage(
        payload.data?.support
          ? 'ありがとうございます。今の状況に合わせた進め方を用意しました。'
          : 'ありがとうございます。回答を保存しました。',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '回答を保存できませんでした。');
    } finally {
      setPending(false);
    }
  }

  if (question.options.length === 0) {
    return (
      <section className="activity-barrier-card" aria-live="polite">
        {message ? <p className="success-message">{message}</p> : null}
        {support ? (
          <div className="activity-barrier-support">
            <p className="eyebrow">今日のサポート</p>
            <h2>{support.title}</h2>
            <p>{support.reason}</p>
            <ol>
              {support.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
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
