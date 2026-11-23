'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition, type FormEvent } from 'react';
import type { FortuneBasicProfile, FortuneBasicProfileSex } from '@bunshin/capability-fortune';
import type {
  FortuneBasicProfileSettings,
  FortuneCharacter,
} from '../../../src/fortune/guidance-settings';
import { FortuneCharacterBadge } from './fortune-character';

const sexLabels: Record<FortuneBasicProfileSex, string> = {
  MALE: '男性',
  FEMALE: '女性',
  OTHER: 'その他',
};

export function FortuneBasicProfileForm({
  serviceSlug,
  settings,
  character,
  profile = null,
  initial = true,
}: {
  serviceSlug: string;
  settings: FortuneBasicProfileSettings;
  character?: FortuneCharacter;
  profile?: FortuneBasicProfile | null;
  initial?: boolean;
}) {
  const router = useRouter();
  const headingId = useId();
  const consentId = useId();
  const [sex, setSex] = useState<FortuneBasicProfileSex | ''>(profile?.sex ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const showNickname = settings.enabled && settings.showNickname;
  const showBirthDate = settings.enabled && settings.showBirthDate;
  const showSex = settings.enabled && settings.showSex;
  const editable = showNickname || showBirthDate || showSex;
  const hidden = [
    { field: 'nickname', label: 'ニックネーム', value: !showNickname && profile?.nickname },
    { field: 'birthDate', label: '生年月日', value: !showBirthDate && profile?.birthDate },
    {
      field: 'sex',
      label: '性別',
      value: !showSex && profile?.sex && (profile.sexDescription || sexLabels[profile.sex]),
    },
  ].filter(({ value }) => Boolean(value));

  async function send(body: object | null) {
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/services/${serviceSlug}/fortune/basic-profile`, {
        ...(body
          ? {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            }
          : { method: 'DELETE' }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(result?.error?.message ?? '更新できませんでした。もう一度お試しください。');
        return;
      }
      if (!body) setSex('');
      setMessage(
        body
          ? '基本プロフィールを更新しました。'
          : '同意を撤回し、基本プロフィールを削除しました。',
      );
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
      ...(showNickname ? { nickname: fields.get('nickname') || null } : {}),
      ...(showBirthDate ? { birthDate: fields.get('birthDate') || null } : {}),
      ...(showSex
        ? { sex: sex || null, sexDescription: fields.get('sexDescription') || null }
        : {}),
    });
  }

  return (
    <section className="settings-card fortune-basic-profile" aria-labelledby={headingId}>
      {character?.enabled && (
        <FortuneCharacterBadge character={character} expression="welcome" compact />
      )}
      <h2 id={headingId}>{initial ? 'あなたのことを少し教えてください' : '基本プロフィール'}</h2>
      {initial && <p>{settings.introduction}</p>}
      {!initial && <p>入力は任意です。項目を空欄にして保存すると、その項目を削除できます。</p>}
      <form className="fortune-action" onSubmit={submit} key={profile?.updatedAt ?? 'empty'}>
        <fieldset className="fortune-action" disabled={submitting || refreshing}>
          {showNickname && (
            <label className="form-field">
              <span>ニックネーム（任意）</span>
              <input
                name="nickname"
                type="text"
                maxLength={30}
                defaultValue={profile?.nickname ?? ''}
              />
            </label>
          )}
          {showBirthDate && (
            <label className="form-field">
              <span>生年月日（任意）</span>
              <input
                name="birthDate"
                type="date"
                min="0001-01-01"
                defaultValue={profile?.birthDate ?? ''}
              />
            </label>
          )}
          {showSex && (
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
          {showSex && sex === 'OTHER' && (
            <label className="form-field">
              <span>性別の自由記述（任意）</span>
              <input
                name="sexDescription"
                type="text"
                maxLength={60}
                defaultValue={profile?.sexDescription ?? ''}
              />
            </label>
          )}
          {editable && (
            <>
              <p id={consentId}>{settings.consentDescription}</p>
              <label className="fortune-check">
                <input
                  name="consent"
                  type="checkbox"
                  aria-describedby={consentId}
                  defaultChecked={Boolean(profile)}
                  required
                />
                <span>この目的で基本プロフィールを保存することに同意します</span>
              </label>
            </>
          )}
          {hidden.length > 0 && (
            <div className="fortune-action">
              <h3>保存済みの項目</h3>
              {hidden.map(({ field, label, value }) => (
                <div key={field}>
                  <p>
                    {label} {value}
                  </p>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() =>
                      void send({
                        action: 'save',
                        consented: true,
                        [field]: null,
                      })
                    }
                  >
                    {label}を削除
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="button-row">
            {editable && (
              <button type="submit" className="button button--primary">
                {initial ? '保存して次へ' : '変更を保存'}
              </button>
            )}
            {initial && (
              <button
                type="button"
                className="button button--secondary"
                onClick={() => void send({ action: 'skip' })}
              >
                スキップして占う
              </button>
            )}
            {!initial && profile && (
              <button
                type="button"
                className="button button--secondary"
                onClick={() => void send(null)}
              >
                同意を撤回して基本プロフィールを削除
              </button>
            )}
          </div>
        </fieldset>
      </form>
      {!initial && message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
