'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import {
  defaultFortuneGuidanceSettings,
  type FortuneGuidanceSettings,
} from '../../../src/fortune/guidance-settings';
import type { FortunePersonalProfile } from '@bunshin/capability-fortune';

export function FortuneProfileForm({
  serviceSlug,
  profile,
  initial = false,
  enabled,
  guidance = defaultFortuneGuidanceSettings,
}: {
  serviceSlug: string;
  profile: FortunePersonalProfile;
  initial?: boolean;
  enabled: boolean;
  guidance?: FortuneGuidanceSettings;
}) {
  const router = useRouter();
  const [interest, setInterest] = useState(profile.interest ?? '');
  const questionHintId = useId();
  const [consented, setConsented] = useState(profile.consented);
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function save(fields?: FormData) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const allow = Boolean(fields && consented && enabled);
      const response = await fetch(`/api/services/${serviceSlug}/fortune/profile`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          fields && allow
            ? {
                consented: true,
                interest: fields.get('interest'),
                question: fields.get('question'),
                style: fields.get('style') || null,
              }
            : { consented: false },
        ),
      });
      if (!response.ok) {
        setError('保存できませんでした。時間をおいてもう一度お試しください。');
        return;
      }
      if (!allow) setInterest('');
      setConsented(allow);
      setCompleted(true);
      setMessage(allow ? '希望を保存しました。' : '個別化に使う希望を削除しました。');
      router.refresh();
    } catch {
      setError('通信できませんでした。時間をおいてもう一度お試しください。');
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(new FormData(event.currentTarget));
  }

  if (initial && completed) return null;

  return (
    <section className="settings-card">
      <h2>{initial ? 'あなたに合う占いにする' : '占いに使う希望'}</h2>
      {initial && <p>どの質問も任意です。スキップして今日の占いを利用できます。</p>}
      <form className="fortune-action" onSubmit={submit}>
        <fieldset className="fortune-action" disabled={busy}>
          {enabled && (
            <>
              <label className="form-field">
                <span>{guidance.interestQuestion}</span>
                <input
                  name="interest"
                  value={interest}
                  maxLength={120}
                  onChange={(event) => setInterest(event.target.value)}
                />
              </label>
              <div className="button-row" role="group" aria-label="関心テーマの候補">
                {Object.entries(guidance.themeLabels).map(([theme, label]) => (
                  <button
                    key={theme}
                    className="button button--secondary"
                    type="button"
                    aria-pressed={interest === label}
                    onClick={() => setInterest(label)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="form-field">
                <span>{guidance.consultationQuestion}</span>
                <textarea
                  name="question"
                  defaultValue={profile.question ?? ''}
                  maxLength={500}
                  rows={3}
                  aria-describedby={questionHintId}
                />
                <small id={questionHintId} className="fortune-input-hint" aria-hidden="true">
                  例：新しい仕事に慣れるためにできることを知りたい（500文字まで）
                </small>
              </label>
              <label className="form-field">
                <span>{guidance.styleQuestion}</span>
                <select name="style" defaultValue={profile.style ?? ''}>
                  <option value="">おまかせ</option>
                  {Object.entries(guidance.styleLabels).map(([style, label]) => (
                    <option key={style} value={style}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="fortune-check">
                <input
                  type="checkbox"
                  checked={consented}
                  onChange={(event) => setConsented(event.target.checked)}
                />
                <span>
                  このサービスの今後の鑑定を私に合わせるため、入力した希望と過去の鑑定・評価を使うことに同意する
                </span>
              </label>
            </>
          )}
          <div className="button-row">
            {enabled && (
              <button className="button button--primary" type="submit" disabled={!consented}>
                {busy ? '保存しています…' : '同意して希望を保存'}
              </button>
            )}
            {(initial || profile.consented) && (
              <button
                className="button button--secondary"
                type="button"
                onClick={() => void save()}
              >
                {initial ? 'スキップ' : '同意を取り消して希望を削除'}
              </button>
            )}
          </div>
        </fieldset>
      </form>
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
