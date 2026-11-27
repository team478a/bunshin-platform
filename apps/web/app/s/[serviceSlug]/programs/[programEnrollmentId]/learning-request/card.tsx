'use client';

import design from '../../../../../../src/components/manaberu-learner.module.css';
import { useRef, useState } from 'react';
import { browserLearningDevice } from '@bunshin/capability-training';
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
  simpleStart = false,
  firstTopicEndpoint,
  browserMaterialHref,
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
  simpleStart?: boolean;
  firstTopicEndpoint?: string;
  browserMaterialHref?: string | undefined;
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
  const busy = useRef(false);
  const firstTopic = useRef<string | null>(null);
  const topicUrl = (url: string) =>
    firstTopic.current ? `${url}?topicId=${encodeURIComponent(firstTopic.current)}` : url;
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState<{ key: string; serialized: string } | null>(null);
  const matchesSaved =
    saved &&
    Object.entries(content).every(
      ([key, value]) => saved[key as keyof PersonalLearningRequestContent] === value,
    );
  const additionalDetails = (
    <>
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
    </>
  );
  async function send<T>(url: string, value: object): Promise<T> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(value),
    });
    const result = (await response.json()) as { data?: T; error?: { message?: string } };
    if (!response.ok || !result.data)
      throw new Error(result.error?.message ?? '処理できませんでした。再試行してください。');
    return result.data;
  }

  async function save(nextContent = content) {
    if (busy.current || !nextContent.originalText.trim()) return;
    busy.current = true;
    setPending(true);
    setMessage('');
    const serialized = JSON.stringify({
      content: nextContent,
      expectedRevision: saved?.revision ?? 0,
    });
    const operation =
      retry?.serialized === serialized ? retry : { key: crypto.randomUUID(), serialized };
    setRetry(operation);
    try {
      if (firstTopicEndpoint && !firstTopic.current) {
        const result = await send<{ outcome: string; topic?: { id: string } }>(firstTopicEndpoint, {
          title: nextContent.originalText.trim().slice(0, 160),
          first: true,
        });
        if (result.outcome !== 'CREATED' || !result.topic)
          throw new Error('テーマを準備できませんでした。画面を開き直してください。');
        firstTopic.current = result.topic.id;
        const page = new URL(window.location.href);
        page.searchParams.set('topicId', result.topic.id);
        window.history.replaceState(null, '', page);
      }
      const unchanged =
        saved &&
        Object.entries(nextContent).every(
          ([key, value]) => saved[key as keyof PersonalLearningRequestContent] === value,
        );
      const request =
        simpleStart && unchanged
          ? saved
          : await send<SavedPersonalLearningRequest>(topicUrl(endpoint), {
              content: nextContent,
              expectedRevision: saved?.revision ?? 0,
              idempotencyKey: operation.key,
            });
      setContent(nextContent);
      setSaved(request);
      setRetry(null);
      if (simpleStart && candidateEndpoint && !practice.current) {
        const lesson = await send<SavedLearningLessonCandidate>(topicUrl(candidateEndpoint), {
          action: 'GENERATE',
          requestId: request.id,
          requestRevision: request.revision,
          operationId: request.id,
        });
        setCandidate(lesson);
        setMessage(lesson.proposal.status === 'READY' ? '最初の練習を用意しました。' : '');
      } else {
        setMessage('希望を保存しました。再訪しても同じ希望から再開できます。');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存できませんでした。再試行できます。');
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function start(lesson: SavedLearningLessonCandidate) {
    if (busy.current || !candidateEndpoint || !practiceEndpoint || !practice.allowed) return;
    busy.current = true;
    setPending(true);
    setMessage('');
    try {
      const identity = {
        requestId: lesson.requestId,
        requestRevision: lesson.requestRevision,
        candidateId: lesson.id,
      };
      if (!lesson.confirmedAt)
        setCandidate(
          await send<SavedLearningLessonCandidate>(topicUrl(candidateEndpoint), {
            action: 'CONFIRM',
            ...identity,
          }),
        );
      const current = await send<NonNullable<PersonalLearningPracticeState['current']>>(
        topicUrl(practiceEndpoint),
        { action: 'START', ...identity },
      );
      setPractice({ ...practice, current });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '練習を開始できませんでした。');
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  const selectedCandidate = matchesSaved && candidate?.requestId === saved?.id ? candidate : null;
  const requestPanel = (
    <div className={`${design.panel} ${design.requestPanel}`} id="learning-request-record">
      <h1>
        {simpleStart
          ? 'AIで何ができるようになりたいですか？'
          : dynamicMode
            ? 'AIでできるようになりたいこと'
            : 'AIを使って、何ができるようになりたいですか？'}
      </h1>
      <p>
        {simpleStart
          ? 'AIで試したいことを一つ書いてください。'
          : dynamicMode
            ? 'AIで試したいことを一つ書いてください。新しい実践を始めるまで、今の実践は続けられます。'
            : 'あなたの希望を元のまま保存します。未回答の経験や能力は推測しません。'}
      </p>
      {!dynamicMode && (
        <p>
          {practiceEndpoint
            ? '希望の下書き保存では現在の実践を切り替えません。教材の本人確認後、実践開始を別に確認します。'
            : candidateEndpoint
              ? 'この検証画面では教材候補の確認までです。実践課題の開始は準備中で、現在の課題は切り替わりません。'
              : 'この検証画面では希望の保存までです。教材の生成・確定はまだ行いません。現在の課題は切り替わりません。'}
        </p>
      )}
      {saved && (
        <p>
          {dynamicMode ? '前回の希望：' : `前回保存した希望（版 ${saved.revision}）：`}
          {saved.originalText}
        </p>
      )}
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {browserMaterialHref && (!saved || !browserLearningDevice(saved)) && (
          <p>
            フォームの操作教材を試すなら「検証用の研修申請フォームに入力して、プレビューを確認したい」と書き、使う端末を選んでください。
          </p>
        )}
        <label>
          実現したいこと
          <textarea
            required
            maxLength={2000}
            placeholder={
              simpleStart
                ? '例：営業週報をまとめたい'
                : dynamicMode
                  ? '例：お店のチラシの文章をAIで作れるようになりたい／スマホでAIに写真の説明をさせたい'
                  : undefined
            }
            value={content.originalText}
            onChange={(event) => setContent({ ...content, originalText: event.target.value })}
          />
        </label>
        {dynamicMode ? (
          <details>
            <summary>くわしく伝える（任意）</summary>
            {additionalDetails}
          </details>
        ) : (
          additionalDetails
        )}
        <button disabled={pending || !content.originalText.trim()} type="submit">
          {pending
            ? '準備中…'
            : simpleStart && !practice.current
              ? '最初の練習を見る'
              : simpleStart
                ? '希望を保存'
                : dynamicMode
                  ? 'この内容で始める'
                  : '希望を保存'}
        </button>
      </form>
      {!simpleStart && <p role="status">{message}</p>}
    </div>
  );

  return (
    <section className={design.panels}>
      {practiceEndpoint && (!simpleStart || practice.current) && (
        <div className={design.panel} id="practice-record">
          {!practice.current && (
            <p className={design.practiceEntryHint}>
              記録するには、学習したいことを伝え、実践を始めてください。
            </p>
          )}
          <LearningPracticeCard
            key={practice.current?.assignmentId ?? 'pending'}
            endpoint={topicUrl(practiceEndpoint)}
            state={practice}
            plainLanguage={dynamicMode}
            simpleStart={simpleStart}
            candidate={
              matchesSaved && confirmedCandidate?.requestId === saved?.id
                ? confirmedCandidate
                : null
            }
            onChange={setPractice}
          />
        </div>
      )}
      {simpleStart && (practice.current || selectedCandidate) ? (
        <details>
          <summary>学習の希望を見直す</summary>
          {requestPanel}
        </details>
      ) : (
        requestPanel
      )}
      {simpleStart && (
        <p role="status" aria-label="学習の状態">
          {message}
        </p>
      )}
      {browserMaterialHref && saved && matchesSaved && browserLearningDevice(saved) && (
        <section className="service-entry__card" aria-label="操作教材">
          <h2>画像付き操作教材</h2>
          <a className="button button--secondary" href={browserMaterialHref}>
            画像付き操作教材を確認する
          </a>
        </section>
      )}
      {conversationEndpoint && saved && matchesSaved && (
        <div className={design.panel} id="conversation-record">
          {simpleStart ? (
            <details>
              <summary>AIに質問する</summary>
              {conversationCard()}
            </details>
          ) : (
            conversationCard()
          )}
        </div>
      )}
      {candidateEndpoint &&
        !practice.current &&
        saved &&
        matchesSaved &&
        (!simpleStart || selectedCandidate) && (
          <LearningCandidateCard
            key={`${saved.id}:${candidate?.id ?? 'none'}`}
            endpoint={candidateEndpoint}
            request={saved}
            initial={selectedCandidate}
            onChange={setCandidate}
            plainLanguage={dynamicMode}
            {...(simpleStart
              ? {
                  pendingStart: pending || !practice.allowed,
                  onStart: start,
                  onAnswer: (answer: string) =>
                    save({
                      ...content,
                      currentPosition: [content.currentPosition, answer]
                        .filter(Boolean)
                        .join('\n')
                        .slice(-500),
                    }),
                }
              : practiceEndpoint
                ? { onConfirmed: setConfirmedCandidate }
                : {})}
          />
        )}
    </section>
  );

  function conversationCard() {
    if (!saved || !conversationEndpoint) return null;
    return (
      <LearningConversationCard
        key={saved.id}
        endpoint={topicUrl(conversationEndpoint)}
        sharingEndpoint={appendPath(topicUrl(conversationEndpoint), '/share')}
        request={saved}
        initial={initialConversation?.requestId === saved.id ? initialConversation : null}
        candidate={candidate?.requestId === saved.id ? candidate : null}
        practiceEndpoint={practiceEndpoint ? topicUrl(practiceEndpoint) : ''}
        practice={practice}
        onPracticeChange={setPractice}
        onCandidateChange={setCandidate}
        plainLanguage={dynamicMode}
      />
    );
  }
}
