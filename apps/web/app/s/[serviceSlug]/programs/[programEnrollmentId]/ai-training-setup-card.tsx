import {
  TRAINING_CHALLENGES,
  TRAINING_GOALS,
  TRAINING_TOPICS,
  TRAINING_USE_CASES,
  recommendedTrainingGoalKeys,
  type TrainingChallengeKey,
  type TrainingGoalKey,
  type TrainingTopicKey,
  type TrainingUseCaseKey,
} from '@bunshin/capability-training';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type { TrainingAiLevel, TrainingRole } from './ai-training-types';
import type { TrainingDeviceType } from './ai-training-types';

const roleLabels: Record<TrainingRole, string> = {
  SALES: '営業・接客',
  OFFICE: '事務・バックオフィス',
  MANAGER: '管理職・リーダー',
  OTHER: 'その他',
};
const levelLabels: Record<TrainingAiLevel, string> = {
  BEGINNER: 'ほとんど使ったことがない',
  INTERMEDIATE: '何度か使ったことがある',
};

export function AiTrainingSetupCard({
  setupStep,
  setSetupStep,
  role,
  setRole,
  aiLevel,
  setAiLevel,
  aiUseCases,
  setAiUseCases,
  workChallenges,
  setWorkChallenges,
  preferredTopics,
  setPreferredTopics,
  dailyMinutes,
  setDailyMinutes,
  learningGoalKey,
  setLearningGoalKey,
  workDescription,
  setWorkDescription,
  timeConsumingTask,
  setTimeConsumingTask,
  aiImprovementTarget,
  setAiImprovementTarget,
  deviceType,
  setDeviceType,
  saving,
  error,
  setError,
  saveProfile,
}: {
  setupStep: number;
  setSetupStep: Dispatch<SetStateAction<number>>;
  role: TrainingRole;
  setRole: Dispatch<SetStateAction<TrainingRole>>;
  aiLevel: TrainingAiLevel;
  setAiLevel: Dispatch<SetStateAction<TrainingAiLevel>>;
  aiUseCases: TrainingUseCaseKey[];
  setAiUseCases: Dispatch<SetStateAction<TrainingUseCaseKey[]>>;
  workChallenges: TrainingChallengeKey[];
  setWorkChallenges: Dispatch<SetStateAction<TrainingChallengeKey[]>>;
  preferredTopics: TrainingTopicKey[];
  setPreferredTopics: Dispatch<SetStateAction<TrainingTopicKey[]>>;
  dailyMinutes: 5 | 10 | 15;
  setDailyMinutes: Dispatch<SetStateAction<5 | 10 | 15>>;
  learningGoalKey: TrainingGoalKey;
  setLearningGoalKey: Dispatch<SetStateAction<TrainingGoalKey>>;
  workDescription: string;
  setWorkDescription: Dispatch<SetStateAction<string>>;
  timeConsumingTask: string;
  setTimeConsumingTask: Dispatch<SetStateAction<string>>;
  aiImprovementTarget: string;
  setAiImprovementTarget: Dispatch<SetStateAction<string>>;
  deviceType: TrainingDeviceType;
  setDeviceType: Dispatch<SetStateAction<TrainingDeviceType>>;
  saving: boolean;
  error: string;
  setError: Dispatch<SetStateAction<string>>;
  saveProfile: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const recommendedGoals = recommendedTrainingGoalKeys(role);
  return (
    <section className="service-entry__card training-card" aria-labelledby="training-setup-title">
      <p className="eyebrow">最初のかんたん診断 {setupStep} / 5</p>
      <div className="training-setup-progress" aria-label={`診断 ${setupStep} / 5`}>
        <span style={{ width: `${setupStep * 20}%` }} />
      </div>
      <h2 id="training-setup-title">
        {setupStep === 1
          ? 'あなたの仕事とAI経験'
          : setupStep === 2
            ? '普段の仕事を教えてください'
            : setupStep === 3
              ? '今の使い方と困りごと'
              : setupStep === 4
                ? '学べる内容を選ぶ'
                : '30日後の目標を決める'}
      </h2>
      <p>今の仕事、経験、困りごとに合わせて、毎日の課題を変えます。</p>
      <form
        className="form-stack"
        onSubmit={(event) => {
          void saveProfile(event);
        }}
      >
        {setupStep === 1 ? (
          <>
            <fieldset className="training-choice-group">
              <legend>今の仕事に近いもの</legend>
              {(Object.keys(roleLabels) as TrainingRole[]).map((value) => (
                <label key={value} className="training-choice">
                  <input
                    type="radio"
                    name="role"
                    checked={role === value}
                    onChange={() => setRole(value)}
                  />
                  <span>{roleLabels[value]}</span>
                </label>
              ))}
            </fieldset>
            <fieldset className="training-choice-group">
              <legend>AI・ChatGPTの経験</legend>
              {(Object.keys(levelLabels) as TrainingAiLevel[]).map((value) => (
                <label key={value} className="training-choice">
                  <input
                    type="radio"
                    name="aiLevel"
                    checked={aiLevel === value}
                    onChange={() => setAiLevel(value)}
                  />
                  <span>{levelLabels[value]}</span>
                </label>
              ))}
            </fieldset>
          </>
        ) : null}
        {setupStep === 2 ? (
          <>
            <label className="field">
              <span className="field__label">普段どんな仕事をしていますか？</span>
              <textarea
                className="field__control"
                value={workDescription}
                onChange={(event) => setWorkDescription(event.target.value)}
                minLength={5}
                maxLength={240}
                rows={3}
                placeholder="例：法人向けサービスの営業をしています"
                required
              />
            </label>
            <label className="field">
              <span className="field__label">時間がかかる・面倒だと感じる作業</span>
              <input
                className="field__control"
                value={timeConsumingTask}
                onChange={(event) => setTimeConsumingTask(event.target.value)}
                minLength={2}
                maxLength={160}
                placeholder="例：商談後のメール作成"
                required
              />
            </label>
            <label className="field">
              <span className="field__label">AIで楽にしたい、上手くなりたい仕事</span>
              <input
                className="field__control"
                value={aiImprovementTarget}
                onChange={(event) => setAiImprovementTarget(event.target.value)}
                minLength={2}
                maxLength={160}
                placeholder="例：相手に合わせたフォローメール作成"
                required
              />
            </label>
            <fieldset className="training-choice-group">
              <legend>主に使う端末</legend>
              {(
                [
                  ['SMARTPHONE', 'スマートフォン中心'],
                  ['PC', 'PC中心'],
                  ['BOTH', 'スマートフォン＋PC'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="training-choice">
                  <input
                    type="radio"
                    name="deviceType"
                    checked={deviceType === value}
                    onChange={() => setDeviceType(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            <p className="training-privacy-note">
              顧客名、個人情報、パスワード、機密情報などは入力しないでください。
            </p>
          </>
        ) : null}
        {setupStep === 3 ? (
          <>
            <fieldset className="training-choice-group">
              <legend>今、AIを使っている業務（複数選択可）</legend>
              {TRAINING_USE_CASES.map((option) => (
                <label key={option.key} className="training-choice">
                  <input
                    type="checkbox"
                    checked={aiUseCases.includes(option.key)}
                    onChange={() =>
                      setAiUseCases((current) => {
                        if (option.key === 'NOT_YET') return ['NOT_YET'];
                        const choices = current.filter((value) => value !== 'NOT_YET');
                        return choices.includes(option.key)
                          ? choices.filter((value) => value !== option.key)
                          : [...choices, option.key];
                      })
                    }
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>
            <fieldset className="training-choice-group">
              <legend>仕事で困っていること（複数選択可）</legend>
              {TRAINING_CHALLENGES.map((option) => (
                <label key={option.key} className="training-choice">
                  <input
                    type="checkbox"
                    checked={workChallenges.includes(option.key)}
                    onChange={() =>
                      setWorkChallenges((current) =>
                        current.includes(option.key)
                          ? current.filter((value) => value !== option.key)
                          : [...current, option.key],
                      )
                    }
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>
          </>
        ) : null}
        {setupStep === 4 ? (
          <fieldset className="training-choice-group training-catalog">
            <legend>学びたいテーマ（6つまで）</legend>
            <p className="training-field-help">
              AIでできる仕事の例です。気になるものを選んでください。
            </p>
            {TRAINING_TOPICS.map((option) => (
              <label key={option.key} className="training-choice">
                <input
                  type="checkbox"
                  checked={preferredTopics.includes(option.key)}
                  disabled={!preferredTopics.includes(option.key) && preferredTopics.length >= 6}
                  onChange={() =>
                    setPreferredTopics((current) =>
                      current.includes(option.key)
                        ? current.filter((value) => value !== option.key)
                        : [...current, option.key],
                    )
                  }
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
        ) : null}
        {setupStep === 5 ? (
          <>
            <fieldset className="training-choice-group training-goal-options">
              <legend>30日後にできるようになりたいこと</legend>
              {TRAINING_GOALS.map((goal) => (
                <label key={goal.key} className="training-choice training-goal-choice">
                  <input
                    type="radio"
                    name="learningGoal"
                    checked={learningGoalKey === goal.key}
                    onChange={() => setLearningGoalKey(goal.key)}
                  />
                  <span>
                    <strong>{goal.label}</strong>
                    {recommendedGoals.includes(goal.key) ? <small>あなたにおすすめ</small> : null}
                    {goal.description ? <em>{goal.description}</em> : null}
                  </span>
                </label>
              ))}
            </fieldset>
            <fieldset className="training-choice-group training-time-options">
              <legend>1日に使える時間</legend>
              {([5, 10, 15] as const).map((minutes) => (
                <label key={minutes} className="training-choice">
                  <input
                    type="radio"
                    name="dailyMinutes"
                    checked={dailyMinutes === minutes}
                    onChange={() => setDailyMinutes(minutes)}
                  />
                  <span>{minutes}分</span>
                </label>
              ))}
            </fieldset>
            <p className="training-privacy-note">
              顧客名、個人情報、パスワード、機密情報などは入力しないでください。
            </p>
          </>
        ) : null}
        {error ? <p className="notice notice--error">{error}</p> : null}
        <div className="training-setup-actions">
          {setupStep > 1 ? (
            <button
              className="button button--secondary"
              type="button"
              onClick={() => {
                setError('');
                setSetupStep((current) => current - 1);
              }}
            >
              戻る
            </button>
          ) : null}
          {setupStep < 5 ? (
            <button
              className="button button--primary"
              type="button"
              onClick={() => {
                if (
                  setupStep === 2 &&
                  (!workDescription.trim() ||
                    !timeConsumingTask.trim() ||
                    !aiImprovementTarget.trim())
                ) {
                  setError('普段の仕事と、改善したい仕事を入力してください。');
                  return;
                }
                if (setupStep === 3 && !workChallenges.length) {
                  setError('困っていることを1つ以上選んでください。');
                  return;
                }
                if (setupStep === 4 && !preferredTopics.length) {
                  setError('学びたいテーマを1つ以上選んでください。');
                  return;
                }
                setError('');
                setSetupStep((current) => current + 1);
              }}
            >
              次へ
            </button>
          ) : (
            <button className="button button--primary" disabled={saving}>
              {saving ? '準備しています…' : 'この内容で研修を始める'}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
