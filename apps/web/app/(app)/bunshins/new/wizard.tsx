'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

const steps = ['名前と役割', '達成したいこと', '届けたい相手', '話し方・雰囲気', '確認'] as const;
const roles = [
  {
    value: 'COPY',
    label: '自分らしく発信する',
    description: 'あなたの考えや経験を代わりに言葉にします',
  },
  {
    value: 'EXPERT',
    label: '専門家として伝える',
    description: '知識を分かりやすく整理して届けます',
  },
  {
    value: 'BRAND',
    label: 'ブランドを育てる',
    description: '商品や活動の世界観を一貫して伝えます',
  },
  {
    value: 'CHARACTER',
    label: 'キャラクターとして発信する',
    description: '個性のある語り手として活動します',
  },
] as const;

function createSlug(): string {
  return `bunshin-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

export function BunshinWizard({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(() => ({
    name: '',
    slug: createSlug(),
    type: 'COPY',
    objectiveSummary: '',
    audienceSummary: '',
    personalitySummary: '',
  }));
  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (step < steps.length - 1) {
      setStep((current) => current + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/bunshins`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!response.ok) {
        setError('作成できませんでした。入力内容を確認して、もう一度お試しください。');
        return;
      }
      const result = (await response.json()) as { data: { id: string } };
      router.push(
        `/bunshins/${result.data.id}?workspaceId=${encodeURIComponent(workspaceId)}` as Route,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app-page onboarding-page">
      <header className="onboarding-header">
        <div className="onboarding-header__meta">
          <span>
            STEP {step + 1} / {steps.length}
          </span>
          <span>{steps[step]}</span>
        </div>
        <div className="progress-bar" aria-label={`作成の進捗 ${step + 1}/${steps.length}`}>
          <span style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
        </div>
      </header>

      <form className="wizard-card" onSubmit={(event) => void submit(event)}>
        {step === 0 && (
          <fieldset>
            <legend>あなたのBUNSHINを作りましょう</legend>
            <p className="wizard-lead">あとから変更できます。まずは今のイメージで大丈夫です。</p>
            <label className="field" htmlFor="bunshin-name">
              <span className="field__label">名前</span>
              <input
                className="field__control"
                id="bunshin-name"
                required
                maxLength={80}
                autoFocus
                value={form.name}
                onChange={(event) => set('name', event.target.value)}
                placeholder="例：発信サポートのブンシン"
              />
            </label>
            <div className="choice-field">
              <span className="field__label">どんな役割を任せたいですか？</span>
              <div className="choice-grid">
                {roles.map((role) => (
                  <label
                    className={`choice-card${form.type === role.value ? ' is-selected' : ''}`}
                    key={role.value}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={role.value}
                      checked={form.type === role.value}
                      onChange={() => set('type', role.value)}
                    />
                    <span>
                      <strong>{role.label}</strong>
                      <small>{role.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </fieldset>
        )}
        {step === 1 && (
          <WizardTextarea
            id="objective"
            label="このBUNSHINと何を達成したいですか？"
            hint="仕事や活動で実現したいことを、短く教えてください。"
            placeholder="例：専門知識を発信して、相談してくれる人を増やしたい"
            value={form.objectiveSummary}
            onChange={(value) => set('objectiveSummary', value)}
          />
        )}
        {step === 2 && (
          <WizardTextarea
            id="audience"
            label="誰に届けたいですか？"
            hint="今、どんなことで困っている人でしょうか。"
            placeholder="例：SNS発信を始めたいけれど、何を書けばよいか迷っている個人事業主"
            value={form.audienceSummary}
            onChange={(value) => set('audienceSummary', value)}
          />
        )}
        {step === 3 && (
          <WizardTextarea
            id="personality"
            label="どんな話し方・雰囲気にしますか？"
            hint="あなたらしい言葉や、相手に与えたい印象を教えてください。"
            placeholder="例：親しみやすく、難しいこともかみ砕いて説明する。売り込みすぎない"
            value={form.personalitySummary}
            onChange={(value) => set('personalitySummary', value)}
          />
        )}
        {step === 4 && (
          <fieldset>
            <legend>この内容で作成します</legend>
            <p className="wizard-lead">内容を確認してください。作成後も編集できます。</p>
            <dl className="confirmation-list">
              <ConfirmationItem term="名前" value={form.name} onEdit={() => setStep(0)} />
              <ConfirmationItem
                term="役割"
                value={roles.find((role) => role.value === form.type)?.label ?? ''}
                onEdit={() => setStep(0)}
              />
              <ConfirmationItem
                term="達成したいこと"
                value={form.objectiveSummary}
                onEdit={() => setStep(1)}
              />
              <ConfirmationItem
                term="届けたい相手"
                value={form.audienceSummary}
                onEdit={() => setStep(2)}
              />
              <ConfirmationItem
                term="話し方・雰囲気"
                value={form.personalitySummary}
                onEdit={() => setStep(3)}
              />
            </dl>
          </fieldset>
        )}

        {error && (
          <div className="notice notice--danger" role="alert">
            {error}
          </div>
        )}
        <div className="wizard-actions">
          {step > 0 && (
            <button
              className="button button--secondary"
              type="button"
              disabled={submitting}
              onClick={() => setStep((current) => current - 1)}
            >
              戻る
            </button>
          )}
          <button className="button button--primary" type="submit" disabled={submitting}>
            {step === steps.length - 1 ? (submitting ? '作成中…' : 'BUNSHINを作る') : '次へ'}
          </button>
        </div>
      </form>
    </main>
  );
}

function WizardTextarea({
  id,
  label,
  hint,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <p className="wizard-lead">{hint}</p>
      <label className="field" htmlFor={id}>
        <span className="field__label">あなたの回答</span>
        <textarea
          className="field__control wizard-textarea"
          id={id}
          required
          maxLength={1000}
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      </label>
    </fieldset>
  );
}

function ConfirmationItem({
  term,
  value,
  onEdit,
}: {
  term: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <div>
      <dt>{term}</dt>
      <dd>{value}</dd>
      <button type="button" onClick={onEdit}>
        編集
      </button>
    </div>
  );
}
