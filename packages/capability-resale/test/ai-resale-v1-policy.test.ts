import { describe, expect, it } from 'vitest';
import {
  AiResaleV1Policy,
  canTransitionResaleItemStatus,
  classifyDaySeven,
  programDayAt,
  recoveryLoadForInactiveDays,
  shouldPauseResaleProgram,
  type AiResaleV1DecisionContext,
  type ResaleItemSnapshot,
} from '../src';

const now = new Date('2026-09-18T03:00:00.000Z');

function item(overrides: Partial<ResaleItemSnapshot> = {}): ResaleItemSnapshot {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'FOUND',
    reactionState: 'UNKNOWN',
    foundAt: new Date('2026-09-17T03:00:00.000Z'),
    listedAt: null,
    reactionObservedAt: null,
    lastImprovedAt: null,
    soldAt: null,
    shippedAt: null,
    reevaluateAt: null,
    ...overrides,
  };
}

function context(overrides: Partial<AiResaleV1DecisionContext> = {}): AiResaleV1DecisionContext {
  return {
    now,
    policyKey: 'PAID_90D',
    programDay: 1,
    programState: 'ACTIVE',
    activityBaselineAt: new Date('2026-09-17T03:00:00.000Z'),
    lastUserActionAt: now,
    pauseAfterDays: 3,
    defaultWaitHours: 24,
    items: [],
    ...overrides,
  };
}

describe('AI resale V1 domain', () => {
  const policy = new AiResaleV1Policy();

  it('uses the service timezone to derive the registration-based program day', () => {
    expect(
      programDayAt({
        startsAt: new Date('2026-09-16T14:30:00.000Z'),
        now: new Date('2026-09-17T15:30:00.000Z'),
        timeZone: 'Asia/Tokyo',
      }),
    ).toBe(3);
  });

  it('classifies DAY7 from item evidence and user action events', () => {
    expect(classifyDaySeven({ items: [], eventTypes: [] })).toBe('NOT_STARTED');
    expect(classifyDaySeven({ items: [], eventTypes: ['ACTION_PARTIAL'] })).toBe('PARTIAL');
    expect(
      classifyDaySeven({
        items: [item({ status: 'LISTED', listedAt: now })],
        eventTypes: [],
      }),
    ).toBe('LISTED');
  });

  it('does not treat an active WAIT window as inactivity', () => {
    expect(
      shouldPauseResaleProgram({
        now,
        activityBaselineAt: new Date('2026-09-01T00:00:00.000Z'),
        lastUserActionAt: null,
        pauseAfterDays: 3,
        activeWaitUntil: new Date('2026-09-19T03:00:00.000Z'),
      }),
    ).toBe(false);
  });

  it('uses three recovery load bands', () => {
    expect(recoveryLoadForInactiveDays(3)).toBe('NORMAL');
    expect(recoveryLoadForInactiveDays(7)).toBe('SMALL');
    expect(recoveryLoadForInactiveDays(14)).toBe('TINY');
  });

  it('enforces the forward-only item lifecycle', () => {
    expect(canTransitionResaleItemStatus('FOUND', 'PHOTOGRAPHED')).toBe(true);
    expect(canTransitionResaleItemStatus('PHOTOGRAPHED', 'FOUND')).toBe(false);
    expect(canTransitionResaleItemStatus('SOLD', 'SHIPPED')).toBe(true);
  });

  it('returns exactly one action using the documented priority', () => {
    const sold = item({
      id: '22222222-2222-4222-8222-222222222222',
      status: 'SOLD',
      reactionState: 'SOLD',
      soldAt: new Date('2026-09-17T05:00:00.000Z'),
    });
    expect(
      policy.evaluate(
        context({
          programState: 'PAUSED',
          items: [sold],
          lastUserActionAt: new Date('2026-09-01T00:00:00.000Z'),
        }),
      ),
    ).toMatchObject({ actionKey: 'SHIPPING', target: { resourceId: sold.id } });
  });

  it('returns RECOVERY before ordinary item work', () => {
    expect(
      policy.evaluate(
        context({
          programState: 'PAUSED',
          items: [item()],
          lastUserActionAt: new Date('2026-09-01T00:00:00.000Z'),
        }),
      ),
    ).toMatchObject({ actionKey: 'RECOVERY' });
  });

  it('moves an item from finding through listing preparation', () => {
    expect(policy.evaluate(context({ items: [item()] }))).toMatchObject({ actionKey: 'PHOTO' });
    expect(policy.evaluate(context({ items: [item({ status: 'PHOTOGRAPHED' })] }))).toMatchObject({
      actionKey: 'LIST',
    });
  });

  it('returns WAIT before the listing review time without requiring completion', () => {
    const reevaluateAt = new Date('2026-09-19T03:00:00.000Z');
    expect(
      policy.evaluate(
        context({
          items: [item({ status: 'LISTED', listedAt: now, reevaluateAt })],
        }),
      ),
    ).toMatchObject({ actionKey: 'WAIT', mode: 'WAIT', reevaluateAt });
  });

  it('checks or improves a listing when its review time arrives', () => {
    const due = new Date('2026-09-18T02:00:00.000Z');
    expect(
      policy.evaluate(
        context({ items: [item({ status: 'LISTED', listedAt: due, reevaluateAt: due })] }),
      ),
    ).toMatchObject({ actionKey: 'CHECK' });
    expect(
      policy.evaluate(
        context({
          items: [
            item({
              status: 'LISTED',
              reactionState: 'NO_REACTION',
              listedAt: due,
              reevaluateAt: due,
            }),
          ],
        }),
      ),
    ).toMatchObject({ actionKey: 'IMPROVE' });
  });

  it('starts with item discovery and continues after a shipped item', () => {
    expect(policy.evaluate(context())).toMatchObject({ actionKey: 'ITEM_FIND' });
    expect(
      policy.evaluate(
        context({
          items: [
            item({
              status: 'SHIPPED',
              reactionState: 'SOLD',
              soldAt: new Date('2026-09-16T03:00:00.000Z'),
              shippedAt: new Date('2026-09-17T03:00:00.000Z'),
            }),
          ],
        }),
      ),
    ).toMatchObject({ actionKey: 'NEXT_ITEM' });
  });
});
