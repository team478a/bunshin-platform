import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const runtime = readFileSync(join(process.cwd(), 'src', 'resale-runtime.ts'), 'utf8');
const serviceParticipation = readFileSync(
  join(process.cwd(), 'src', 'service-participation.ts'),
  'utf8',
);

describe('AI resale runtime orchestration boundary', () => {
  it('anchors automatic enrollment to public registration in the same transaction', () => {
    const registration = serviceParticipation.slice(
      serviceParticipation.indexOf('export class PrismaServiceParticipationRepository'),
    );
    expect(registration).toContain('autoEnrollAiResaleForRegistration(tx, { membership');
    expect(runtime).toContain("source: 'PUBLIC_REGISTRATION'");
    expect(runtime).toContain('registrationAt = membership.consentedAt');
    expect(runtime).toContain('registrationAt > enrollmentAvailableAt');
    expect(runtime).toContain('skipDuplicates: true');
  });

  it('selects programs through tenant-owned settings instead of a service name', () => {
    expect(runtime).toContain("settings: { path: ['moduleKey'], equals: AI_RESALE_V1_MODULE_KEY }");
    expect(runtime).not.toContain('ワタシワークス公式');
    expect(runtime).not.toContain('千ノ国メディア');
  });

  it('writes the assignment and progress snapshot in one serializable transaction', () => {
    const persistence = runtime.slice(runtime.indexOf('async persistDecision'));
    expect(persistence).toContain('this.client.$transaction');
    expect(persistence).toContain('programMissionAssignment.create');
    expect(persistence).toContain('programProgressSnapshot');
    expect(persistence).toContain("isolationLevel: 'Serializable'");
    expect(persistence).toContain('revision: input.candidate.progressRevision');
  });

  it('persists DAY7 once and completes the free enrollment atomically', () => {
    const classification = runtime.slice(runtime.indexOf('async persistDaySevenClassification'));
    expect(classification).toContain("eventType: 'DAY7_CLASSIFIED'");
    expect(classification).toContain('ai-resale:day7:');
    expect(classification).toContain("stateKey: 'COMPLETED'");
    expect(classification).toContain("data: { status: 'COMPLETED' }");
  });

  it('excludes a formal WAIT interval from the activity baseline', () => {
    expect(runtime).toContain("currentAssignment?.actionMode === 'WAIT'");
    expect(runtime).toContain('waitBaseline > enrollment.startsAt');
  });

  it('expires paid access at its 90-day end before selecting due actions', () => {
    const expiration = runtime.slice(runtime.indexOf('async expireEndedPaidParticipants'));
    expect(expiration).toContain("settings.policyKey === 'PAID_90D'");
    expect(expiration).toContain("data: { status: 'EXPIRED' }");
    expect(expiration).toContain("stateKey: 'COMPLETED'");
    expect(expiration).toContain('currentAssignmentId: null');
    expect(expiration).toContain("action: 'EXPIRED'");
  });
});
