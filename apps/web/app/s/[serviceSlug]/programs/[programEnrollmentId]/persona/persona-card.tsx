'use client';

import { useState } from 'react';
import {
  PERSONAL_LEARNING_PERSONA_CONSENT_COPY as consent,
  PERSONAL_LEARNING_PERSONA_CONSENT_VERSION,
} from '../../../../../../src/services/personal-learning-persona-consent';

type PersonaProfile = {
  optedIn: boolean;
  consentVersion: string | null;
  dismissedUntil: string | null;
  companyName: string | null;
  ageBand: string | null;
  industryJob: string | null;
};

type PersonaItem = {
  id: string;
  attributeKey: string;
  value: string;
  status: string;
  evidenceType: string;
  evidenceId: string;
  evidenceCreatedAt: string;
  evidenceHref: string | null;
};

const statusLabel: Record<string, string> = {
  UNCONFIRMED: '未確認',
  CONFIRMED: '確認済み',
  REJECTED: '違う',
};
const evidenceLabel: Record<string, string> = {
  LEARNING_REQUEST: '最初の希望',
  CONVERSATION_EVENT: '相談でのやりとり',
  PRACTICE_ANSWER: '実践の記録',
  LEARNER_INPUT: '本人が入力',
};

export function PersonalLearningPersonaCard({
  serviceSlug,
  enrollmentId,
  initialProfile,
  invitationReady,
  initialItems,
  initialSuppressedAttributes,
}: {
  serviceSlug: string;
  enrollmentId: string;
  initialProfile: PersonaProfile | null;
  invitationReady: boolean;
  initialItems: PersonaItem[];
  initialSuppressedAttributes: string[];
}) {
  const [items, setItems] = useState(initialItems);
  const [suppressedAttributes, setSuppressedAttributes] = useState(initialSuppressedAttributes);
  const [profile, setProfile] = useState<PersonaProfile>(
    initialProfile ?? {
      optedIn: false,
      consentVersion: null,
      dismissedUntil: null,
      companyName: null,
      ageBand: null,
      industryJob: null,
    },
  );
  const [companyChecked, setCompanyChecked] = useState(Boolean(initialProfile?.companyName));
  const [ageChecked, setAgeChecked] = useState(Boolean(initialProfile?.ageBand));
  const [jobChecked, setJobChecked] = useState(initialProfile?.industryJob !== null);
  const [companyName, setCompanyName] = useState(initialProfile?.companyName ?? '');
  const [ageBand, setAgeBand] = useState(initialProfile?.ageBand ?? '');
  const [industryJob, setIndustryJob] = useState(initialProfile?.industryJob ?? '');
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(initialItems.map((item) => [item.id, item.value])),
  );
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const endpoint = `/api/services/${serviceSlug}/ai-training/enrollments/${enrollmentId}/personal-learning/persona`;
  const showInvitation =
    invitationReady &&
    !profile.optedIn &&
    (!profile.dismissedUntil || Date.parse(profile.dismissedUntil) <= Date.now());

  async function saveProfile() {
    setBusyId('profile');
    setError('');
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'profile',
          companyName: companyChecked ? companyName || null : null,
          ageBand: ageChecked ? ageBand || null : null,
          industryJob: jobChecked ? industryJob || null : null,
        }),
      });
      if (!response.ok) throw new Error('入力項目を保存できませんでした。内容を確認してください。');
      const result = (await response.json()) as {
        data: Pick<PersonaProfile, 'companyName' | 'ageBand' | 'industryJob'>;
      };
      setProfile((current) => ({ ...current, ...result.data }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '入力項目を保存できませんでした。');
    } finally {
      setBusyId('');
    }
  }

  async function setEnabled(enabled: boolean) {
    const deleteSavedData = enabled
      ? false
      : window.confirm(
          '保存済みの推測・入力内容も削除しますか？（キャンセルすると、内容は残します）',
        );
    setBusyId('consent');
    setError('');
    try {
      if (enabled) {
        const saveResponse = await fetch(endpoint, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'profile',
            companyName: companyChecked ? companyName || null : null,
            ageBand: ageChecked ? ageBand || null : null,
            industryJob: jobChecked ? industryJob || null : null,
          }),
        });
        if (!saveResponse.ok) throw new Error('入力項目を保存できませんでした。');
      }
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'opt-in',
          enabled,
          ...(enabled
            ? { consentVersion: PERSONAL_LEARNING_PERSONA_CONSENT_VERSION }
            : { deleteSavedData }),
        }),
      });
      if (!response.ok)
        throw new Error('設定を保存できませんでした。画面を更新して再度お試しください。');
      setProfile((current) => ({
        ...current,
        optedIn: enabled,
        consentVersion: enabled
          ? PERSONAL_LEARNING_PERSONA_CONSENT_VERSION
          : current.consentVersion,
      }));
      if (!enabled && deleteSavedData) {
        setItems([]);
        setSuppressedAttributes([]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '設定を保存できませんでした。');
    } finally {
      setBusyId('');
    }
  }

  async function dismissInvitation() {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss' }),
      });
      if (!response.ok) throw new Error('案内を閉じられませんでした。');
      setProfile((current) => ({
        ...current,
        dismissedUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '案内を閉じられませんでした。');
    }
  }

  async function update(
    item: PersonaItem,
    payload: { value?: string; status?: 'CONFIRMED' | 'REJECTED' },
  ) {
    setBusyId(item.id);
    setError('');
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId: item.id, ...payload }),
      });
      if (!response.ok) throw new Error('保存できませんでした。画面を更新して再度お試しください。');
      const result = (await response.json()) as { data: PersonaItem };
      setItems((current) =>
        current.map((row) =>
          row.id === item.id ? { ...result.data, evidenceHref: row.evidenceHref } : row,
        ),
      );
      setDrafts((current) => ({ ...current, [item.id]: result.data.value }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存できませんでした。');
    } finally {
      setBusyId('');
    }
  }

  async function remove(item: PersonaItem) {
    if (
      !window.confirm(
        '削除すると、この内容はAIに渡されず、再び推測されることもありません。削除しますか？',
      )
    )
      return;
    setBusyId(item.id);
    setError('');
    try {
      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      });
      if (!response.ok) throw new Error('削除できませんでした。画面を更新して再度お試しください。');
      setItems((current) => current.filter((row) => row.id !== item.id));
      setSuppressedAttributes((current) => [
        item.attributeKey,
        ...current.filter((attributeKey) => attributeKey !== item.attributeKey),
      ]);
      setDrafts((current) =>
        Object.fromEntries(Object.entries(current).filter(([id]) => id !== item.id)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '削除できませんでした。');
    } finally {
      setBusyId('');
    }
  }

  async function allowReinference(attributeKey: string) {
    setBusyId(attributeKey);
    setError('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ allowReinferenceFor: attributeKey }),
      });
      if (!response.ok)
        throw new Error('設定を変更できませんでした。画面を更新して再度お試しください。');
      setSuppressedAttributes((current) =>
        current.filter((suppressed) => suppressed !== attributeKey),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '設定を変更できませんでした。');
    } finally {
      setBusyId('');
    }
  }

  return (
    <section className="service-entry__card" aria-labelledby="persona-items-title">
      {showInvitation && (
        <section aria-labelledby="persona-opt-in-title">
          <h2 id="persona-opt-in-title">{consent.heading}</h2>
          <p>{consent.summary}</p>
          <p>{consent.off}</p>
          <h3>{consent.examplesHeading}</h3>
          <ul>
            {consent.examples.map((example) => (
              <li key={example}>{example}</li>
            ))}
          </ul>
          <p>{consent.never}</p>
          <fieldset>
            <legend>本人が入力する項目（入力しない項目はチェックを外してください）</legend>
            <label>
              <input
                type="checkbox"
                checked={companyChecked}
                onChange={(event) => setCompanyChecked(event.target.checked)}
              />
              勤務先の会社名
            </label>
            {companyChecked && (
              <label>
                会社名
                <input
                  maxLength={80}
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                />
              </label>
            )}
            <p>
              会社に合わせた例を出せます。会社名がこのサービスに保存されます。会社の規則で社外サービスへの入力が禁止されていないか確認してください。
            </p>
            <label>
              <input
                type="checkbox"
                checked={ageChecked}
                onChange={(event) => setAgeChecked(event.target.checked)}
              />
              年代
            </label>
            {ageChecked && (
              <label>
                年代
                <select value={ageBand} onChange={(event) => setAgeBand(event.target.value)}>
                  <option value="">選択してください</option>
                  {['20代', '30代', '40代', '50代', '60代', '70代以上'].map((band) => (
                    <option key={band}>{band}</option>
                  ))}
                </select>
              </label>
            )}
            <p>年代に合った例を出しやすくなります。年代で決めつけた提案になる場合があります。</p>
            <label>
              <input
                type="checkbox"
                checked={jobChecked}
                onChange={(event) => setJobChecked(event.target.checked)}
              />
              業種・職種
            </label>
            {jobChecked && (
              <label>
                業種・職種
                <input
                  maxLength={80}
                  value={industryJob}
                  onChange={(event) => setIndustryJob(event.target.value)}
                />
              </label>
            )}
            <p>仕事に合った練習テーマを出せます。</p>
          </fieldset>
          <div className="service-entry__actions">
            <button type="button" disabled={busyId !== ''} onClick={() => void saveProfile()}>
              入力項目を保存
            </button>
            <button type="button" disabled={busyId !== ''} onClick={() => void setEnabled(true)}>
              使う
            </button>
            <button type="button" disabled={busyId !== ''} onClick={() => void dismissInvitation()}>
              今は使わない（30日間閉じる）
            </button>
          </div>
        </section>
      )}
      {profile.optedIn && (
        <section aria-labelledby="persona-consent-status">
          <h2 id="persona-consent-status">学び方に合わせたサポート：利用中</h2>
          <p>保存済みの推測や入力内容は、同じサービス内のあなたの研修にだけ使われます。</p>
          <button type="button" disabled={busyId !== ''} onClick={() => void setEnabled(false)}>
            利用を停止する
          </button>
          <fieldset>
            <legend>本人が入力した項目（チェックを外すと削除します）</legend>
            <label>
              <input
                type="checkbox"
                checked={companyChecked}
                onChange={(event) => setCompanyChecked(event.target.checked)}
              />
              勤務先の会社名
            </label>
            {companyChecked && (
              <label>
                会社名
                <input
                  maxLength={80}
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                />
              </label>
            )}
            <label>
              <input
                type="checkbox"
                checked={ageChecked}
                onChange={(event) => setAgeChecked(event.target.checked)}
              />
              年代
            </label>
            {ageChecked && (
              <label>
                年代
                <select value={ageBand} onChange={(event) => setAgeBand(event.target.value)}>
                  <option value="">選択してください</option>
                  {['20代', '30代', '40代', '50代', '60代', '70代以上'].map((band) => (
                    <option key={band}>{band}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              <input
                type="checkbox"
                checked={jobChecked}
                onChange={(event) => setJobChecked(event.target.checked)}
              />
              業種・職種
            </label>
            {jobChecked && (
              <label>
                業種・職種
                <input
                  maxLength={80}
                  value={industryJob}
                  onChange={(event) => setIndustryJob(event.target.value)}
                />
              </label>
            )}
            <button type="button" disabled={busyId !== ''} onClick={() => void saveProfile()}>
              入力内容を保存
            </button>
          </fieldset>
        </section>
      )}
      <h2 id="persona-items-title">AIが理解していること</h2>
      <p>
        項目ごとに、元の記録を確認してから扱いを選べます。確認前の項目にも「AIによる推測」と表示します。
      </p>
      {error && <p role="alert">{error}</p>}
      {items.length === 0 && (
        <p>
          確認できる本人像はまだありません。今後、学習記録から推測された項目がここに表示されます。
        </p>
      )}
      <ul className="service-entry__list">
        {items.map((item) => {
          return (
            <li key={item.id} className="service-entry__card">
              <p>
                <strong>{item.attributeKey}</strong>
              </p>
              <label>
                <span>{item.status === 'CONFIRMED' ? '本人が確認した内容' : 'AIによる推測'}</span>
                <textarea
                  value={drafts[item.id] ?? item.value}
                  maxLength={1000}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [item.id]: event.target.value }))
                  }
                  aria-label={`${item.attributeKey}の内容`}
                />
              </label>
              <p>
                状態：{statusLabel[item.status] ?? '未確認'} ・ 根拠：
                {evidenceLabel[item.evidenceType] ?? '学習記録'}（
                {new Date(item.evidenceCreatedAt).toLocaleDateString('ja-JP')}）
              </p>
              {item.evidenceType === 'LEARNER_INPUT' ? (
                <p>本人が入力した内容です。</p>
              ) : item.evidenceHref ? (
                <a href={item.evidenceHref}>根拠になった学習テーマの記録を開く</a>
              ) : (
                <p>根拠の記録は現在表示できません。記録が受講範囲内にない可能性があります。</p>
              )}
              <div className="service-entry__actions">
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void update(item, { value: drafts[item.id] ?? item.value })}
                >
                  修正して確認
                </button>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() =>
                    void update(item, { value: drafts[item.id] ?? item.value, status: 'CONFIRMED' })
                  }
                >
                  この内容で確認
                </button>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void update(item, { status: 'REJECTED' })}
                >
                  違う
                </button>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void remove(item)}
                >
                  削除
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {items.some((item) => item.status === 'REJECTED') && (
        <p>「違う」とした項目は、次のAI呼び出しには渡しません。</p>
      )}
      {suppressedAttributes.length > 0 && (
        <section aria-labelledby="persona-suppressed-title">
          <h3 id="persona-suppressed-title">再推測しない項目</h3>
          <p>
            削除した項目の内容は保存されず、AIに渡されません。許可すると、今後の推測対象に戻ります。
          </p>
          <ul className="service-entry__list">
            {suppressedAttributes.map((attributeKey) => (
              <li key={attributeKey} className="service-entry__card">
                <p>{attributeKey}</p>
                <button
                  type="button"
                  disabled={busyId === attributeKey}
                  onClick={() => void allowReinference(attributeKey)}
                >
                  今後の再推測を許可
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
