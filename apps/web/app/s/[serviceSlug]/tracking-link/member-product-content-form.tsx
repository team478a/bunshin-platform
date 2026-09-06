'use client';

import {
  MEMBER_PRODUCT_CONTENT_PLATFORMS,
  createMemberProductContent,
  type MemberProductContentPlatform,
  type MemberTrackingLinkSettings,
} from '@bunshin/application';
import { useState, type FormEvent } from 'react';

const platformLabel = { INSTAGRAM: 'Instagram', X: 'X', THREADS: 'Threads' } as const;

export function MemberProductContentForm({ settings }: { settings: MemberTrackingLinkSettings }) {
  const activeLinks = settings.links.filter((link) => link.status === 'ACTIVE');
  const [body, setBody] = useState('');
  const [message, setMessage] = useState('');

  function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' ? value : '';
    };
    try {
      const result = createMemberProductContent({
        productName: text('productName'),
        appealPoint: text('appealPoint'),
        targetAudience: text('targetAudience'),
        approvedUrl: text('approvedUrl'),
        platform: text('platform') as MemberProductContentPlatform,
      });
      setBody(result.body);
      setMessage(`投稿文を作成しました（${result.characterCount}/${result.characterLimit}文字）。`);
    } catch {
      setBody('');
      setMessage('投稿文を作成できませんでした。入力内容を確認してください。');
    }
  }

  async function copy() {
    if (!body) return;
    try {
      await navigator.clipboard.writeText(body);
      setMessage('投稿文をコピーしました。');
    } catch {
      setMessage('コピーできませんでした。投稿文を長押ししてコピーしてください。');
    }
  }

  if (activeLinks.length === 0) {
    return (
      <div className="empty-state">
        <p>運営者が確認して「使用中」になったURLから投稿文を作れます。</p>
      </div>
    );
  }

  return (
    <form className="member-product-content" onSubmit={generate}>
      <label>
        使用するURL
        <select name="approvedUrl" required>
          {activeLinks.map((link) => (
            <option key={link.id} value={link.url}>
              {link.systemName}
            </option>
          ))}
        </select>
      </label>
      <label>
        商品・サービス名
        <input name="productName" required maxLength={100} placeholder="例：商品名" />
      </label>
      <label>
        今回伝えたいポイント
        <textarea
          name="appealPoint"
          required
          maxLength={280}
          rows={4}
          placeholder="確認できている特徴を、自分の言葉で入力してください"
        />
      </label>
      <label>
        届けたい相手（任意）
        <input name="targetAudience" maxLength={120} placeholder="例：新しい習慣を始めたい方" />
      </label>
      <label>
        投稿先
        <select name="platform" defaultValue="INSTAGRAM">
          {MEMBER_PRODUCT_CONTENT_PLATFORMS.map((platform) => (
            <option key={platform} value={platform}>
              {platformLabel[platform]}
            </option>
          ))}
        </select>
      </label>
      <p className="notice">
        価格・効果・在庫などは自動取得しません。事実を確認して入力してください。投稿文にはPR表記が入ります。
      </p>
      <button className="button button--primary button--full" type="submit">
        このURLで投稿文を作る
      </button>
      {body && (
        <div className="member-product-content__result">
          <label>
            投稿前に内容を確認してください
            <textarea
              readOnly
              rows={9}
              value={body}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <button className="button button--full" type="button" onClick={() => void copy()}>
            投稿文をコピー
          </button>
          <small>自動投稿はしません。コピー後、ご自身のSNSから投稿してください。</small>
        </div>
      )}
      {message && (
        <p role="status" aria-live="polite">
          {message}
        </p>
      )}
    </form>
  );
}
