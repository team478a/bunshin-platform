'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition, type FormEvent } from 'react';
import type { FortuneBasicProfile, FortuneBasicProfileSex } from '@bunshin/capability-fortune';
import type {
  FortuneBasicProfileSettings,
  FortuneCharacter,
} from '../../../src/fortune/guidance-settings';
import { FortuneCharacterBadge } from './fortune-character';
import './fortune-basic-profile.css';

const sexLabels: Record<FortuneBasicProfileSex, string> = {
  MALE: '男性',
  FEMALE: '女性',
  OTHER: 'その他',
};

function daysInBirthMonth(year: string, month: string) {
  if (!month) return 31;
  const endOfMonth = new Date(0);
  endOfMonth.setUTCFullYear(Number(year) || 2000, Number(month), 0);
  return endOfMonth.getUTCDate();
}

function BirthDateFields({ birthDate }: { birthDate: string | null }) {
  const [savedYear = '', savedMonth = '', savedDay = ''] = birthDate?.split('-') ?? [];
  const [year, setYear] = useState(savedYear);
  const [month, setMonth] = useState(savedMonth);
  const [day, setDay] = useState(savedDay);
  const currentYear = new Date().getUTCFullYear();
  const oldestYear = Math.min(1900, Number(savedYear) || 1900);
  const years = Array.from({ length: currentYear - oldestYear + 1 }, (_, index) =>
    String(currentYear - index).padStart(4, '0'),
  );
  const numberOptions = (count: number, unit: string) =>
    Array.from({ length: count }, (_, index) => {
      const number = index + 1;
      const value = String(number).padStart(2, '0');
      return (
        <option key={value} value={value}>
          {number}
          {unit}
        </option>
      );
    });

  return (
    <fieldset className="fortune-basic-profile__birth-date fortune-basic-profile__wide">
      <legend>生年月日（任意）</legend>
      <div className="fortune-basic-profile__date-parts">
        <label className="form-field">
          <span>年</span>
          <select
            name="birthYear"
            value={year}
            onChange={(event) => {
              const next = event.target.value;
              setYear(next);
              if (Number(day) > daysInBirthMonth(next, month)) setDay('');
            }}
          >
            <option value="">年を選択</option>
            {years.map((value) => (
              <option key={value} value={value}>
                {Number(value)}年
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>月</span>
          <select
            name="birthMonth"
            value={month}
            onChange={(event) => {
              const next = event.target.value;
              setMonth(next);
              if (Number(day) > daysInBirthMonth(year, next)) setDay('');
            }}
          >
            <option value="">月を選択</option>
            {numberOptions(12, '月')}
          </select>
        </label>
        <label className="form-field">
          <span>日</span>
          <select name="birthDay" value={day} onChange={(event) => setDay(event.target.value)}>
            <option value="">日を選択</option>
            {numberOptions(daysInBirthMonth(year, month), '日')}
          </select>
        </label>
      </div>
      {(year || month || day) && (
        <button
          type="button"
          className="fortune-basic-profile__clear-date"
          onClick={() => {
            setYear('');
            setMonth('');
            setDay('');
          }}
        >
          生年月日をクリア
        </button>
      )}
    </fieldset>
  );
}

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
    const birthParts = ['birthYear', 'birthMonth', 'birthDay'].map((name) => {
      const value = fields.get(name);
      return typeof value === 'string' ? value : '';
    });
    if (showBirthDate && birthParts.some(Boolean) && !birthParts.every(Boolean)) {
      setError('生年月日は年・月・日をすべて選ぶか、空欄にしてください。');
      setMessage('');
      return;
    }
    void send({
      action: 'save',
      consented: fields.get('consent') === 'on',
      ...(showNickname ? { nickname: fields.get('nickname') || null } : {}),
      ...(showBirthDate
        ? { birthDate: birthParts.every(Boolean) ? birthParts.join('-') : null }
        : {}),
      ...(showSex
        ? { sex: sex || null, sexDescription: fields.get('sexDescription') || null }
        : {}),
    });
  }

  return (
    <section
      className={
        initial
          ? 'fortune-basic-profile fortune-basic-profile--welcome'
          : 'settings-card fortune-basic-profile'
      }
      aria-labelledby={headingId}
    >
      {initial ? (
        <header className="fortune-basic-profile__welcome">
          <span className="fortune-basic-profile__moon" aria-hidden="true" />
          <div className="fortune-basic-profile__welcome-copy">
            {character?.enabled && (
              <FortuneCharacterBadge character={character} expression="welcome" compact />
            )}
            <h2 id={headingId}>あなたのことを少し教えてください</h2>
            <p>{settings.introduction}</p>
          </div>
        </header>
      ) : (
        <>
          <h2 id={headingId}>基本プロフィール</h2>
          <p>入力は任意です。項目を空欄にして保存すると、その項目を削除できます。</p>
        </>
      )}
      <form
        className="fortune-basic-profile__form"
        onSubmit={submit}
        key={profile?.updatedAt ?? 'empty'}
      >
        <fieldset className="fortune-basic-profile__fieldset" disabled={submitting || refreshing}>
          {editable && (
            <div className="fortune-basic-profile__fields">
              {showNickname && (
                <label className="form-field fortune-basic-profile__wide">
                  <span>ニックネーム（任意）</span>
                  <input
                    name="nickname"
                    type="text"
                    maxLength={30}
                    defaultValue={profile?.nickname ?? ''}
                  />
                </label>
              )}
              {showBirthDate && <BirthDateFields birthDate={profile?.birthDate ?? null} />}
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
                <label className="form-field fortune-basic-profile__wide">
                  <span>性別の自由記述（任意）</span>
                  <input
                    name="sexDescription"
                    type="text"
                    maxLength={60}
                    defaultValue={profile?.sexDescription ?? ''}
                  />
                </label>
              )}
            </div>
          )}
          {editable && (
            <div className="fortune-basic-profile__consent">
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
            </div>
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
          {error && (
            <p role="alert" className="fortune-basic-profile__error">
              {error}
            </p>
          )}
          <div className="fortune-basic-profile__actions">
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
      {initial && (submitting || refreshing) && (
        <p className="fortune-basic-profile__pending" role="status">
          今日の占いを準備しています…
        </p>
      )}
      {!initial && message && <p role="status">{message}</p>}
    </section>
  );
}
