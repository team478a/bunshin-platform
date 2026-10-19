const enrollmentIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const prefix = 'manaberu-nudge-v1:';

export type PersonalLearningNudgeLineAction =
  | { programEnrollmentId: string; action: 'RESUME' }
  | { programEnrollmentId: string; action: 'PAUSE'; days: 7 | 14 | 30 }
  | { programEnrollmentId: string; action: 'STOP' };

export interface PersonalLearningNudgeQuickReply {
  type: 'action';
  action: {
    type: 'postback';
    label: string;
    displayText: string;
    data: string;
  };
}

function dataFor(action: PersonalLearningNudgeLineAction): string {
  const suffix = action.action === 'PAUSE' ? `PAUSE:${action.days}` : action.action;
  return `${prefix}${action.programEnrollmentId}:${suffix}`;
}

export function personalLearningNudgeQuickReplies(
  programEnrollmentId: string,
): PersonalLearningNudgeQuickReply[] {
  if (!enrollmentIdPattern.test(programEnrollmentId))
    throw new Error('invalid program enrollment id');
  const actions: Array<{ label: string; action: PersonalLearningNudgeLineAction }> = [
    { label: '続きをする', action: { programEnrollmentId, action: 'RESUME' } },
    { label: '1週間休む', action: { programEnrollmentId, action: 'PAUSE', days: 7 } },
    { label: '2週間休む', action: { programEnrollmentId, action: 'PAUSE', days: 14 } },
    { label: '1か月休む', action: { programEnrollmentId, action: 'PAUSE', days: 30 } },
    { label: '声かけを止める', action: { programEnrollmentId, action: 'STOP' } },
  ];
  return actions.map(({ label, action }) => ({
    type: 'action',
    action: { type: 'postback', label, displayText: label, data: dataFor(action) },
  }));
}

export function parsePersonalLearningNudgeLineAction(
  data: string | undefined,
): PersonalLearningNudgeLineAction | null {
  if (!data?.startsWith(prefix)) return null;
  const rest = data.slice(prefix.length);
  const separator = rest.indexOf(':');
  if (separator < 0) return null;
  const programEnrollmentId = rest.slice(0, separator);
  const actionText = rest.slice(separator + 1);
  if (!enrollmentIdPattern.test(programEnrollmentId)) return null;
  if (actionText === 'RESUME') return { programEnrollmentId, action: 'RESUME' };
  if (actionText === 'STOP') return { programEnrollmentId, action: 'STOP' };
  const pause = /^PAUSE:(7|14|30)$/.exec(actionText);
  if (pause) {
    const days = Number(pause[1]);
    if (days === 7 || days === 14 || days === 30)
      return { programEnrollmentId, action: 'PAUSE', days };
  }
  return null;
}
