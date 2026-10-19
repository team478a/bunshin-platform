'use client';

import { useState } from 'react';

type Features = {
  conversation: boolean;
  multiTopic: boolean;
  lineLearning: boolean;
  extendedScope: boolean;
  learningNudges: boolean;
};
type LearningMode = 'DYNAMIC_V1' | 'FIXED_DEFINITIONS_V1';
type ProgramOption = {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  learningMode: LearningMode | null;
  learningFeatures: Features | null;
  enabled: boolean;
  configurationValid: boolean;
};

const defaults: Features = {
  conversation: false,
  multiTopic: false,
  lineLearning: false,
  extendedScope: false,
  learningNudges: false,
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
  const evidenceValid = /^[a-zA-Z0-9_.:-]{1,100}$/.test(evidence);

  function chooseProgram(id: string) {
    const next = programs.find((program) => program.id === id);
    setSelectedId(id);
    setLearningMode(next?.learningMode ?? 'FIXED_DEFINITIONS_V1');
    setFeatures(next?.learningFeatures ?? defaults);
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
    setEvidence('');
    setConfirmed(false);
  }

  async function save() {
    if (!selected || !canEdit || !changed || !confirmed || !evidenceValid || busy) return;
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
        !isFeatures(updated.learningFeatures) ||
        JSON.stringify(updated.learningFeatures) !== JSON.stringify(features)
      )
        throw new Error('保存結果が入力内容と一致しません。再読み込みして確認してください。');
      setPrograms((current) =>
        current.map((program) => (program.id === updated.id ? updated : program)),
      );
      setLearningMode(updated.learningMode ?? 'FIXED_DEFINITIONS_V1');
      setFeatures(updated.learningFeatures);
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
    <section className="card stack" aria-labelledby="program-feature-flags-title">
      <h2 id="program-feature-flags-title">AI研修Programごとの機能設定</h2>
      <p>
        サービス内のAI研修Programを選び、機能を個別に設定します。変更は選択したProgramだけに保存され、他のProgramには影響しません。システム全体の停止設定がOFFの場合、ここをONにしても機能は実行されません。
      </p>
      {programs.length === 0 ? (
        <p>このサービスにはAI研修Programがありません。</p>
      ) : (
        <>
          <label>
            対象Program
            <select
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
          <button type="button" disabled={busy} onClick={() => void reload()}>
            最新状態を再読み込み
          </button>
          <p role="status">{message}</p>
          {selected && (
            <>
              <p>
                Program状態: {selected.status} / 全体実行: {selected.enabled ? 'ON' : 'OFF'} /
                学習モード: {selected.learningMode ?? '設定不正'}
              </p>
              {!selected.configurationValid && (
                <p role="alert">設定形式を確認できないため、このProgramは変更できません。</p>
              )}
              <fieldset className="stack" disabled={!canEdit || busy}>
                <legend>機能スイッチ（下書き・停止中のみ変更可能）</legend>
                <label>
                  学習モード
                  <select
                    value={learningMode}
                    onChange={(event) => setLearningMode(event.target.value as LearningMode)}
                  >
                    <option value="FIXED_DEFINITIONS_V1">固定Definition方式</option>
                    <option value="DYNAMIC_V1">動的学習方式</option>
                  </select>
                </label>
                {featureRows.map(({ key, label, description }) => (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '1rem',
                    }}
                  >
                    <div>
                      <strong>{label}</strong>
                      <p style={{ margin: '0.25rem 0' }}>{description}</p>
                      <span>{features[key] ? 'ON' : 'OFF'}</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-label={label}
                      aria-checked={features[key]}
                      disabled={!canEdit || busy}
                      onClick={() =>
                        setFeatures((current) => ({ ...current, [key]: !current[key] }))
                      }
                      style={{
                        flex: '0 0 auto',
                        width: '3.25rem',
                        height: '1.875rem',
                        padding: '0.1875rem',
                        border: 0,
                        borderRadius: '999px',
                        background: features[key] ? '#4f46e5' : '#737373',
                        cursor: !canEdit || busy ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          display: 'block',
                          width: '1.5rem',
                          height: '1.5rem',
                          borderRadius: '50%',
                          background: 'white',
                          transform: features[key] ? 'translateX(1.375rem)' : 'translateX(0)',
                          transition: 'transform 120ms ease',
                        }}
                      />
                    </button>
                  </div>
                ))}
              </fieldset>
              {!canEdit && selected.configurationValid && (
                <p>設定の変更には、対象Programを下書きまたは停止状態にしてください。</p>
              )}
              <label>
                設定変更のレビュー記録ID（本文や秘密情報は入力しない）
                <input
                  value={evidence}
                  maxLength={100}
                  disabled={busy}
                  onChange={(event) => setEvidence(event.target.value)}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                対象Programと変更内容を確認しました
              </label>
              <button
                type="button"
                disabled={!canEdit || !changed || !confirmed || !evidenceValid || busy}
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
