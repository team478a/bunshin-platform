'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FortuneFeedbackIssue, FortuneFeedbackRating } from '@bunshin/capability-fortune';

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

const feedbackChoices: Array<{ value: FortuneFeedbackRating; label: string }> = [
  { value: 'HELPFUL', label: '参考になった' },
  { value: 'SOMEWHAT', label: '少し参考になった' },
  { value: 'NOT_HELPFUL', label: '今回は違った' },
];

export function FortuneFeedbackButtons({
  serviceSlug,
  readingId,
  current,
  currentIssue,
}: {
  serviceSlug: string;
  readingId: string;
  current: FortuneFeedbackRating | null;
  currentIssue: FortuneFeedbackIssue | null;
}) {
  const [selected, setSelected] = useState(current);
  const [issue, setIssue] = useState(currentIssue);
  const [busy, setBusy] = useState<FortuneFeedbackRating | null>(null);
  const [error, setError] = useState('');
  return (
    <section className="fortune-action" aria-labelledby={`fortune-feedback-${readingId}`}>
      <h3 id={`fortune-feedback-${readingId}`}>この結果は参考になりましたか？</h3>
      <p>選ぶだけで回答できます。占いの内容や自由文は送信しません。</p>
      <div className="button-row">
        {feedbackChoices.map((choice) => (
          <button
            key={choice.value}
            className={`button ${selected === choice.value ? 'button--primary' : 'button--secondary'}`}
            type="button"
            disabled={busy !== null}
            aria-pressed={selected === choice.value}
            onClick={() =>
              void (async () => {
                setBusy(choice.value);
                setError('');
                try {
                  await request(
                    `/api/services/${serviceSlug}/fortune/readings/${readingId}/feedback`,
                    {
                      method: 'PUT',
                      body: JSON.stringify({ rating: choice.value, issue: null }),
                    },
                  );
                  setSelected(choice.value);
                  setIssue(null);
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : '回答を保存できませんでした。');
                } finally {
                  setBusy(null);
                }
              })
            }
          >
            {busy === choice.value ? '保存しています…' : choice.label}
          </button>
        ))}
      </div>
      {selected === 'NOT_HELPFUL' && (
        <div className="fortune-action">
          <p>どこが気になりましたか？（選ばなくても大丈夫です）</p>
          <div className="button-row">
            {[
              ['TOO_VAGUE', '内容があいまい'],
              ['HARD_TO_UNDERSTAND', '分かりにくい'],
              ['UNCOMFORTABLE', '不安になった'],
              ['OTHER', 'その他'],
            ].map(([value, label]) => (
              <button
                key={value}
                className={`button ${issue === value ? 'button--primary' : 'button--secondary'}`}
                type="button"
                disabled={busy !== null}
                aria-pressed={issue === value}
                onClick={() =>
                  void (async () => {
                    const selectedIssue = value as FortuneFeedbackIssue;
                    setBusy('NOT_HELPFUL');
                    setError('');
                    try {
                      await request(
                        `/api/services/${serviceSlug}/fortune/readings/${readingId}/feedback`,
                        {
                          method: 'PUT',
                          body: JSON.stringify({
                            rating: 'NOT_HELPFUL',
                            issue: selectedIssue,
                          }),
                        },
                      );
                      setIssue(selectedIssue);
                    } catch (cause) {
                      setError(
                        cause instanceof Error ? cause.message : '回答を保存できませんでした。',
                      );
                    } finally {
                      setBusy(null);
                    }
                  })
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {selected && <p className="success-message">回答を保存しました。変更もできます。</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
