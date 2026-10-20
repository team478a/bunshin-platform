export type PilotOperation = Readonly<{
  operationId: string;
  expectedStateToken: string;
  confirmation: 'CONFIRM_PILOT_OPERATION';
  reviewEvidenceKey: string;
}> &
  (
    | { action: 'CREATE_PROGRAM' | 'INITIALIZE' | 'START' | 'STOP' }
    | { action: 'PREPARE_ENROLLMENT'; groupMembershipId: string; programOfferingId: string }
    | { action: 'SET_LEARNING_MODE'; learningMode: 'DYNAMIC_V1' | 'FIXED_DEFINITIONS_V1' }
    | {
        action: 'SET_LEARNING_FEATURES';
        learningFeatures: Readonly<{
          conversation: boolean;
          multiTopic: boolean;
          lineLearning: boolean;
          extendedScope: boolean;
          learningNudges?: boolean;
          toolUpdates?: boolean;
        }>;
      }
  );

export function parsePilotOperation(value: unknown): PilotOperation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const keys = ['action', 'operationId', 'expectedStateToken', 'confirmation', 'reviewEvidenceKey'];
  if (v.action === 'PREPARE_ENROLLMENT') keys.push('groupMembershipId', 'programOfferingId');
  if (v.action === 'SET_LEARNING_MODE') keys.push('learningMode');
  if (v.action === 'SET_LEARNING_FEATURES') keys.push('learningFeatures');
  const uuid = (s: unknown) =>
    typeof s === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(s);
  if (
    typeof v.action !== 'string' ||
    ![
      'CREATE_PROGRAM',
      'INITIALIZE',
      'PREPARE_ENROLLMENT',
      'START',
      'STOP',
      'SET_LEARNING_MODE',
      'SET_LEARNING_FEATURES',
    ].includes(v.action) ||
    Object.keys(v).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(v, k)) ||
    !uuid(v.operationId) ||
    v.confirmation !== 'CONFIRM_PILOT_OPERATION' ||
    typeof v.expectedStateToken !== 'string' ||
    !/^[a-f0-9]{64}$/.test(v.expectedStateToken) ||
    typeof v.reviewEvidenceKey !== 'string' ||
    !/^[a-zA-Z0-9_.:-]{1,100}$/.test(v.reviewEvidenceKey) ||
    (v.action === 'PREPARE_ENROLLMENT' &&
      (!uuid(v.groupMembershipId) || !uuid(v.programOfferingId))) ||
    (v.action === 'SET_LEARNING_MODE' &&
      !['DYNAMIC_V1', 'FIXED_DEFINITIONS_V1'].includes(String(v.learningMode))) ||
    (v.action === 'SET_LEARNING_FEATURES' &&
      (!v.learningFeatures ||
        typeof v.learningFeatures !== 'object' ||
        Array.isArray(v.learningFeatures) ||
        !(
          Object.keys(v.learningFeatures).length === 4 ||
          Object.keys(v.learningFeatures).length === 5 ||
          Object.keys(v.learningFeatures).length === 6
        ) ||
        ['conversation', 'multiTopic', 'lineLearning', 'extendedScope'].some(
          (key) => typeof (v.learningFeatures as Record<string, unknown>)[key] !== 'boolean',
        ) ||
        (Object.hasOwn(v.learningFeatures, 'learningNudges') &&
          typeof (v.learningFeatures as Record<string, unknown>).learningNudges !== 'boolean') ||
        (Object.hasOwn(v.learningFeatures, 'toolUpdates') &&
          typeof (v.learningFeatures as Record<string, unknown>).toolUpdates !== 'boolean') ||
        Object.keys(v.learningFeatures).some(
          (key) =>
            ![
              'conversation',
              'multiTopic',
              'lineLearning',
              'extendedScope',
              'learningNudges',
              'toolUpdates',
            ].includes(key),
        )))
  )
    return null;
  return Object.freeze({ ...v }) as PilotOperation;
}
