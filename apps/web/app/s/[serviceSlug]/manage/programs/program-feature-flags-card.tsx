'use client';

import { useState } from 'react';

type Features = {
  conversation: boolean;
  multiTopic: boolean;
  lineLearning: boolean;
  extendedScope: boolean;
  learningNudges: boolean;
  toolUpdates: boolean;
};
type LearningMode = 'DYNAMIC_V1' | 'FIXED_DEFINITIONS_V1';
type OfferPolicy = 'AI_SKILL_V1' | 'SIDE_HUSTLE_V1' | null;
type ProgramOption = {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  learningMode: LearningMode | null;
  learningFeatures: Features | null;
  enabled: boolean;
  configurationValid: boolean;
  learningOfferPolicy: OfferPolicy;
  hasEnrollments: boolean;
};

const defaults: Features = {
  conversation: false,
  multiTopic: false,
  lineLearning: false,
  extendedScope: false,
  learningNudges: false,
  toolUpdates: false,
};
const featureRows: { key: keyof Features; label: string; description: string }[] = [
  {
    key: 'conversation',
    label: '本人との対話',
    description: '受講者が提案への追加質問や実践中の相談を同じスレッドで続けます。',
  },
  {
    key: 'multiTopic',
    label: '複数テーマ学習',
    description: '目標・計画・会話をテーマごとに分けて管理します。',
  },
  {
    key: 'lineLearning',
    label: 'LINE学習',
    description: 'LINEから届いた本文や画像を使った学習を有効にします。',
  },
  {
    key: 'extendedScope',
    label: '拡張支援範囲',
    description: 'AIの実践支援で扱う範囲を広げます。',
  },
  {
    key: 'learningNudges',
    label: '学習の声かけ',
    description: '受講状況に応じた学習の声かけを有効にします。',
  },
  {
    key: 'toolUpdates',
    label: 'AIツールの公式更新情報',
    description: '承認済みの公式更新情報を、申告ツールと学習テーマに沿う提案の参考にします。',
  },
];
const isFeatures = (value: unknown): value is Features =>
  !!value &&
  typeof value === 'object' &&
  Object.keys(defaults).every(
    (key) => typeof (value as Record<string, unknown>)[key] === 'boolean',
  );

