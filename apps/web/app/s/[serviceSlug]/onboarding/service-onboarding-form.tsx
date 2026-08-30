'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ServiceOnboardingForm({
  serviceSlug,
  questions,
}: {
  serviceSlug: string;
  questions: string[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(formData: FormData) {
    setSaving(true);
    setMessage('');
    const answers = questions.map((_, index) => {
      const value = formData.get(`answer-${index}`);
      return typeof value === 'string' ? value : '';
    });
    const response = await fetch(`/api/services/${encodeURIComponent(serviceSlug)}/onboarding`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answers }),
    });
    if (!response.ok) {
      setSaving(false);
      setMessage('保存できませんでした。入力内容を確認して、もう一度お試しください。');
      return;
    }
    router.replace(`/s/${serviceSlug}/home`);
    router.refresh();
  }

  return (
    <form action={submit} className="service-onboarding-form">
      {questions.map((question, index) => (
        <label key={`${index}-${question}`}>
          <span>
            {index + 1}. {question}
          </span>
          <textarea name={`answer-${index}`} required maxLength={1000} rows={3} />
        </label>
      ))}
      <button className="button button--primary button--full" type="submit" disabled={saving}>
        {saving ? '保存しています…' : '回答してはじめる'}
      </button>
      {message && <p role="alert">{message}</p>}
    </form>
  );
}
