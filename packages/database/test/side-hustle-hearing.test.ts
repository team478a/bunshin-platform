import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import type { PersonalLearningActor } from '@bunshin/application';
import { PrismaSideHustleHearingRepository } from '../src';
import {
  screenSideHustleCandidates,
  validateSideHustleCandidateProposal,
} from '@bunshin/capability-training';

const actor: PersonalLearningActor = {
  actorUserId: '11111111-1111-4111-8111-111111111111',
  scope: {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    groupId: '22222222-2222-4222-8222-222222222222',
    programEnrollmentId: '33333333-3333-4333-8333-333333333333',
    groupMembershipId: '44444444-4444-4444-8444-444444444444',
    userId: '55555555-5555-4555-8555-555555555555',
  },
};
const hearing = {
  conditions: {
    initialBudget: null,
    monthlyBudget: null,
    weeklyHours: null,
    faceExposure: null,
    snsPosting: null,
    clientInteraction: null,
    salesOutreach: null,
    inventory: null,
    device: null,
  },
  freeText: { goal: '得意なことを活かしたい', experience: null, interest: null, constraint: null },
  followUps: [],
};

function fixture() {
  const events: Record<string, unknown>[] = [];
  const tx = {
    programEnrollment: { findFirst: vi.fn().mockResolvedValue({ serviceProgramId: 'program' }) },
    serviceProgram: {
      findFirst: vi.fn().mockResolvedValue({ settings: { learningOfferPolicy: 'SIDE_HUSTLE_V1' } }),
    },
    programActionEvent: {
      findFirst: vi.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          events.find((event) => {
            return Object.entries(where).every(([key, value]) => {
              if (key === 'metadata' && value && typeof value === 'object' && 'path' in value) {
                const filter = value as { path: string[]; equals: unknown };
                const data = event['metadata'] as Record<string, unknown>;
                return data[filter.path[0]!] === filter.equals;
              }
              return event[key] === value;
            });
          }) ?? null,
        ),
      ),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, id: `event-${events.length + 1}`, occurredAt: data['occurredAt'] };
        events.push(row);
        return Promise.resolve(row);
      }),
    },
  };
  class TestRepository extends PrismaSideHustleHearingRepository {
    constructor() {
      super({} as never);
    }
    protected override authorized<T>(
      actor: PersonalLearningActor,
      write: boolean,
      work: (client: Prisma.TransactionClient, now: Date) => Promise<T>,
    ) {
      void actor;
      void write;
      return work(tx as unknown as Prisma.TransactionClient, new Date('2026-10-22T00:00:00Z'));
    }
    protected override normalLearner(
      txClient: Prisma.TransactionClient,
      learner: PersonalLearningActor,
    ) {
      void txClient;
      void learner;
      return Promise.resolve();
    }
  }
  return { repo: new TestRepository(), tx, events };
}