export function ProgramFeatureFlagsCard({
  serviceSlug,
  initialPrograms,
}: {
  serviceSlug: string;
  initialPrograms: ProgramOption[];
}) {
  const [programs, setPrograms] = useState(initialPrograms);
  const [selectedId, setSelectedId] = useState(initialPrograms[0]?.id ?? '');
  const selected = programs.find((program) => program.id === selectedId) ?? null;
  const [learningMode, setLearningMode] = useState<LearningMode>(
    selected?.learningMode ?? 'FIXED_DEFINITIONS_V1',
  );
  const [features, setFeatures] = useState<Features>(selected?.learningFeatures ?? defaults);
  const [offerPolicy, setOfferPolicy] = useState<OfferPolicy>(
    selected?.learningOfferPolicy ?? 'AI_SKILL_V1',
  );
  const [evidence, setEvidence] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('対象Programを選び、現在値を確認してください。');

  const endpoint = `/api/services/${encodeURIComponent(serviceSlug)}/manage/programs/feature-flags`;
  const canEdit =
    (selected?.status === 'DRAFT' || selected?.status === 'SUSPENDED') &&
    !selected.enabled &&
    selected.configurationValid &&
    selected.learningFeatures !== null &&
    selected.learningMode !== null;
  const changed =
    !!selected &&
    (learningMode !== selected.learningMode ||
      JSON.stringify(features) !== JSON.stringify(selected.learningFeatures));
  const policyChanged = !!selected && offerPolicy !== selected.learningOfferPolicy;
  const evidenceValid = /^[a-zA-Z0-9_.:-]{1,100}$/.test(evidence);
  const sideHustleMultiTopicInvalid = offerPolicy === 'SIDE_HUSTLE_V1' && !features.multiTopic;

  function chooseProgram(id: string) {
    const next = programs.find((program) => program.id === id);
    setSelectedId(id);
    setLearningMode(next?.learningMode ?? 'FIXED_DEFINITIONS_V1');
    setFeatures(next?.learningFeatures ?? defaults);
    setOfferPolicy(next?.learningOfferPolicy ?? 'AI_SKILL_V1');
    setEvidence('');
    setConfirmed(false);
    setMessage('選択したProgramの状態を表示しています。');
  }

  async function reload() {
    setBusy(true);
    try {
      const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('読み込みに失敗しました。ページを再読み込みしてください。');
      const body = (await response.json()) as { data?: unknown };
      if (!Array.isArray(body.data)) throw new Error('応答を確認できませんでした。');
      const next = body.data as ProgramOption[];
      setPrograms(next);
      const id = next.some((program) => program.id === selectedId)
        ? selectedId
        : (next[0]?.id ?? '');
      chooseProgramFrom(next, id);
      setMessage('Programの最新状態を読み込みました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '状態を確認できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  function chooseProgramFrom(values: ProgramOption[], id: string) {
    const next = values.find((program) => program.id === id);
    setSelectedId(id);
    setLearningMode(next?.learningMode ?? 'FIXED_DEFINITIONS_V1');
    setFeatures(next?.learningFeatures ?? defaults);
    setOfferPolicy(next?.learningOfferPolicy ?? 'AI_SKILL_V1');
    setEvidence('');
    setConfirmed(false);
  }

  async function save() {
    if (
      !selected ||
      !canEdit ||
      (!changed && !policyChanged) ||
      !confirmed ||
      !evidenceValid ||
      busy
    )
      return;
    setBusy(true);
    setMessage('設定を保存し、保存後の状態を確認しています。');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          serviceProgramId: selected.id,
          expectedUpdatedAt: selected.updatedAt,
          learningMode,
          learningFeatures: features,
          learningOfferPolicy: offerPolicy,
          reviewEvidenceKey: evidence,
          confirmation: 'CONFIRM_PROGRAM_FEATURE_SETTINGS',
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        data?: unknown;
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.data || typeof body.data !== 'object') {
        if (response.status === 409) await reload();
        throw new Error(
          response.status === 409
            ? 'Programの状態が変わっていました。最新値を再表示しました。内容を確認してください。'
            : (body?.error?.message ?? '保存できませんでした。最新状態を確認してください。'),
        );
      }
      const updated = body.data as ProgramOption;
      if (
        updated.id !== selected.id ||
        updated.learningMode !== learningMode ||
        updated.learningOfferPolicy !== offerPolicy ||
        !isFeatures(updated.learningFeatures) ||
        JSON.stringify(updated.learningFeatures) !== JSON.stringify(features)
      )
        throw new Error('保存結果が入力内容と一致しません。再読み込みして確認してください。');
      setPrograms((current) =>
        current.map((program) => (program.id === updated.id ? updated : program)),
      );
      setLearningMode(updated.learningMode ?? 'FIXED_DEFINITIONS_V1');
      setFeatures(updated.learningFeatures);
      setOfferPolicy(updated.learningOfferPolicy);
      setEvidence('');
      setConfirmed(false);
      setMessage('選択したProgramだけに保存しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存結果を確認できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="card stack program-feature-flags"
      aria-labelledby="program-feature-flags-title"
    >
      <h2 id="program-feature-flags-title">AI研修Programごとの機能設定</h2>
      <p className="program-feature-flags__intro">
        サービス内のAI研修Programを選び、機能を個別に設定します。変更は選択したProgramだけに保存され、他のProgramには影響しません。システム全体の停止設定がOFFの場合、ここをONにしても機能は実行されません。
      </p>
      {programs.length === 0 ? (
        <p className="program-feature-flags__empty">このサービスにはAI研修Programがありません。</p>
      ) : (
        <>
          <label className="program-feature-flags__field">
            対象Program
            <select
              className="program-feature-flags__control"
              value={selectedId}
              disabled={busy}
              onChange={(event) => chooseProgram(event.target.value)}
            >
              {programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}（{program.status}）
                </option>
              ))}
            </select>
          </label>
          <button
            className="program-feature-flags__button program-feature-flags__button--secondary"
            type="button"
            disabled={busy}
            onClick={() => void reload()}
          >
            最新状態を再読み込み
          </button>
          <p className="program-feature-flags__status" role="status">
            {message}
          </p>
          {selected && (
            <>
              <div className="program-feature-flags__summary" aria-label="選択したProgramの状態">
                <span>
                  Program状態 <strong>{selected.status}</strong>
                </span>
                <span>
                  全体実行 <strong>{selected.enabled ? 'ON' : 'OFF'}</strong>
                </span>
                <span>
                  学習モード <strong>{selected.learningMode ?? '設定不正'}</strong>
                </span>
              </div>
              {!selected.configurationValid && (
                <p role="alert">設定形式を確認できないため、このProgramは変更できません。</p>
              )}
              <fieldset className="stack" disabled={!canEdit || busy}>
                <legend>機能スイッチ（下書き・停止中のみ変更可能）</legend>
                <p className="program-feature-flags__hint">
                  スイッチを変更しただけでは反映されません。内容を確認し、下の保存ボタンを押してください。
                </p>
                <label className="program-feature-flags__field">
                  学習モード
                  <select
                    className="program-feature-flags__control"
                    value={learningMode}
                    onChange={(event) => setLearningMode(event.target.value as LearningMode)}
                  >
                    <option value="FIXED_DEFINITIONS_V1">固定Definition方式</option>
                    <option value="DYNAMIC_V1">動的学習方式</option>
                  </select>
                </label>
                {featureRows.map(({ key, label, description }) => (
                  <div key={key} className="program-feature-flags__row">
                    <label
                      className="program-feature-flags__toggle-label"
                      htmlFor={`feature-${key}`}
                    >
                      <span className="program-feature-flags__toggle-copy">
                        <strong>{label}</strong>
                        <span>{description}</span>
                      </span>
                      <span
                        className={`program-feature-flags__state${features[key] ? ' is-on' : ''}`}
                      >
                        {features[key] ? 'ON' : 'OFF'}
                      </span>
                    </label>
                    <input
                      id={`feature-${key}`}
                      className="program-feature-flags__switch"
                      type="checkbox"
                      role="switch"
                      checked={features[key]}
                      disabled={
                        !canEdit ||
                        busy ||
                        (key === 'multiTopic' &&
                          offerPolicy === 'SIDE_HUSTLE_V1' &&
                          features.multiTopic)
                      }
                      onChange={() =>
                        setFeatures((current) => ({ ...current, [key]: !current[key] }))
                      }
                      aria-label={`${label}を${features[key] ? 'OFF' : 'ON'}にする`}
                    />
                  </div>
                ))}
              </fieldset>
              {sideHustleMultiTopicInvalid && (
                <p role="alert">副業支援では、複数テーマの機能が必要です</p>
              )}
              <label className="program-feature-flags__field">
                提供方針
                <select
                  className="program-feature-flags__control"
                  value={offerPolicy ?? 'AI_SKILL_V1'}
                  disabled={!canEdit || busy || selected.hasEnrollments}
                  onChange={(event) => setOfferPolicy(event.target.value as OfferPolicy)}
                >
                  <option value="AI_SKILL_V1">AI研修（既定）</option>
                  <option value="SIDE_HUSTLE_V1">副業支援</option>
                </select>
              </label>
              {selected.hasEnrollments && (
                <p className="program-feature-flags__hint">受講者がいるため変更できません</p>
              )}
              {!canEdit && selected.configurationValid && (
                <p>設定の変更には、対象Programを下書きまたは停止状態にしてください。</p>
              )}
              <label className="program-feature-flags__field">
                設定変更のレビュー記録ID（本文や秘密情報は入力しない）
                <input
                  type="text"
                  className="program-feature-flags__control"
                  value={evidence}
                  maxLength={100}
                  disabled={busy}
                  onChange={(event) => setEvidence(event.target.value)}
                  placeholder="例：review-2026-001"
                  autoComplete="off"
                />
                <span className="program-feature-flags__hint">
                  半角英数字と _ . : - が使えます。変更理由の文章や秘密情報は入力しないでください。
                </span>
              </label>
              <label className="program-feature-flags__confirmation">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>対象Programと変更内容を確認しました</span>
              </label>
              <button
                className="program-feature-flags__button program-feature-flags__button--primary"
                type="button"
                disabled={
                  !canEdit || (!changed && !policyChanged) || !confirmed || !evidenceValid || busy
                }
                onClick={() => void save()}
              >
                選択したProgramの設定を保存
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
