import 'server-only';
import type { PersonalLearningActor } from '@bunshin/application';
import {
  personalLearningDynamicProgramAllows,
  personalLearningFeatureEnabled,
} from '@bunshin/capability-training';
import type { SavedPersonalLearningRequest } from '@bunshin/application';

export type PersonalLearningToolFeatureSource = Readonly<{
  title: string;
  summary: string;
  sourceTitle: string;
  sourceUrl: string;
}>;
export type PersonalLearningToolFeatureContext = Readonly<{
  sources: PersonalLearningToolFeatureSource[];
  topicTitle: string;
  topicGoal: string | null;
}>;

const declaredToolKey = (value: string | null) => {
  const normalized = value?.normalize('NFKC').toLocaleLowerCase('ja-JP') ?? '';
  if (/chat\s*gpt|chatgpt|openai/.test(normalized)) return 'CHATGPT';
  if (/claude|anthropic/.test(normalized)) return 'CLAUDE';
  if (/gemini|ジェミニ/.test(normalized)) return 'GEMINI';
  if (/canva|キャンバ/.test(normalized)) return 'CANVA';
  return null;
};
const approvedHosts: Record<'CHATGPT' | 'CLAUDE' | 'GEMINI' | 'CANVA', readonly string[]> = {
  CHATGPT: ['openai.com'],
  CLAUDE: ['anthropic.com'],
  GEMINI: ['google.com', 'deepmind.google'],
  CANVA: ['canva.com'],
};
const isOfficialHttpsSource = (value: string, toolKey: keyof typeof approvedHosts) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      approvedHosts[toolKey].some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
      )
    );
  } catch {
    return false;
  }
};

/**
 * Load at most three currently approved official updates. The new catalog table is not queried
 * unless this exact AI-training Program is dynamic, enabled, and the request has an owned topic
 * and an explicitly declared supported tool.
 */
export async function loadPersonalLearningToolFeatureContext(
  db: typeof import('@bunshin/database'),
  actor: PersonalLearningActor,
  request: SavedPersonalLearningRequest,
): Promise<PersonalLearningToolFeatureContext> {
  const empty = { sources: [], topicTitle: '', topicGoal: null };
  if (!actor.topicId) return empty;
  const enrollment = await db.prisma.programEnrollment.findFirst({
    where: {
      workspaceId: actor.scope.workspaceId,
      groupId: actor.scope.groupId,
      id: actor.scope.programEnrollmentId,
      groupMembershipId: actor.scope.groupMembershipId,
      status: 'ACTIVE',
    },
    select: { id: true, serviceProgramId: true },
  });
  if (!enrollment) return empty;
  const program = await db.prisma.serviceProgram.findFirst({
    where: {
      id: enrollment.serviceProgramId,
      workspaceId: actor.scope.workspaceId,
      groupId: actor.scope.groupId,
      status: 'ACTIVE',
      settings: { path: ['moduleKey'], equals: 'AI_TRAINING_V1' },
    },
    select: { settings: true },
  });
  if (
    !program ||
    !personalLearningDynamicProgramAllows(program.settings, enrollment.id) ||
    !personalLearningFeatureEnabled(program.settings, 'toolUpdates')
  )
    return empty;
  const toolKey = declaredToolKey(request.toolDescription);
  if (!toolKey) return empty;
  const topic = await db.prisma.personalLearningTopic.findFirst({
    where: {
      ...actor.scope,
      id: actor.topicId,
      status: 'ACTIVE',
    },
    select: { id: true, title: true, goalSnapshot: true },
  });
  if (!topic) return empty;
  const updates = await db.prisma.personalLearningToolFeatureUpdate.findMany({
    where: {
      toolKey,
      status: 'APPROVED',
      expiresAt: { gt: new Date() },
    },
    orderBy: [{ publishedAt: 'desc' }, { reviewedAt: 'desc' }, { id: 'asc' }],
    take: 3,
    select: { title: true, summary: true, sourceTitle: true, sourceUrl: true },
  });
  // The learner's wish is already in the request. The topic is separately passed as untrusted
  // context so the model can ignore updates unrelated to both, without using another AI call.
  const topicGoal =
    topic.goalSnapshot === null ? null : JSON.stringify(topic.goalSnapshot).slice(0, 1200);
  return {
    sources: updates
      .filter((item) => isOfficialHttpsSource(item.sourceUrl, toolKey))
      .map((item) => ({
        title: item.title,
        summary: item.summary.slice(0, 1000),
        sourceTitle: item.sourceTitle,
        sourceUrl: item.sourceUrl,
      })),
    topicTitle: topic.title,
    topicGoal,
  };
}
