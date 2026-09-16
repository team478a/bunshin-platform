'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

async function request(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
  const body = (await response.json()) as { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? '操作を完了できませんでした。');
}

export function FortuneJoinButton({
  serviceSlug,
  minimumAge,
}: {
  serviceSlug: string;
  minimumAge: number;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="fortune-action">
      <label className="fortune-check">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
        />
        <span>私は{minimumAge}歳以上です</span>
      </label>
      <button
        className="button button--primary button--full"
        type="button"
        disabled={!checked || busy}
        onClick={() =>
          void (async () => {
            setBusy(true);
            setError('');
            try {
              await request(`/api/services/${serviceSlug}/fortune/participation`, {
                method: 'POST',
                body: JSON.stringify({ ageConfirmed: true }),
              });
              router.refresh();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : '操作を完了できませんでした。');
            } finally {
              setBusy(false);
            }
          })()
        }
      >
        {busy ? '確認しています…' : '確認して始める'}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const choices = [
  { value: 'LOVE', label: '恋愛', note: '恋愛や気持ちについて' },
  { value: 'WORK', label: '仕事', note: '仕事や今後の動きについて' },
  { value: 'RELATIONSHIPS', label: '人間関係', note: '家族・友人・周囲との関係について' },
] as const;

export function FortuneDrawButtons({ serviceSlug }: { serviceSlug: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  return (
    <div className="fortune-theme-list">
      {choices.map((choice) => (
        <button
          key={choice.value}
          className="fortune-theme-button"
          disabled={busy !== null}
          type="button"
          onClick={() =>
            void (async () => {
              setBusy(choice.value);
              setError('');
              try {
                await request(`/api/services/${serviceSlug}/fortune/today`, {
                  method: 'POST',
                  body: JSON.stringify({ theme: choice.value }),
                });
                router.refresh();
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : '占いを完了できませんでした。');
              } finally {
                setBusy(null);
              }
            })()
          }
        >
          <strong>{busy === choice.value ? 'カードを引いています…' : choice.label}</strong>
          <span>{choice.note}</span>
        </button>
      ))}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function FortuneDeleteButton({
  serviceSlug,
  readingId,
}: {
  serviceSlug: string;
  readingId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="fortune-action">
      <button
        className="button button--secondary"
        type="button"
        disabled={busy}
        onClick={() =>
          void (async () => {
            if (!window.confirm('この結果を削除しますか？ 削除後も今日は引き直せません。')) return;
            setBusy(true);
            setError('');
            try {
              await request(`/api/services/${serviceSlug}/fortune/readings/${readingId}`, {
                method: 'DELETE',
              });
              router.push(`/s/${serviceSlug}/history` as Route);
              router.refresh();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : '削除できませんでした。');
              setBusy(false);
            }
          })()
        }
      >
        {busy ? '削除しています…' : 'この結果を削除する'}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
