import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProgramGoalsAdminEditor } from '../app/s/[serviceSlug]/manage/program-goals/program-goals-admin-editor';
import {
  requireTrainingLearningMode,
  selectableTrainingModes,
} from '../src/services/training-support-mode';

describe('Learning First support selection', () => {
  const training = { moduleKey: 'AI_TRAINING_V1' };
  it('rejects finished output for training, not other programs', () => {
    expect(() => requireTrainingLearningMode(training, ['READY_TO_USE'])).toThrow();
    expect(() => requireTrainingLearningMode(training, ['GUIDED', 'READY_TO_USE'])).toThrow();
    expect(() => requireTrainingLearningMode(training, ['GUIDED'])).not.toThrow();
    expect(() =>
      requireTrainingLearningMode({ moduleKey: 'SOCIAL' }, ['READY_TO_USE']),
    ).not.toThrow();
  });
  it('projects selectable modes without changing historical input', () => {
    const old = ['GUIDED', 'READY_TO_USE'];
    expect(selectableTrainingModes(old, true)).toEqual(['GUIDED']);
    expect(selectableTrainingModes(old, false)).toEqual(old);
    expect(old).toEqual(['GUIDED', 'READY_TO_USE']);
  });
  it('hides finished output from training policy UI, preserving other programs', () => {
    const program = { id: 'program', name: '研修', learningOnly: true, policy: null, goals: [] };
    const html = renderToStaticMarkup(
      <ProgramGoalsAdminEditor serviceSlug="service" programs={[program]} />,
    );
    expect(html).not.toContain('READY_TO_USE');
    expect(html).toContain('GUIDED');
    expect(
      renderToStaticMarkup(
        <ProgramGoalsAdminEditor
          serviceSlug="service"
          programs={[{ ...program, learningOnly: false }]}
        />,
      ),
    ).toContain('READY_TO_USE');
  });
});
