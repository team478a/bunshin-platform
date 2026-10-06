import { describe, expect, it } from 'vitest';
import {
  definePracticeCompletion,
  effectivePracticeSupport,
  validateGuidedPracticeCommand,
} from '../src/index';
const completion = {
  action: 'COMPLETE',
  learnerConfirmedCompletion: true,
  usefulResult: true,
} as const;
const ready = {
  command: completion,
  started: true,
  assessmentVerified: true,
  interactions: ['SELF_PROMPTED', 'SELF_EVALUATED'] as const,
  supportLevel: 'GUIDED' as const,
};
describe('Learning First guided practice evidence', () => {
  it('records bounded learner evidence without inferring quality or capability Level', () => {
    expect(definePracticeCompletion(ready)).toMatchObject({
      operator: 'LEARNER',
      outcomeQuality: 'UNKNOWN',
      capabilityLevel: 'UNKNOWN',
      capabilityEvidence: ['GUIDED_COMPLETION', 'SELF_PROMPTED', 'SELF_EVALUATED'],
    });
  });
  it.each([
    { started: false },
    { assessmentVerified: false },
    { interactions: [] },
    { interactions: ['SELF_PROMPTED'] as const },
  ])('requires interaction, assessment and start %j', (missing) => {
    expect(() => definePracticeCompletion({ ...ready, ...missing })).toThrow();
  });
  it.each([
    { action: 'COMPLETE', learnerConfirmedCompletion: false, usefulResult: true },
    { ...completion, usefulResult: false },
    { ...completion, outcome: 'finished confidential email' },
    { action: 'START', supportLevel: 'LOW' },
    { action: 'INTERACT', interaction: 'TRANSFERRED' },
  ])('rejects unsupported or unconfirmed facts %j', (command) => {
    expect(() => validateGuidedPracticeCommand(command)).toThrow();
  });
  it('never reduces recorded support or maps revision to Level 4', () => {
    expect(effectivePracticeSupport('INDEPENDENT', true, false)).toBe('HINTED');
    expect(effectivePracticeSupport('HINTED', false, true)).toBe('GUIDED');
    expect(
      definePracticeCompletion({ ...ready, interactions: [...ready.interactions, 'SELF_REVISED'] })
        .capabilityLevel,
    ).toBe('UNKNOWN');
  });
});
