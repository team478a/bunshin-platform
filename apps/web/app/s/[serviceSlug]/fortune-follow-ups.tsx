'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

const suggestions = ['もう少し詳しく知りたい', '別の見方はある？', '具体的にどうすればいい？'];

type Conversation = {
  remaining: number;
  creditOffer?: { cost: number; name: string; available: number; remaining: number };
  turns: {
    turn: number;
    question: string;
    status: 'PENDING' | 'READY' | 'FAILED';
    answer: string | null;
    actionStep: string | null;
    creditCost?: number;
  }[];
};

async function loadConversation(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error('follow-up unavailable');
  return ((await response.json()) as { data: Conversation | null }).data;
}

export function FortuneFollowUps({
  serviceSlug,
  readingId,
}: {
  serviceSlug: string;
  readingId: string;
}) {
  const url = `/api/services/${serviceSlug}/fortune/readings/${readingId}/follow-ups`;
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [question, setQuestion] = useState('');
  const [draft, setDraft] = useState<{
    requestId: string;
    question: string;
    expectedCreditCost?: number;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void loadConversation(url, { signal: controller.signal }).then(
      (data) => {
        if (!controller.signal.aborted) setConversation(data);
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [url]);

  const creditOffer = conversation?.creditOffer;
  const expectedCreditCost = creditOffer?.cost;
  const canExchange =
    creditOffer &&
    creditOffer.remaining > 0 &&
    creditOffer.available >= creditOffer.cost &&
    !conversation?.turns.some((turn) => turn.status === 'PENDING');
  const canAsk = (conversation?.remaining ?? 0) > 0 || canExchange;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text || busy || !canAsk) return;
    const next =
      draft?.question === text && draft.expectedCreditCost === expectedCreditCost
        ? draft
        : {
            requestId: crypto.randomUUID(),
            question: text,
            ...(expectedCreditCost === undefined ? {} : { expectedCreditCost }),
          };
    setDraft(next);
    setBusy(true);
    setError('');
    try {
      setConversation(
        await loadConversation(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(next),
        }),
      );
      setDraft(undefined);
      setQuestion('');
    } catch {
      setError('質問を送信できませんでした。もう一度お試しください。');
      await loadConversation(url).then(setConversation, () => undefined);
    } finally {
      setBusy(false);
    }
  }

  if (
    !conversation ||
    (conversation.remaining === 0 && conversation.turns.length === 0 && !creditOffer)
  )
    return null;
  return (
    <section className="settings-card">
      <h2>この鑑定についてAIに聞く</h2>
      {conversation.turns.map((turn) => (
        <div key={turn.turn} className="fortune-action-step">
          <p>
            <strong>{turn.question}</strong>
          </p>
          {turn.status === 'PENDING' && (
            <p role="status">AIが回答を作成中です。しばらくしてページを更新してください。</p>
          )}
          {turn.status === 'FAILED' && (
            <p>
              AIの回答を表示できませんでした。
              {turn.creditCost
                ? 'クレジットは消費されていません。'
                : '元の鑑定は引き続きご覧いただけます。'}
            </p>
          )}
          {turn.status === 'READY' && (
            <>
              <p className="fortune-reading-body">{turn.answer}</p>
              {turn.actionStep && <p>{turn.actionStep}</p>}
            </>
          )}
        </div>
      ))}
      {(conversation.remaining > 0 || !creditOffer) && (
        <p>あと{conversation.remaining}回質問できます。質問と回答はこの鑑定に保存されます。</p>
      )}
      {creditOffer && (
        <>
          <p>
            追加質問1回に{creditOffer.name}を{creditOffer.cost}使います。 利用可能残高は
            {creditOffer.available}、この鑑定であと{creditOffer.remaining}回交換できます。
          </p>
          <p>回答が保存された時点で消費します。質問と回答はこの鑑定に保存されます。</p>
          <p>
            <Link href={`/s/${serviceSlug}/credits` as Route}>残高・履歴と利用条件を見る</Link>
          </p>
        </>
      )}
      {canAsk && (
        <form className="form-stack" onSubmit={(event) => void submit(event)}>
          <div className="button-row">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="button button--secondary"
                disabled={busy}
                onClick={() => setQuestion(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
          <label className="form-field">
            <span>AIへの質問</span>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={300}
              rows={2}
              required
              disabled={busy}
            />
          </label>
          <button
            type="submit"
            className="button button--primary"
            disabled={busy || !question.trim()}
          >
            {busy
              ? 'AIが回答中です…'
              : creditOffer
                ? `${creditOffer.cost}クレジットで質問する`
                : '質問する'}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
