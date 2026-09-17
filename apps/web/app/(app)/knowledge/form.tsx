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
  const typeLabels: Record<string, string> = {
    PROFILE: '自分や会社の紹介',
    EXPERIENCE: 'これまでの経験',
    SKILL: 'できること・得意なこと',
    PRODUCT: '商品やサービス',
    FAQ: 'よくある質問と答え',
    CASE: 'これまでの事例',
    ASSET: '持っている資料',
    OTHER: 'その他',
  };
  const router = useRouter();
  const [form, setForm] = useState({
    type: item?.type ?? 'PROFILE',
    title: item?.title ?? '',
    content: item?.content ?? '',
  });
  const [status, setStatus] = useState<'idle' | 'saving' | 'archiving' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const endpoint = `/api/workspaces/${encodeURIComponent(workspaceId)}/knowledge${item ? `/${item.id}` : ''}`;
  async function save(event: FormEvent) {
    event.preventDefault();
    setStatus('saving');
    setMessage('');
    try {
      const response = await fetch(endpoint, {
        method: item ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error();
      const value = (await response.json()) as { data: { id: string } };
      router.push(`/knowledge/${value.data.id}?workspaceId=${workspaceId}` as Route);
      router.refresh();
    } catch {
      setStatus('error');
      setMessage('保存できませんでした。入力内容と通信状態を確認して、もう一度お試しください。');
    }
  }
  async function archive() {
    if (!item) return;
    setStatus('archiving');
    setMessage('');
    try {
      const response = await fetch(`${endpoint}/archive`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error();
      router.push('/knowledge');
    } catch {
      setStatus('error');
      setMessage('使わない設定に変更できませんでした。もう一度お試しください。');
    }
  }
  return (
    <main className="app-page">
      <header className="app-page__heading">
        <h1>{item ? '教えた内容を直す' : '投稿パートナーに新しく教える'}</h1>
        <p>投稿づくりで参考にしてほしい内容を保存します。</p>
      </header>
      <form
        className="settings-card form-stack"
        onSubmit={(event) => {
          void save(event);
        }}
      >
        <label className="field">
          <span className="field__label">種類</span>
          <select
            className="field__control"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            {['PROFILE', 'EXPERIENCE', 'SKILL', 'PRODUCT', 'FAQ', 'CASE', 'ASSET', 'OTHER'].map(
              (value) => (
                <option key={value} value={value}>
                  {typeLabels[value]}
                </option>
              ),
            )}
          </select>
        </label>
        <label className="field">
          <span className="field__label">タイトル</span>
          <input
            className="field__control"
            required
            maxLength={160}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field__label">内容</span>
          <textarea
            className="field__control"
            required
            maxLength={20000}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />
        </label>
        <button
          className="button button--primary button--full"
          type="submit"
          disabled={status === 'saving' || status === 'archiving'}
        >
          {status === 'saving' ? '保存しています…' : '保存'}
        </button>
      </form>
      {message && (
        <p className="notice notice--danger" role="alert">
          {message}
        </p>
      )}
      {item && (
        <button
          className="button button--secondary"
          type="button"
          disabled={status === 'saving' || status === 'archiving'}
          onClick={() => {
            void archive();
          }}
        >
          {status === 'archiving' ? '変更しています…' : '使わないようにする'}
        </button>
      )}
    </main>
  );
}
