'use client';

import { useState } from 'react';
import { CAMPAIGN_UNAVAILABLE_MESSAGE } from './campaign-copy-messages';

function copyWithSelection(value: string) {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.inset = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, value.length);
  const copied = document.execCommand('copy');
  textarea.remove();
  return copied;
}

export function VideoPostCopy({
  value,
  authorizationPath,
}: {
  value: string;
  authorizationPath: string;
}) {
  const [message, setMessage] = useState('');

  async function copy() {
    setMessage('コピーの準備を確認しています…');
    const authorization = await fetch(authorizationPath, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }).catch(() => null);
    const result = authorization
      ? ((await authorization.json().catch(() => null)) as {
          data?: { allowed?: boolean; reason?: string };
        } | null)
      : null;
    if (!authorization?.ok || !result?.data?.allowed) {
      setMessage(
        result?.data?.reason === 'CAMPAIGN_UNAVAILABLE'
          ? CAMPAIGN_UNAVAILABLE_MESSAGE
          : result?.data?.reason === 'APPROVAL_PENDING'
            ? 'この投稿文は運営者の確認待ちです。確認が終わるまでコピーできません。'
            : result?.data?.reason === 'LINK_CHANGED'
              ? '専用URLが変更されています。投稿案を作り直してください。'
              : '投稿文をコピーできません。元の投稿案を確認してください。',
      );
      return;
    }
    let clipboardAttempt: Promise<boolean> | null = null;
    try {
      clipboardAttempt = navigator.clipboard.writeText(value).then(
        () => true,
        () => false,
      );
    } catch {
      // LINE内ブラウザや一部のiPhoneではClipboard APIを利用できない場合がある。
    }
    const selectedCopy = copyWithSelection(value);
    const copied = selectedCopy || (await clipboardAttempt) || false;
    setMessage(
      copied
        ? '投稿文をコピーしました。Instagramの投稿画面に貼り付けてください。'
        : '自動でコピーできませんでした。下の投稿文を長押ししてコピーしてください。',
    );
  }

  return (
    <div className="form-stack">
      <h3>動画と一緒に使う投稿文</h3>
      <textarea
        aria-label="動画の投稿文"
        className="field__control"
        readOnly
        rows={8}
        value={value}
      />
      <button className="button button--primary" type="button" onClick={() => void copy()}>
        投稿文をコピー
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
