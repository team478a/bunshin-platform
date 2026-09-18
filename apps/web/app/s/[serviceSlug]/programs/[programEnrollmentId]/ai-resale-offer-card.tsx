'use client';

import { useEffect, useRef, useState } from 'react';

type OfferKind = 'STANDARD' | 'MONITOR';
export type OfferState = {
  freeEnrollmentId: string;
  classification: 'NOT_STARTED' | 'PARTIAL' | 'LISTED';
  status: 'STANDARD' | 'MONITOR' | 'DECLINED' | 'PENDING_CONFIRMATION' | 'ENROLLED' | 'UNAVAILABLE';
  offer: {
    offeringId: string;
    serviceProgramId: string;
    displayName: string;
    priceReference: string;
    terms: {
      offerKey: OfferKind;
      amountYen: number;
      currency: 'JPY';
      durationDays: 90;
      applicationUrl: string | null;
    };
  } | null;
  selectedOfferKind: OfferKind | null;
  paidEnrollmentId: string | null;
};

const message = {
  NOT_STARTED: {
    title: 'まだ始められなくても大丈夫です',
    description: '一人で迷わないよう、最初の小さなActionから90日間案内します。',
  },
  PARTIAL: {
    title: '途中からでも、次の一歩を一緒に決められます',
    description: '止まった場所から再開できる小さなActionを、毎回一つだけ提示します。',
  },
  LISTED: {
    title: '出品できた流れを、販売につながる形へ整えます',
    description: '次の90日間は、反応確認と改善を繰り返しながら販売まで伴走します。',
  },
} as const;

