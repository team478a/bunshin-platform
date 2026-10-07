'use client';

import { useRef, useState, type FormEvent } from 'react';
import {
  profilePreparationCommand,
  submitProfilePreparation,
  type PreparedLearningProfile,
  type ProfilePreparationCommand,
} from './personal-learning-profile-preparation-client';

export function PersonalLearningProfilePreparationCard({
  serviceSlug,
  enrollmentId,
  initialProfile,
}: {
  serviceSlug: string;
  enrollmentId: string;
  initialProfile: PreparedLearningProfile | null;
}) {
  const [role, setRole] = useState('');
  const [aiLevel, setAiLevel] = useState('');
  const [dailyMinutes, setDailyMinutes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [phase, setPhase] = useState<'READY' | 'SAVED' | 'RETRY' | 'CLOSED' | 'CONFLICT'>(
    initialProfile ? 'SAVED' : 'READY',
  );
  const [busy, setBusy] = useState(false);
  const pending = useRef<ProfilePreparationCommand | null>(null);
  const inFlight = useRef(false);
  const locked = busy || phase !== 'READY';
  const canSubmit = !!role && !!aiLevel && !!dailyMinutes && confirmed;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || !['READY', 'RETRY'].includes(phase)) return;
    pending.current ??= profilePreparationCommand({ role, aiLevel, dailyMinutes }, confirmed);
    if (!pending.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      setPhase(
        await submitProfilePreparation(
          `/api/services/${encodeURIComponent(serviceSlug)}/ai-training/enrollments/${encodeURIComponent(enrollmentId)}/personal-learning/profile`,
          pending.current,
        ),
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="service-entry__card training-card">
      <h2>学習を始める前の設定</h2>
      <p>マナベルスタイルでの学習に使う、あなた自身の回答を確認します。</p>
      <p>学習はまだ始まりません。答えを代わりに作るのではなく、自分でAIを使うための研修です。</p>
      {phase === 'SAVED' ? (
        <p className="notice" role="status">
          学習設定は保存済みです。開始の案内をお待ちください。この画面では変更しません。
        </p>
      ) : (
        <form className="form-stack" onSubmit={(event) => void save(event)}>
          <fieldset className="form-stack" disabled={locked}>
            <legend>3つの項目を選んでください</legend>
            <label className="field">
              <span className="field__label">主な仕事の種類</span>
              <select
                className="field__control"
                required
                value={role}
                onChange={(event) => setRole(event.target.value)}
              >
                <option value="">選んでください</option>
                <option value="SALES">営業</option>
                <option value="OFFICE">事務</option>
                <option value="MANAGER">管理職</option>
                <option value="OTHER">その他</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">今のAI利用経験</span>
              <select
                className="field__control"
                required
                value={aiLevel}
                onChange={(event) => setAiLevel(event.target.value)}
              >
                <option value="">選んでください</option>
                <option value="BEGINNER">これから学ぶ・基本から確認したい</option>
                <option value="INTERMEDIATE">基本的な使い方は分かる</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">1回の学習に使いたい時間</span>
              <select
                className="field__control"
                required
                value={dailyMinutes}
                onChange={(event) => setDailyMinutes(event.target.value)}
              >
                <option value="">選んでください</option>
                <option value="5">5分</option>
                <option value="10">10分</option>
                <option value="15">15分</option>
              </select>
            </label>
            <p>分からない項目は選ばず、運営者へ確認してください。未回答を初心者とは扱いません。</p>
            <label className="field">
              <span>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />{' '}
                自分自身の回答として、この内容を保存します
              </span>
            </label>
          </fieldset>
          {phase === 'RETRY' ? (
            <p className="notice" role="status">
              保存結果を確認できませんでした。回答を変更せず、同じ内容を再送できます。
            </p>
          ) : null}
          {phase === 'CLOSED' ? (
            <p className="notice" role="alert">
              現在、この設定は利用できません。運営者へ確認してください。
            </p>
          ) : null}
          {phase === 'CONFLICT' ? (
            <p className="notice" role="alert">
              設定状態が変わったため保存を続けられません。画面を更新して確認してください。
            </p>
          ) : null}
          {phase === 'READY' || phase === 'RETRY' ? (
            <button
              className="button button--full"
              type="submit"
              disabled={busy || (phase === 'READY' && !canSubmit)}
            >
              {busy
                ? '確認しています…'
                : phase === 'RETRY'
                  ? '同じ内容を再送する'
                  : '確認して保存する'}
            </button>
          ) : null}
        </form>
      )}
    </section>
  );
}
