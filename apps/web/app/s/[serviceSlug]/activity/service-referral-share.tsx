'use client';

import { useEffect, useState } from 'react';

type ReferralValue = { code: string; referralUrl: string; qrDataUrl: string };

export function ServiceReferralShare({
  serviceSlug,
  serviceName,
  initialValue,
}: {
  serviceSlug: string;
  serviceName: string;
  initialValue: ReferralValue | null;
}) {
  const [value, setValue] = useState(initialValue);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(initialValue === null);

  useEffect(() => {
    if (value) return;
    let active = true;
    void fetch(`/api/services/${encodeURIComponent(serviceSlug)}/referral-code`, { method: 'POST' })
      .then(async (response) => {
        if (!response.ok) throw new Error('REFERRAL_CODE_UNAVAILABLE');
        const body = (await response.json()) as { data: ReferralValue };
        if (active) setValue(body.data);
      })
      .catch(() => {
        if (active)
          setMessage('紹介URLを準備できませんでした。画面を更新してもう一度お試しください。');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [serviceSlug, value]);

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value.referralUrl);
      setMessage('紹介URLをコピーしました。');
    } catch {
      setMessage('コピーできませんでした。URLを長押ししてコピーしてください。');
    }
  }

  async function share() {
    if (!value) return;
    if (!navigator.share) {
      await copy();
      return;
    }
    try {
      await navigator.share({
        title: serviceName,
        text: `${serviceName}をご紹介します。`,
        url: value.referralUrl,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage('共有画面を開けませんでした。紹介URLをコピーしてお使いください。');
    }
  }

  if (loading) return <p role="status">あなた専用の紹介URLを準備しています…</p>;
  if (!value) return <p role="alert">{message}</p>;
  const lineText = encodeURIComponent(`${serviceName}をご紹介します。\n${value.referralUrl}`);
  return (
    <div className="service-referral-share">
      <label>
        あなた専用の紹介URL
        <input
          readOnly
          value={value.referralUrl}
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
      <div className="service-referral-share__actions">
        <button className="button button--primary" type="button" onClick={() => void copy()}>
          URLをコピー
        </button>
        <button className="button" type="button" onClick={() => void share()}>
          共有する
        </button>
        <a
          className="button"
          href={`https://line.me/R/share?text=${lineText}`}
          target="_blank"
          rel="noreferrer"
        >
          LINEで送る
        </a>
      </div>
      {message && <p role="status">{message}</p>}
      <details>
        <summary>QRコードを表示</summary>
        <img
          className="service-referral-share__qr"
          src={value.qrDataUrl}
          alt="紹介URLのQRコード"
          width={320}
          height={320}
        />
      </details>
      <small>紹介コード：{value.code}</small>
    </div>
  );
}
