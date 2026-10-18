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
  const [evidenceKind, setEvidenceKind] = useState<'TEXT' | 'SELF_REPORT'>('TEXT');
  const [evidence, setEvidence] = useState('');
  const [evidenceRetry, setEvidenceRetry] = useState<{ serialized: string; key: string } | null>(
    null,
  );
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
  async function practiceAction(
    payload: Record<string, string | number | undefined>,
    success: string,
  ) {
    if (pending) return;
    setPending(true);
    setMessage('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        data?: PersonalLearningPracticeState;
        error?: { message?: string };
      };
      if (!response.ok || !result.data)
        throw new Error(result.error?.message ?? '保存できませんでした。');
      onChange(result.data);
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存できませんでした。');
    } finally {
      setPending(false);
    }
  }
  async function submitEvidence() {
    const current = state.current;
    if (!current || pending || !evidence.trim()) return;
    setPending(true);
    setMessage('');
    const serialized = JSON.stringify({
      assignmentId: current.assignmentId,
      candidateId: current.candidate.id,
      materialVersion: current.candidate.materialVersion,
      expectedRevision: current.submissions.length,
      kind: evidenceKind,
      content: evidence.trim(),
    });
    const operation =
      evidenceRetry?.serialized === serialized
        ? evidenceRetry
        : { serialized, key: crypto.randomUUID() };
    setEvidenceRetry(operation);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'EVIDENCE',
          ...JSON.parse(serialized),
          idempotencyKey: operation.key,
        }),
      });
      const result = (await response.json()) as {
        data?: PersonalLearningPracticeState;
        error?: { message?: string };
      };
      if (!response.ok || !result.data)
        throw new Error(result.error?.message ?? '提出を保存できませんでした。');
      onChange(result.data);
      setEvidenceRetry(null);
      setEvidence('');
      setMessage('提出を保存しました。確認結果はこの画面に表示します。');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '提出を保存できませんでした。入力は残しています。',
      );
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
          <h3>今回の結果を確認する</h3>
          <label>
            提出内容の種類
            <select
              value={evidenceKind}
              onChange={(event) => setEvidenceKind(event.target.value as 'TEXT' | 'SELF_REPORT')}
            >
              <option value="TEXT">作った文章・結果の一部</option>
              <option value="SELF_REPORT">本人からの短い報告</option>
            </select>
          </label>
          <label htmlFor="practice-evidence">できたこと、または確認してほしい内容</label>
          <textarea
            id="practice-evidence"
            maxLength={10_000}
            value={evidence}
            onChange={(event) => setEvidence(event.target.value)}
          />
          <button
            type="button"
            disabled={
              !state.allowed ||
              pending ||
              !evidence.trim() ||
              current.submissions.some((item) => item.status === 'PENDING') ||
              current.submissions.some((item) => item.review?.state === 'CURRENT_STEP_EVIDENCE')
            }
            onClick={() => void submitEvidence()}
          >
            {pending ? '提出中…' : '提出して今回の基準を確認'}
          </button>
          {current.submissions.length > 0 && (
            <div aria-label="提出と確認結果">
              <h4>これまでの提出</h4>
              {current.submissions.slice(-3).map((item) => (
                <article key={item.answerId}>
                  <p>
                    提出 {item.revision} ·{' '}
                    {item.kind === 'SELF_REPORT' ? '本人の報告' : '文章の提出'} ·{' '}
                    {item.status === 'PENDING'
                      ? '確認中'
                      : item.status === 'FAILED'
                        ? '確認できませんでした'
                        : '確認済み'}
                  </p>
                  <p>{item.content}</p>
                  {item.review && (
                    <>
                      <p>
                        {item.review.state === 'CURRENT_STEP_EVIDENCE'
                          ? '今回の基準に対応する内容が提出文から見つかりました。独力での再現や目標全体の達成を示すものではありません。'
                          : item.review.state === 'SELF_REPORT_ONLY'
                            ? '本人の報告として記録しました。提出物からの確認はできていません。'
                            : item.review.state === 'UNABLE_TO_ASSESS'
                              ? '提出内容だけでは確認できませんでした。'
                              : '追加の確認が必要です。'}
                      </p>
                      {item.review.observed.length > 0 && (
                        <p>提出文で確認できた点：{item.review.observed.join('／')}</p>
                      )}
                      {item.review.notEstablished.length > 0 && (
                        <p>まだ確認できていない点：{item.review.notEstablished.join('／')}</p>
                      )}
                      <p>{item.review.feedback}</p>
                      <p>次にすること：{item.review.nextAction}</p>
                    </>
                  )}
                </article>
              ))}
            </div>
          )}
          {current.submissions.at(-1)?.review?.state === 'CURRENT_STEP_EVIDENCE' && (
            <section aria-label="次の学習課題">
              <h3>今回の実践を踏まえた次の一歩</h3>
              <p>
                今回確認できた提出と元の希望を使って、次の小さな実践案を作ります。案を確認するまで現在の課題は切り替わりません。
              </p>
              {!current.nextCandidate && (
                <button
                  type="button"
                  disabled={!state.allowed || pending}
                  onClick={() =>
                    void practiceAction(
                      {
                        action: 'NEXT_PROPOSAL',
                        assignmentId: current.assignmentId,
                        operationId: crypto.randomUUID(),
                      },
                      '次の実践案を準備しました。内容を確認してください。',
                    )
                  }
                >
                  {pending ? '次の実践案を準備中…' : '次の実践を提案してもらう'}
                </button>
              )}
              {current.nextCandidate?.proposal.status === 'READY' && (
                <article>
                  <p>元の希望：{current.nextCandidate.originalText}</p>
                  <h4>次の到達点（提案）</h4>
                  <p>{current.nextCandidate.proposal.outcome}</p>
                  <p>{current.nextCandidate.proposal.explanation}</p>
                  <ol>
                    {current.nextCandidate.proposal.practice.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                  <p>確認方法：{current.nextCandidate.proposal.evidence.join('／')}</p>
                  <p>今回の基準：{current.nextCandidate.proposal.criteria.join('／')}</p>
                  {current.nextCandidate.confirmedAt ? (
                    <button
                      type="button"
                      disabled={!state.allowed || pending}
                      onClick={() =>
                        void practiceAction(
                          {
                            action: 'START',
                            requestId: current.nextCandidate!.requestId,
                            requestRevision: current.nextCandidate!.requestRevision,
                            candidateId: current.nextCandidate!.id,
                            previousAssignmentId: current.assignmentId,
                          },
                          '確認した次の課題を開始しました。前の課題と結果は履歴に残っています。',
                        )
                      }
                    >
                      この次の課題を始める
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!state.allowed || pending}
                      onClick={() =>
                        void practiceAction(
                          {
                            action: 'NEXT_CONFIRM',
                            requestId: current.nextCandidate!.requestId,
                            requestRevision: current.nextCandidate!.requestRevision,
                            candidateId: current.nextCandidate!.id,
                          },
                          '次の課題案を確認しました。開始は別操作で行います。',
                        )
                      }
                    >
                      この次の課題案を確認
                    </button>
                  )}
                </article>
              )}
              {current.nextCandidate && current.nextCandidate.proposal.status !== 'READY' && (
                <p>次の案には追加確認が必要です。現在の課題はそのまま保持しています。</p>
              )}
            </section>
          )}
          <p>
            一回の提出で今回の基準を確認します。本人の報告、提出文から確認したこと、独力で別の実践ができることは別に扱います。目標全体の達成や次の課題はこの確認では決まりません。
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
