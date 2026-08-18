'use client';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';
export function KnowledgeForm({
  workspaceId,
  item,
}: {
  workspaceId: string;
  item?: { id: string; type: string; title: string; content: string };
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    type: item?.type ?? 'PROFILE',
    title: item?.title ?? '',
    content: item?.content ?? '',
  });
  const endpoint = `/api/workspaces/${encodeURIComponent(workspaceId)}/knowledge${item ? `/${item.id}` : ''}`;
  async function save(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(endpoint, {
      method: item ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (response.ok) {
      const value = (await response.json()) as { data: { id: string } };
      router.push(`/knowledge/${value.data.id}?workspaceId=${workspaceId}` as Route);
      router.refresh();
    }
  }
  async function archive() {
    if (!item) return;
    const response = await fetch(`${endpoint}/archive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (response.ok) router.push('/knowledge' as Route);
  }
  return (
    <main>
      <h1>{item ? 'Knowledge編集' : 'Knowledge作成'}</h1>
      <form
        onSubmit={(event) => {
          void save(event);
        }}
      >
        <label>
          種類
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {['PROFILE', 'EXPERIENCE', 'SKILL', 'PRODUCT', 'FAQ', 'CASE', 'ASSET', 'OTHER'].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </label>
        <label>
          タイトル
          <input
            required
            maxLength={160}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <label>
          内容
          <textarea
            required
            maxLength={20000}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />
        </label>
        <button type="submit">保存</button>
      </form>
      {item && (
        <button
          type="button"
          onClick={() => {
            void archive();
          }}
        >
          アーカイブ
        </button>
      )}
    </main>
  );
}
