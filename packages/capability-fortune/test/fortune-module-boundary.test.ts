import { describe, expect, it } from 'vitest';
import * as definition from '../src/fortune-definition';
import * as knowledge from '../src/fortune-knowledge';
import * as policyError from '../src/fortune-policy-error';
import * as reading from '../src/fortune-reading';
import * as core from '../src/index';
import * as tarot from '../src/tarot';

describe('Fortune capability module boundaries', () => {
  it('preserves the package entry point exports', () => {
    expect(core.FORTUNE_CAPABILITY).toBe(definition.FORTUNE_CAPABILITY);
    expect(core.TAROT_DECK).toBe(tarot.TAROT_DECK);
    expect(core.FortunePolicyError).toBe(policyError.FortunePolicyError);
    expect(core.FortuneDailyReadingService).toBe(reading.FortuneDailyReadingService);
    expect(core.parseFortuneKnowledgePack).toBe(knowledge.parseFortuneKnowledgePack);
  });

  it('keeps deck, reading runtime, and knowledge validation separate', () => {
    expect(tarot.drawTarotCard).toBeTypeOf('function');
    expect('FortuneDailyReadingService' in tarot).toBe(false);
    expect(reading.FortuneDailyReadingService).toBeTypeOf('function');
    expect('parseFortuneKnowledgePack' in reading).toBe(false);
    expect(knowledge.parseFortuneKnowledgePack).toBeTypeOf('function');
    expect('drawTarotCard' in knowledge).toBe(false);
  });
});
