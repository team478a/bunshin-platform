'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

interface EditableBunshin {
  id: string;
  name: string;
  objectiveSummary: string;
  audienceSummary: string;
  personalitySummary: string;
}

export function ServiceBunshinEditor({
  serviceSlug,
  bunshin,
}: {
  serviceSlug: string;
  bunshin: EditableBunshin;
}) {
  const router = useRouter();
  const [form, setForm] = useState(bunshin);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const endpoint = `/api/services/${encodeURIComponent(serviceSlug)}/bunshins/${encodeURIComponent(bunshin.id)}`;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        objectiveSummary: form.objectiveSummary,
        audienceSummary: form.audienceSummary,
        personalitySummary: form.personalitySummary,
      }),
    });
    setSaving(false);
    setMessage(response.ok ? '変更を保存しました。' : '保存できませんでした。');
    if (response.ok) router.refresh();
  }

  async function archive() {
    if (!window.confirm('この投稿パートナーを停止しますか？')) return;
    const response = await fetch(`${endpoint}/archive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (response.ok) {
      router.push(`/s/${serviceSlug}/bunshins`);
      router.refresh();
      return;
    }
    setMessage('停止できませんでした。');
  }

  return (
    <form className="form-stack" onSubmit={(event) => void save(event)}>
      <label className="field">
        <span className="field__label">投稿パートナーの名前</span>
        <input
          className="field__control"
          value={form.name}
          maxLength={100}
          required
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
      </label>
      <label className="field">
        <span className="field__label">何について発信しますか？</span>
        <textarea
          className="field__control"
          value={form.objectiveSummary}
          maxLength={500}
          required
          onChange={(event) => setForm({ ...form, objectiveSummary: event.target.value })}
        />
      </label>
      <label className="field">
        <span className="field__label">誰に見てほしいですか？</span>
        <textarea
          className="field__control"
          value={form.audienceSummary}
          maxLength={500}
          required
          onChange={(event) => setForm({ ...form, audienceSummary: event.target.value })}
        />
      </label>
      <label className="field">
        <span className="field__label">どんな話し方にしますか？</span>
        <textarea
          className="field__control"
          value={form.personalitySummary}
          maxLength={500}
          required
          onChange={(event) => setForm({ ...form, personalitySummary: event.target.value })}
        />
      </label>
      {message && <p role="status">{message}</p>}
      <button className="button button--primary button--full" type="submit" disabled={saving}>
        {saving ? '保存しています…' : '変更を保存する'}
      </button>
      <button className="button" type="button" onClick={() => void archive()}>
        この投稿パートナーを停止する
      </button>
    </form>
  );
}
