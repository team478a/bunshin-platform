'use client';
import type { BunshinAggregate } from '@bunshin/platform-domain';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

export function BunshinEditor({
  workspaceId,
  bunshin,
}: {
  workspaceId: string;
  bunshin: BunshinAggregate;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: bunshin.name,
    objectiveSummary: bunshin.objectiveSummary,
    audienceSummary: bunshin.audienceSummary,
    personalitySummary: bunshin.personalitySummary,
  });
  const endpoint = `/api/workspaces/${encodeURIComponent(workspaceId)}/bunshins/${encodeURIComponent(bunshin.id)}`;
  async function save(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (response.ok) router.refresh();
  }
  async function archive() {
    const response = await fetch(`${endpoint}/archive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (response.ok) router.push('/bunshins');
  }
  return (
    <main>
      <h1>{bunshin.name}</h1>
      <form
        onSubmit={(event) => {
          void save(event);
        }}
      >
        <label>
          名前
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          目的
          <textarea
            value={form.objectiveSummary}
            onChange={(e) => setForm({ ...form, objectiveSummary: e.target.value })}
          />
        </label>
        <label>
          対象者
          <textarea
            value={form.audienceSummary}
            onChange={(e) => setForm({ ...form, audienceSummary: e.target.value })}
          />
        </label>
        <label>
          人格
          <textarea
            value={form.personalitySummary}
            onChange={(e) => setForm({ ...form, personalitySummary: e.target.value })}
          />
        </label>
        <p>
          <button type="submit">保存</button>
        </p>
      </form>
      <button
        type="button"
        onClick={() => {
          void archive();
        }}
      >
        アーカイブ
      </button>
    </main>
  );
}
