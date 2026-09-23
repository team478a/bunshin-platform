import { TRAINING_SKILL_LABELS } from '@bunshin/capability-training';
import type { TrainingEvaluation, TrainingParticipantState } from './ai-training-types';

const skillStateLabel = (score: number) =>
  score >= 80 ? 'よくできています' : score >= 60 ? 'できています' : '練習中です';

export function AiTrainingEvaluationCard({
  serviceSlug,
  state,
  evaluation,
  message,
  error,
  toolkitSaving,
  toolkitSaved,
  saving,
  saveToToolkit,
  loadNextMission,
}: {
  serviceSlug: string;
  state: TrainingParticipantState;
  evaluation: TrainingEvaluation;
  message: string;
  error: string;
  toolkitSaving: boolean;
  toolkitSaved: boolean;
  saving: boolean;
  saveToToolkit: () => Promise<void>;
  loadNextMission: () => Promise<void>;
}) {
  return (
    <section className="service-entry__card training-card" aria-labelledby="training-result-title">
      <p className="eyebrow">回答の確認結果</p>
      <h2 id="training-result-title">
        {evaluation.result === 'PASS' ? 'できています' : 'もう一度、短く復習しましょう'}
      </h2>
      <div className="training-score" aria-label={`理解度 ${evaluation.understanding}点`}>
        <strong>{evaluation.understanding}</strong>
        <span>理解度 / 100</span>
      </div>
      <div className="training-skill-results">
        <h3>今回確認した力</h3>
        {evaluation.evaluatedSkillKeys.map((skill) => {
          const score = evaluation.skills[skill];
          return (
            <div className="training-skill-result" key={skill}>
              <div>
                <strong>{TRAINING_SKILL_LABELS[skill]}</strong>
                <span>{skillStateLabel(score)}</span>
              </div>
              <span
                className="training-skill-result__bar"
                role="meter"
                aria-label={`${TRAINING_SKILL_LABELS[skill]} ${score}点`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={score}
              >
                <span style={{ width: `${score}%` }} />
              </span>
            </div>
          );
        })}
      </div>
      {evaluation.strengths.length ? (
        <div className="training-feedback training-feedback--good">
          <h3>できているところ</h3>
          <ul>
            {evaluation.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {evaluation.weaknesses.length ? (
        <div className="training-feedback">
          <h3>次に意識するところ</h3>
          <ul>
            {evaluation.weaknesses.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="training-recommendation">{evaluation.nextRecommendation}</p>
      {message ? <p className="notice notice--success">{message}</p> : null}
      {error ? <p className="notice notice--error">{error}</p> : null}
      {evaluation.result === 'PASS' ? (
        <div className="training-toolkit-save">
          <h3>仕事でまた使う回答ですか？</h3>
          <p>必要なものだけを、自分専用のMy AI Toolkitへ保存できます。</p>
          <button
            className="button button--secondary button--full"
            type="button"
            onClick={() => {
              void saveToToolkit();
            }}
            disabled={toolkitSaving || toolkitSaved}
          >
            {toolkitSaving
              ? '保存しています…'
              : toolkitSaved
                ? 'My AI Toolkitに保存済み'
                : 'My AI Toolkitに保存する'}
          </button>
        </div>
      ) : null}
      <a
        className="button button--secondary button--full"
        href={`/s/${encodeURIComponent(serviceSlug)}/programs/${state.enrollmentId}/toolkit`}
      >
        My AI Toolkitを見る
      </a>
      <button
        className="button button--primary button--full"
        type="button"
        onClick={() => {
          void loadNextMission();
        }}
        disabled={saving}
      >
        {saving
          ? '更新しています…'
          : evaluation.result === 'REVIEW'
            ? '復習してもう一度回答する'
            : '次の課題を見る'}
      </button>
    </section>
  );
}
