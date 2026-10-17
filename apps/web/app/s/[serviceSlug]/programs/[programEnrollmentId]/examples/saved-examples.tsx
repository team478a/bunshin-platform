'use client';

import { useRef, useState } from 'react';

type Example = { id: string; title: string; content: string; createdAt: string };

export function PersonalLearningSavedExamples({
  serviceSlug,
  enrollmentId,
  initialItems,
}: {
  serviceSlug: string;
  enrollmentId: string;
  initialItems: Example[];
}) {
  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const endpoint = `/api/services/${serviceSlug}/ai-training/enrollments/${enrollmentId}/personal-learning/examples`;

  async function save(formData: FormData) {
    setMessage('');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: formData.get('title'), content: formData.get('content') }),
    });
    if (!response.ok) return setMessage('保存できませんでした。入力内容を確認してください。');
    const body = (await response.json()) as { data: Example };
    setItems((current) => [body.data, ...current]);
    formRef.current?.reset();
    setMessage('活用例を保存しました。');
  }

  async function remove(id: string) {
    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) return setMessage('削除できませんでした。再読み込みして確認してください。');
    setItems((current) => current.filter((item) => item.id !== id));
    setMessage('活用例を削除しました。');
  }

  return (
    <section className="space-y-6">
      <form
        ref={formRef}
        id="saved-example-form"
        action={save}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"
      >
        <h2 className="text-lg font-semibold">活用例を保存する</h2>
        <label className="block space-y-1">
          <span>名前</span>
          <input name="title" required maxLength={160} className="w-full rounded border p-3" />
        </label>
        <label className="block space-y-1">
          <span>内容</span>
          <textarea
            name="content"
            required
            maxLength={8000}
            rows={5}
            className="w-full rounded border p-3"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white"
        >
          保存する
        </button>
      </form>
      {message ? <p role="status">{message}</p> : null}
      <ul className="space-y-4">
        {items.map((item) => (
          <li key={item.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold">{item.title}</h2>
              <button
                type="button"
                onClick={() => void remove(item.id)}
                className="text-sm text-red-700"
              >
                削除
              </button>
            </div>
            <p className="whitespace-pre-wrap">{item.content}</p>
            <time className="text-sm text-slate-500" dateTime={item.createdAt}>
              {new Date(item.createdAt).toLocaleDateString('ja-JP')}
            </time>
          </li>
        ))}
        {items.length === 0 ? <li>保存した活用例はまだありません。</li> : null}
      </ul>
    </section>
  );
}
