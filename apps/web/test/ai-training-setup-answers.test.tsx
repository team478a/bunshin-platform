import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AiTrainingCard } from '../app/s/[serviceSlug]/programs/[programEnrollmentId]/ai-training-card';
import {
  trainingSetupError,
  trainingSetupStepError,
  type TrainingSetupAnswers,
} from '../app/s/[serviceSlug]/programs/[programEnrollmentId]/ai-training-setup-validation';
import type { TrainingParticipantState } from '../app/s/[serviceSlug]/programs/[programEnrollmentId]/ai-training-types';

const answered: TrainingSetupAnswers = {
  role: 'OFFICE',
  aiLevel: 'INTERMEDIATE',
  aiUseCases: ['EMAIL'],
  workChallenges: ['WRITING_TAKES_TIME'],
  preferredTopics: ['WRITING'],
  dailyMinutes: 5,
  learningGoalKey: 'USE_AI_IN_DAILY_WORK',
  workDescription: 'お店の事務をしています',
  timeConsumingTask: '文章の作成',
  aiImprovementTarget: '自分で紹介文を直したい',
  deviceType: 'SMARTPHONE',
};
const initial: TrainingParticipantState = {
  enrollmentId: 'synthetic-enrollment',
  programName: '合成研修',
  enrollmentStatus: 'ACTIVE',
  startsAt: '2026-10-12T00:00:00Z',
  endsAt: null,
  profile: null,
  goal: null,
  action: null,
};

describe('learner setup answers are explicit, not inferred', () => {
  it('new users have no role, experience or usage radio preselected', () => {
    const html = renderToStaticMarkup(
      <AiTrainingCard serviceSlug="synthetic" initialState={initial} />,
    );
    expect(html).toContain('AI・ChatGPTの経験');
    expect(html).not.toContain('checked=""');
  });
  it('restores a previously saved role and experience', () => {
    const html = renderToStaticMarkup(
      <AiTrainingCard
        serviceSlug="synthetic"
        initialState={{
          ...initial,
          profile: {
            role: 'OFFICE',
            aiLevel: 'INTERMEDIATE',
            aiUseCases: ['EMAIL'],
            workChallenges: ['WRITING_TAKES_TIME'],
            preferredTopics: ['WRITING'],
            dailyMinutes: 5,
            learningGoalKey: 'USE_AI_IN_DAILY_WORK',
            workContextComplete: false,
          },
        }}
      />,
    );
    expect(html.match(/checked=""/g)).toHaveLength(2);
  });
  it.each(['role', 'aiLevel', 'deviceType', 'dailyMinutes', 'learningGoalKey'] as const)(
    'refuses an unanswered %s before submit',
    (key) => {
      expect(trainingSetupError({ ...answered, [key]: '' })).not.toBeNull();
    },
  );
  it('does not infer NOT_YET from an empty usage selection', () => {
    expect(trainingSetupStepError(3, { ...answered, aiUseCases: [] })).not.toBeNull();
    expect(trainingSetupStepError(3, { ...answered, aiUseCases: ['NOT_YET'] })).toBeNull();
  });
  it('requires device before advancing even with complete work descriptions', () => {
    expect(trainingSetupStepError(2, { ...answered, deviceType: '' })).not.toBeNull();
    expect(trainingSetupStepError(2, answered)).toBeNull();
  });
  it('does not advance from work descriptions shorter than the API requires', () => {
    expect(trainingSetupStepError(2, { ...answered, workDescription: '  店  ' })).not.toBeNull();
  });
  it('accepts explicit answers without changing them', () => {
    const before = structuredClone(answered);
    expect(trainingSetupError(answered)).toBeNull();
    expect(answered).toEqual(before);
  });
  it('rejects missing challenges and topics', () => {
    expect(trainingSetupError({ ...answered, workChallenges: [] })).not.toBeNull();
    expect(trainingSetupError({ ...answered, preferredTopics: [] })).not.toBeNull();
  });
});
