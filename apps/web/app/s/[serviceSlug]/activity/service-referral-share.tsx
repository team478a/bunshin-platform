'use client';

import {
  SERVICE_REFERRAL_CONTENT_PLATFORMS,
  createServiceReferralContent,
  type ServiceReferralContentPlatform,
} from '@bunshin/application';
import { useEffect, useState } from 'react';

type ReferralValue = { code: string; referralUrl: string; qrDataUrl: string };

export function ServiceReferralShare({
  serviceSlug,
  serviceName,
  serviceDescription,
  initialValue,
}: {
  serviceSlug: string;
  serviceName: string;
  serviceDescription?: string | null;
  initialValue: ReferralValue | null;
}) {
  const [value, setValue] = useState(initialValue);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(initialValue === null);
  const [platform, setPlatform] = useState<ServiceReferralContentPlatform>('INSTAGRAM');
  const [postText, setPostText] = useState<string | null>(null);

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

  function createPostText() {
    if (!value) return;
    try {
      setPostText(
        createServiceReferralContent({
          serviceName,
          serviceDescription,
          referralUrl: value.referralUrl,
          platform,
        }).body,
      );
      setMessage('紹介用の投稿文を作成しました。内容を確認して投稿してください。');
    } catch {
      setMessage('紹介用の投稿文を作成できませんでした。');
    }
  }

  async function copyPostText() {
    if (!postText) return;
    try {
      await navigator.clipboard.writeText(postText);
      setMessage('紹介用の投稿文をコピーしました。');
    } catch {
      setMessage('コピーできませんでした。投稿文を長押ししてコピーしてください。');
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
      <section
        className="service-referral-content"
        aria-labelledby="service-referral-content-title"
      >
        <div>
          <h3 id="service-referral-content-title">紹介用の投稿文</h3>
          <p>投稿先を選ぶと、あなたの紹介URLとPR表記を入れた文章を作れます。</p>
        </div>
        <label>
          投稿先
          <select
            value={platform}
            onChange={(event) => {
              setPlatform(event.target.value as ServiceReferralContentPlatform);
              setPostText(null);
            }}
          >
            {SERVICE_REFERRAL_CONTENT_PLATFORMS.map((value) => (
              <option key={value} value={value}>
                {value === 'INSTAGRAM' ? 'Instagram' : value === 'X' ? 'X' : 'Threads'}
              </option>
            ))}
          </select>
        </label>
        <button className="button button--primary" type="button" onClick={createPostText}>
          紹介用の投稿文を作る
        </button>
        {postText && (
          <div className="service-referral-content__result">
            <label>
              投稿前に内容を確認してください
              <textarea
                readOnly
                rows={8}
                value={postText}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
            <button className="button" type="button" onClick={() => void copyPostText()}>
              投稿文をコピー
            </button>
            <small>自動投稿はしません。コピー後、ご自身のSNSから投稿してください。</small>
          </div>
        )}
      </section>
    </div>
  );
}
