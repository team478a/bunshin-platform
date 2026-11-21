'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  FORTUNE_INTAKE_QUESTIONS,
  buildFortuneUnderstanding,
  confirmedFortuneUnderstanding,
  fortuneUnderstandingConsultation,
  type FortuneIntakeAnswer,
  type FortuneIntakeKey,
  type FortuneTheme,
  type FortuneUnderstandingItem,
} from '@bunshin/capability-fortune';
import { FortuneDrawButtons } from './fortune-actions';
import { FortuneUnderstandingReview } from './fortune-understanding';

type Step =
  { kind: 'START' | 'DONE' | 'WAIT' | 'UNAVAILABLE' } | { kind: 'QUESTION'; key: FortuneIntakeKey };

export function FortuneDynamicIntake(
  props: Omit<ComponentProps<typeof FortuneDrawButtons>, 'onSelectTheme'>,
) {
  const [started, setStarted] = useState(false);
  const [theme, setTheme] = useState<FortuneTheme>();
  return (
    <>
      {!started ? (
        <>
          <FortuneDrawButtons {...props} />
          <button
            className="button button--secondary"
            type="button"
            onClick={() => setStarted(true)}
          >
            AIと相談を整理してから占う
          </button>
        </>
      ) : theme ? (
        <IntakeConversation
          serviceSlug={props.serviceSlug}
          theme={theme}
          onExit={() => {
            setStarted(false);
            setTheme(undefined);
          }}
        />
      ) : (
        <>
          <FortuneDrawButtons {...props} askConsultation={false} onSelectTheme={setTheme} />
          <button
            className="button button--secondary"
            type="button"
            onClick={() => setStarted(false)}
          >
            通常の占いに戻る
          </button>
        </>
      )}
    </>
  );
}

function IntakeConversation({
  serviceSlug,
  theme,
  onExit,
}: {
  serviceSlug: string;
  theme: FortuneTheme;
  onExit: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: 'START' });
  const [consultation, setConsultation] = useState('');
  const [answers, setAnswers] = useState<FortuneIntakeAnswer[]>([]);
  const [draft, setDraft] = useState('');
  const [asking, setAsking] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState(false);
  const [review, setReview] = useState<FortuneUnderstandingItem[] | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const question = step.kind === 'QUESTION' ? FORTUNE_INTAKE_QUESTIONS[step.key] : null;

  async function ask(nextAnswers: FortuneIntakeAnswer[]) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setAnswers(nextAnswers);
    setDraft('');
    setAsking(true);
    setError(false);
    try {
      const response = await fetch(`/api/services/${serviceSlug}/fortune/intake`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ theme, consultation, answers: nextAnswers }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('intake unavailable');
      const { data } = (await response.json()) as { data: Step };
      setStep(data);
    } catch {
      if (!controller.signal.aborted) setStep({ kind: 'UNAVAILABLE' });
    } finally {
      if (active.current === controller) active.current = null;
      setAsking(false);
    }
  }

  function answer(value: string | null) {
    if (step.kind === 'QUESTION') void ask([...answers, { key: step.key, answer: value }]);
  }

  async function draw(items: readonly FortuneUnderstandingItem[]) {
    active.current?.abort();
    setDrawing(true);
    setError(false);
    try {
      const combined = fortuneUnderstandingConsultation(items);
      const response = await fetch(`/api/services/${serviceSlug}/fortune/today`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ theme, ...(combined ? { consultation: combined } : {}) }),
      });
      if (!response.ok) throw new Error('reading unavailable');
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setDrawing(false);
    }
  }

  function reviewBeforeDrawing() {
    const items = buildFortuneUnderstanding(theme, consultation, answers);
    if (!confirmedFortuneUnderstanding(items).length) {
      void draw(items);
      return;
    }
    active.current?.abort();
    setReview(items);
  }

  if (review) {
    return (
      <div className="fortune-action">
        <FortuneUnderstandingReview
          serviceSlug={serviceSlug}
          items={review}
          drawing={drawing}
          update={(item) =>
            setReview(
              (current) =>
                current?.map((value) => (value.field === item.field ? item : value)) ?? null,
            )
          }
        />
        <div className="button-row">
          <button
            className="button button--primary"
            type="button"
            disabled={drawing}
            onClick={() => void draw(review)}
          >
            {drawing ? 'カードを引いています…' : 'この内容で占う'}
          </button>
          <button
            className="button button--secondary"
            type="button"
            disabled={drawing}
            onClick={() => setReview(null)}
          >
            入力に戻る
          </button>
        </div>
        {error && (
          <p className="form-error" role="alert">
            占いを開始できませんでした。もう一度お試しください。
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="fortune-action">
      <p>AIが必要な質問を選びます。回答は任意で、今回の質問選びと鑑定に使います。</p>
      {step.kind === 'START' && (
        <label className="form-field">
          <span>今回の相談（任意）</span>
          <textarea
            rows={3}
            maxLength={200}
            value={consultation}
            disabled={asking || drawing}
            onChange={(event) => setConsultation(event.target.value)}
          />
        </label>
      )}
      {question && (
        <div className="fortune-action-step fortune-action">
          <h3>{question.text}</h3>
          <div className="button-row">
            {question.choices.map((choice) => (
              <button
                key={choice}
                className="button button--secondary"
                type="button"
                disabled={asking || drawing}
                onClick={() => answer(choice)}
              >
                {choice}
              </button>
            ))}
          </div>
          <label className="form-field">
            <span>自分の言葉で答える（任意）</span>
            <textarea
              rows={2}
              maxLength={50}
              value={draft}
              disabled={asking || drawing}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <div className="button-row">
            <button
              className="button button--secondary"
              type="button"
              disabled={asking || drawing || !draft.trim()}
              onClick={() => answer(draft.trim())}
            >
              回答する
            </button>
            <button
              className="button button--secondary"
              type="button"
              disabled={asking || drawing}
              onClick={() => answer(null)}
            >
              質問をスキップする
            </button>
          </div>
        </div>
      )}
      {step.kind === 'DONE' && <p role="status">ここまでの内容で占えます。</p>}
      {step.kind === 'UNAVAILABLE' && (
        <p role="status">追加の質問を表示できませんでした。通常の占いへ進めます。</p>
      )}
      {asking && <p role="status">次の質問が必要かAIが確認しています。</p>}
      <div className="button-row">
        {(step.kind === 'START' || step.kind === 'WAIT') && (
          <button
            className="button button--secondary"
            type="button"
            disabled={asking || drawing}
            onClick={() => void ask(answers)}
          >
            {step.kind === 'WAIT' ? '次の質問を確認する' : 'AIに相談してみる'}
          </button>
        )}
        <button
          className="button button--primary"
          type="button"
          disabled={drawing}
          onClick={reviewBeforeDrawing}
        >
          {drawing ? 'カードを引いています…' : 'ここまでで占う'}
        </button>
        <button
          className="button button--secondary"
          type="button"
          disabled={drawing}
          onClick={onExit}
        >
          答えたくない・通常の占いに戻る
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          占いを開始できませんでした。もう一度お試しください。
        </p>
      )}
    </div>
  );
}
