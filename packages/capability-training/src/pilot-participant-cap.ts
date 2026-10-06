export const ABSOLUTE_EXTERNAL_PILOT_CAP = 100;
export const PILOT_PARTICIPANT_CAP_VERSION = 'PILOT_PARTICIPANT_CAP_V1';
export type PilotParticipantPolicy = Readonly<{
  version: typeof PILOT_PARTICIPANT_CAP_VERSION;
  revision: number;
  externalParticipantCap: number;
  internalParticipantCap: number;
  currentWave: number;
  currentWaveCap: number;
}>;
export function parsePilotParticipantPolicy(value: unknown): PilotParticipantPolicy | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).length !== 6 ||
    v.version !== PILOT_PARTICIPANT_CAP_VERSION ||
    !Number.isSafeInteger(v.revision) ||
    Number(v.revision) < 1 ||
    !Number.isInteger(v.externalParticipantCap) ||
    Number(v.externalParticipantCap) < 0 ||
    Number(v.externalParticipantCap) > ABSOLUTE_EXTERNAL_PILOT_CAP ||
    !Number.isInteger(v.internalParticipantCap) ||
    Number(v.internalParticipantCap) < 0 ||
    Number(v.internalParticipantCap) > 100 ||
    !Number.isInteger(v.currentWave) ||
    Number(v.currentWave) < 0 ||
    Number(v.currentWave) > 4 ||
    v.currentWaveCap !== [0, 5, 20, 50, 100][Number(v.currentWave)] ||
    Number(v.currentWaveCap) > Number(v.externalParticipantCap)
  )
    return null;
  return Object.freeze({
    version: PILOT_PARTICIPANT_CAP_VERSION,
    revision: Number(v.revision),
    externalParticipantCap: Number(v.externalParticipantCap),
    internalParticipantCap: Number(v.internalParticipantCap),
    currentWave: Number(v.currentWave),
    currentWaveCap: Number(v.currentWaveCap),
  });
}
