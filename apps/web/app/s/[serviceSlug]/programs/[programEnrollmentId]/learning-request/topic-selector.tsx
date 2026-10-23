'use client';
import { useState } from 'react';

type Topic = { id: string; title: string };

export function LearningTopicSelector({
  endpoint,
  pagePath,
  topics,
  selectedTopicId,
  allowCreate = true,
}: {
  endpoint: string;
  pagePath: string;
  topics: Topic[];
  selectedTopicId?: string | undefined;
  allowCreate?: boolean;
}) {
  const [title, setTitle] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function create() {
    if (pending || !title.trim()) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      });
      const result = (await response.json()) as {
        data?: { outcome?: string; topic?: Topic };
        error?: { message?: string };
      };
      if (!response.ok || result.data?.outcome !== 'CREATED' || !result.data.topic)
        throw new Error(result.error?.message ?? 'テーマを作成できませんでした。');
      window.location.assign(`${pagePath}?topicId=${encodeURIComponent(result.data.topic.id)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'テーマを作成できませんでした。');
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="panel" aria-labelledby="learning-topic-title">
      <h1 id="learning-topic-title">学習テーマを選ぶ</h1>
      <p>希望・目標・計画・会話は、選択したテーマごとに分けて保存されます。</p>
      {topics.length > 0 && (
        <ul>
          {topics.map((topic) => (
            <li key={topic.id}>
              {topic.id === selectedTopicId ? (
                <span aria-current="page">{topic.title}（選択中）</span>
              ) : (
                <a href={`${pagePath}?topicId=${encodeURIComponent(topic.id)}`}>{topic.title}</a>
              )}
            </li>
          ))}
        </ul>
      )}
      {allowCreate && (
        <>
          <label>
            {topics.length ? '別のテーマを追加' : '最初のテーマ'}
            <input
              maxLength={160}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <button disabled={pending || !title.trim()} onClick={() => void create()} type="button">
            {pending ? '作成中…' : 'テーマを作成'}
          </button>
          <p role="status">{error}</p>
        </>
      )}
    </section>
  );
}
