import {
  AI_TRAINING_V1_MODULE_KEY,
  TRAINING_SKILL_KEYS,
  type TrainingSkillKey,
} from '@bunshin/capability-training';
import { Prisma, type PrismaClient, prisma } from './client';

export type TrainingAdminEvaluationMetric = {
  programEnrollmentId: string;
  evaluation: {
    result: 'PASS' | 'REVIEW' | null;
    skills: Partial<Record<TrainingSkillKey, number>>;
  };
  evaluatedAt: Date | null;
  updatedAt: Date;
};

// Projection is performed inside PostgreSQL: private evaluation prose must never
// cross the database boundary just to calculate admin metrics.
export async function listTrainingAdminEvaluationMetrics(
  input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    enrollmentIds: readonly string[];
  },
  client: PrismaClient = prisma,
): Promise<TrainingAdminEvaluationMetric[]> {
  if (!input.enrollmentIds.length) return [];
  const skills = Prisma.join(
    TRAINING_SKILL_KEYS.map(
      (key) => Prisma.sql`
    ${key}::text, CASE
      WHEN jsonb_typeof(a.evaluation->'skills'->${key}::text) = 'number' THEN
        CASE WHEN (a.evaluation->'skills'->>${key}::text)::numeric BETWEEN 0 AND 100
          THEN a.evaluation->'skills'->${key}::text ELSE NULL END
      ELSE NULL END
  `,
    ),
  );
  return client.$queryRaw<TrainingAdminEvaluationMetric[]>(Prisma.sql`
    SELECT a.program_enrollment_id AS "programEnrollmentId",
      jsonb_build_object(
        'result', CASE WHEN a.evaluation->>'result' IN ('PASS', 'REVIEW')
          THEN a.evaluation->>'result' ELSE NULL END,
        'skills', jsonb_strip_nulls(jsonb_build_object(${skills}))
      ) AS evaluation,
      a.evaluated_at AS "evaluatedAt", a.updated_at AS "updatedAt"
    FROM training_mission_answers a
    JOIN program_enrollments e ON e.id = a.program_enrollment_id
      AND e.workspace_id = a.workspace_id AND e.group_id = a.group_id
    JOIN group_memberships m ON m.id = e.group_membership_id
      AND m.workspace_id = e.workspace_id AND m.group_id = e.group_id
      AND m.user_id = a.user_id AND m.service_role = 'PARTICIPANT'
      AND m.status IN ('ACTIVE', 'SUSPENDED')
    JOIN service_programs p ON p.id = e.service_program_id
      AND p.workspace_id = e.workspace_id AND p.group_id = e.group_id
      AND p.settings->>'moduleKey' = ${AI_TRAINING_V1_MODULE_KEY}
    WHERE a.workspace_id = ${input.workspaceId}::uuid
      AND a.group_id = ${input.groupId}::uuid
      AND a.program_enrollment_id IN (${Prisma.join(input.enrollmentIds.map((id) => Prisma.sql`${id}::uuid`))})
      AND a.evaluation_status = 'READY'
      AND EXISTS (
        SELECT 1 FROM group_memberships admin
        JOIN users u ON u.id = admin.user_id AND u.status = 'ACTIVE'
        JOIN groups g ON g.id = admin.group_id AND g.workspace_id = admin.workspace_id AND g.status = 'ACTIVE'
        JOIN workspaces w ON w.id = admin.workspace_id AND w.status = 'ACTIVE'
        WHERE admin.workspace_id = a.workspace_id AND admin.group_id = a.group_id
          AND admin.user_id = ${input.actorUserId}::uuid AND admin.status = 'ACTIVE'
          AND admin.service_role IN ('SERVICE_OWNER', 'SERVICE_ADMIN')
      )
    ORDER BY a.updated_at DESC
  `);
}
