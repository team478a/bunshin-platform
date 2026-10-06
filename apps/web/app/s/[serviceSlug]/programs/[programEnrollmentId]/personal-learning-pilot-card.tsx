'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type {
  LearningConsultationAnswer,
  LearningConsultationResult,
  PersonalLearningState,
  LearningRouterResult,
} from '@bunshin/application';
import type {
  TrainingAction,
  TrainingEvaluation,
  TrainingInteractionType,
} from './ai-training-types';
import { AiTrainingMissionCard } from './ai-training-mission-card';
import { AiTrainingEvaluationCard } from './ai-training-evaluation-card';

const titles: Record<string, string> = {
  PROMPT_STRUCTURE: 'AIへの指示の基本構造',
  CONTEXT_SETTING: '必要な背景情報の伝え方',
  CONSTRAINT_SETTING: '条件の指定方法',
};
export function personalLearningRouterMessage(status: string, reason?: string) {
  if (status === 'NEXT' && reason === 'ASSESSMENT_PASSED')
    return '前回の結果をもとに、次はこちらを学びましょう';
  return (
    (
      {
        NEXT: '次はこちらを学びましょう',
        REVIEW: '前回の結果をもとに、ここをもう一度確認しましょう',
        RETRY: '前回の結果をもとに、もう一度やってみましょう',
        BLOCKED: '前の学習の確認が必要です',
        UNKNOWN: '学習状態を確認できませんでした。もう一度お試しください。',
        PLAN_COMPLETED: '今回の学習プランを完了しました。研修修了や契約終了ではありません。',
      } as Record<string, string>
    )[status] ?? '学習状態を確認できませんでした。'
  );
}
export type PersonalLearningPilotSnapshot = {
  state: PersonalLearningState;
  assignment: (TrainingAction & { definitionKey: string | null; planCompleted?: boolean }) | null;
  readiness: { profileReady: boolean; approvalReady: boolean };
};
const errorMessage = '学習状態を確認できませんでした。もう一度お試しください。';

