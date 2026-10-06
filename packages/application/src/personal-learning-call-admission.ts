/** Explicit server configuration. No permissive fallback or provider credentials. */
export type PersonalLearningCallAdmissionPolicy = Readonly<{
  workspaceId: string;
  groupId: string;
  serviceProgramId: string;
  dailyAttemptLimit: number;
  maxConcurrent: number;
  model: string;
  maxRequestBytes: number;
  maxOutputTokens: number;
}>;

export function parsePersonalLearningCallAdmissionPolicy(
  value: unknown,
): PersonalLearningCallAdmissionPolicy | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const keys = [
    'workspaceId',
    'groupId',
    'serviceProgramId',
    'dailyAttemptLimit',
    'maxConcurrent',
    'model',
    'maxRequestBytes',
    'maxOutputTokens',
  ];
  if (Object.keys(v).length !== keys.length || keys.some((key) => !Object.hasOwn(v, key)))
    return null;
  for (const key of ['workspaceId', 'groupId', 'serviceProgramId']) {
    if (
      typeof v[key] !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v[key])
    )
      return null;
  }
  for (const key of ['dailyAttemptLimit', 'maxConcurrent', 'maxRequestBytes', 'maxOutputTokens']) {
    const n = v[key];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 2_147_483_647) return null;
  }
  if (
    Number(v.maxConcurrent) > Number(v.dailyAttemptLimit) ||
    Number(v.maxOutputTokens) < 16 ||
    typeof v.model !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(v.model)
  )
    return null;
  return Object.freeze({ ...v }) as PersonalLearningCallAdmissionPolicy;
}
