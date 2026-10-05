'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TRAINING_SUPPORT_SKILL_ROLLBACK_AXES } from '@bunshin/capability-training';
import { PublicShell } from '../../../../../ui/public-shell';

type SkillState = {
  skill: {
    skillId: string;
    skillKey: string;
    operationalStatus: 'ACTIVE' | 'SUSPENDED' | 'RETIRED';
    currentVersionId: string | null;
    revision: number;
    scope: {
      programTemplateVersionId: string;
      missionDefinitionKey: string;
      learningObjectiveKey: string;
      assignmentVariant: 'STANDARD' | 'SHORT';
    };
    updatedAt: string;
  };
  versions: Array<{
    skillVersionId: string;
    version: number;
    disposition: 'APPROVED' | 'ACTIVE' | 'DEPRECATED' | 'REVOKED';
    steps: readonly string[];
    expectedOutput: string;
    validationPolicyVersion: string;
    approvedAt: string;
  }>;
  events: Array<{
    operationId: string;
    operation: string;
    reasonCode: string;
    occurredAt: string;
  }>;
};

type Preview = { expectedRevision: number; nextVersion: number; scope: unknown };

async function request(endpoint: string, payload: unknown) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as { data?: unknown; message?: string; error?: string };
  if (!response.ok) throw new Error(body.message ?? body.error ?? '操作に失敗しました');
  return body.data as Record<string, unknown>;
}

