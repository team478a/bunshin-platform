'use client';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

const labels = ['名前・種類', '目的', '対象', '人格', '確認'];
export function BunshinWizard({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    slug: '',
    type: 'COPY',
    objectiveSummary: '',
    audienceSummary: '',
    personalitySummary: '',
  });
  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (step < 4) {
      setStep(step + 1);
      return;
    }
    const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/bunshins`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (!response.ok) {
      setError('作成できませんでした。入力内容を確認してください。');
      return;
    }
    const result = (await response.json()) as { data: { id: string } };
    router.push(
      `/bunshins/${result.data.id}?workspaceId=${encodeURIComponent(workspaceId)}` as Route,
    );
  }
  return (
    <main>
      <h1>分身を作る</h1>
      <p>
        Step {step + 1}/5 — {labels[step]}
      </p>
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        {step === 0 && (
          <>
            <label>
              名前
              <input required value={form.name} onChange={(e) => set('name', e.target.value)} />
            </label>
            <label>
              Slug
              <input
                required
                pattern="[a-z0-9-]+"
                value={form.slug}
                onChange={(e) => set('slug', e.target.value)}
              />
            </label>
            <label>
              種類
              <select value={form.type} onChange={(e) => set('type', e.target.value)}>
                <option value="COPY">COPY</option>
                <option value="EXPERT">EXPERT</option>
                <option value="BRAND">BRAND</option>
                <option value="CHARACTER">CHARACTER</option>
              </select>
            </label>
          </>
        )}
        {step === 1 && (
          <label>
            目的
            <textarea
              required
              value={form.objectiveSummary}
              onChange={(e) => set('objectiveSummary', e.target.value)}
            />
          </label>
        )}
        {step === 2 && (
          <label>
            対象者
            <textarea
              required
              value={form.audienceSummary}
              onChange={(e) => set('audienceSummary', e.target.value)}
            />
          </label>
        )}
        {step === 3 && (
          <label>
            人格・話し方
            <textarea
              required
              value={form.personalitySummary}
              onChange={(e) => set('personalitySummary', e.target.value)}
            />
          </label>
        )}
        {step === 4 && (
          <dl>
            <dt>名前</dt>
            <dd>{form.name}</dd>
            <dt>目的</dt>
            <dd>{form.objectiveSummary}</dd>
            <dt>対象者</dt>
            <dd>{form.audienceSummary}</dd>
            <dt>人格</dt>
            <dd>{form.personalitySummary}</dd>
          </dl>
        )}
        {error && <p role="alert">{error}</p>}
        <p>
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)}>
              戻る
            </button>
          )}{' '}
          <button type="submit">{step === 4 ? '作成' : '次へ'}</button>
        </p>
      </form>
    </main>
  );
}
