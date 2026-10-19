'use client';

import { useState } from 'react';

export interface LearningNudgePreferenceView {
  enabled: boolean;
  consented: boolean;
  pausedUntil: string | null;
  stoppedAt: string | null;
  featureEnabled: boolean;
}

export function LearningNudgePreferenceCard({
  endpoint,
  initial,
}: {
  endpoint: string;
  initial: LearningNudgePreferenceView;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function update(action: 'ENABLE' | 'PAUSE' | 'STOP' | 'RESUME', days?: 7 | 14 | 30) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          action === 'ENABLE'
            ? { action, accepted: true }
            : action === 'PAUSE'
              ? { action, days }
              : { action },
        ),
      });
      if (!response.ok) throw new Error('更新できませんでした。時間をおいて再度お試しください。');
      const result = (await response.json()) as { data: Partial<LearningNudgePreferenceView> };
      setValue((current) => ({ ...current, ...result.data }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '更新できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  const paused = value.pausedUntil !== null && new Date(value.pausedUntil) > new Date();
  const stopped = value.stoppedAt !== null || !value.enabled;
  return (
    <section className="service-entry__card" aria-labelledby="learning-nudge-title">
      <h2 id="learning-nudge-title">LINEでの学習サポート</h2>
      <p>
        研修の利用状況に合わせて、決まった案内文でLINEの声かけを送ります。いつでも休止・停止できます。声かけを止めても、学習は続けられます。
      </p>
      {!value.featureEnabled && <p>このプログラムでは、現在LINEの声かけを利用できません。</p>}
      {value.featureEnabled && !stopped && !paused && <p>声かけは有効です。</p>}
      {paused && (
        <p>休止中です（{new Date(value.pausedUntil!).toLocaleDateString('ja-JP')}に再開予定）。</p>
      )}
      {stopped && <p>声かけは停止中です。学習そのものには影響しません。</p>}
      {error && <p role="alert">{error}</p>}
      <div className="form-actions">
        {stopped ? (
          <button
            type="button"
            className="button button--secondary"
            disabled={busy || !value.featureEnabled}
            onClick={() => void update('ENABLE')}
          >
            声かけを再開する
          </button>
        ) : (
          <>
            <label>
              休止期間
              <select
                aria-label="休止期間"
                disabled={busy}
                defaultValue="7"
                onChange={(event) =>
                  void update('PAUSE', Number(event.target.value) as 7 | 14 | 30)
                }
              >
                <option value="7">1週間</option>
                <option value="14">2週間</option>
                <option value="30">1か月</option>
              </select>
            </label>
            <button
              type="button"
              className="button button--secondary"
              disabled={busy}
              onClick={() => void update('STOP')}
            >
              声かけを停止する
            </button>
            {paused && (
              <button
                type="button"
                className="button button--secondary"
                disabled={busy}
                onClick={() => void update('RESUME')}
              >
                今すぐ再開する
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
