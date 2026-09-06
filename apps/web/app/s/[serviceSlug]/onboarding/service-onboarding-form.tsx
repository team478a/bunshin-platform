'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { serviceOnboardingChoicePreset } from '../../../../src/services/service-onboarding-settings';

const OTHER = '__OTHER__';

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
  const [selections, setSelections] = useState(() => questions.map(() => ''));
  const [customAnswers, setCustomAnswers] = useState(() => questions.map(() => ''));

  const answers = questions.map((question, index) => {
    const preset = serviceOnboardingChoicePreset(question);
    if (!preset || selections[index] === OTHER) return customAnswers[index]?.trim() ?? '';
    return selections[index]?.trim() ?? '';
  });
  const complete = answers.every(Boolean);

  async function submit() {
    if (!complete) {
      setMessage('すべての質問に回答してください。');
      return;
    }
    setSaving(true);
    setMessage('');
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
    router.replace(`/s/${encodeURIComponent(serviceSlug)}/bunshins/new`);
    router.refresh();
  }

  return (
    <form action={submit} className="service-onboarding-form">
      {questions.map((question, index) => {
        const preset = serviceOnboardingChoicePreset(question);
        if (!preset) {
          return (
            <label key={`${index}-${question}`}>
              <span>
                {index + 1}. {question}
              </span>
              <textarea
                value={customAnswers[index] ?? ''}
                onChange={(event) =>
                  setCustomAnswers((current) =>
                    current.map((value, itemIndex) =>
                      itemIndex === index ? event.target.value : value,
                    ),
                  )
                }
                required
                maxLength={1000}
                rows={3}
              />
            </label>
          );
        }
        return (
          <fieldset className="service-onboarding-question" key={`${index}-${question}`}>
            <legend>
              {index + 1}. {question}
            </legend>
            <div className="onboarding-options service-onboarding-options">
              {preset.options.map((option) => (
                <button
                  aria-pressed={selections[index] === option}
                  className={selections[index] === option ? 'is-selected' : ''}
                  key={option}
                  onClick={() =>
                    setSelections((current) =>
                      current.map((value, itemIndex) => (itemIndex === index ? option : value)),
                    )
                  }
                  type="button"
                >
                  <span>{option}</span>
                  <small>{selections[index] === option ? '選択中' : '選ぶ'}</small>
                </button>
              ))}
              <button
                aria-pressed={selections[index] === OTHER}
                className={selections[index] === OTHER ? 'is-selected' : ''}
                onClick={() =>
                  setSelections((current) =>
                    current.map((value, itemIndex) => (itemIndex === index ? OTHER : value)),
                  )
                }
                type="button"
              >
                <span>{preset.otherLabel}</span>
                <small>{selections[index] === OTHER ? '入力中' : '選ぶ'}</small>
              </button>
            </div>
            {selections[index] === OTHER ? (
              <label className="service-onboarding-other">
                回答を入力してください
                <textarea
                  autoFocus
                  value={customAnswers[index] ?? ''}
                  onChange={(event) =>
                    setCustomAnswers((current) =>
                      current.map((value, itemIndex) =>
                        itemIndex === index ? event.target.value : value,
                      ),
                    )
                  }
                  required
                  maxLength={1000}
                  rows={3}
                />
              </label>
            ) : null}
          </fieldset>
        );
      })}
      <button
        className="button button--primary button--full"
        type="submit"
        disabled={saving || !complete}
      >
        {saving ? '保存しています…' : '回答してはじめる'}
      </button>
      {message && <p role="alert">{message}</p>}
    </form>
  );
}
