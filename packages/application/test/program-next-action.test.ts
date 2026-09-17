import { describe, expect, it } from 'vitest';
import { defineNextActionDecision } from '../src/program-next-action';

describe('defineNextActionDecision', () => {
  it('accepts a work decision without a reevaluation time', () => {
    expect(
      defineNextActionDecision({
        actionKey: 'ITEM_FIND',
        mode: 'WORK',
        reasonCode: 'NO_ACTIVE_ITEM',
        target: null,
        ruleVersion: 'AI_RESALE_V1_RULES_1',
        reevaluateAt: null,
      }),
    ).toMatchObject({ actionKey: 'ITEM_FIND', mode: 'WORK' });
  });

  it('requires WAIT to declare when it should be reevaluated', () => {
    expect(() =>
      defineNextActionDecision({
        actionKey: 'WAIT',
        mode: 'WAIT',
        reasonCode: 'LISTING_OBSERVATION_WINDOW',
        target: null,
        ruleVersion: 'AI_RESALE_V1_RULES_1',
        reevaluateAt: null,
      }),
    ).toThrow('WAIT requires reevaluateAt');
  });

  it('rejects unversioned or malformed decision keys', () => {
    expect(() =>
      defineNextActionDecision({
        actionKey: 'item-find',
        mode: 'WORK',
        reasonCode: 'NO_ACTIVE_ITEM',
        target: null,
        ruleVersion: 'AI_RESALE_V1_RULES_1',
        reevaluateAt: null,
      }),
    ).toThrow('invalid actionKey');
  });
});
