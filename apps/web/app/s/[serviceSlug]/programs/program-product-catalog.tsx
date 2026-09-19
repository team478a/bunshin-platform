'use client';

import { useState } from 'react';

export function ProgramProductCatalog({
  serviceSlug,
  paymentEnabled,
  legalReady,
  products,
}: {
  serviceSlug: string;
  paymentEnabled: boolean;
  legalReady: boolean;
  products: {
    offeringId: string;
    name: string;
    description: string;
    amountYen: number;
    durationDays: number;
  }[];
}) {
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  async function checkout(offeringId: string) {
    setSubmitting(offeringId);
    setMessage('安全な決済画面を準備しています…');
    try {
      const response = await fetch(
        `/api/services/${serviceSlug}/program-offerings/${offeringId}/checkout`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
        },
      );
      const result = (await response.json()) as {
        data?: { checkoutUrl?: string };
        error?: { message?: string };
      };
      if (!response.ok || !result.data?.checkoutUrl) {
        throw new Error(result.error?.message ?? '決済を開始できませんでした。');
      }
      window.location.assign(result.data.checkoutUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '決済を開始できませんでした。');
      setSubmitting(null);
    }
  }

  if (products.length === 0) return null;
  return (
    <section className="settings-card">
      <p className="eyebrow">新しく始める</p>
      <h2>参加できる有料プログラム</h2>
      <p>内容、利用期間、価格を確認してから決済へ進んでください。</p>
      <p role="status" aria-live="polite">
        {message}
      </p>
      <div className="settings-stack">
        {products.map((product) => (
          <article key={product.offeringId}>
            <h3>{product.name}</h3>
            <p>{product.description}</p>
            <p>
              <strong>{product.amountYen.toLocaleString('ja-JP')}円</strong>（税込）／
              {product.durationDays}日間
            </p>
            <p>
              購入前に<a href={`/s/${serviceSlug}/terms`}>利用規約</a>と
              <a href={`/s/${serviceSlug}/privacy`}>プライバシーポリシー</a>、
              <a href={`/s/${serviceSlug}/commerce`}>特定商取引法に基づく表示</a>
              をご確認ください。
            </p>
            <button
              className="button button--primary button--full"
              type="button"
              disabled={!paymentEnabled || !legalReady || submitting !== null}
              onClick={() => void checkout(product.offeringId)}
            >
              {submitting === product.offeringId ? '決済画面を準備中…' : '内容を確認して購入する'}
            </button>
            {!paymentEnabled ? <p>現在、決済の準備中です。</p> : null}
            {paymentEnabled && !legalReady ? (
              <p>販売条件を準備しています。公開までしばらくお待ちください。</p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
