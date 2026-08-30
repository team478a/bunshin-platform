'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export function ServiceBunshinForm({ serviceSlug }: { serviceSlug: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/services/${encodeURIComponent(serviceSlug)}/bunshins`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: form.get('name'),
        objectiveSummary: form.get('objectiveSummary'),
        audienceSummary: form.get('audienceSummary'),
        personalitySummary: form.get('personalitySummary'),
      }),
    });
    setSaving(false);
    if (!response.ok) {
      setError('保存できませんでした。入力内容を確認して、もう一度お試しください。');
      return;
    }
    router.push(`/s/${serviceSlug}/bunshins`);
    router.refresh();
  }

  return (
    <form className="form-stack" onSubmit={(event) => void submit(event)}>
      <label className="field">
        <span className="field__label">投稿パートナーの名前</span>
        <input className="field__control" name="name" maxLength={100} required />
        <small>例：副業発信さん、やさしい美容案内役</small>
      </label>
      <label className="field">
        <span className="field__label">何について発信しますか？</span>
        <textarea className="field__control" name="objectiveSummary" maxLength={500} required />
        <small>例：初めて副業をする人に、毎日できる小さな行動を伝える</small>
      </label>
      <label className="field">
        <span className="field__label">誰に見てほしいですか？</span>
        <textarea className="field__control" name="audienceSummary" maxLength={500} required />
        <small>例：SNSに慣れていない30代から50代の会社員</small>
      </label>
      <label className="field">
        <span className="field__label">どんな話し方にしますか？</span>
        <select
          className="field__control"
          name="personalitySummary"
          defaultValue="やさしく、短く、わかりやすく話す"
        >
          <option>やさしく、短く、わかりやすく話す</option>
          <option>明るく、元気に、背中を押すように話す</option>
          <option>落ち着いて、ていねいに、信頼できるように話す</option>
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="button button--primary button--full" type="submit" disabled={saving}>
        {saving ? '保存しています…' : 'この内容で作る'}
      </button>
    </form>
  );
}
