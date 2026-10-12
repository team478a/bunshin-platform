'use client';
import { useState } from 'react';
import type {
  SavedLearningLessonCandidate,
  SavedPersonalLearningRequest,
} from '@bunshin/application';

export function LearningCandidateCard({
  endpoint,
  request,
  initial,
}: {
  endpoint: string;
  request: SavedPersonalLearningRequest;
  initial: SavedLearningLessonCandidate | null;
}) {
  const [candidate, setCandidate] = useState(initial);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [operationId] = useState(() => crypto.randomUUID());
  async function submit(action: 'GENERATE' | 'CONFIRM') {
    if (pending) return;
    setPending(true);
    setMessage('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          requestId: request.id,
          requestRevision: request.revision,
          ...(action === 'GENERATE' ? { operationId } : { candidateId: candidate?.id }),
        }),
      });
      const result = (await response.json()) as {
        data?: SavedLearningLessonCandidate;
        error?: { message?: string };
      };
      if (!response.ok || !result.data)
        throw new Error(result.error?.message ?? '教材候補を取得できませんでした。');
      setCandidate(result.data);
      setMessage(
        action === 'CONFIRM'
          ? 'この教材候補を確認しました。実践課題の開始はまだ接続されていません。'
          : '教材候補を保存しました。内容を確認してください。',
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : '確認できませんでした。再読込して保存状態を確認してください。',
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section aria-label="今回の教材候補">
      <h2>最初の実践を確認</h2>
      <p>
        本人が取り組むためのAIによる提案です。内容を確認してください。画面操作や学習成果の確認済みを意味しません。
      </p>
      {!candidate && (
        <button type="button" disabled={pending} onClick={() => void submit('GENERATE')}>
          {pending ? '候補を準備中…' : '最初の実践を提案してもらう'}
        </button>
      )}
      {candidate && (
        <>
          <p>元の希望：{candidate.originalText}</p>
          <p>{candidate.proposal.reason}</p>
          {candidate.proposal.status === 'READY' ? (
            <>
              <h3>今回の到達点</h3>
              <p>{candidate.proposal.outcome}</p>
              <h3>短い説明</h3>
              <p>{candidate.proposal.explanation}</p>
              <h3>例</h3>
              <p>{candidate.proposal.example}</p>
              {(
                [
                  ['practice', '本人が行うこと'],
                  ['evidence', '結果の確認方法'],
                  ['criteria', '今回の評価基準'],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <h3>{label}</h3>
                  <ol>
                    {candidate.proposal[key].map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ol>
                </div>
              ))}
              <p>
                教材版 {candidate.materialVersion}
                。この確認だけで学習目標全体の達成や受講終了にはしません。
              </p>
              {candidate.confirmedAt ? (
                <p>確認済みの候補です。同じ内容から再開します。実践課題への接続は準備中です。</p>
              ) : (
                <button type="button" disabled={pending} onClick={() => void submit('CONFIRM')}>
                  この内容を確認
                </button>
              )}
            </>
          ) : (
            <>
              <p>
                {candidate.proposal.status === 'NEEDS_CONTEXT'
                  ? '開始に必要な条件だけ確認します。上の希望・環境を更新して保存してください。'
                  : '現在の提供範囲外です。本人が学ぶ希望として見直す場合は上の希望を更新してください。'}
              </p>
              <ul>
                {candidate.proposal.questions.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <p role="status" aria-label="教材候補の状態">
        {message}
      </p>
    </section>
  );
}
