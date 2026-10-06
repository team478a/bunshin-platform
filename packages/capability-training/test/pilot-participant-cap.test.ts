import { describe, it, expect } from 'vitest';
import { parsePilotParticipantPolicy, personalLearningPilotAllows } from '../src';
const policy = {
  version: 'PILOT_PARTICIPANT_CAP_V1',
  revision: 1,
  externalParticipantCap: 100,
  internalParticipantCap: 0,
  currentWave: 1,
  currentWaveCap: 5,
};
describe('cumulative Pilot cap contract', () => {
  it.each([
    [0, 0],
    [1, 5],
    [2, 20],
    [3, 50],
    [4, 100],
  ])('maps wave %i to cumulative %i without automatic advancement', (wave, cap) => {
    expect(
      parsePilotParticipantPolicy({ ...policy, currentWave: wave, currentWaveCap: cap })
        ?.currentWaveCap,
    ).toBe(cap);
    expect(policy.currentWave).toBe(1);
  });
  it.each([
    null,
    {},
    { ...policy, externalParticipantCap: 101 },
    { ...policy, externalParticipantCap: 500 },
    { ...policy, currentWaveCap: 6 },
    { ...policy, internalParticipantCap: -1 },
    { ...policy, internalParticipantCap: 101 },
    { ...policy, revision: 0 },
    { ...policy, extra: true },
  ])('fails closed (%j)', (v) => expect(parsePilotParticipantPolicy(v)).toBeNull());
  it('bounded settings never enable nonexistent 101st external seat', () => {
    const ids = Array.from(
      { length: 101 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    const settings = {
      moduleKey: 'AI_TRAINING_V1',
      personalLearningPilot: {
        enabled: true,
        enrollmentIds: ids.slice(0, 100),
        participantControl: { ...policy, currentWave: 4, currentWaveCap: 100 },
      },
      trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
    };
    expect(personalLearningPilotAllows(settings, ids[0]!)).toBe(true);
    expect(
      personalLearningPilotAllows(
        {
          ...settings,
          personalLearningPilot: { ...settings.personalLearningPilot, enrollmentIds: ids },
        },
        ids[100]!,
      ),
    ).toBe(false);
  });
});
