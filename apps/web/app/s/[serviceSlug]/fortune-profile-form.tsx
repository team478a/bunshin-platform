'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { FortunePersonalProfile } from '@bunshin/capability-fortune';

export function FortuneProfileForm({
  serviceSlug,
  profile,
  initial = false,
  enabled,
}: {
  serviceSlug: string;
  profile: FortunePersonalProfile;
  initial?: boolean;
  enabled: boolean;
}) {
  const router = useRouter();
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
                <span>今、どんなことが気になっていますか？</span>
                <input
                  name="interest"
                  defaultValue={profile.interest ?? ''}
                  maxLength={120}
                  placeholder="恋愛、仕事、人間関係など"
                />
              </label>
              <label className="form-field">
                <span>具体的に知りたいことはありますか？</span>
                <textarea
                  name="question"
                  defaultValue={profile.question ?? ''}
                  maxLength={500}
                  rows={3}
                />
              </label>
              <label className="form-field">
                <span>どんな雰囲気が好みですか？</span>
                <select name="style" defaultValue={profile.style ?? ''}>
                  <option value="">おまかせ</option>
                  <option value="GENTLE">やさしく</option>
                  <option value="DIRECT">簡潔に</option>
                  <option value="REFLECTIVE">じっくり考える</option>
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
