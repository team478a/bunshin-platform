import type {
  BunshinCapabilityAssignment,
  BunshinCapabilityAssignmentRepository,
} from '@bunshin/application';
import { describe, expect, it } from 'vitest';
import {
  RecordManualPost,
  RecordMissionFeedback,
  type DailyMissionRepository,
  type MissionActivity,
  type MissionFeedback,
  type MissionOutcomeRepository,
  type PostRecord,
} from '../src';

const now = new Date('2026-08-20T00:00:00Z');
class Assignments implements BunshinCapabilityAssignmentRepository {
  constructor(private readonly status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE') {}
  assign() {
    return Promise.resolve(null);
  }
  list() {
    return Promise.resolve([]);
  }
  setStatus() {
    return Promise.resolve(null);
  }
  find(): Promise<BunshinCapabilityAssignment> {
    return Promise.resolve({
      id: 'assignment-1',
      workspaceId: 'workspace-1',
      bunshinId: 'bunshin-1',
      capabilityType: 'SOCIAL',
      status: this.status,
      config: {},
      assignedByUserId: 'user-1',
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }
}
const missions = {} as DailyMissionRepository;
const activity: MissionActivity = {
  id: 'activity-1',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  dailyMissionId: 'mission-1',
  actorUserId: 'user-1',
  type: 'POSTED',
  occurredAt: now,
  idempotencyKey: 'post-1',
  metadata: null,
  createdAt: now,
};
const post: PostRecord = {
  id: 'post-1',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  dailyMissionId: 'mission-1',
  actorUserId: 'user-1',
  platform: 'X',
  postedAt: now,
  postUrl: null,
  externalPostId: null,
  source: 'MANUAL',
  manualMetrics: null,
  idempotencyKey: 'post-1',
  createdAt: now,
  updatedAt: now,
};
const feedback: MissionFeedback = {
  id: 'feedback-1',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  dailyMissionId: 'mission-1',
  actorUserId: 'user-1',
  rating: 'GOOD',
  createdAt: now,
  updatedAt: now,
};
class Outcomes implements MissionOutcomeRepository {
  postInput: Parameters<MissionOutcomeRepository['recordPost']>[0] | null = null;
  feedbackInput: Parameters<MissionOutcomeRepository['recordFeedback']>[0] | null = null;
  getPost() {
    return Promise.resolve(post);
  }
  recordPost(
    input: Parameters<MissionOutcomeRepository['recordPost']>[0],
  ): ReturnType<MissionOutcomeRepository['recordPost']> {
    this.postInput = input;
    return Promise.resolve({ post, activity });
  }
  getFeedback() {
    return Promise.resolve(feedback);
  }
  recordFeedback(input: Parameters<MissionOutcomeRepository['recordFeedback']>[0]) {
    this.feedbackInput = input;
    return Promise.resolve({
      feedback: { ...feedback, rating: input.rating },
      activity: { ...activity, type: `FEEDBACK_${input.rating}` as MissionActivity['type'] },
    });
  }
}
const scope = {
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  actorUserId: 'user-1',
  dailyMissionId: 'mission-1',
};

describe('Mission outcome use cases', () => {
  it('normalizes a manual post without accepting provider fields', async () => {
    const outcomes = new Outcomes();
    await new RecordManualPost(missions, new Assignments(), outcomes).execute({
      ...scope,
      platform: 'X',
      postedAt: now,
      postUrl: ' https://x.com/example/status/1 ',
      idempotencyKey: ' post-1 ',
    });
    expect(outcomes.postInput).toMatchObject({
      actorUserId: 'user-1',
      postUrl: 'https://x.com/example/status/1',
      idempotencyKey: 'post-1',
    });
    expect(outcomes.postInput).not.toHaveProperty('source');
  });
  it('rejects invalid urls and future timestamps', async () => {
    const useCase = new RecordManualPost(missions, new Assignments(), new Outcomes());
    await expect(
      useCase.execute({
        ...scope,
        platform: 'X',
        postUrl: 'javascript:alert(1)',
        idempotencyKey: 'post-1',
      }),
    ).rejects.toThrow();
    await expect(
      useCase.execute({
        ...scope,
        platform: 'X',
        postedAt: new Date(Date.now() + 600_000),
        idempotencyKey: 'post-1',
      }),
    ).rejects.toThrow();
  });
  it('records only the three fit ratings with a normalized key', async () => {
    const outcomes = new Outcomes();
    await new RecordMissionFeedback(missions, new Assignments(), outcomes).execute({
      ...scope,
      rating: 'BAD',
      idempotencyKey: ' feedback-1 ',
    });
    expect(outcomes.feedbackInput).toMatchObject({ rating: 'BAD', idempotencyKey: 'feedback-1' });
  });
  it('blocks mutations while SOCIAL is suspended', async () => {
    await expect(
      new RecordManualPost(missions, new Assignments('SUSPENDED'), new Outcomes()).execute({
        ...scope,
        platform: 'X',
        idempotencyKey: 'post-1',
      }),
    ).rejects.toThrow();
  });
  it('maps inaccessible outcomes to not found', async () => {
    const outcomes = new Outcomes();
    outcomes.recordPost = () => Promise.resolve(null);
    await expect(
      new RecordManualPost(missions, new Assignments(), outcomes).execute({
        ...scope,
        platform: 'X',
        idempotencyKey: 'post-1',
      }),
    ).rejects.toThrow();
  });
});
