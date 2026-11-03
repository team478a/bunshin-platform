'use client';

import type {
  SocialActivityBarrierQuestion,
  SocialActivitySupportAction,
  SocialActivitySupportKey,
  SocialActivitySupportProgress,
} from '@bunshin/capability-social';
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import './activity-support.css';

type AnswerResponse = {
  data?: { supportProgress: SocialActivitySupportProgress | null };
  error?: { message?: string };
};
type SupportResponse = {
  data?: SocialActivitySupportProgress;
  error?: { message?: string };
};

const photoFirstActionLabels: Partial<Record<SocialActivitySupportKey, string>> = {
  CONTENT_REVIEW: '写真から投稿内容を考え直す',
  MEDIA_PREPARATION: '写真を1枚残す',
  LOW_RISK_PUBLISHING: '写真の使い方と投稿案を確認する',
};

export function ActivityBarrierCard({
  endpoint,
  initialQuestion,
  initialSupport,
  photoFirstHref,
  postingHref,
  metricsHref,
  creditsHref,
  referralHref,
}: {
  endpoint: string;
  initialQuestion: SocialActivityBarrierQuestion | null;
  initialSupport: SocialActivitySupportProgress | null;
  photoFirstHref?: string;
  postingHref?: string;
  metricsHref?: string;
  creditsHref?: string;
  referralHref?: string;
}) {
  const [question, setQuestion] = useState(initialSupport ? null : initialQuestion);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null | undefined>(undefined);
  const [support, setSupport] = useState(initialSupport);
  const [pending, setPending] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const supportElement = useRef<HTMLDivElement | null>(null);
  const questionElement = useRef<HTMLElement | null>(null);
  const questionAttempts = useRef(new Set<string>());
  const exposureAttempts = useRef(new Set<string>());
  const recordExposure = useCallback(
    async (id: string, kind: 'DISPLAY' | 'DETAILS') => {
      const key = `${endpoint}:${id}:${kind}`;
      if (exposureAttempts.current.has(key)) return;
      exposureAttempts.current.add(key);
      try {
        const response = await fetch(`${endpoint}/exposure`, {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ supportId: id, kind }),
        });
        if (!response.ok) throw new Error('exposure not recorded');
        const result: unknown = await response.json();
        if (
          !result ||
          typeof result !== 'object' ||
          !('data' in result) ||
          !result.data ||
          typeof result.data !== 'object' ||
          !('recorded' in result.data) ||
          result.data.recorded !== true
        )
          throw new Error('invalid exposure receipt');
      } catch {
        console.warn('サポートの閲覧記録を保存できませんでした。');
      }
    },
    [endpoint],
  );
  const questionIds = question?.caseIds.join(',') ?? '';
  const questionEvidenceKey = question?.evidenceKey;
  useEffect(() => {
    const element = questionElement.current;
    if (!element || !questionIds || support) return;
    const key = `${endpoint}:${questionIds}:${questionEvidenceKey ?? 'legacy'}`;
    if (questionAttempts.current.has(key)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.1))
          return;
        questionAttempts.current.add(key);
        observer.disconnect();
        void fetch(`${endpoint}/question-exposure`, {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            caseIds: questionIds.split(','),
            ...(questionEvidenceKey ? { evidenceKey: questionEvidenceKey } : {}),
          }),
        })
          .then(async (response) => {
            if (!response.ok) throw new Error('question exposure not recorded');
            const value: unknown = await response.json();
            if (
              !value ||
              typeof value !== 'object' ||
              !('data' in value) ||
              !value.data ||
              typeof value.data !== 'object' ||
              !('recorded' in value.data) ||
              value.data.recorded !== true
            )
              throw new Error('invalid question exposure receipt');
          })
          .catch(() => {
            console.warn('質問の表示記録を保存できませんでした。');
          });
      },
      { threshold: 0.1 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [endpoint, questionIds, questionEvidenceKey, support]);
  const supportId = support?.id;
  useEffect(() => {
    const element = supportElement.current;
    if (!supportId || !element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.1)) {
          void recordExposure(supportId, 'DISPLAY');
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [recordExposure, supportId]);
  const photoFirstActionLabel =
    support && photoFirstHref ? photoFirstActionLabels[support.support.key] : undefined;
  const measurement =
    support &&
    ['PERFORMANCE_REVIEW', 'MEASUREMENT_SETUP', 'AWARENESS_MEASUREMENT_SETUP'].includes(
      support.support.key,
    );
  const posting =
    support &&
    [
      'STEP_BY_STEP_GUIDE',
      'FIVE_MINUTE_ACTION',
      'CONTENT_REVIEW',
      'MEDIA_PREPARATION',
      'LOW_RISK_PUBLISHING',
    ].includes(support.support.key);
  const usageHref =
    support?.support.key === 'IMAGE_CREDIT_REVIEW'
      ? creditsHref
      : support?.support.key === 'REFERRAL_BENEFIT_REVIEW'
        ? referralHref
        : support?.support.key === 'MULTI_PLATFORM_PREPARATION'
          ? postingHref
          : undefined;
  const nextHref =
    usageHref ??
    (photoFirstActionLabel
      ? photoFirstHref
      : measurement
        ? metricsHref
        : posting
          ? postingHref
          : undefined);
  const nextLabel = usageHref
    ? support?.support.key === 'IMAGE_CREDIT_REVIEW'
      ? '画像作成回数を確認する'
      : support?.support.key === 'REFERRAL_BENEFIT_REVIEW'
        ? '紹介状況を確認する'
        : '投稿の準備を進める'
    : (photoFirstActionLabel ?? (measurement ? '投稿結果を手動で記録する' : '投稿の準備を進める'));

  function openPhotoFirstSection(event: MouseEvent<HTMLAnchorElement>) {
    if (!event.currentTarget.hash) return;
    const target = document.querySelector(event.currentTarget.hash);
    const drawer = target?.closest('details');
    if (drawer instanceof HTMLDetailsElement) drawer.open = true;
  }

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
          ...(question.evidenceKey ? { evidenceKey: question.evidenceKey } : {}),
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
        body: JSON.stringify({
          supportId: support.id,
          action,
          ...(action === 'SKIP' && skipReason.trim() ? { reason: skipReason.trim() } : {}),
        }),
      });
      const payload = (await response.json()) as SupportResponse;
      if (!response.ok) throw new Error(payload.error?.message ?? '状態を保存できませんでした。');
      const expectedStatus =
        action === 'ACCEPT' ? 'ACCEPTED' : action === 'COMPLETE' ? 'COMPLETED' : 'SKIPPED';
      if (!payload.data || payload.data.id !== support.id || payload.data.status !== expectedStatus)
        throw new Error('保存した状態を確認できません。画面を更新してください。');
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
          <div className="activity-barrier-support" ref={supportElement}>
            <p className="eyebrow">今日のサポート</p>
            <h2>{support.support.title}</h2>
            <details
              onToggle={(event) => {
                if (event.currentTarget.open) void recordExposure(support.id, 'DETAILS');
              }}
            >
              <summary>サポートの詳しい進め方</summary>
              <p>{support.support.reason}</p>
              <ol>
                {support.support.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </details>
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
                <>
                  {nextHref ? (
                    <a
                      className="button button--primary button--full"
                      href={nextHref}
                      onClick={openPhotoFirstSection}
                    >
                      {nextLabel}
                    </a>
                  ) : null}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void transitionSupport('COMPLETE')}
                  >
                    {pending ? '保存しています…' : 'できました'}
                  </button>
                </>
              )}
              <label className="activity-barrier-support__reason">
                見送る理由（任意）
                <input
                  value={skipReason}
                  maxLength={500}
                  disabled={pending}
                  onChange={(event) => setSkipReason(event.target.value)}
                />
              </label>
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
    <section
      ref={questionElement}
      className="activity-barrier-card"
      aria-labelledby="activity-barrier-title"
    >
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
