import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient, Prisma } from '@prisma/client';
import { listTrainingAdminEvaluationMetrics } from '../src';

const input = {
  workspaceId: 'workspace',
  groupId: 'service',
  actorUserId: 'manager',
  enrollmentIds: ['enrollment'],
};
function fixture() {
  const query = vi.fn().mockResolvedValue([]);
  return { query, client: { $queryRaw: query } as unknown as PrismaClient };
}
describe('training admin evaluation metrics', () => {
  it('does not execute a query for an empty scope', async () => {
    const { client, query } = fixture();
    expect(
      await listTrainingAdminEvaluationMetrics({ ...input, enrollmentIds: [] }, client),
    ).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
  it('uses parameterized ownership and manager gates with database-side projection', async () => {
    const { client, query } = fixture();
    await listTrainingAdminEvaluationMetrics(input, client);
    const sql = query.mock.calls[0]![0] as Prisma.Sql;
    expect(sql.values).toEqual(
      expect.arrayContaining(['workspace', 'service', 'manager', 'enrollment', 'AI_TRAINING_V1']),
    );
    expect(sql.sql).toContain("admin.service_role IN ('SERVICE_OWNER', 'SERVICE_ADMIN')");
    expect(sql.sql).toContain('m.user_id = a.user_id');
    expect(sql.sql).toContain('e.workspace_id = a.workspace_id');
    expect(sql.sql).toContain("jsonb_typeof(a.evaluation->'skills'");
    expect(sql.sql).toContain('BETWEEN 0 AND 100');
    expect(sql.sql).toContain("IN ('PASS', 'REVIEW')");
    expect(sql.sql).not.toMatch(/SELECT\s+a\.evaluation\b/);
    expect(sql.sql).not.toContain('weaknesses');
    expect(sql.sql).not.toContain('a.answer');
  });
  it('does not mask database failures with empty success', async () => {
    const { client, query } = fixture();
    query.mockRejectedValue(new Error('DB unavailable'));
    await expect(listTrainingAdminEvaluationMetrics(input, client)).rejects.toThrow(
      'DB unavailable',
    );
  });
});
