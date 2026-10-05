import {
  TRAINING_BARRIER_REASONS,
  TRAINING_BARRIER_REASON_LABELS,
  type TrainingSupportSkillPresentationV1,
} from '@bunshin/capability-training';
import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import type {
  TrainingAction,
  TrainingBarrierReason,
  TrainingInteractionType,
  TrainingParticipantState,
} from './ai-training-types';

const difficultyLabels = {
  EASY: 'やさしく確認',
  STANDARD: '実務練習',
  CHALLENGE: '応用チャレンジ',
} as const;

export function AiTrainingMissionCard({
  state,
  action,
  answer,
  setAnswer,
  hintVisible,
  setHintVisible,
  helpVisible,
  setHelpVisible,
  supportSkill,
  postponed,
  setPostponed,
  interactionSaving,
  barrierSaving,
  saving,
  message,
  error,
  recordInteraction,
  adjustMission,
  editGoal,
  submitAnswer,
}: {
  state: TrainingParticipantState;
  action: TrainingAction;
  answer: string;
  setAnswer: Dispatch<SetStateAction<string>>;
  hintVisible: boolean;
  setHintVisible: Dispatch<SetStateAction<boolean>>;
  helpVisible: boolean;
  setHelpVisible: Dispatch<SetStateAction<boolean>>;
  supportSkill: TrainingSupportSkillPresentationV1 | null;
  postponed: boolean;
  setPostponed: Dispatch<SetStateAction<boolean>>;
  interactionSaving: TrainingInteractionType | null;
  barrierSaving: boolean;
  saving: boolean;
  message: string;
  error: string;
  recordInteraction: (interactionType: TrainingInteractionType) => Promise<void>;
  adjustMission: (
    adjustment: { type: 'BARRIER'; reason: TrainingBarrierReason } | { type: 'RESTORE_STANDARD' },
  ) => Promise<void>;
  editGoal: () => void;
  submitAnswer: (event?: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const [barrierOpen, setBarrierOpen] = useState(false);
  return (
    <section className="service-entry__card training-card" aria-labelledby="training-action-title">
      <div className="resale-action-card__meta">
        <span>あなた向け課題</span>
        {action.display.difficulty ? (
          <span>{difficultyLabels[action.display.difficulty]}</span>
        ) : null}
        {action.display.practiceMode ? (
          <span>{action.display.practiceMode === 'WORK' ? '実務モード' : '練習モード'}</span>
        ) : null}
        {action.display.missionVariant === 'SHORT' ? <span>1分版</span> : null}
        {action.display.estimatedMinutes !== null ? (
          <span>目安 {action.display.estimatedMinutes}分</span>
        ) : null}
      </div>
      <p className="eyebrow">今日やること</p>
      <h2 id="training-action-title">{action.display.title}</h2>
      {state.goal ? (
        <p className="training-current-goal">
          <strong>あなたの目標</strong>
          <span>{state.goal.title}</span>
        </p>
      ) : null}
      <p className="training-reason">{action.display.reason}</p>
      {action.display.personalizationStatus === 'PERSONALIZED' ? (
        <p className="training-field-help">
          あなたの初期設定をもとに、仕事の場面を調整しています。
        </p>
      ) : null}
      {action.display.difficultyGuidance ? (
        <p className="training-field-help">{action.display.difficultyGuidance}</p>
      ) : null}
      {action.display.barrierGuidance ? (
        <p className="notice notice--success" role="status">
          {action.display.barrierGuidance}
        </p>
      ) : null}
      {action.display.goalReviewRecommended ? (
        <button className="button button--secondary" type="button" onClick={editGoal}>
          学習目標を見直す
        </button>
      ) : null}
      {action.display.learningObjective ? (
        <div className="training-learning-objective">
          <strong>今回できるようになること</strong>
          <p>{action.display.learningObjective}</p>
        </div>
      ) : null}
      {action.display.businessScenario ? (
        <div className="training-scenario">
          <strong>実務の場面</strong>
          <p>{action.display.businessScenario}</p>
        </div>
      ) : null}
      <div className="training-task">
        <strong>課題</strong>
        <p>{action.display.task}</p>
      </div>
      {action.mode === 'WORK' ? (
        <div className="training-support-actions" aria-label="課題のサポート">
          <button
            className="button button--secondary"
            type="button"
            aria-expanded={hintVisible}
            onClick={() => {
              setHintVisible(true);
              void recordInteraction('HINT_VIEWED');
            }}
            disabled={interactionSaving !== null}
          >
            {interactionSaving === 'HINT_VIEWED' ? '表示しています…' : 'ヒントを見る'}
          </button>
          <button
            className="button button--secondary"
            type="button"
            aria-expanded={helpVisible}
            onClick={() => {
              setHelpVisible(true);
              setHintVisible(true);
              void recordInteraction('HELP_REQUESTED');
            }}
            disabled={interactionSaving !== null}
          >
            {interactionSaving === 'HELP_REQUESTED' ? '確認しています…' : '困った'}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setPostponed(true);
              void recordInteraction('TRAINING_POSTPONED');
            }}
            disabled={interactionSaving !== null || postponed}
          >
            {postponed ? '後で再開できます' : '後でやる'}
          </button>
          <button
            className="button button--secondary"
            type="button"
            aria-expanded={barrierOpen}
            onClick={() => setBarrierOpen((open) => !open)}
            disabled={barrierSaving || action.submission !== null}
          >
            進めにくい理由
          </button>
        </div>
      ) : null}
      {barrierOpen && action.mode === 'WORK' && !action.submission ? (
        <div className="training-hint" aria-label="進めにくい理由を選ぶ">
          <strong>いちばん近い理由を選んでください</strong>
          <p>自由記述は保存しません。選択した理由だけを次の課題調整に使います。</p>
          <div className="training-support-actions">
            {TRAINING_BARRIER_REASONS.map((reason) => (
              <button
                className="button button--secondary"
                type="button"
                key={reason}
                disabled={barrierSaving}
                onClick={() => void adjustMission({ type: 'BARRIER', reason })}
              >
                {TRAINING_BARRIER_REASON_LABELS[reason]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {action.display.missionVariant === 'SHORT' && !action.submission ? (
        <button
          className="button button--secondary"
          type="button"
          disabled={barrierSaving}
          onClick={() => void adjustMission({ type: 'RESTORE_STANDARD' })}
        >
          {barrierSaving ? '切り替えています…' : '通常版に戻す'}
        </button>
      ) : null}
      {hintVisible ? (
        <div className="training-hint" role="status">
          <strong>ヒント</strong>
          <p>
            {action.display.hint ??
              `まず「${action.display.successCriteria?.[0] ?? '課題の目的'}」を確認し、伝えたい内容を一つに絞って書き始めてみましょう。`}
          </p>
        </div>
      ) : null}
      {helpVisible ? (
        <div className="notice training-help" role="status">
          <strong>
            {supportSkill ? 'この手順で進めてみましょう' : '小さく分けて進めましょう'}
          </strong>
          {supportSkill ? (
            <>
              <ol>
                {supportSkill.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p>目指す形: {supportSkill.expectedOutput}</p>
            </>
          ) : (
            <p>上のヒントを使って最初の1文だけ書いてください。短い回答でもAIが改善点を伝えます。</p>
          )}
        </div>
      ) : null}
      {postponed ? (
        <p className="notice notice--success" role="status">
          この画面を閉じても大丈夫です。次に開いたとき、同じ課題から続けられます。
        </p>
      ) : null}
      {action.display.constraints?.length ? (
        <div className="training-quality-list">
          <strong>条件</strong>
          <ul>
            {action.display.constraints.map((constraint) => (
              <li key={constraint}>{constraint}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {action.display.successCriteria?.length ? (
        <div className="training-quality-list training-quality-list--success">
          <strong>確認ポイント</strong>
          <ul>
            {action.display.successCriteria.map((criterion) => (
              <li key={criterion}>{criterion}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {action.display.commonMistakes?.length ? (
        <details className="training-common-mistakes">
          <summary>よくある失敗を見る</summary>
          <ul>
            {action.display.commonMistakes.map((mistake) => (
              <li key={mistake}>{mistake}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {action.display.instructions.length ? (
        <ol className="resale-action-card__steps">
          {action.display.instructions.map((instruction) => (
            <li key={instruction}>{instruction}</li>
          ))}
        </ol>
      ) : null}
      {action.mode === 'WAIT' ? (
        <div className="notice resale-action-card__wait">
          <strong>今日は新しい課題はありません</strong>
          <p>
            {action.reevaluateAt
              ? `${new Intl.DateTimeFormat('ja-JP', {
                  month: 'numeric',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                }).format(new Date(action.reevaluateAt))}ごろに次の課題を確認します。`
              : '次の課題が用意されるまで、そのままお待ちください。'}
          </p>
        </div>
      ) : action.submission ? (
        <div className="training-pending">
          <p>
            {action.submission.evaluationStatus === 'FAILED'
              ? '回答は保存されています。AI評価をもう一度試すことができます。'
              : '回答は保存されています。AIが確認中です。画面を閉じても処理は続きます。'}
          </p>
          {message ? <p className="notice notice--success">{message}</p> : null}
          {error ? <p className="notice notice--error">{error}</p> : null}
          <button
            className="button button--primary button--full"
            type="button"
            onClick={() => {
              void submitAnswer();
            }}
            disabled={saving}
          >
            {saving
              ? '確認しています…'
              : action.submission.evaluationStatus === 'FAILED'
                ? 'AI評価をもう一度試す'
                : '評価状況を確認する'}
          </button>
        </div>
      ) : (
        <form
          className="form-stack"
          onSubmit={(event) => {
            void submitAnswer(event);
          }}
        >
          <label className="field">
            <span className="field__label">あなたの回答</span>
            <textarea
              className="field__control training-answer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              maxLength={10_000}
              rows={8}
              placeholder="ここに回答を書いてください"
              required
            />
          </label>
          {message ? <p className="notice notice--success">{message}</p> : null}
          {error ? <p className="notice notice--error">{error}</p> : null}
          <button className="button button--primary button--full" disabled={saving}>
            {saving ? '回答を確認しています…' : '回答を送って確認する'}
          </button>
          <p className="training-form-note">回答はAIが確認し、次に必要な課題を選ぶ参考にします。</p>
        </form>
      )}
    </section>
  );
}
