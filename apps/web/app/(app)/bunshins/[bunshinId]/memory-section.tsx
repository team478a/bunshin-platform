'use client';

import type { BunshinMemoryType } from '@bunshin/platform-domain';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

const memoryTypes = [
  'BELIEF',
  'EXPERIENCE',
  'KNOWLEDGE',
  'STORY',
  'FAQ',
  'OPINION',
  'PREFERENCE',
  'PERFORMANCE_INSIGHT',
] as const;

const memoryTypeLabels: Record<BunshinMemoryType, string> = {
  BELIEF: '大切にしている考え',
  EXPERIENCE: 'これまでの経験',
  KNOWLEDGE: '知っていること',
  STORY: '伝えたい話',
  FAQ: 'よくある質問と答え',
  OPINION: '自分の意見',
  PREFERENCE: '好きなこと・苦手なこと',
  PERFORMANCE_INSIGHT: 'うまくいったこと',
};

export interface MemoryView {
  id: string;
  type: BunshinMemoryType;
  content: string;
  summary: string | null;
  confidence: number;
  importance: number;
  active: boolean;
}

const initialForm = {
  type: 'EXPERIENCE' as BunshinMemoryType,
  content: '',
  summary: '',
  confidence: 1,
  importance: 3,
};

export function MemorySection({
  workspaceId,
  bunshinId,
  memories,
}: {
  workspaceId: string;
  bunshinId: string;
  memories: MemoryView[];
}) {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [showInactive, setShowInactive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const endpoint = `/api/workspaces/${encodeURIComponent(workspaceId)}/bunshins/${encodeURIComponent(bunshinId)}/memories`;
  const visible = memories.filter((memory) => memory.active !== showInactive);

  async function create(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (!response.ok)
      return setMessage('覚える内容を保存できませんでした。入力を確認してください。');
    setForm(initialForm);
    setMessage('BUNSHINが新しく覚えました。');
    router.refresh();
  }

  async function update(memory: MemoryView) {
    setMessage(null);
    const response = await fetch(`${endpoint}/${encodeURIComponent(memory.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: memory.type,
        content: memory.content,
        summary: memory.summary ?? '',
        confidence: memory.confidence,
        importance: memory.importance,
      }),
    });
    setMessage(response.ok ? '覚えている内容を保存しました。' : '内容を保存できませんでした。');
    if (response.ok) router.refresh();
  }

  async function setActive(memory: MemoryView) {
    setMessage(null);
    const action = memory.active ? 'deactivate' : 'activate';
    const response = await fetch(`${endpoint}/${encodeURIComponent(memory.id)}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    setMessage(response.ok ? '使う内容を変えました。' : '変更できませんでした。');
    if (response.ok) router.refresh();
  }

  async function remove(memory: MemoryView) {
    if (!window.confirm('この内容を忘れさせますか？後から元に戻すことはできません。')) return;
    setMessage(null);
    const response = await fetch(`${endpoint}/${encodeURIComponent(memory.id)}`, {
      method: 'DELETE',
    });
    setMessage(response.ok ? 'この内容を忘れました。' : '削除できませんでした。');
    if (response.ok) router.refresh();
  }

  return (
    <section className="memory-section">
      <div className="memory-section__heading">
        <div>
          <p className="memory-section__eyebrow">分身に教えること</p>
          <h2>BUNSHINが覚えていること</h2>
          <p>
            経験や考えを教えると、投稿づくりや回答に使います。いつでも直したり、お休みにしたりできます。
          </p>
        </div>
        <span className="memory-section__count">
          利用中 {memories.filter((memory) => memory.active).length}件
        </span>
      </div>
      <form
        className="memory-form form-stack"
        onSubmit={(event) => {
          void create(event);
        }}
      >
        <label className="field">
          <span className="field__label">何について教えますか</span>
          <select
            className="field__control"
            value={form.type}
            onChange={(event) =>
              setForm({ ...form, type: event.target.value as BunshinMemoryType })
            }
          >
            {memoryTypes.map((type) => (
              <option key={type} value={type}>
                {memoryTypeLabels[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">内容</span>
          <textarea
            className="field__control"
            required
            maxLength={20000}
            value={form.content}
            onChange={(event) => setForm({ ...form, content: event.target.value })}
          />
        </label>
        <label className="field">
          <span className="field__label">短いまとめ（書かなくても大丈夫）</span>
          <input
            className="field__control"
            maxLength={1000}
            value={form.summary}
            onChange={(event) => setForm({ ...form, summary: event.target.value })}
          />
        </label>
        <label className="field">
          <span className="field__label">どのくらい確かな内容ですか？</span>
          <input
            className="field__control"
            type="number"
            min="0"
            max="1"
            step="0.001"
            value={form.confidence}
            onChange={(event) => setForm({ ...form, confidence: Number(event.target.value) })}
          />
        </label>
        <label className="field">
          <span className="field__label">どれくらい大切ですか？</span>
          <input
            className="field__control"
            type="number"
            min="1"
            max="5"
            step="1"
            value={form.importance}
            onChange={(event) => setForm({ ...form, importance: Number(event.target.value) })}
          />
        </label>
        <button className="button button--primary button--full" type="submit">
          BUNSHINに覚えてもらう
        </button>
      </form>

      <div className="memory-tabs" aria-label="覚えている内容の表示切り替え">
        <button
          className={!showInactive ? 'is-active' : ''}
          type="button"
          aria-pressed={!showInactive}
          onClick={() => setShowInactive(false)}
        >
          有効
        </button>
        <button
          className={showInactive ? 'is-active' : ''}
          type="button"
          aria-pressed={showInactive}
          onClick={() => setShowInactive(true)}
        >
          無効
        </button>
      </div>
      {message ? (
        <p className="form-feedback" role="status">
          {message}
        </p>
      ) : null}
      {visible.length === 0 ? (
        <p className="memory-empty">
          {showInactive
            ? 'お休み中の内容はありません。'
            : 'まだ覚えている内容はありません。上の入力欄から、経験や伝えたいことを教えてください。'}
        </p>
      ) : (
        <ul className="memory-list">
          {visible.map((memory) => (
            <MemoryItem
              key={memory.id}
              initial={memory}
              onUpdate={update}
              onSetActive={setActive}
              onDelete={remove}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function MemoryItem({
  initial,
  onUpdate,
  onSetActive,
  onDelete,
}: {
  initial: MemoryView;
  onUpdate: (memory: MemoryView) => Promise<void>;
  onSetActive: (memory: MemoryView) => Promise<void>;
  onDelete: (memory: MemoryView) => Promise<void>;
}) {
  const [memory, setMemory] = useState(initial);
  return (
    <li className="memory-card">
      <label className="field">
        <span className="field__label">種類</span>
        <select
          className="field__control"
          value={memory.type}
          onChange={(event) =>
            setMemory({ ...memory, type: event.target.value as BunshinMemoryType })
          }
        >
          {memoryTypes.map((type) => (
            <option key={type} value={type}>
              {memoryTypeLabels[type]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">内容</span>
        <textarea
          className="field__control"
          maxLength={20000}
          value={memory.content}
          onChange={(event) => setMemory({ ...memory, content: event.target.value })}
        />
      </label>
      <label className="field">
        <span className="field__label">短いまとめ</span>
        <input
          className="field__control"
          maxLength={1000}
          value={memory.summary ?? ''}
          onChange={(event) => setMemory({ ...memory, summary: event.target.value })}
        />
      </label>
      <div className="memory-numbers">
        <label className="field">
          <span className="field__label">確かさ</span>
          <input
            className="field__control"
            type="number"
            min="0"
            max="1"
            step="0.001"
            value={memory.confidence}
            onChange={(event) => setMemory({ ...memory, confidence: Number(event.target.value) })}
          />
        </label>
        <label className="field">
          <span className="field__label">大切さ</span>
          <input
            className="field__control"
            type="number"
            min="1"
            max="5"
            step="1"
            value={memory.importance}
            onChange={(event) => setMemory({ ...memory, importance: Number(event.target.value) })}
          />
        </label>
      </div>
      <div className="memory-actions">
        <button
          className="button button--primary"
          type="button"
          onClick={() => void onUpdate(memory)}
        >
          保存
        </button>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => void onSetActive(memory)}
        >
          {memory.active ? '無効にする' : '有効にする'}
        </button>
        <button
          className="button button--danger"
          type="button"
          onClick={() => void onDelete(memory)}
        >
          削除
        </button>
      </div>
    </li>
  );
}
