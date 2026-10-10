import { z } from 'zod';

export const reviewLabels = {
  objective: '学習目的',
  prerequisites: '前提となる学習',
  concepts: '学ぶ要点',
  safety: '安全・学習の境界',
  mistakes: 'よくある間違い',
  practice: '本人が行う練習',
  rubricAndMission: '課題・評価基準・進級条件の対応',
} as const;
export type ReviewKey = keyof typeof reviewLabels;
export const reviewKeys = Object.keys(reviewLabels) as ReviewKey[];
export const definitionTitles = {
  PROMPT_STRUCTURE: '指示の基本構造',
  CONTEXT_SETTING: '背景情報の設定',
  CONSTRAINT_SETTING: '条件の指定',
} as const;
const key = z.enum(['PROMPT_STRUCTURE', 'CONTEXT_SETTING', 'CONSTRAINT_SETTING']);
const version = z.literal('AI_TRAINING_DEFINITION_FIXTURE_V1');
const ref = z.object({ packageKey: z.literal('AI_TRAINING'), definitionKey: key, version });
const texts = z.array(z.string().min(1).max(2000)).min(1).max(20);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const itemSchema = z.object({
  revision: digest,
  reviewDigest: digest,
  current: z
    .object({
      approvalStatus: z.enum(['DRAFT', 'REVIEWED', 'APPROVED', 'DEPRECATED']),
      approvedAt: z.string().datetime().nullable(),
    })
    .nullable(),
  routerRuleVersion: z.literal('AI_TRAINING_LEARNING_ROUTER_V1'),
  definition: z.object({
    reference: ref,
    learningObjective: z.string().min(1).max(2000),
    targetSkillRefs: z
      .array(
        z.object({
          packageKey: z.literal('AI_TRAINING'),
          skillKey: z.string().min(1),
          version: z.string().min(1),
        }),
      )
      .min(1)
      .max(5),
    prerequisites: z.array(ref).max(3),
    coreConcepts: texts,
    safetyBoundary: texts,
    commonMistakes: texts,
    practicePattern: z.string().min(1).max(2000),
    evaluationRubricRef: z.object({
      packageKey: z.literal('AI_TRAINING'),
      rubricKey: z.enum(['PROMPT_BASIC', 'PROMPT_CONDITION']),
      version: z.literal('AI_TRAINING_MISSION_QUALITY_V1'),
    }),
    legacyMissionRef: z.object({
      actionKey: z.enum(['PROMPT_BASIC', 'PROMPT_CONDITION']),
      qualityVersion: z.literal('AI_TRAINING_MISSION_QUALITY_V1'),
    }),
  }),
  mission: z.object({
    key: z.enum(['PROMPT_BASIC', 'PROMPT_CONDITION']),
    learningObjective: z.string().min(1),
    task: z.string().min(1),
    constraints: texts,
    successCriteria: texts,
    commonMistakes: texts,
    evaluationCriteria: texts,
    skillKeys: texts,
  }),
});
export type DefinitionReview = z.infer<typeof itemSchema>;
export function parseDefinitionReviews(value: unknown): DefinitionReview[] | null {
  const parsed = z.array(itemSchema).length(3).safeParse(value);
  if (!parsed.success) return null;
  const items = parsed.data;
  if (new Set(items.map((i) => i.definition.reference.definitionKey)).size !== 3) return null;
  for (const i of items) {
    const d = i.definition;
    const mission =
      d.reference.definitionKey === 'CONSTRAINT_SETTING' ? 'PROMPT_CONDITION' : 'PROMPT_BASIC';
    if (
      i.mission.key !== mission ||
      d.legacyMissionRef.actionKey !== mission ||
      d.evaluationRubricRef.rubricKey !== mission
    )
      return null;
  }
  return items;
}
const commandSchema = z
  .object({
    action: z.literal('APPROVE'),
    confirmation: z.literal('CONFIRM_DEFINITION_APPROVAL'),
    operationId: z.uuid(),
    definitionKey: key,
    version,
    expectedRevision: digest,
    reviewDigest: digest,
    reviewedCommitSha: z.string().regex(/^[a-f0-9]{40}$/),
    reviewEvidenceKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/),
    reviewChecklist: z
      .object({
        objective: z.literal(true),
        prerequisites: z.literal(true),
        concepts: z.literal(true),
        safety: z.literal(true),
        mistakes: z.literal(true),
        practice: z.literal(true),
        rubricAndMission: z.literal(true),
      })
      .strict(),
  })
  .strict();
export type DefinitionApprovalCommand = z.infer<typeof commandSchema>;
export function approvalCommand(
  item: DefinitionReview | null,
  checks: Partial<Record<ReviewKey, boolean>>,
  sha: string,
  evidence: string,
  confirmed: boolean,
): DefinitionApprovalCommand | null {
  if (!item || !confirmed || item.current?.approvalStatus === 'APPROVED') return null;
  const parsed = commandSchema.safeParse({
    action: 'APPROVE',
    confirmation: 'CONFIRM_DEFINITION_APPROVAL',
    operationId: crypto.randomUUID(),
    definitionKey: item.definition.reference.definitionKey,
    version: item.definition.reference.version,
    expectedRevision: item.revision,
    reviewDigest: item.reviewDigest,
    reviewedCommitSha: sha,
    reviewEvidenceKey: evidence,
    reviewChecklist: checks,
  });
  return parsed.success ? parsed.data : null;
}
export function reviewReady(
  item: DefinitionReview | null,
  checks: Partial<Record<ReviewKey, boolean>>,
  sha: string,
  evidence: string,
  confirmed: boolean,
) {
  return (
    !!item &&
    item.current?.approvalStatus !== 'APPROVED' &&
    confirmed &&
    reviewKeys.every((k) => checks[k] === true) &&
    Object.keys(checks).length === 7 &&
    /^[a-f0-9]{40}$/.test(sha) &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(evidence)
  );
}
const endpoint = (slug: string) =>
  `/api/services/${encodeURIComponent(slug)}/ai-training/definition-approvals`;
export async function loadDefinitionReviews(slug: string) {
  const response = await fetch(endpoint(slug), { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) return null;
  const body = (await response.json()) as { data?: unknown };
  return parseDefinitionReviews(body.data);
}
export async function submitDefinitionApproval(
  slug: string,
  command: DefinitionApprovalCommand,
): Promise<'RECEIVED' | 'RETRY' | 'REJECTED'> {
  if (!commandSchema.safeParse(command).success) return 'REJECTED';
  try {
    const response = await fetch(endpoint(slug), {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!response.ok) return response.status >= 500 ? 'RETRY' : 'REJECTED';
    const body = (await response.json()) as { data?: unknown };
    const receipt = z
      .object({
        replayed: z.boolean(),
        operationId: z.literal(command.operationId),
        stateAtOperation: z.object({
          approvalStatus: z.literal('APPROVED'),
          approvedAt: z.string().datetime(),
          approvedByUserId: z.uuid(),
        }),
      })
      .safeParse(body.data);
    return receipt.success ? 'RECEIVED' : 'RETRY';
  } catch {
    return 'RETRY';
  }
}
