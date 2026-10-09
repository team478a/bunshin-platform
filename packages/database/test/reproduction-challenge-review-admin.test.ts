import type { Prisma, ProgramAuditLog } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  REPRODUCTION_CHALLENGE_REVIEW_FIXTURES,
  resolveReproductionChallengeReference,
} from '@bunshin/capability-training';
import {
  PrismaReproductionChallengeReviewAdminRepository,
  validateReproductionChallengeReviewAdminCommand,
} from '../src';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const authority = { workspaceId: id(1), groupId: id(2), serviceProgramId: id(3) };
const actor = id(4);
const commit = 'a'.repeat(40);
const reference = REPRODUCTION_CHALLENGE_REVIEW_FIXTURES[0]!.reference;
const checklist = {
  objective: true,
  prerequisites: true,
  syntheticFacts: true,
  learnerTask: true,
  rubricAndMission: true,
  safety: true,
};
function fixture() {
  const rows: ProgramAuditLog[] = [];
  const settings = {
    moduleKey: 'AI_TRAINING_V1',
    personalLearningPilot: { enabled: false, enrollmentIds: [id(8)] },
    trainingOperations: { notificationsEnabled: false, postponedReminderEnabled: false },
  };
  let clock = 0;
  const guard = vi.fn();
  const tx = {
    $queryRaw: vi.fn((strings: TemplateStringsArray) => {
      const sql = strings.join('');
      if (sql.includes('FROM service_programs')) return Promise.resolve([{ settings }]);
      return Promise.resolve([{ id: id(9) }]);
    }),
    programEnrollment: { count: vi.fn().mockResolvedValue(1) },
    serviceProgram: { count: vi.fn().mockResolvedValue(0) },
    programAuditLog: {
      findMany: vi.fn((args: { where: Prisma.ProgramAuditLogWhereInput; take: number }) =>
        Promise.resolve(rows.slice(0, args.take)),
      ),
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(rows.find((r) => r.id === where.id) ?? null),
      ),
      create: vi.fn(({ data }: { data: ProgramAuditLog }) => {
        rows.push(data);
        return Promise.resolve(data);
      }),
    },
  };
  const client = {
    $transaction: vi.fn(async (work: (db: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const repo = new PrismaReproductionChallengeReviewAdminRepository(
    client as never,
    authority,
    commit,
    guard,
    () => new Date(1791525600000 + ++clock),
  );
  async function command(operationId = id(10)) {
    const state = await repo.read(actor, reference);
    return {
      operationId,
      reference,
      expectedRevision: state.revision,
      materialDigest: state.materialDigest,
      reviewedCommitSha: commit,
      evidenceKey: 'synthetic-human-review',
      action: 'APPROVE' as const,
      confirmation: 'CONFIRM_CHALLENGE_REVIEW' as const,
      checklist,
    };
  }
  return { rows, tx, client, repo, guard, settings, command };
}
describe('bounded stopped-service challenge review repository', () => {
  it('computes material/commit on server, creates review and retains DRAFT/UNKNOWN', async () => {
    const f = fixture();
    const c = await f.command();
    const result = await f.repo.change(actor, c);
    expect(result.current).toMatchObject({
      recordedDecision: 'APPROVE',
      reviewBinding: 'MATCHED',
      executionPermission: 'NOT_GRANTED',
    });
    expect(result.current.history[0]?.record).toMatchObject({
      reviewerUserId: actor,
      workspaceId: authority.workspaceId,
      serviceId: authority.groupId,
    });
    expect(f.rows).toHaveLength(1);
    expect(JSON.stringify(f.rows)).not.toContain('scenario');
    expect(JSON.stringify(f.rows)).not.toContain('syntheticFacts":[');
    expect(f.tx.programAuditLog.create).toHaveBeenCalledTimes(1);
    expect(resolveReproductionChallengeReference(reference)).toEqual({
      status: 'UNKNOWN',
      reason: 'HUMAN_REVIEW_REQUIRED',
    });
    expect(f.client.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      maxWait: 10000,
      timeout: 20000,
    });
    expect(f.tx.programAuditLog.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        workspaceId: authority.workspaceId,
        groupId: authority.groupId,
        resourceType: 'REPRODUCTION_CHALLENGE_REVIEW',
      },
      take: 102,
    });
  });
  it.each(['REJECT', 'REVISION_REQUIRED'] as const)(
    'records %s without execution approval',
    async (action) => {
      const f = fixture();
      const c = await f.command();
      expect(
        (await f.repo.change(actor, { ...c, action, checklist: { ...checklist, safety: false } }))
          .current.recordedDecision,
      ).toBe(action);
    },
  );
  it('retries same operation once; changed content, actor and operation collision conflict', async () => {
    const f = fixture();
    const c = await f.command();
    await f.repo.change(actor, c);
    await expect(
      f.repo.change(actor, Object.fromEntries(Object.entries(c).reverse())),
    ).resolves.toMatchObject({ replayed: true });
    await expect(f.repo.change(actor, { ...c, evidenceKey: 'different' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(f.repo.change(id(5), c)).rejects.toThrow();
    expect(f.rows).toHaveLength(1);
  });
  it('explicit revocation retains history; approval replay never restores it', async () => {
    const f = fixture();
    const c = await f.command();
    await f.repo.change(actor, c);
    const current = await f.repo.read(actor, reference);
    const revoke = {
      ...c,
      operationId: id(11),
      expectedRevision: current.revision,
      action: 'REVOKE',
      confirmation: 'CONFIRM_CHALLENGE_REVOKE',
      checklist: null,
    };
    const r = await f.repo.change(actor, revoke);
    expect(r.current.recordedDecision).toBe('REVOKE');
    expect(r.current.history).toHaveLength(2);
    expect(r.current.history[1]?.record).toBeNull();
    const replay = await f.repo.change(actor, c);
    expect(replay).toMatchObject({
      replayed: true,
      current: { recordedDecision: 'REVOKE', executionPermission: 'NOT_GRANTED' },
    });
    await expect(
      f.repo.change(actor, {
        ...revoke,
        operationId: id(12),
        expectedRevision: r.current.revision,
      }),
    ).rejects.toThrow();
    expect(f.rows).toHaveLength(2);
  });
  it('rejects stale CAS and future or changed server commit/digest', async () => {
    const f = fixture();
    const c = await f.command();
    for (const change of [
      { expectedRevision: 'b'.repeat(64) },
      { reviewedCommitSha: 'b'.repeat(40) },
      { materialDigest: `sha256:${'b'.repeat(64)}` },
    ]) {
      await expect(f.repo.change(actor, { ...c, ...change })).rejects.toThrow();
    }
    await f.repo.change(actor, c);
    await expect(f.repo.change(actor, { ...c, operationId: id(11) })).rejects.toThrow();
    expect(f.rows).toHaveLength(1);
  });
  it('new deployment keeps history but marks old binding UNKNOWN and rejects old retries', async () => {
    const f = fixture();
    const c = await f.command();
    await f.repo.change(actor, c);
    const updated = new PrismaReproductionChallengeReviewAdminRepository(
      f.client as never,
      authority,
      'b'.repeat(40),
      f.guard,
    );
    expect(await updated.read(actor, reference)).toMatchObject({
      reviewBinding: 'UNKNOWN',
      recordedDecision: 'APPROVE',
      executionPermission: 'NOT_GRANTED',
    });
    await expect(updated.change(actor, c)).rejects.toThrow();
  });
  it('reserves a final withdrawal slot when normal review history reaches its limit', async () => {
    const f = fixture();
    for (let i = 0; i < 100; i++) await f.repo.change(actor, await f.command(id(1000 + i)));
    const c = await f.command(id(2000));
    await expect(f.repo.change(actor, c)).rejects.toThrow();
    const revoked = await f.repo.change(actor, {
      ...c,
      action: 'REVOKE',
      confirmation: 'CONFIRM_CHALLENGE_REVOKE',
      checklist: null,
    });
    expect(revoked.current.history).toHaveLength(101);
    expect(revoked.current.recordedDecision).toBe('REVOKE');
    await expect(f.repo.change(actor, await f.command(id(2001)))).rejects.toThrow();
  }, 15000);
  it('rejects unknown reference and malformed input without writes', async () => {
    const f = fixture();
    const c = await f.command();
    await expect(
      f.repo.change(actor, {
        ...c,
        reference: { ...reference, challengeVersion: 'UNKNOWN_VERSION' },
      }),
    ).rejects.toThrow();
    for (const fields of [
      { actorUserId: actor },
      { answer: 'private' },
      { checklist: { ...checklist, safety: false } },
      { confirmation: 'YES' },
    ]) {
      expect(() => validateReproductionChallengeReviewAdminCommand({ ...c, ...fields })).toThrow();
    }
    expect(f.rows).toHaveLength(0);
  });
  it.each([
    'id',
    'workspaceId',
    'groupId',
    'performedByUserId',
    'action',
    'resourceType',
    'resourceId',
  ] as const)('rejects corrupted audit %s', async (key) => {
    const f = fixture();
    await f.repo.change(actor, await f.command());
    Object.assign(f.rows[0]!, {
      [key]: key === 'action' || key === 'resourceType' ? 'OTHER' : id(90),
    });
    await expect(f.repo.read(actor, reference)).rejects.toThrow();
  });
  it('rejects broken chain, oversized or duplicate-time histories', async () => {
    const f = fixture();
    await f.repo.change(actor, await f.command());
    const row = f.rows[0]!;
    const original = row.afterData;
    row.afterData = { ...(original as Prisma.JsonObject), previousRevision: 'b'.repeat(64) };
    await expect(f.repo.read(actor, reference)).rejects.toThrow();
    row.afterData = original;
    f.rows.push(row);
    await expect(f.repo.read(actor, reference)).rejects.toThrow();
    while (f.rows.length < 101) f.rows.push(row);
    await expect(f.repo.read(actor, reference)).rejects.toThrow();
  });
  it('accepts JSONB property reordering without corrupting the chain', async () => {
    const f = fixture();
    await f.repo.change(actor, await f.command());
    const data = f.rows[0]!.afterData as Prisma.JsonObject;
    const record = data.reviewRecord as Prisma.JsonObject;
    data.reviewRecord = Object.fromEntries(Object.entries(record).reverse());
    f.rows[0]!.afterData = Object.fromEntries(Object.entries(data).reverse());
    expect((await f.repo.read(actor, reference)).history).toHaveLength(1);
    await f.repo.change(actor, await f.command(id(11)));
    expect((await f.repo.read(actor, reference)).history).toHaveLength(2);
  });
  it('authorizes current active admin and exact dedicated stopped Program on every retry', async () => {
    const f = fixture();
    const c = await f.command();
    await f.repo.change(actor, c);
    const sql = f.tx.$queryRaw.mock.calls.map(([strings]) => strings.join('')).join('\n');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('SERVICE_OWNER');
    expect(sql).toContain('SERVICE_ADMIN');
    expect(sql).toContain("u.status::text='ACTIVE'");
    expect(sql).toContain("status::text='SUSPENDED'");
    f.tx.$queryRaw.mockResolvedValue([]);
    await expect(f.repo.change(actor, c)).rejects.toThrow();
    expect(f.rows).toHaveLength(1);
  });
  it('denies notifications, foreign allowlist, duplicate Program and changed preparation guard', async () => {
    const f = fixture();
    const c = await f.command();
    f.settings.personalLearningPilot.enabled = true;
    await expect(f.repo.change(actor, c)).rejects.toThrow();
    f.settings.personalLearningPilot.enabled = false;
    f.settings.trainingOperations.notificationsEnabled = true;
    await expect(f.repo.change(actor, c)).rejects.toThrow();
    f.settings.trainingOperations.notificationsEnabled = false;
    f.tx.programEnrollment.count.mockResolvedValue(0);
    await expect(f.repo.change(actor, c)).rejects.toThrow();
    f.tx.programEnrollment.count.mockResolvedValue(1);
    f.tx.serviceProgram.count.mockResolvedValue(1);
    await expect(f.repo.change(actor, c)).rejects.toThrow();
    f.tx.serviceProgram.count.mockResolvedValue(0);
    f.guard.mockImplementation(() => {
      throw new Error('disabled');
    });
    await expect(f.repo.change(actor, c)).rejects.toThrow('disabled');
    expect(f.rows).toHaveLength(0);
  });
  it('requires valid server authority and commit; never accepts client-selected Service', async () => {
    const f = fixture();
    const repo = new PrismaReproductionChallengeReviewAdminRepository(
      f.client as never,
      { ...authority, groupId: 'bad' },
      commit,
      f.guard,
    );
    await expect(repo.read(actor, reference)).rejects.toThrow();
    const noCommit = new PrismaReproductionChallengeReviewAdminRepository(
      f.client as never,
      authority,
      '',
      f.guard,
    );
    await expect(noCommit.read(actor, reference)).rejects.toThrow();
    expect(f.client.$transaction).not.toHaveBeenCalled();
  });
});
