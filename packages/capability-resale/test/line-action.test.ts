import { describe, expect, it } from 'vitest';
import { buildAiResaleActionLineMessage, renderAiResaleFallback } from '../src';

describe('AI resale LINE action message', () => {
  it('guides a work action to the exact participant page', () => {
    const display = renderAiResaleFallback({
      actionKey: 'PHOTO',
      mode: 'WORK',
      reasonCode: 'ITEM_AWAITS_PHOTO',
      ruleVersion: 'AI_RESALE_V1_RULES_1',
      target: null,
      reevaluateAt: null,
    });
    const message = buildAiResaleActionLineMessage({
      serviceName: 'ワタシワークス公式',
      display,
      actionUrl: 'https://www.watashi-works.com/s/official/programs/enrollment-1',
    });

    expect(message).toContain('今日やることがあります。');
    expect(message).toContain(display.title);
    expect(message).toContain('目安：10分');
    expect(message).toContain('/s/official/programs/enrollment-1');
  });

  it('treats WAIT as an intentional no-work notification', () => {
    const display = renderAiResaleFallback({
      actionKey: 'WAIT',
      mode: 'WAIT',
      reasonCode: 'LISTING_OBSERVATION_WINDOW',
      ruleVersion: 'AI_RESALE_V1_RULES_1',
      target: null,
      reevaluateAt: new Date('2026-09-19T00:00:00.000Z'),
    });
    const message = buildAiResaleActionLineMessage({
      serviceName: 'ワタシワークス公式',
      display,
      actionUrl: 'https://www.watashi-works.com/s/official/programs/enrollment-1',
    });

    expect(message).toContain('今日は何もしなくてOKです。');
    expect(message).not.toContain('今日やることがあります。');
  });

  it('uses a restart message for recovery', () => {
    const display = renderAiResaleFallback({
      actionKey: 'RECOVERY',
      mode: 'WORK',
      reasonCode: 'PROGRAM_PAUSED',
      ruleVersion: 'AI_RESALE_V1_RULES_1',
      target: null,
      reevaluateAt: null,
    });
    const message = buildAiResaleActionLineMessage({
      serviceName: 'ワタシワークス公式',
      display,
      actionUrl: 'https://www.watashi-works.com/s/official/programs/enrollment-1',
    });

    expect(message).toContain('今日からまた始められます。');
  });
});
