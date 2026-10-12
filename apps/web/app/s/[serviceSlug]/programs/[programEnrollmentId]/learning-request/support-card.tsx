'use client';
import { useRef, useState } from 'react';
import type {
  PersonalLearningPractice,
  PersonalLearningPracticeState,
  PracticeSupportReason,
} from '@bunshin/application';
const reasons: { value: PracticeSupportReason; label: string }[] = [
  { value: 'UNKNOWN', label: 'ここで止まった・理由が分からない' },
  { value: 'UNDERSTANDING', label: '説明が分からない' },
  { value: 'NEXT_ACTION', label: '次に何を操作するか分からない' },
  { value: 'ENVIRONMENT_MISMATCH', label: '画面や端末が説明と違う' },
  { value: 'FEATURE_UNAVAILABLE', label: '必要な機能を使えない' },
  { value: 'OUTPUT_MISMATCH', label: '作れたが希望と違う' },
  { value: 'WORKLOAD', label: '作業が多い・短い一歩にしたい' },
];
export function LearningSupportCard({
  endpoint,
  state,
  onChange,
}: {
  endpoint: string;
  state: PersonalLearningPracticeState;
  onChange: (state: PersonalLearningPracticeState) => void;
}) {
  const [reason, setReason] = useState<PracticeSupportReason>('UNKNOWN');
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const operation = useRef<{ signature: string; id: string } | null>(null);
  const current = state.current;
  if (!current) return null;
  const support = current.support;
  const busy = support.history.some((r) => r.status === 'PENDING');
  async function consult() {
    if (!current || pending || busy) return;
    const content = {
      assignmentId: current.assignmentId,
      expectedNoteRevision: current.note?.revision ?? 0,
      expectedSupportRevision: support.revision,
      reason,
      text: text.trim(),
    };
    const signature = JSON.stringify(content);
    if (operation.current?.signature !== signature)
      operation.current = { signature, id: crypto.randomUUID() };
    setPending(true);
    setMessage('');
    try {
      const response = await fetch(endpoint + '/support', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...content, operationId: operation.current.id }),
      });
      const result = (await response.json()) as {
        data?: PersonalLearningPractice;
        error?: { message?: string };
      };
      if (!response.ok || !result.data)
        throw new Error(result.error?.message ?? '支援を取得できませんでした。');
      onChange({ ...state, current: result.data });
      operation.current = null;
      setMessage(
        result.data.support.history[0]?.status === 'STALE'
          ? '作業記録が変わったため、古い助言は適用していません。現在の状態で相談してください。'
          : '同じ課題の続きとして支援を保存しました。',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '支援を取得できませんでした。');
      try {
        // Reading durable request state never reruns the AI or overwrites the consultation text.
        const response = await fetch(endpoint, { cache: 'no-store' });
        if (response.ok) {
          const result = (await response.json()) as { data?: PersonalLearningPracticeState };
          if (result.data) onChange(result.data);
        }
      } catch {
        setMessage(
          '支援と保存状態を確認できませんでした。入力は残っています。再読込して現在の相談を確認してください。',
        );
      }
    } finally {
      setPending(false);
    }
  }
  return (
    <section aria-label="実践途中の相談">
      <h3>途中でも相談できます</h3>
      <p>いまの課題を保ったまま、次の一歩を相談します。画像はまだ添付できません。</p>
      <label htmlFor="support-reason">いま困っていること</label>
      <select
        id="support-reason"
        value={reason}
        disabled={pending}
        onChange={(e) => setReason(e.target.value as PracticeSupportReason)}
      >
        {reasons.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <label htmlFor="support-text">どこまで進めたか・何を聞きたいか（短く）</label>
      <textarea
        id="support-text"
        maxLength={500}
        value={text}
        disabled={pending}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        type="button"
        disabled={!state.allowed || pending || busy || !text.trim() || support.revision >= 1000}
        onClick={() => void consult()}
      >
        この課題の続きを相談
      </button>
      {busy && (
        <p>
          相談の応答を確認中です。重複送信はしません。再読込しても未完了なら運営へ確認してください。
        </p>
      )}
      <p role="status" aria-label="相談の状態">
        {message}
      </p>
      {support.history.length > 0 && (
        <div aria-label="保存した支援履歴">
          <h3>前回までの相談</h3>
          {support.history.slice(0, 3).map((r) => (
            <article key={r.id}>
              <p>相談：{r.text}</p>
              <p>作業記録の版 {r.noteRevision} に対する相談</p>
              {r.noteRevision !== (current.note?.revision ?? 0) && (
                <p>現在の作業記録より前の支援です。いまの状態を確認した助言ではありません。</p>
              )}
              {r.status === 'READY' && r.advice ? (
                <>
                  <p>{r.advice.explanation}</p>
                  {r.advice.nextAction && <p>次の一歩：{r.advice.nextAction}</p>}
                  {r.advice.question && <p>確認したいこと：{r.advice.question}</p>}
                  <p>支援であり、達成・合格・独力再現の評価ではありません。</p>
                </>
              ) : (
                <p>
                  {r.status === 'STALE'
                    ? '記録が変わったため、古い助言は適用していません。'
                    : r.status === 'FAILED'
                      ? '支援を取得できませんでした。課題と作業記録は残っています。'
                      : '相談を保存済み・応答は未確認です。'}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
