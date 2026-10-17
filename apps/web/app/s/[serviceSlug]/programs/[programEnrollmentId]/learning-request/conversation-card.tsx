'use client';
import { useState } from 'react';
import type {
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
  onCandidateChange,
}: {
  endpoint: string;
  sharingEndpoint: string;
  request: SavedPersonalLearningRequest;
  initial: PersonalLearningConversationState | null;
  candidate: SavedLearningLessonCandidate | null;
  onCandidateChange: (value: SavedLearningLessonCandidate | null) => void;
}) {
  const [state, setState] = useState(initial);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [operationId, setOperationId] = useState('');
  const [sharingPending, setSharingPending] = useState(false);

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
    if (pending || !text.trim()) return;
    setPending(true);
    setError('');
    const message = text.trim();
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
        {state?.messages.map((message) => (
          <li key={message.id}>
            <p>
              {message.role === 'USER'
                ? 'あなた'
                : message.responseStatus === 'NEEDS_CONTEXT'
                  ? 'マナベルからの確認質問'
                  : 'マナベル'}
            </p>
            <p>{message.text}</p>
            {message.role === 'USER' && message.status === 'FAILED' && (
              <small>
                返信の状態を確認できません。費用・通信状態が不明の場合は再送せず運営者へ確認してください。
              </small>
            )}
          </li>
        ))}
      </ol>
      <div>
        <p>この会話を運営者と共有しますか？共有中は運営者が閲覧でき、閲覧記録が残ります。</p>
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
        <button disabled={pending || !text.trim()} type="submit">
          {pending ? '返信を確認中…' : '相談を送る'}
        </button>
      </form>
      <p role="status">{error}</p>
    </section>
  );
}