export function AiResaleOfferCard({
  serviceSlug,
  initialState,
}: {
  serviceSlug: string;
  initialState: OfferState;
}) {
  const [state, setState] = useState(initialState);
  const [declineReason, setDeclineReason] = useState<
    'PRICE_TOO_HIGH' | 'NOT_READY' | 'NOT_INTERESTED' | 'OTHER'
  >('PRICE_TOO_HIGH');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const shownKey = useRef<string | null>(null);
  const retry = useRef<{ signature: string; key: string } | null>(null);

  async function act(
    action:
      | { type: 'VIEW'; offerKind: OfferKind }
      | { type: 'DECLINE_STANDARD'; reason: typeof declineReason }
      | { type: 'SELECT'; offerKind: OfferKind },
    quiet = false,
  ) {
    const signature = JSON.stringify(action);
    const request =
      retry.current?.signature === signature
        ? retry.current
        : { signature, key: crypto.randomUUID() };
    retry.current = request;
    if (!quiet) {
      setSaving(true);
      setNotice('');
      setError('');
    }
    try {
      const response = await fetch(
        `/api/services/${encodeURIComponent(serviceSlug)}/program-enrollments/${state.freeEnrollmentId}/offer`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...action, idempotencyKey: request.key }),
        },
      );
      const payload = (await response.json()) as {
        data?: { state?: OfferState; redirectUrl?: string | null };
        error?: { message?: string };
      };
      if (!response.ok || !payload.data?.state) {
        throw new Error(payload.error?.message ?? '処理できませんでした。');
      }
      retry.current = null;
      setState(payload.data.state);
      if (action.type === 'SELECT') {
        setNotice(
          payload.data.redirectUrl
            ? '申込みページを開きます。'
            : '申込み希望を受け付けました。運営者から支払い方法をご案内します。',
        );
        if (payload.data.redirectUrl) window.location.assign(payload.data.redirectUrl);
      } else if (action.type === 'DECLINE_STANDARD') {
        setNotice(
          action.reason === 'PRICE_TOO_HIGH'
            ? 'ご回答ありがとうございます。モニタープランをご案内します。'
            : 'ご回答を記録しました。',
        );
      }
    } catch (cause) {
      if (!quiet) setError(cause instanceof Error ? cause.message : '処理できませんでした。');
    } finally {
      if (!quiet) setSaving(false);
    }
  }

  useEffect(() => {
    if (!state.offer || !['STANDARD', 'MONITOR'].includes(state.status)) return;
    const key = `${state.freeEnrollmentId}:${state.offer.offeringId}`;
    if (shownKey.current === key) return;
    shownKey.current = key;
    void act({ type: 'VIEW', offerKind: state.offer.terms.offerKey }, true);
  }, [state.freeEnrollmentId, state.offer, state.status]);

  if (state.status === 'ENROLLED' && state.paidEnrollmentId) {
    return (
      <section className="service-entry__card resale-offer-card resale-offer-card--complete">
        <p className="eyebrow">90日プログラム</p>
        <h2>参加登録が完了しています</h2>
        <p>次にやることを確認して、今日の一歩から始めましょう。</p>
        <a
          className="button button--primary button--full"
          href={`/s/${serviceSlug}/programs/${state.paidEnrollmentId}`}
        >
          今日やることを確認する
        </a>
      </section>
    );
  }

  if (state.status === 'PENDING_CONFIRMATION') {
    return (
      <section className="service-entry__card resale-offer-card resale-offer-card--pending">
        <p className="eyebrow">申込み受付済み</p>
        <h2>運営者が入金を確認しています</h2>
        <p>確認後に90日プログラムが開始されます。再登録は必要ありません。</p>
        {state.offer?.terms.applicationUrl ? (
          <a
            className="button button--secondary button--full"
            href={state.offer.terms.applicationUrl}
          >
            支払いページをもう一度開く
          </a>
        ) : null}
      </section>
    );
  }

  if (state.status === 'DECLINED') {
    return (
      <section className="service-entry__card resale-offer-card">
        <h2>ご回答ありがとうございました</h2>
        <p>7日間の記録は残っています。必要になったときは運営者へご連絡ください。</p>
      </section>
    );
  }

  if (state.status === 'UNAVAILABLE' || !state.offer) {
    return (
      <section className="service-entry__card resale-offer-card">
        <p className="eyebrow">7日間の体験が完了しました</p>
        <h2>次のプログラムを準備しています</h2>
        <p>案内を開始できる状態になり次第、運営者からお知らせします。</p>
      </section>
    );
  }

  const copy = message[state.classification];
  return (
    <section className="service-entry__card resale-offer-card">
      <p className="eyebrow">
        {state.status === 'MONITOR' ? 'モニタープランのご案内' : '7日間の体験が完了しました'}
      </p>
      <h2>{copy.title}</h2>
      <p>{copy.description}</p>
      <div className="resale-offer-card__price" aria-label="料金">
        <strong>{new Intl.NumberFormat('ja-JP').format(state.offer.terms.amountYen)}円</strong>
        <span>／90日・一括</span>
      </div>
      <ul className="resale-offer-card__benefits">
        <li>今の状態から、次にやることを一つだけ表示</li>
        <li>待つべき日は「今日は何もしなくてOK」と案内</li>
        <li>止まったときは小さな作業から再開</li>
      </ul>
      <button
        className="button button--primary button--full"
        type="button"
        disabled={saving}
        onClick={() => void act({ type: 'SELECT', offerKind: state.offer!.terms.offerKey })}
      >
        {saving ? '処理しています…' : '90日プログラムに申し込む'}
      </button>
      {state.status === 'STANDARD' ? (
        <details className="resale-offer-card__decline">
          <summary>今回は申し込まない</summary>
          <label className="field">
            <span className="field__label">理由を教えてください</span>
            <select
              className="field__control"
              value={declineReason}
              onChange={(event) => setDeclineReason(event.target.value as typeof declineReason)}
            >
              <option value="PRICE_TOO_HIGH">価格が高い</option>
              <option value="NOT_READY">今は始める準備ができていない</option>
              <option value="NOT_INTERESTED">内容が自分に合わない</option>
              <option value="OTHER">その他</option>
            </select>
          </label>
          <button
            className="button button--secondary button--full"
            type="button"
            disabled={saving}
            onClick={() => void act({ type: 'DECLINE_STANDARD', reason: declineReason })}
          >
            回答を送る
          </button>
        </details>
      ) : null}
      {notice ? (
        <p className="notice notice--success" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="notice notice--danger" role="alert">
          {error} もう一度同じボタンを押してください。
        </p>
      ) : null}
    </section>
  );
}
