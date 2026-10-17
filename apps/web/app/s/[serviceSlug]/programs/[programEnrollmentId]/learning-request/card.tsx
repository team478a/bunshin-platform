'use client';
import { useState } from 'react';
import { LearningCandidateCard } from './candidate-card';
import { LearningPracticeCard } from './practice-card';
import { LearningConversationCard } from './conversation-card';
import type {
  SavedPersonalLearningRequest,
  PersonalLearningRequestContent,
  SavedLearningLessonCandidate,
  PersonalLearningPracticeState,
  PersonalLearningConversationState,
} from '@bunshin/application';

const appendPath = (url: string, suffix: string) => {
  const queryAt = url.indexOf('?');
  return queryAt < 0 ? `${url}${suffix}` : `${url.slice(0, queryAt)}${suffix}${url.slice(queryAt)}`;
};

export function PersonalLearningRequestCard({
  dynamicMode = false,
  endpoint,
  initial,
  candidateEndpoint,
  initialCandidate = null,
  practiceEndpoint,
  initialPractice = { allowed: false, current: null },
  conversationEndpoint,
  initialConversation = null,
}: {
  dynamicMode?: boolean;
  endpoint: string;
  initial: SavedPersonalLearningRequest | null;
  candidateEndpoint?: string;
  initialCandidate?: SavedLearningLessonCandidate | null;
  practiceEndpoint?: string;
  initialPractice?: PersonalLearningPracticeState;
  conversationEndpoint?: string | undefined;
  initialConversation?: PersonalLearningConversationState | null | undefined;
}) {
  const [content, setContent] = useState<PersonalLearningRequestContent>({
    originalText: initial?.originalText ?? '',
    deviceType: initial?.deviceType ?? null,
    toolDescription: initial?.toolDescription ?? null,
    experienceDescription: initial?.experienceDescription ?? null,
    currentPosition: initial?.currentPosition ?? null,
  });
  const [saved, setSaved] = useState(initial);
  const [practice, setPractice] = useState(initialPractice);
  const [confirmedCandidate, setConfirmedCandidate] = useState(initialCandidate);
  const [candidate, setCandidate] = useState(initialCandidate);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState<{ key: string; serialized: string } | null>(null);
  const matchesSaved =
    saved &&
    Object.entries(content).every(
      ([key, value]) => saved[key as keyof PersonalLearningRequestContent] === value,
    );
  async function save() {
    if (pending || !content.originalText.trim()) return;
    setPending(true);
    setMessage('');
    const serialized = JSON.stringify({ content, expectedRevision: saved?.revision ?? 0 });
    const operation =
      retry?.serialized === serialized ? retry : { key: crypto.randomUUID(), serialized };
    setRetry(operation);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...JSON.parse(serialized), idempotencyKey: operation.key }),
      });
      const result = (await response.json()) as {
        data?: SavedPersonalLearningRequest;
        error?: { message: string };
      };
      if (!response.ok || !result.data)
        throw new Error(result.error?.message ?? '保存できませんでした。');
      setSaved(result.data);
      setRetry(null);
      setMessage('希望を保存しました。再訪しても同じ希望から再開できます。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存できませんでした。再試行できます。');
    } finally {
      setPending(false);
    }
  }
  return (
    <section>
      {practiceEndpoint && (
        <LearningPracticeCard
          endpoint={practiceEndpoint}
          state={practice}
          candidate={
            matchesSaved && confirmedCandidate?.requestId === saved?.id ? confirmedCandidate : null
          }
          onChange={setPractice}
        />
      )}
      <h1>
        {dynamicMode
          ? 'AIでできるようになりたいこと'
          : 'AIを使って、何ができるようになりたいですか？'}
      </h1>
      <p>あなたの希望を元のまま保存します。未回答の経験や能力は推測しません。</p>
      <p>
        {dynamicMode
          ? '希望を保存し、内容に合う小さな実践課題へ進みます。今の実践は、新しい課題を確認して開始するまで切り替わりません。'
          : practiceEndpoint
            ? '希望の下書き保存では現在の実践を切り替えません。教材の本人確認後、実践開始を別に確認します。'
            : candidateEndpoint
              ? 'この検証画面では教材候補の確認までです。実践課題の開始は準備中で、現在の課題は切り替わりません。'
              : 'この検証画面では希望の保存までです。教材の生成・確定はまだ行いません。現在の課題は切り替わりません。'}
      </p>
      {saved && (
        <p>
          前回保存した希望（版 {saved.revision}）：{saved.originalText}
        </p>
      )}
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label>
          実現したいこと
          <textarea
            required
            maxLength={2000}
            value={content.originalText}
            onChange={(event) => setContent({ ...content, originalText: event.target.value })}
          />
        </label>
        <label>
          使う端末（任意）
          <select
            value={content.deviceType ?? ''}
            onChange={(event) =>
              setContent({
                ...content,
                deviceType: (event.target.value ||
                  null) as PersonalLearningRequestContent['deviceType'],
              })
            }
          >
            <option value="">まだ分からない・未回答</option>
            <option value="SMARTPHONE">スマートフォン</option>
            <option value="PC">パソコン</option>
            <option value="BOTH">両方</option>
          </select>
        </label>
        {(
          [
            ['toolDescription', '使うAIツール（任意）', 240],
            ['experienceDescription', 'これまでの経験（任意）', 300],
            ['currentPosition', '今どこまでできていますか（任意）', 500],
          ] as const
        ).map(([key, label, max]) => (
          <label key={key}>
            {label}
            <textarea
              maxLength={max}
              value={content[key] ?? ''}
              onChange={(event) =>
                setContent({
                  ...content,
                  [key]: event.target.value.trim() ? event.target.value : null,
                })
              }
            />
          </label>
        ))}
        <button disabled={pending || !content.originalText.trim()} type="submit">
          {pending ? '保存中…' : '希望を保存'}
        </button>
      </form>
      <p role="status">{message}</p>
      {conversationEndpoint && saved && matchesSaved && (
        <LearningConversationCard
          key={saved.id}
          endpoint={conversationEndpoint}
          sharingEndpoint={appendPath(conversationEndpoint, '/share')}
          request={saved}
          initial={initialConversation?.requestId === saved.id ? initialConversation : null}
          candidate={candidate?.requestId === saved.id ? candidate : null}
          practiceEndpoint={practiceEndpoint ?? ''}
          practice={practice}
          onPracticeChange={setPractice}
          onCandidateChange={setCandidate}
        />
      )}
      {candidateEndpoint &&
        !practice.current &&
        saved &&
        Object.entries(content).every(
          ([key, value]) => value === saved[key as keyof PersonalLearningRequestContent],
        ) && (
          <LearningCandidateCard
            key={`${saved.id}:${candidate?.id ?? 'none'}`}
            endpoint={candidateEndpoint}
            request={saved}
            initial={candidate?.requestId === saved.id ? candidate : null}
            onChange={setCandidate}
            {...(practiceEndpoint ? { onConfirmed: setConfirmedCandidate } : {})}
          />
        )}
    </section>
  );
}
