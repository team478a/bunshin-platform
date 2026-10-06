export type PersonalLearningPreparationAuthority = Readonly<{
  workspaceId: string;
  groupId: string;
  serviceProgramId: string;
}>;

/** Server-owned scope, never taken from a public request body. */
export function parsePersonalLearningPreparationAuthority(
  value: unknown,
): PersonalLearningPreparationAuthority | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const keys = ['workspaceId', 'groupId', 'serviceProgramId'];
  if (
    Object.keys(v).length !== keys.length ||
    keys.some(
      (key) =>
        !Object.hasOwn(v, key) ||
        typeof v[key] !== 'string' ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v[key]),
    )
  )
    return null;
  return Object.freeze({
    workspaceId: String(v.workspaceId),
    groupId: String(v.groupId),
    serviceProgramId: String(v.serviceProgramId),
  });
}
