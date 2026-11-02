'use client';
import { useEffect, useRef, useState } from 'react';
import {
  approvalCommand,
  definitionTitles,
  loadDefinitionReviews,
  reviewKeys,
  reviewLabels,
  reviewReady,
  submitDefinitionApproval,
  type DefinitionApprovalCommand,
  type DefinitionReview,
  type ReviewKey,
} from './client';

function Points({ values }: { values: readonly string[] }) {
  return (
    <ul>
      {values.map((v, i) => (
        <li key={i}>{v}</li>
      ))}
    </ul>
  );
}
export function DefinitionReviewCard({ serviceSlug }: { serviceSlug: string }) {
  return <DefinitionReviewSession key={serviceSlug} serviceSlug={serviceSlug} />;
}
function DefinitionReviewSession({ serviceSlug }: { serviceSlug: string }) {
  const [items, setItems] = useState<DefinitionReview[] | null>(null);
  const [selected, setSelected] = useState('');
  const [checks, setChecks] = useState<Partial<Record<ReviewKey, boolean>>>({});
  const [busy, setBusy] = useState(true);
  const [retry, setRetry] = useState(false);
  const [message, setMessage] = useState('現在の定義と承認状態を取得しています。');
  const lock = useRef(false);
  const pending = useRef<DefinitionApprovalCommand | null>(null);
  useEffect(() => {
    let active = true;
    void loadDefinitionReviews(serviceSlug)
      .then((current) => {
        if (!active) return;
        if (!current) throw new Error('unavailable');
        setItems(current);
        setMessage('現在の状態を取得しました。1件ずつ内容を確認してください。');
      })
      .catch(() => {
        if (active)
          setMessage('状態を取得できませんでした。再取得するか、担当者に確認してください。');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [serviceSlug]);
  const item = items?.find((i) => i.definition.reference.definitionKey === selected) ?? null;
  function resetReview() {
    setChecks({});
  }
  async function refresh() {
    if (lock.current || pending.current) return;
    lock.current = true;
    setBusy(true);
    setItems(null);
    setSelected('');
    resetReview();
    try {
      const current = await loadDefinitionReviews(serviceSlug);
      if (!current) throw new Error('unavailable');
      setItems(current);
      setMessage('現在の状態を取得しました。1件ずつ内容を確認してください。');
    } catch {
      setMessage(
        '状態を確認できませんでした。権限・停止状態・承認操作の設定を担当者に確認してください。',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function submit() {
    if (lock.current) return;
    if (busy) return;
    const command = pending.current ?? approvalCommand(item, checks);
    if (!command) return;
    pending.current = command;
    lock.current = true;
    setBusy(true);
    setRetry(false);
    const result = await submitDefinitionApproval(serviceSlug, command);
    if (result === 'RETRY') {
      lock.current = false;
      setBusy(false);
      setRetry(true);
      setMessage('結果が不明です。同じ操作だけを再送して確認してください。');
      return;
    }
    pending.current = null;
    setItems(null);
    setSelected(result === 'RECEIVED' ? command.definitionKey : '');
    resetReview();
    try {
      const current = await loadDefinitionReviews(serviceSlug);
      if (!current) throw new Error('unavailable');
      setItems(current);
      const approved =
        current.find((i) => i.definition.reference.definitionKey === command.definitionKey)?.current
          ?.approvalStatus === 'APPROVED';
      setMessage(
        result === 'RECEIVED'
          ? approved
            ? '承認登録の応答を受信し、現在も承認済みであることを確認しました。Pilotは開始しません。'
            : '承認登録の応答を受信しましたが、現在は承認済みではありません。現在の状態を確認してください。'
          : '登録は受理されませんでした。現在の状態を取得しました。内容を改めてレビューしてください。',
      );
    } catch {
      setMessage(
        result === 'RECEIVED'
          ? '承認登録の応答は受信しましたが、現在の状態を確認できません。状態を再取得してください。承認を再送する必要はありません。'
          : '登録は受理されませんでした。現在の状態も取得できません。状態を再取得してください。',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="card stack">
      <h2>学習設計の人間レビュー</h2>
      <p>
        マナベルスタイル by
        ワタシワークス。停止中のPilotの3件だけを、1件ずつ承認登録します。自動承認・一括承認は行いません。
      </p>
      <p>この操作はPilot開始、参加者登録、通知、AI呼び出しの承認ではありません。</p>
      <p role="status">{message}</p>
      <button
        className="button button--secondary"
        type="button"
        disabled={busy || retry}
        onClick={() => void refresh()}
      >
        状態を再取得
      </button>
      {items && !retry && (
        <>
          <ul>
            {items.map((i) => (
              <li key={i.definition.reference.definitionKey}>
                {definitionTitles[i.definition.reference.definitionKey]}：
                {i.current?.approvalStatus === 'APPROVED'
                  ? '承認済み'
                  : i.current?.approvalStatus === 'DEPRECATED'
                    ? '利用停止'
                    : '未承認'}
                {i.current?.approvedAt && `（承認日時 ${i.current.approvedAt}）`}
              </li>
            ))}
          </ul>
          <label className="field">
            レビューする学習設計
            <select
              className="field__control"
              value={selected}
              disabled={busy}
              onChange={(e) => {
                setSelected(e.target.value);
                resetReview();
              }}
            >
              <option value="">選択してください</option>
              {items.map((i) => (
                <option
                  key={i.definition.reference.definitionKey}
                  value={i.definition.reference.definitionKey}
                >
                  {definitionTitles[i.definition.reference.definitionKey]}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {item && !retry && (
        <>
          <h3>{definitionTitles[item.definition.reference.definitionKey]}</h3>
          <p>対象版：{item.definition.reference.version}</p>
          <h4>学習目的</h4>
          <p>{item.definition.learningObjective}</p>
          <h4>前提となる学習</h4>
          <p>
            {item.definition.prerequisites
              .map((r) => definitionTitles[r.definitionKey])
              .join(' → ') || 'なし'}
          </p>
          <h4>学ぶ要点</h4>
          <Points values={item.definition.coreConcepts} />
          <h4>安全・学習の境界</h4>
          <Points values={item.definition.safetyBoundary} />
          <h4>よくある間違い</h4>
          <Points values={item.definition.commonMistakes} />
          <h4>本人が行う練習</h4>
          <p>{item.definition.practicePattern}</p>
          <h4>既存課題と評価</h4>
          <p>課題：{item.mission.task}</p>
          <Points values={item.mission.constraints} />
          <Points values={item.mission.successCriteria} />
          <Points values={item.mission.evaluationCriteria} />
          <p>
            対象Skill：
            {item.definition.targetSkillRefs.map((s) => `${s.skillKey} (${s.version})`).join('、')}
            。課題で評価するSkill：{item.mission.skillKeys.join('、')}。
          </p>
          <p>
            Mission：{item.mission.key} / Rubric版：{item.definition.evaluationRubricRef.version} /
            Router版：{item.routerRuleVersion}
          </p>
          <p>
            構造と背景は同じ課題を使い、注目する点を変えます。背景専用の課題・学習目的ではありません。条件の課題でも背景を確認します。
          </p>
          <p>
            次へ進むには版と学習計画が一致する本人の回答・評価証跡、PASS、課題完了、理解度60以上、評価した全Skillが60以上を必要とします。未評価・不明なら進みません。プラン完了は能力習得や研修修了を意味しません。
          </p>
          <p>
            独立した教え方の自動生成はありません。本人が指示を作り、AIの結果を確認する学習です。
          </p>
          {item.current?.approvalStatus === 'APPROVED' ? (
            <p>この版は承認済みです。この画面では撤回・上書きしません。</p>
          ) : (
            <>
              <fieldset disabled={busy} className="stack">
                <legend>7項目を本人が確認してください</legend>
                {reviewKeys.map((k) => (
                  <label key={k} className="check-row">
                    <input
                      type="checkbox"
                      checked={checks[k] === true}
                      onChange={(e) => {
                        setChecks({ ...checks, [k]: e.target.checked });
                      }}
                    />
                    {reviewLabels[k]}を確認した
                  </label>
                ))}
              </fieldset>
              <p>
                {item.provenance.reviewedCommitSha
                  ? '対象版とシステムの来歴を自動記録します。内容を確認したら、この1件を承認してください。'
                  : 'システムの来歴を取得できないため承認できません。環境担当者に公開コード情報の確認を依頼してください。'}
              </p>
              <button
                className="button button--primary"
                type="button"
                disabled={busy || !reviewReady(item, checks)}
                onClick={() => void submit()}
              >
                この1件の承認を登録
              </button>
            </>
          )}
        </>
      )}
      {retry && (
        <>
          <button
            className="button button--secondary"
            type="button"
            disabled={busy}
            onClick={() => void submit()}
          >
            同じ操作を再送して確認
          </button>
          <p>
            ページを離れると再送情報は失われます。再読込後は状態確認だけを行い、結果が不明なまま新しい承認を繰り返さないでください。
          </p>
        </>
      )}
    </section>
  );
}