export function PersonalLearningPilotCard({
  serviceSlug,
  enrollmentId,
  initialSnapshot,
}: {
  serviceSlug: string;
  enrollmentId: string;
  initialSnapshot?: PersonalLearningPilotSnapshot;
}) {
  const base = `/api/services/${encodeURIComponent(serviceSlug)}/ai-training/enrollments/${encodeURIComponent(enrollmentId)}`;
  const [snapshot, setSnapshot] = useState<PersonalLearningPilotSnapshot | null>(
    initialSnapshot ?? null,
  );
  const [text, setText] = useState('');
  const [answers, setAnswers] = useState<LearningConsultationAnswer[]>([]);
  const [consultation, setConsultation] = useState<LearningConsultationResult | null>(null);
  const [router, setRouter] = useState<LearningRouterResult | null>(null);
  const [answer, setAnswer] = useState('');
  const [evaluation, setEvaluation] = useState<TrainingEvaluation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState(false);
  const [help, setHelp] = useState(false);
  const [postponed, setPostponed] = useState(false);
  const [fitSaved, setFitSaved] = useState(false);
  // Stable operation keys survive a network retry; durable state is recovered from the server.
  const keys = useRef<Record<string, string>>({});
  const key = (operation: string) => (keys.current[operation] ??= crypto.randomUUID());
  async function api<T>(path: string, value?: unknown): Promise<T> {
    const response = await fetch(
      path,
      value === undefined
        ? { cache: 'no-store' }
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(value),
          },
    );
    const json = (await response.json()) as { data: T };
    if (!response.ok) throw new Error(errorMessage);
    return json.data;
  }
  async function reload() {
    const value = await api<PersonalLearningPilotSnapshot>(`${base}/personal-learning`);
    setSnapshot(value);
    return value;
  }
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch {
      setError(errorMessage);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let live = true;
    void api<PersonalLearningPilotSnapshot>(`${base}/personal-learning`)
      .then((value) => {
        if (live) setSnapshot(value);
      })
      .catch(() => {
        if (live) setError(errorMessage);
      });
    return () => {
      live = false;
    };
    // The URL identity is stable for this page. No consultation is persisted in browser storage.
  }, [base]);
  const current = snapshot?.state.plans.find((row) => row.isCurrent && row.goalActive);
  const goal = snapshot?.state.goals.find((row) => row.reference.reference.status === 'ACTIVE');
  const action = snapshot?.assignment;
  const planCompleted = router?.status === 'PLAN_COMPLETED' || action?.planCompleted === true;
  async function consult(nextAnswers: LearningConsultationAnswer[] = []) {
    setAnswers(nextAnswers);
    setConsultation(
      await api<LearningConsultationResult>(`${base}/personal-learning`, {
        operation: 'CONSULT',
        telemetryKey: key(`consult_${nextAnswers.length}`),
        consultation: { text, answers: nextAnswers },
      }),
    );
  }
  async function choose(option: string) {
    if (!consultation || !('question' in consultation)) return;
    const question = consultation.question;
    const next = [
      ...answers,
      {
        questionKey: question.key,
        answerKey: option,
        ...(question.candidateKey ? { candidateKey: question.candidateKey } : {}),
      },
    ];
    if (question.key !== 'GOAL_CONFIRMATION' || option !== 'YES') {
      await consult(next);
      return;
    }
    const result = await api<{ goalId: string }>(`${base}/personal-learning`, {
      operation: 'CONFIRM_GOAL',
      consultation: { text, answers: next },
      idempotencyKey: key('goal'),
    });
    // Goal and Plan confirmation remain separate human decisions.
    await api(`${base}/personal-learning`, { operation: 'PREPARE_PLAN', goalId: result.goalId });
    setText('');
    setAnswers([]);
    setConsultation(null);
    await reload();
  }
  async function nextLearning() {
    if (!current) return;
    const value = await api<{ result: LearningRouterResult }>(`${base}/personal-learning`, {
      operation: 'NEXT',
      planId: current.plan.planId,
      revision: current.plan.revision,
      idempotencyKey: key(
        `next_${current.plan.planId}_${current.plan.revision}_${action?.id ?? 'initial'}`,
      ),
    });
    setRouter(value.result);
    setEvaluation(null);
    setAnswer('');
    setHint(false);
    setHelp(false);
    setPostponed(false);
    setFitSaved(false);
    await reload();
  }
  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    await run(async () => {
      if (!action) return;
      let answerId = action.submission?.answerId;
      if (!answerId) {
        const result = await api<{ answer: { id: string } }>(`${base}/answers`, {
          missionAssignmentId: action.id,
          answer,
          idempotencyKey: key(`answer_${action.id}`),
        });
        answerId = result.answer.id;
      }
      const result = await api<{ status: string; evaluation?: TrainingEvaluation }>(
        `${base}/answers/${answerId}/evaluate`,
        { idempotencyKey: key(`evaluate_${answerId}`) },
      );
      if (result.status === 'READY' && result.evaluation) setEvaluation(result.evaluation);
      await reload();
    });
  }
  async function interaction(interactionType: TrainingInteractionType) {
    if (!action) return;
    await run(async () => {
      await api(`${base}/actions`, {
        missionAssignmentId: action.id,
        interactionType,
        idempotencyKey: key(`${action.id}_${interactionType}`),
      });
    });
  }
  const state = {
    enrollmentId,
    programName: 'Personal Learning',
    enrollmentStatus: 'ACTIVE' as const,
    startsAt: '',
    endsAt: null,
    profile: null,
    goal: null,
    action: action ?? null,
  };
  return (
    <>
      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}
      {!snapshot ? (
        <button
          className="button button--secondary button--full"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await reload();
            })
          }
        >
          学習状態を確認する
        </button>
      ) : null}
      {snapshot && !snapshot.readiness.profileReady ? (
        <p className="notice" role="status">
          Pilotの学習設定を準備中です。運営者へ確認してください。未回答の経験を初心者とは扱いません。
        </p>
      ) : null}
      {snapshot && snapshot.readiness.profileReady && !goal && !current ? (
        <section className="service-entry__card training-card">
          {!consultation ? (
            <form
              className="form-stack"
              onSubmit={(event) => {
                event.preventDefault();
                void run(() => consult());
              }}
            >
              <h2>今日は何を学びたいですか？</h2>
              <p>
                現在はAIへの指示の構造・背景・条件を学べます。業務秘密や個人情報は入力しないでください。
              </p>
              <label className="field">
                <span className="field__label">AIでどんなことができるようになりたいですか？</span>
                <textarea
                  className="field__control"
                  maxLength={2000}
                  rows={3}
                  required
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
              </label>
              {['プロンプトを学びたい', '何を学べばいいか分からない'].map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className="button button--secondary button--full"
                  onClick={() => setText(choice)}
                >
                  {choice}
                </button>
              ))}
              <button className="button button--primary button--full" disabled={busy}>
                学習目標を相談する
              </button>
            </form>
          ) : (
            <>
              {consultation.status === 'GOAL_CANDIDATE' ? (
                <>
                  <h2>あなたの学習目標</h2>
                  <p>{consultation.candidate.learningObjective}</p>
                </>
              ) : null}
              {'question' in consultation ? (
                <>
                  <h2>
                    {consultation.question.key === 'GOAL_CONFIRMATION'
                      ? 'この内容を学びますか？'
                      : consultation.question.text}
                  </h2>
                  {consultation.question.options
                    .filter((item) => !['IMAGE', 'AUTOMATION', 'AGENT'].includes(item.key))
                    .map((item) => (
                      <button
                        key={item.key}
                        className="button button--primary button--full"
                        disabled={busy}
                        onClick={() => void run(() => choose(item.key))}
                      >
                        {item.label}
                      </button>
                    ))}
                </>
              ) : (
                <p>
                  {consultation.status === 'LEARNING_DEFINITION_GAP'
                    ? 'このテーマの学習メニューは現在準備中です。'
                    : consultation.status === 'OUTSIDE_SCOPE'
                      ? 'このAI研修では、事業戦略や学習以外の相談は対象としていません。AIの使い方やAIスキルについて学ぶことはできます。'
                      : consultation.status === 'LEARNING_SUPPORT'
                        ? '現在の課題でヒントや学習支援をご利用ください。'
                        : consultation.status === 'DECLINED'
                          ? '今は学習目標を決めません。希望が決まったら、また選べます。'
                          : '学習希望を確認できませんでした。改めて学びたいことを選んでください。'}
                </p>
              )}
              <button
                className="button button--secondary button--full"
                disabled={busy}
                onClick={() => {
                  setConsultation(null);
                  setAnswers([]);
                  keys.current = {};
                }}
              >
                学習希望を変更する
              </button>
            </>
          )}
        </section>
      ) : null}
      {goal && !current ? (
        <button
          className="button button--primary button--full"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await api(`${base}/personal-learning`, {
                operation: 'PREPARE_PLAN',
                goalId: goal.reference.reference.programMemberGoalId,
              });
              await reload();
            })
          }
        >
          選んだ目標の学習プランを確認する
        </button>
      ) : null}
      {current ? (
        <section className="service-entry__card training-card">
          <h2>あなたの学習プラン</h2>
          <p>学習結果に応じて進みます。ステップ数で受講期間は決まりません。</p>
          <ol>
            {current.plan.steps.map((step) => (
              <li key={step.definition.definitionKey}>
                {titles[step.definition.definitionKey] ?? '学習テーマ'}
                {planCompleted
                  ? ' — 完了'
                  : (router?.definition?.definitionKey ?? action?.definitionKey) ===
                      step.definition.definitionKey
                    ? ' — 学習中'
                    : current.plan.steps.findIndex(
                          (item) =>
                            item.definition.definitionKey ===
                            (router?.definition?.definitionKey ?? action?.definitionKey),
                        ) > current.plan.steps.indexOf(step)
                      ? ' — 完了'
                      : ' — 未学習'}
              </li>
            ))}
          </ol>
          {current.plan.status === 'DRAFT' ? (
            <button
              className="button button--primary button--full"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api(`${base}/personal-learning`, {
                    operation: 'CONFIRM_PLAN',
                    planId: current.plan.planId,
                    revision: current.plan.revision,
                    idempotencyKey: key('plan'),
                  });
                  await reload();
                })
              }
            >
              このプランで学ぶ
            </button>
          ) : !action && !planCompleted ? (
            <button
              className="button button--primary button--full"
              disabled={busy || (!!action && !action.submission && !evaluation)}
              onClick={() => void run(nextLearning)}
            >
              今日の学習を確認する
            </button>
          ) : null}
        </section>
      ) : null}
      {router || planCompleted ? (
        <p className="notice" role="status">
          {personalLearningRouterMessage(
            planCompleted ? 'PLAN_COMPLETED' : router!.status,
            router?.reason,
          )}
        </p>
      ) : null}
      {evaluation ? (
        <>
          <AiTrainingEvaluationCard
            pilot
            serviceSlug={serviceSlug}
            state={state}
            evaluation={evaluation}
            message=""
            error=""
            toolkitSaving={false}
            toolkitSaved={false}
            saving={busy}
            workResult={null}
            workResultSaving={false}
            saveToToolkit={async () => {}}
            saveWorkResult={async () => {}}
            loadNextMission={async () => {
              await run(nextLearning);
            }}
          />
          <section className="service-entry__card training-card">
            <h2>この内容は自分に合っていましたか？</h2>
            {(
              [
                ['FIT', '合っていた'],
                ['NEUTRAL', 'どちらとも言えない'],
                ['NOT_FIT', '合っていなかった'],
              ] as const
            ).map(([fit, label]) => (
              <button
                key={fit}
                className="button button--secondary button--full"
                disabled={busy || fitSaved}
                onClick={() =>
                  void run(async () => {
                    if (!action) return;
                    await api(`${base}/personal-learning`, {
                      operation: 'FEEDBACK',
                      assignmentId: action.id,
                      fit,
                    });
                    setFitSaved(true);
                  })
                }
              >
                {label}
              </button>
            ))}
            {fitSaved ? <p role="status">回答ありがとうございます。</p> : null}
          </section>
        </>
      ) : action && !planCompleted ? (
        <AiTrainingMissionCard
          pilot
          state={state}
          action={action}
          answer={answer}
          setAnswer={setAnswer}
          hintVisible={hint}
          setHintVisible={setHint}
          helpVisible={help}
          setHelpVisible={setHelp}
          supportSkill={null}
          postponed={postponed}
          setPostponed={setPostponed}
          interactionSaving={busy ? 'HINT_VIEWED' : null}
          barrierSaving={false}
          saving={busy}
          message=""
          error=""
          recordInteraction={interaction}
          adjustMission={async () => {}}
          editGoal={() => {}}
          submitAnswer={submit}
        />
      ) : null}
    </>
  );
}
