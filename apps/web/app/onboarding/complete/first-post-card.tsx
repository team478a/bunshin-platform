'use client';
import { useRef, useState } from 'react';

export function FirstPostCard({
  suggestion,
}: {
  suggestion: { title: string; body: string; version: string };
}) {
  const body = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);
  return (
    <section className="wizard-card" aria-labelledby="first-post-title">
      <p className="eyebrow">投稿案</p>
      <h2 id="first-post-title">{suggestion.title}</h2>
      <textarea
        ref={body}
        className="field__control"
        rows={10}
        defaultValue={suggestion.body}
        aria-label="最初の投稿案"
      />
      <div className="wizard-actions">
        <button
          className="button button--secondary"
          type="button"
          onClick={() => {
            void navigator.clipboard
              .writeText(body.current?.value ?? suggestion.body)
              .then(() => {
                setCopied(true);
                return fetch('/api/registration-funnel', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ eventType: 'FIRST_POST_COPIED' }),
                });
              })
              .catch(() => undefined);
          }}
        >
          {copied ? 'コピーしました' : '投稿案をコピー'}
        </button>
      </div>
      <small>生成ルール: {suggestion.version}</small>
    </section>
  );
}
