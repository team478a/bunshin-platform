import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const scheduler = source('src/services/ai-training-action-line-scheduler.ts');
const handler = source('src/jobs/service-line-broadcast-job-handler.ts');
const missionScheduler = source('src/http/mission-scheduler.ts');
const page = source('app/s/[serviceSlug]/programs/[programEnrollmentId]/page.tsx');

describe('AI training current Action LINE boundary', () => {
  it('selects only the active participant enrollment and an explicitly connected LINE destination', () => {
    expect(scheduler).toContain("serviceRole: 'PARTICIPANT'");
    expect(scheduler).toContain("status: 'ACTIVE'");
    expect(scheduler).toContain('consentedAt: { not: null }');
    expect(scheduler).toContain('notificationConsentAt: { not: null }');
    expect(scheduler).toContain("friendshipStatus: 'FOLLOWING'");
    expect(scheduler).toContain('configurationId: lineConfiguration.id');
  });

  it('uses one broadcast per assignment and the existing delivery worker', () => {
    expect(scheduler).toContain('ai-training-action:${environment}:${assignmentId}');
    expect(scheduler).toContain("kind: 'AI_TRAINING_ACTION'");
    expect(scheduler).toContain("jobType: 'SERVICE_LINE_BROADCAST_DELIVER'");
    expect(scheduler).toContain('maxAttempts: 3');
    expect(scheduler).toContain('serviceLineBroadcastRecipient.create');
    expect(scheduler).not.toContain('serviceLineBroadcastRecipient.createMany');
  });

  it('rechecks the exact current assignment immediately before delivery', () => {
    expect(handler).toContain("criteria.kind === 'AI_TRAINING_ACTION'");
    expect(handler).toContain('programEnrollmentId: criteria.programEnrollmentId');
    expect(handler).toContain('currentAssignmentId: criteria.assignmentId');
    expect(handler).toContain("status: 'PRESENTED'");
    expect(handler).toContain("equals: 'AI_TRAINING_V1'");
    expect(handler).toContain('settings: expectedModuleFilter');
  });

  it('materializes the current personalized assignment before scheduling', () => {
    expect(scheduler).toContain('training_participant_profiles');
    expect(scheduler).toContain('runtime.current({');
    expect(scheduler).toContain('actorUserId: candidate.participantUserId');
  });

  it('runs from the existing authenticated mission scheduler', () => {
    expect(missionScheduler).toContain('scheduleAiTrainingActionLineDeliveries({ environment })');
    expect(missionScheduler).toContain('aiTrainingLine');
  });

  it('honors the service notification switch and Japan-time delivery hour', () => {
    expect(scheduler).toContain('parseAiTrainingOperationsSettings(program.settings)');
    expect(scheduler).toContain('operations.notificationsEnabled');
    expect(scheduler).toContain('tokyoHour !== operations.notificationHour');
    expect(scheduler).toContain("timeZone: 'Asia/Tokyo'");
  });

  it('links to the authenticated participant page, which preserves the return path through login', () => {
    expect(scheduler).toContain('/programs/${encodeURIComponent(candidate.programEnrollmentId)}');
    expect(page).toContain('resolveAuthenticatedMemberServicePage');
    expect(page).toContain('`/s/${serviceSlug}/programs/${programEnrollmentId}`');
  });
});