function SkillCard({
  endpoint,
  state,
  onChanged,
}: {
  endpoint: string;
  state: SkillState;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const candidates = state.versions.filter(
    (version) =>
      version.disposition !== 'REVOKED' && version.skillVersionId !== state.skill.currentVersionId,
  );
  const [rollbackVersionId, setRollbackVersionId] = useState(candidates[0]?.skillVersionId ?? '');
  const [compatibility, setCompatibility] = useState(
    Object.fromEntries(
      TRAINING_SUPPORT_SKILL_ROLLBACK_AXES.map((axis) => [axis, 'UNKNOWN']),
    ) as Record<(typeof TRAINING_SUPPORT_SKILL_ROLLBACK_AXES)[number], string>,
  );

  async function mutate(payload: Record<string, unknown>, prompt: string) {
    if (!window.confirm(prompt)) return;
    setBusy(true);
    setMessage('');
    try {
      await request(endpoint, payload);
      setMessage('保存しました。');
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="settings-card">
      <h2>{state.skill.skillKey}</h2>
      <p>
        状態: <strong>{state.skill.operationalStatus}</strong> / revision {state.skill.revision}
      </p>
      <p>
        {state.skill.scope.missionDefinitionKey} ・ {state.skill.scope.learningObjectiveKey} ・{' '}
        {state.skill.scope.assignmentVariant}
      </p>
      <p>承認済みversionは自動配信されません。有効化も提示も別の操作です。</p>
      {state.versions.map((version) => (
        <section key={version.skillVersionId} className="training-admin__participant">
          <h3>
            version {version.version} — {version.disposition}
          </h3>
          <ol>
            {version.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p>期待する出力: {version.expectedOutput}</p>
          {version.disposition !== 'REVOKED' &&
          version.skillVersionId !== state.skill.currentVersionId ? (
            <button
              className="button"
              disabled={busy || state.skill.operationalStatus === 'RETIRED'}
              onClick={() =>
                void mutate(
                  {
                    action: 'ACTIVATE',
                    skillId: state.skill.skillId,
                    skillVersionId: version.skillVersionId,
                    expectedRevision: state.skill.revision,
                    idempotencyKey: crypto.randomUUID(),
                    confirmation: 'ACTIVATE_SKILL_VERSION',
                  },
                  `version ${version.version} を明示的に有効化しますか？`,
                )
              }
              type="button"
            >
              このversionを有効化
            </button>
          ) : null}
        </section>
      ))}

      {state.skill.operationalStatus === 'ACTIVE' ? (
        <button
          className="button button--secondary"
          disabled={busy}
          onClick={() =>
            void mutate(
              {
                action: 'SUSPEND',
                skillId: state.skill.skillId,
                expectedRevision: state.skill.revision,
                idempotencyKey: crypto.randomUUID(),
                reasonCode: 'MANUAL_OPERATIONAL_STOP',
                confirmation: 'SUSPEND_SKILL',
              },
              'このSkillの新規適用を停止しますか？履歴は削除されません。',
            )
          }
          type="button"
        >
          Skillを停止
        </button>
      ) : null}

      {candidates.length > 0 && state.skill.operationalStatus !== 'RETIRED' ? (
        <section>
          <h3>Rollback互換性レビュー</h3>
          <p>
            既定値は全てUNKNOWNです。現在のProgram・Mission・学習目的・variant・検証方針を人が確認してください。
          </p>
          <label>
            対象version
            <select
              value={rollbackVersionId}
              onChange={(event) => setRollbackVersionId(event.target.value)}
            >
              {candidates.map((version) => (
                <option key={version.skillVersionId} value={version.skillVersionId}>
                  version {version.version}
                </option>
              ))}
            </select>
          </label>
          {TRAINING_SUPPORT_SKILL_ROLLBACK_AXES.map((axis) => (
            <label key={axis}>
              {axis}
              <select
                value={compatibility[axis]}
                onChange={(event) =>
                  setCompatibility((current) => ({ ...current, [axis]: event.target.value }))
                }
              >
                <option value="UNKNOWN">UNKNOWN（未確認）</option>
                <option value="BLOCKED">BLOCKED（不適合）</option>
                <option value="PASSED">PASSED（確認済み）</option>
              </select>
            </label>
          ))}
          <button
            className="button button--secondary"
            disabled={
              busy ||
              !rollbackVersionId ||
              Object.values(compatibility).some((value) => value !== 'PASSED')
            }
            onClick={() =>
              void mutate(
                {
                  action: 'ROLLBACK',
                  skillId: state.skill.skillId,
                  skillVersionId: rollbackVersionId,
                  expectedRevision: state.skill.revision,
                  idempotencyKey: crypto.randomUUID(),
                  reasonCode: 'MANUAL_VERSION_RESTORE',
                  compatibility,
                  confirmation: 'ROLLBACK_SKILL_VERSION',
                },
                '5軸の確認結果を監査記録へ保存し、このversionへrollbackしますか？',
              )
            }
            type="button"
          >
            確認済みversionへRollback
          </button>
        </section>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </article>
  );
}

export function TrainingSupportSkillAdmin({
  serviceSlug,
  initialSkills,
}: {
  serviceSlug: string;
  initialSkills: SkillState[];
}) {
  const router = useRouter();
  const endpoint = `/api/services/${encodeURIComponent(serviceSlug)}/training-support-skills`;
  const [reviewText, setReviewText] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewSource, setPreviewSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function previewReview() {
    setBusy(true);
    setMessage('');
    setPreview(null);
    try {
      const reviewPackage = JSON.parse(reviewText) as unknown;
      const data = await request(endpoint, { action: 'PREVIEW', reviewPackage });
      setPreview(data as unknown as Preview);
      setPreviewSource(reviewText);
      setMessage('検証済みです。内容を確認してから承認してください。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'プレビューに失敗しました');
    } finally {
      setBusy(false);
    }
  }

  async function approveReview() {
    if (!preview || previewSource !== reviewText) return;
    if (
      !window.confirm(
        `元のProblemとversion ${preview.nextVersion} を人間レビュー済みとして承認しますか？自動有効化はされません。`,
      )
    )
      return;
    setBusy(true);
    setMessage('');
    try {
      const reviewPackage = JSON.parse(reviewText) as unknown;
      await request(endpoint, {
        action: 'APPROVE',
        reviewPackage,
        expectedRevision: preview.expectedRevision,
        idempotencyKey: crypto.randomUUID(),
        confirmation: 'APPROVE_PROBLEM_AND_SKILL_VERSION',
      });
      setPreview(null);
      setMessage('承認済みversionを保存しました。停止状態のままです。');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '承認に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page training-admin">
        <header className="app-page__heading">
          <p className="eyebrow">AI研修 / Human Approval</p>
          <h1>支援Skillの承認と停止</h1>
          <p>
            review
            packageを実データと再照合し、承認・有効化・停止・rollbackを別々に記録します。この画面から参加者への提示や外部AI実行は行いません。
          </p>
          <Link href={`/s/${serviceSlug}/manage/training` as Route}>← AI研修管理へ戻る</Link>
        </header>

        <section className="settings-card">
          <h2>新しいversionをレビュー</h2>
          <p>
            Skill Factory V1のreview package
            JSONを貼り付けます。プレビューは保存せず、APPROVEを押した場合だけ承認済みversionを保存します。
          </p>
          <label>
            Review package JSON
            <textarea
              rows={16}
              spellCheck={false}
              value={reviewText}
              onChange={(event) => {
                setReviewText(event.target.value);
                setPreview(null);
              }}
            />
          </label>
          <button
            className="button button--secondary"
            disabled={busy || !reviewText}
            onClick={() => void previewReview()}
            type="button"
          >
            保存せず検証
          </button>{' '}
          <button
            className="button"
            disabled={busy || !preview || previewSource !== reviewText}
            onClick={() => void approveReview()}
            type="button"
          >
            人間承認として保存
          </button>
          {preview ? (
            <p>
              次のversion: {preview.nextVersion} / expected revision: {preview.expectedRevision}
            </p>
          ) : null}
          {message ? <p role="status">{message}</p> : null}
        </section>

        {initialSkills.length === 0 ? (
          <section className="settings-card">
            <p>承認済みSkillはまだありません。</p>
          </section>
        ) : (
          initialSkills.map((state) => (
            <SkillCard
              endpoint={endpoint}
              key={state.skill.skillId}
              state={state}
              onChanged={() => router.refresh()}
            />
          ))
        )}
      </main>
    </PublicShell>
  );
}
