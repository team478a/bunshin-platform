'use client';

import { useId, useState } from 'react';
import type {
  TrainingDataDeletionPreview,
  TrainingDataDeletionTarget,
} from '@bunshin/capability-training';

export function AiTrainingDataDeletionCard({
  serviceSlug,
  programEnrollmentId,
}: {
  serviceSlug: string;
  programEnrollmentId: string;
}) {
  const headingId = useId();
  const [choice, setChoice] = useState('ALL');
  const [answers, setAnswers] = useState<TrainingDataDeletionPreview['answers']>([]);
  const [preview, setPreview] = useState<TrainingDataDeletionPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const target: TrainingDataDeletionTarget =
    choice === 'ALL' ? { kind: 'ALL' } : { kind: 'ANSWER', answerId: choice };
  const base = `/api/services/${encodeURIComponent(serviceSlug)}/ai-training/enrollments/${encodeURIComponent(programEnrollmentId)}/personal-data`;

  async function submit(action: 'preview' | 'delete') {
    if (busy || (action === 'delete' && (!confirmed || !preview))) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${base}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          action === 'preview'
            ? { target }
            : {
                target,
                revision: preview!.revision,
                confirmation: 'DELETE_TRAINING_DATA',
              },
        ),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        setPreview(null);
        setConfirmed(false);
        setMessage(
          response.status === 409
            ? 'データが更新されました。削除対象をもう一度確認してください。'
            : response.status === 413
              ? 'データ量が多いため、一括削除できません。運営者へお問い合わせください。'
              : '処理できませんでした。ログイン状態を確認して、削除対象をもう一度確認してください。',
        );
        return;
      }
      const result = (await response.json()) as { data: { preview: TrainingDataDeletionPreview } };
      if (action === 'preview') {
        setPreview(result.data.preview);
        if (choice === 'ALL') setAnswers(result.data.preview.answers);
        setConfirmed(false);
      } else {
        setPreview(null);
        setConfirmed(false);
        setAnswers([]);
        setChoice('ALL');
        setMessage('アプリ内の対象データを削除しました。表示を更新してください。');
      }
    } catch {
      setPreview(null);
      setConfirmed(false);
      setMessage('結果を確認できませんでした。通信を確認し、削除対象をもう一度確認してください。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="service-entry__card" aria-labelledby={headingId}>
      <h2 id={headingId}>研修データを削除する</h2>
      <p>取り消せません。必要なデータは、先に上のダウンロード機能で保存してください。</p>
      <label>
        削除対象
        <select
          value={choice}
          disabled={busy}
          onChange={(event) => {
            setChoice(event.target.value);
            setPreview(null);
            setConfirmed(false);
            setMessage('');
          }}
        >
          <option value="ALL">この研修の学習データすべて</option>
          {answers.map((answer) => (
            <option key={answer.id} value={answer.id}>
              {new Date(answer.createdAt).toLocaleString('ja-JP')}の回答
            </option>
          ))}
        </select>
      </label>
      <p>
        回答を1件選ぶには、まず「削除対象を確認」を押してください。回答本文はこの一覧には表示しません。
      </p>
      {choice === 'ALL' ? (
        <p>
          回答・AI評価・関連Toolkit・仕事情報・点数・進捗・課題・活動履歴・目標・研修設定を削除します。参加状態は変わりません。継続する場合は初期設定を入力し直してください。
        </p>
      ) : (
        <p>
          選んだ回答・AI評価・関連Toolkit・回答由来の履歴を削除します。未完了の課題はスキップします。集計済みの点数・学習進捗は残ります。
        </p>
      )}
      <p>
        アカウント・サービス参加同意・契約/決済・原価・最小監査記録は残ります。バックアップ、送信済みの外部AI、端末に保存したファイルはこの操作では消去されません。
      </p>
      <button
        type="button"
        className="button button--secondary button--full"
        disabled={busy}
        onClick={() => void submit('preview')}
      >
        削除対象を確認
      </button>
      {preview && (
        <>
          <p role="status">
            回答・評価 {preview.counts.answers}件 / Toolkit {preview.counts.toolkit}件 /
            仕事情報・点数 {preview.counts.profiles}件 / 進捗 {preview.counts.progress}件 / 課題{' '}
            {preview.counts.assignments}件 / 活動履歴 {preview.counts.activities}件 / 目標{' '}
            {preview.counts.goals}件 / 研修設定 {preview.counts.preferences}件
          </p>
          <p>未完了の関連評価は停止します。外部AIへ送信済みの処理は撤回を保証できません。</p>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            対象と残る記録を確認し、削除が取り消せないことを理解しました
          </label>
          <button
            type="button"
            className="button button--secondary button--full"
            disabled={!confirmed || busy}
            onClick={() => void submit('delete')}
          >
            確認した対象を削除する
          </button>
        </>
      )}
      {message && (
        <p role="status" aria-live="polite">
          {message}
        </p>
      )}
      <button
        type="button"
        className="button button--secondary"
        disabled={busy}
        onClick={() => window.location.reload()}
      >
        表示を更新
      </button>
    </section>
  );
}