describe('side hustle hearing event repository', () => {
  it('saves revisions with idempotent retries and rejects stale or changed reuse', async () => {
    const { repo, tx, events } = fixture();
    const operationId = '66666666-6666-4666-8666-666666666666';
    const first = await repo.saveHearing({
      actor,
      hearing,
      expectedRevision: 0,
      lastAnsweredQuestionIndex: 5,
      idempotencyKey: operationId,
    });
    const retry = await repo.saveHearing({
      actor,
      hearing,
      expectedRevision: 0,
      lastAnsweredQuestionIndex: 5,
      idempotencyKey: operationId,
    });
    expect(retry.id).toBe(first.id);
    expect(first.lastAnsweredQuestionIndex).toBe(5);
    expect(tx.programActionEvent.create).toHaveBeenCalledOnce();
    expect(events[0]).toMatchObject({
      eventType: 'SIDE_HUSTLE_HEARING_SAVED',
      programEnrollmentId: actor.scope.programEnrollmentId,
      actorUserId: actor.scope.userId,
    });
    await expect(
      repo.saveHearing({
        actor,
        hearing: { ...hearing, freeText: { ...hearing.freeText, goal: '別の目的' } },
        expectedRevision: 0,
        idempotencyKey: operationId,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      repo.saveHearing({
        actor,
        hearing,
        expectedRevision: 0,
        idempotencyKey: '77777777-7777-4777-8777-777777777777',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('persists, reads, and selects a validator output while retaining removed-candidate metadata', async () => {
    const events: Record<string, unknown>[] = [];
    const findMatching = (where: Record<string, unknown>) =>
      events.find((event) =>
        Object.entries(where).every(([key, expected]) => {
          if (
            key === 'metadata' &&
            expected &&
            typeof expected === 'object' &&
            'path' in expected &&
            'equals' in expected
          ) {
            const filter = expected as { path: string[]; equals: unknown };
            const meta = event['metadata'];
            return (
              meta !== null &&
              typeof meta === 'object' &&
              !Array.isArray(meta) &&
              (meta as Record<string, unknown>)[filter.path[0]!] === filter.equals
            );
          }
          return event[key] === expected;
        }),
      ) ?? null;
    const tx = {
      programEnrollment: { findFirst: () => Promise.resolve({ serviceProgramId: 'program' }) },
      serviceProgram: {
        findFirst: () => Promise.resolve({ settings: { learningOfferPolicy: 'SIDE_HUSTLE_V1' } }),
      },
      programActionEvent: {
        findFirst: ({ where }: { where: Record<string, unknown> }) =>
          Promise.resolve(findMatching(where)),
        findMany: ({ where }: { where: Record<string, unknown> }) =>
          Promise.resolve(
            events
              .filter((event) =>
                Object.entries(where).every(([key, expected]) => {
                  if (
                    key === 'eventType' &&
                    expected &&
                    typeof expected === 'object' &&
                    'in' in expected &&
                    Array.isArray(expected.in)
                  )
                    return expected.in.includes(event['eventType']);
                  return event[key] === expected;
                }),
              )
              .reverse(),
          ),
        create: ({ data }: { data: Record<string, unknown> }) => {
          const row = { ...data, id: `event-${events.length + 1}` };
          events.push(row);
          return Promise.resolve(row);
        },
      },
      aiUsageEvent: { findFirst: () => Promise.resolve({ id: 'usage' }) },
      personalLearningTopic: { findFirst: () => Promise.resolve(null) },
    };
    class InMemoryEventRepository extends PrismaSideHustleHearingRepository {
      constructor() {
        super({} as never);
      }
      protected override authorized<T>(
        _actor: PersonalLearningActor,
        _write: boolean,
        work: (client: Prisma.TransactionClient, now: Date) => Promise<T>,
      ) {
        return work(tx as unknown as Prisma.TransactionClient, new Date('2026-10-22T00:00:00Z'));
      }
      protected override normalLearner() {
        return Promise.resolve();
      }
    }
    const repo = new InMemoryEventRepository();
    const savedHearing = await repo.saveHearing({
      actor,
      hearing,
      expectedRevision: 0,
      idempotencyKey: '66666666-6666-4666-8666-666666666666',
    });
    const validCandidate = {
      name: '文章作成サポート',
      category: 'SKILL_SERVICE',
      summary: '依頼を受けて読みやすい文章を作る仕事です。',
      monetization: '納品した文章の件数や契約期間に応じて報酬を受け取ります。',
      fitReasons: [{ text: '文章経験を生かせます。', basedOn: ['experience'] }],
      initialCost: 'NONE',
      monthlyCost: 'NONE',
      weeklyHoursMin: 3,
      difficulty: 1,
      requiredSkills: ['文章作成'],
      workStyle: {
        faceExposure: 'NONE',
        snsPosting: 'NONE',
        clientInteraction: 'REQUIRED',
        salesOutreach: 'OPTIONAL',
        inventory: 'NONE',
        device: 'PC_REQUIRED',
      },
      typicalFlow: ['見本を作る', '小さな依頼を探す', '文章を納品する'],
      risks: ['依頼内容と納期の確認が必要です。'],
      requirements: [{ kind: 'PLATFORM_TERMS', text: '利用サービスの規約を確認してください。' }],
    };
    const generated = validateSideHustleCandidateProposal({
      status: 'READY',
      reason: '条件に合う候補です。',
      questions: [],
      candidates: [
        validCandidate,
        { ...validCandidate, name: '除外候補', summary: 'FXを扱う内容です。' },
      ],
    });
    const screening = screenSideHustleCandidates(hearing.conditions, generated.candidates);
    const savedProposal = await repo.saveProposal({
      actor,
      hearingEventId: savedHearing.id,
      hearingRevision: savedHearing.revision,
      proposal: generated,
      screening,
      promptVersion: 'side-hustle-candidates-v1',
      usageKey: `personal-learning-operation:${'a'.repeat(64)}`,
    });
    const read = await repo.readState(actor);
    expect(read.proposal?.proposal.removedCandidates).toEqual(generated.removedCandidates);
    expect(read.proposal?.proposal.removedCandidates).toHaveLength(1);
    const selected = await repo.select({
      actor,
      proposalEventId: savedProposal.id,
      candidateIndex: 0,
      idempotencyKey: '77777777-7777-4777-8777-777777777777',
    });
    expect(selected.candidate).toMatchObject({ name: '文章作成サポート' });
  });

  it('uses NOT_FOUND for a non-side-hustle Program', async () => {
    const { repo, tx } = fixture();
    tx.serviceProgram.findFirst.mockResolvedValue({
      settings: { learningOfferPolicy: 'AI_SKILL_V1' },
    });
    await expect(
      repo.saveHearing({
        actor,
        hearing,
        expectedRevision: 0,
        idempotencyKey: '66666666-6666-4666-8666-666666666666',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
