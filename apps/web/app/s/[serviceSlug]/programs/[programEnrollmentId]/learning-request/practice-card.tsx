'use client';
import { useState } from 'react';
import type {
  PersonalLearningPractice,
  PersonalLearningPracticeState,
  SavedLearningLessonCandidate,
} from '@bunshin/application';
export function LearningPracticeCard({
  endpoint,
  state,
  candidate,
  onChange,
}: {
  endpoint: string;
  state: PersonalLearningPracticeState;
  candidate: SavedLearningLessonCandidate | null;
  onChange: (value: PersonalLearningPracticeState) => void;
}) {
  const [text, setText] = useState(state.current?.note?.text ?? '');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  async function submit(action: 'START' | 'NOTE') {
    if (pending) return;
    setPending(true);
    setMessage('');
    try {
      const current = state.current;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          action === 'START'
            ? {
                action,
                requestId: candidate?.requestId,
                requestRevision: candidate?.requestRevision,
                candidateId: candidate?.id,
              }
            : {
                action,
                assignmentId: current?.assignmentId,
                operationId,
                expectedRevision: current?.note?.revision ?? 0,
                text: text.trim(),
              },
        ),
      });
      const result = (await response.json()) as {
        data?: PersonalLearningPractice;
        error?: { message?: string };
      };
      if (!response.ok || !result.data)
        throw new Error(result.error?.message ?? '保存できませんでした。');
      onChange({ ...state, current: result.data });
      if (action === 'NOTE') setOperationId(crypto.randomUUID());
      setMessage(
        action === 'START'
          ? '同じ教材で実践を始めました。'
          : '本人の報告として保存しました。達成の評価はまだ行っていません。',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存できませんでした。');
    } finally {
      setPending(false);
    }
  }
  const current = state.current;
  if (!current && !candidate?.confirmedAt) return null;
  return (
    <section aria-label="現在の実践">
      <h2>現在の実践</h2>
      {!state.allowed && <p>現在は実践の保存を停止しています。保存済みの内容は確認できます。</p>}
      {current ? (
        <>
          <p>元の希望：{current.candidate.originalText}</p>
          <h3>今回すること</h3>
          <p>{current.candidate.proposal.outcome}</p>
          <p>{current.candidate.proposal.explanation}</p>
          <p>例：{current.candidate.proposal.example}</p>
          <ol>
            {current.candidate.proposal.practice.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <p>結果の確認方法：{current.candidate.proposal.evidence.join('／')}</p>
          <p>今回の評価基準：{current.candidate.proposal.criteria.join('／')}</p>
          {current.note && (
            <div>
              <h3>前回の記録</h3>
              <p>{current.note.text}</p>
              <p>本人の報告です。提出物による達成確認・独力再現の確認ではありません。</p>
            </div>
          )}
          <label htmlFor="practice-note">進めたこと・止まったこと（短く）</label>
          <textarea
            id="practice-note"
            maxLength={500}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            type="button"
            disabled={!state.allowed || pending || !text.trim()}
            onClick={() => void submit('NOTE')}
          >
            途中の記録を保存
          </button>
          <p>
            途中支援・提出物の評価・次課題の提案は準備中です。記録だけで今回の課題や目標全体を完了にはしません。
          </p>
        </>
      ) : (
        <button
          type="button"
          disabled={!state.allowed || pending}
          onClick={() => void submit('START')}
        >
          希望と教材を確認して実践を始める
        </button>
      )}
      <p role="status" aria-label="実践の状態">
        {message}
      </p>
    </section>
  );
}
