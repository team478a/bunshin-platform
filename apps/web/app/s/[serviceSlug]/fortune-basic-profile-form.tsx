'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition, type FormEvent } from 'react';
import type { FortuneBasicProfileSex } from '@bunshin/capability-fortune';
import type {
  FortuneBasicProfileSettings,
  FortuneCharacter,
} from '../../../src/fortune/guidance-settings';
import { FortuneCharacterBadge } from './fortune-character';

export function FortuneBasicProfileForm({
  serviceSlug,
  settings,
  character,
}: {
  serviceSlug: string;
  settings: FortuneBasicProfileSettings;
  character?: FortuneCharacter;
}) {
  const router = useRouter();
  const headingId = useId();
  const consentId = useId();
  const [sex, setSex] = useState<FortuneBasicProfileSex | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState('');

  async function send(body: object) {
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`/api/services/${serviceSlug}/fortune/basic-profile`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(result?.error?.message ?? '保存できませんでした。もう一度お試しください。');
        return;
      }
      startRefresh(() => router.refresh());
    } catch {
      setError('通信できませんでした。もう一度お試しください。');
    } finally {
      setSubmitting(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    void send({
      action: 'save',
      consented: fields.get('consent') === 'on',
      ...(settings.showNickname ? { nickname: fields.get('nickname') || null } : {}),
      ...(settings.showBirthDate ? { birthDate: fields.get('birthDate') || null } : {}),
      ...(settings.showSex
        ? { sex: sex || null, sexDescription: fields.get('sexDescription') || null }
        : {}),
    });
  }

  return (
    <section className="settings-card fortune-basic-profile" aria-labelledby={headingId}>
      {character?.enabled && (
        <FortuneCharacterBadge character={character} expression="welcome" compact />
      )}
      <h2 id={headingId}>あなたのことを少し教えてください</h2>
      <p>{settings.introduction}</p>
      <form className="fortune-action" onSubmit={submit}>
        <fieldset className="fortune-action" disabled={submitting || refreshing}>
          {settings.showNickname && (
            <label className="form-field">
              <span>ニックネーム（任意）</span>
              <input name="nickname" type="text" maxLength={30} />
            </label>
          )}
          {settings.showBirthDate && (
            <label className="form-field">
              <span>生年月日（任意）</span>
              <input name="birthDate" type="date" min="0001-01-01" />
            </label>
          )}
          {settings.showSex && (
            <label className="form-field">
              <span>性別（任意）</span>
              <select
                name="sex"
                value={sex}
                onChange={(event) => setSex(event.target.value as FortuneBasicProfileSex | '')}
              >
                <option value="">回答しない</option>
                <option value="MALE">男性</option>
                <option value="FEMALE">女性</option>
                <option value="OTHER">その他・自由記述を希望</option>
              </select>
            </label>
          )}
          {settings.showSex && sex === 'OTHER' && (
            <label className="form-field">
              <span>性別の自由記述（任意）</span>
              <input name="sexDescription" type="text" maxLength={60} />
            </label>
          )}
          <p id={consentId}>{settings.consentDescription}</p>
          <label className="fortune-check">
            <input name="consent" type="checkbox" aria-describedby={consentId} required />
            <span>この目的で基本プロフィールを保存することに同意します</span>
          </label>
          <div className="button-row">
            <button type="submit" className="button button--primary">
              保存して次へ
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => void send({ action: 'skip' })}
            >
              スキップして占う
            </button>
          </div>
        </fieldset>
      </form>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
