import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client/index';
import { cleanupProgramFixtures } from './program-fixture-cleanup';

const order = [
  'trainingToolkitItem',
  'trainingMissionAnswer',
  'trainingParticipantProfile',
  'trainingDataRetentionState',
  'programActionEvent',
  'programProgressSnapshot',
  'programMissionAssignment',
  'programMemberGoal',
  'programMemberPreference',
  'programEnrollment',
  'programOffering',
  'serviceProgramSupportPolicy',
  'programGoalDefinition',
  'serviceProgram',
  'programTemplateVersion',
  'programTemplate',
  'programAuditLog',
] as const;

function fakeClient(failingModel?: (typeof order)[number]) {
  const events: string[] = [];
  const client = {
    $executeRawUnsafe: vi.fn(() => {
      events.push('trainingSupportSkillLifecycle');
      return Promise.resolve(0);
    }),
    ...Object.fromEntries(
      order.map((name) => [
        name,
        {
          deleteMany: vi.fn(() => {
            events.push(name);
            return name === failingModel
              ? Promise.reject(new Error('synthetic cleanup fault'))
              : Promise.resolve({ count: 0 });
          }),
        },
      ]),
    ),
  } as unknown as PrismaClient;
  return { client, events };
}

describe('program fixture cleanup dependency order', () => {
  it('deletes explicit training residue and RESTRICT children before their parents', async () => {
    const { client, events } = fakeClient();
    await cleanupProgramFixtures(client);
    expect(events).toEqual(['trainingSupportSkillLifecycle', ...order]);
  });

  it('keeps the same order when already empty rather than hiding failures', async () => {
    const { client, events } = fakeClient();
    await cleanupProgramFixtures(client);
    await cleanupProgramFixtures(client);
    expect(events).toEqual([
      'trainingSupportSkillLifecycle',
      ...order,
      'trainingSupportSkillLifecycle',
      ...order,
    ]);
  });

  it('propagates a child deletion failure without proceeding to parent deletion', async () => {
    const { client, events } = fakeClient('programProgressSnapshot');
    await expect(cleanupProgramFixtures(client)).rejects.toThrow('synthetic cleanup fault');
    expect(events).toEqual(['trainingSupportSkillLifecycle', ...order.slice(0, 6)]);
    expect(events).not.toContain('programEnrollment');
  });
});
