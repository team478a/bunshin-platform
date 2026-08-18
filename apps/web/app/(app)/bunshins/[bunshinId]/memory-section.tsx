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
    if (!response.ok) return setMessage('Memoryを作成できませんでした。入力内容をご確認ください。');
    setForm(initialForm);
    setMessage('Memoryを作成しました。');
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
    setMessage(response.ok ? 'Memoryを更新しました。' : 'Memoryを更新できませんでした。');
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
    setMessage(
      response.ok ? 'Memoryの状態を変更しました。' : 'Memoryの状態を変更できませんでした。',
    );
    if (response.ok) router.refresh();
  }

  async function remove(memory: MemoryView) {
    if (!window.confirm('このMemoryを削除しますか？削除後は復元できません。')) return;
    setMessage(null);
    const response = await fetch(`${endpoint}/${encodeURIComponent(memory.id)}`, {
      method: 'DELETE',
    });
    setMessage(response.ok ? 'Memoryを削除しました。' : 'Memoryを削除できませんでした。');
    if (response.ok) router.refresh();
  }

  return (
    <section className="memory-section">
      <h2>Memory</h2>
      <p>Bunshinだけが利用する経験・考え・好みを手動で登録します。</p>
      <form
        className="memory-form"
        onSubmit={(event) => {
          void create(event);
        }}
      >
        <label>
          種類
          <select
            value={form.type}
            onChange={(event) =>
              setForm({ ...form, type: event.target.value as BunshinMemoryType })
            }
          >
            {memoryTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          内容
          <textarea
            required
            maxLength={20000}
            value={form.content}
            onChange={(event) => setForm({ ...form, content: event.target.value })}
          />
        </label>
        <label>
          要約（任意）
          <input
            maxLength={1000}
            value={form.summary}
            onChange={(event) => setForm({ ...form, summary: event.target.value })}
          />
        </label>
        <label>
          確信度（0〜1）
          <input
            type="number"
            min="0"
            max="1"
            step="0.001"
            value={form.confidence}
            onChange={(event) => setForm({ ...form, confidence: Number(event.target.value) })}
          />
        </label>
        <label>
          重要度（1〜5）
          <input
            type="number"
            min="1"
            max="5"
            step="1"
            value={form.importance}
            onChange={(event) => setForm({ ...form, importance: Number(event.target.value) })}
          />
        </label>
        <button type="submit">Memoryを追加</button>
      </form>

      <div className="memory-tabs">
        <button type="button" aria-pressed={!showInactive} onClick={() => setShowInactive(false)}>
          有効
        </button>
        <button type="button" aria-pressed={showInactive} onClick={() => setShowInactive(true)}>
          無効
        </button>
      </div>
      {message ? <p role="status">{message}</p> : null}
      {visible.length === 0 ? (
        <p>{showInactive ? '無効なMemoryはありません。' : '有効なMemoryはありません。'}</p>
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
      <label>
        種類
        <select
          value={memory.type}
          onChange={(event) =>
            setMemory({ ...memory, type: event.target.value as BunshinMemoryType })
          }
        >
          {memoryTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label>
        内容
        <textarea
          maxLength={20000}
          value={memory.content}
          onChange={(event) => setMemory({ ...memory, content: event.target.value })}
        />
      </label>
      <label>
        要約
        <input
          maxLength={1000}
          value={memory.summary ?? ''}
          onChange={(event) => setMemory({ ...memory, summary: event.target.value })}
        />
      </label>
      <div className="memory-numbers">
        <label>
          確信度
          <input
            type="number"
            min="0"
            max="1"
            step="0.001"
            value={memory.confidence}
            onChange={(event) => setMemory({ ...memory, confidence: Number(event.target.value) })}
          />
        </label>
        <label>
          重要度
          <input
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
        <button type="button" onClick={() => void onUpdate(memory)}>
          保存
        </button>
        <button type="button" onClick={() => void onSetActive(memory)}>
          {memory.active ? '無効にする' : '有効にする'}
        </button>
        <button type="button" className="danger" onClick={() => void onDelete(memory)}>
          削除
        </button>
      </div>
    </li>
  );
}
