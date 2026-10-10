import { describe, expect, it } from 'vitest';
import { AI_TRAINING_LEARNING_DEFINITION_FIXTURES as definitions } from '@bunshin/capability-training';
import { resolvePersonalLearningFocus } from '../src/services/personal-learning-focus';

const plan = {
  status: 'CONFIRMED' as const,
  steps: definitions.map((d) => ({
    definition: d.reference,
    prerequisites: d.prerequisites,
    selectionReason: 'GOAL_ALIGNMENT',
  })),
};
const assignment = (index: number) => ({
  definitionReference: definitions[index]!.reference,
  actionKey: definitions[index]!.legacyMissionRef.actionKey,
});
describe('Pilot-only versioned learning focus', () => {
  it('distinguishes all three steps without changing shared Mission or assessment', () => {
    const before = JSON.stringify({ plan, definitions });
    const focus = definitions.map((_, i) => resolvePersonalLearningFocus(plan, assignment(i))!);
    expect(new Set(focus.map((f) => f.title)).size).toBe(3);
    expect(focus[0]!.focus).toContain('背景・目的・依頼');
    expect(focus[1]!.focus).toContain('前と同じ課題');
    expect(focus[1]!.assessmentNote).toContain('構造も引き続き');
    expect(focus[2]!.focus).toContain('2つ以上');
    expect(JSON.stringify({ plan, definitions })).toBe(before);
    expect(Object.isFrozen(focus[0])).toBe(true);
  });
  it.each([
    {
      packageKey: 'SALES',
      definitionKey: 'PROMPT_STRUCTURE',
      version: definitions[0]!.reference.version,
    },
    { ...definitions[0]!.reference, version: 'UNKNOWN_VERSION' },
    { ...definitions[0]!.reference, definitionKey: 'UNKNOWN_DEFINITION' },
  ])('never guesses a focus for %j', (definitionReference) => {
    expect(
      resolvePersonalLearningFocus(plan, { ...assignment(0), definitionReference }),
    ).toBeNull();
  });
  it('requires a current confirmed path and exact Mission, not a key-only fallback', () => {
    expect(resolvePersonalLearningFocus(undefined, assignment(0))).toBeNull();
    expect(resolvePersonalLearningFocus({ ...plan, status: 'DRAFT' }, assignment(0))).toBeNull();
    expect(
      resolvePersonalLearningFocus({ ...plan, steps: plan.steps.slice(1) }, assignment(0)),
    ).toBeNull();
    expect(resolvePersonalLearningFocus(plan, { actionKey: 'PROMPT_BASIC' })).toBeNull();
    expect(
      resolvePersonalLearningFocus(plan, { ...assignment(0), actionKey: 'PROMPT_CONDITION' }),
    ).toBeNull();
    expect(
      resolvePersonalLearningFocus(plan, { ...assignment(0), planCompleted: true }),
    ).toBeNull();
    expect(resolvePersonalLearningFocus(plan, null)).toBeNull();
  });
});
