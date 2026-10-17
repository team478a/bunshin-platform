'use client';
import { useRef, useState } from 'react';
import type {
  PersonalLearningPractice,
  PersonalLearningPracticeState,
  PersonalLearningConversationState,
  SavedLearningLessonCandidate,
  SavedPersonalLearningRequest,
} from '@bunshin/application';

export function LearningConversationCard({
  endpoint,
  sharingEndpoint,
  request,
  initial,
  candidate,
  practiceEndpoint,
  practice,
  onPracticeChange,
  onCandidateChange,
}: {
  endpoint: string;
  sharingEndpoint: string;
  request: SavedPersonalLearningRequest;
  initial: PersonalLearningConversationState | null;
  candidate: SavedLearningLessonCandidate | null;
  practiceEndpoint: string;
  practice: PersonalLearningPracticeState;
  onPracticeChange: (value: PersonalLearningPracticeState) => void;
  onCandidateChange: (value: SavedLearningLessonCandidate | null) => void;
}) {
  const [state, setState] = useState(initial);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [operationId, setOperationId] = useState('');
  const [sharingPending, setSharingPending] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState('');
  const imageInput = useRef<HTMLInputElement>(null);
  const supportOperation = useRef<{ signature: string; id: string } | null>(null);
  const currentPractice = practice.current;
  const supportHistory = currentPractice?.support.history ?? [];
  const supportBusy = supportHistory.some((item) => item.status === 'PENDING');

  async function setSharing(shared: boolean) {
    if (sharingPending || !state) return;
    setSharingPending(true);
    setError('');
    try {
      const response = await fetch(sharingEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId: request.id,
          requestRevision: request.revision,
          operationId: crypto.randomUUID(),
          shared,
        }),
      });
      const result = (await response.json()) as {
        data?: PersonalLearningConversationState;
        error?: { message: string };
      };
      if (!response.ok || !result.data)
        throw new Error(result.error?.message ?? '共有状態を変更できませんでした。');
      setState(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '共有状態を変更できませんでした。');
    } finally {
      setSharingPending(false);
    }
  }

  async function send() {
    if (pending || supportBusy || !text.trim()) return;
    setPending(true);
    setError('');
    const message = text.trim();
    if (currentPractice) {
      const content = {
        assignmentId: currentPractice.assignmentId,
        expectedNoteRevision: currentPractice.note?.revision ?? 0,
        expectedSupportRevision: currentPractice.support.revision,
        reason: 'UNKNOWN',
        text: message,
        imageDataUrl,
      };
      const signature = JSON.stringify(content);
      if (supportOperation.current?.signature !== signature)
        supportOperation.current = { signature, id: crypto.randomUUID() };
      try {
        const response = await fetch(`${practiceEndpoint}/support`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...content, operationId: supportOperation.current.id }),
        });
        const result = (await response.json()) as {
          data?: PersonalLearningPractice;
          error?: { message?: string };
        };
        if (!response.ok || !result.data)
          throw new Error(result.error?.message ?? '返信を取得できませんでした。');
        onPracticeChange({ ...practice, current: result.data });
        setText('');
        setImageDataUrl(null);
        if (imageInput.current) imageInput.current.value = '';
        supportOperation.current = null;
        setError('同じ課題の続きとして返信を保存しました。');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '返信を取得できませんでした。');
        try {
          const response = await fetch(practiceEndpoint, { cache: 'no-store' });
          if (response.ok) {
            const result = (await response.json()) as { data?: PersonalLearningPracticeState };
            if (result.data) onPracticeChange(result.data);
          }
        } catch {
          setError(
            '保存状態を確認できません。入力は残しています。再送せず運営へ確認してください。',
          );
        }
      } finally {
        setPending(false);
      }
      return;
    }
    const op = operationId || crypto.randomUUID();
    setOperationId(op);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId: request.id,
          requestRevision: request.revision,
          operationId: op,
          text: message,
        }),
      });
      const result = (await response.json()) as {
        data?: {
          conversation: PersonalLearningConversationState;
          candidate: SavedLearningLessonCandidate | null;
        };
        error?: { message: string };
      };
      if (!response.ok || !result.data?.conversation)
        throw new Error(result.error?.message ?? '返信を取得できませんでした。');
      setState(result.data.conversation);
      onCandidateChange(result.data.candidate);
      setText('');
      setOperationId('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '返信を取得できませんでした。');
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="learning-conversation-title" className="panel">
      <h2 id="learning-conversation-title">学習について相談する</h2>
      <p>
        保存した希望をもとに同じ相談スレッドで続けられます。AIは実践課題の開始・評価・修了を決めません。
      </p>
      {candidate?.proposal.status === 'NEEDS_CONTEXT' && (
        <aside aria-label="教材候補の確認質問">
          <p>教材候補を作るため、次の質問にこのチャットから回答できます。</p>
          <ul>
            {candidate.proposal.questions.map((question, index) => (
              <li key={index}>{question}</li>
            ))}
          </ul>
        </aside>
      )}
      <ol aria-label="学習相談の会話">
        {[
          ...(state?.messages ?? []).map((item) => ({
            kind: 'conversation' as const,
            at: item.createdAt,
            item,
          })),
          ...supportHistory.map((item) => ({
            kind: 'support' as const,
            at: item.requestedAt,
            item,
          })),
        ]
          .sort((a, b) => a.at.localeCompare(b.at))
          .slice(-20)
          .map((entry) =>
            entry.kind === 'conversation' ? (
              <li key={`conversation:${entry.item.id}`}>
                <p>
                  {entry.item.role === 'USER'
                    ? 'あなた'
                    : entry.item.responseStatus === 'NEEDS_CONTEXT'
                      ? 'マナベルからの確認質問'
                      : 'マナベル'}
                </p>
                <p>{entry.item.text}</p>
                {entry.item.role === 'USER' && entry.item.status === 'FAILED' && (
                  <small>
                    返信を確認できません。費用・通信状態が不明な場合は再送せず運営者へ確認してください。
                  </small>
                )}
              </li>
            ) : (
              <li key={`support:${entry.item.id}`}>
                <p>あなた</p>
                <p>{entry.item.text}</p>
                {entry.item.image && (
                  <img
                    src={`${practiceEndpoint}/support/${entry.item.id}/image`}
                    alt="相談に添付したスクリーンショット"
                    width={240}
                  />
                )}
                {entry.item.status === 'READY' && entry.item.advice ? (
                  <>
                    <p>マナベル</p>
                    <p>{entry.item.advice.explanation}</p>
                    {entry.item.advice.nextAction && (
                      <p>次の一歩：{entry.item.advice.nextAction}</p>
                    )}
                    {entry.item.advice.question && (
                      <p>確認したいこと：{entry.item.advice.question}</p>
                    )}
                    <small>支援であり、達成・合格・独力再現の評価ではありません。</small>
                  </>
                ) : (
                  <p>
                    {entry.item.status === 'STALE'
                      ? '作業記録が変わったため、この助言は適用していません。'
                      : entry.item.status === 'FAILED'
                        ? '返信状態を確認できません。運営へ確認してください。'
                        : '返信を確認中です。'}
                  </p>
                )}
              </li>
            ),
          )}
      </ol>
      <div>
        <p>
          希望・追加質問の会話だけを運営者と共有しますか？共有中は運営者が閲覧でき、閲覧記録が残ります。実践相談と添付画像はこの共有の対象外です。
        </p>
        <button
          disabled={sharingPending || !state}
          onClick={() => void setSharing(!state?.sharedAt)}
          type="button"
        >
          {sharingPending
            ? '更新中…'
            : state?.sharedAt
              ? '共有を取り消す'
              : 'この会話を運営に共有する'}
        </button>
        {state?.sharedAt && (
          <small>共有中（{new Date(state.sharedAt).toLocaleString('ja-JP')}）</small>
        )}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label>
          相談内容
          <textarea
            maxLength={1200}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              if (operationId) setOperationId('');
            }}
            placeholder={
              candidate?.proposal.status === 'NEEDS_CONTEXT'
                ? '上の確認質問への回答を書いてください'
                : '分からないことや、次に試したいことを書いてください'
            }
          />
        </label>
        {currentPractice && (
          <>
            <label htmlFor="learning-chat-image">画面画像（任意・1枚、3MBまで）</label>
            <input
              ref={imageInput}
              id="learning-chat-image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={pending || supportBusy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                setImageError('');
                if (!file) return;
                if (file.size > 3_000_000) {
                  setImageDataUrl(null);
                  setImageError('画像は3MB以下を選んでください。');
                  event.currentTarget.value = '';
                  return;
                }
                const reader = new FileReader();
                reader.onload = () =>
                  typeof reader.result === 'string'
                    ? setImageDataUrl(reader.result)
                    : setImageError('画像を読み込めませんでした。');
                reader.onerror = () => setImageError('画像を読み込めませんでした。');
                reader.readAsDataURL(file);
              }}
            />
            {imageDataUrl && (
              <div>
                <img src={imageDataUrl} alt="相談に添付する画像のプレビュー" width={240} />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setImageDataUrl(null);
                    if (imageInput.current) imageInput.current.value = '';
                  }}
                >
                  画像を削除
                </button>
              </div>
            )}
            {imageError && <p role="alert">{imageError}</p>}
          </>
        )}
        <button
          disabled={
            pending ||
            supportBusy ||
            !text.trim() ||
            Boolean(
              currentPractice && (!practice.allowed || currentPractice.support.revision >= 1000),
            )
          }
          type="submit"
        >
          {pending ? '返信を確認中…' : currentPractice ? 'チャットに送信' : '相談を送る'}
        </button>
      </form>
      <p role="status">{error}</p>
    </section>
  );
}
