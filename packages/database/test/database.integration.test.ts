import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CreateUserWithPersonalWorkspace, requireAccessibleWorkspace } from '@bunshin/application';
import { PrismaClient } from '@prisma/client/index';
import {
  PrismaAccountUnitOfWork,
  PrismaBunshinRepository,
  PrismaPlatformAdminRepository,
  PrismaWorkspaceAccessRepository,
} from '../src';

const testUrl = process.env['DATABASE_URL'] ?? '';
const safe =
  /localhost|127\.0\.0\.1|test/i.test(testUrl) && process.env['APP_ENV'] !== 'production';
const integration = safe ? describe : describe.skip;

integration('database ownership boundaries', () => {
  const client = new PrismaClient();

  beforeAll(async () => {
    await client.platformAdmin.deleteMany();
    await client.bunshinPersonality.deleteMany();
    await client.bunshinAudience.deleteMany();
    await client.bunshinObjective.deleteMany();
    await client.bunshin.deleteMany();
    await client.workspaceMembership.deleteMany();
    await client.workspace.deleteMany();
    await client.authIdentity.deleteMany();
    await client.user.deleteMany();
  });

  afterAll(async () => client.$disconnect());

  it('creates User, PERSONAL Workspace, and OWNER Membership transactionally', async () => {
    const result = await new CreateUserWithPersonalWorkspace(
      new PrismaAccountUnitOfWork(client),
    ).execute({
      displayName: 'Integration User',
      identity: { provider: 'EMAIL', providerUserId: `integration-${randomUUID()}` },
    });
    expect(result.workspace.type).toBe('PERSONAL');
    expect(result.membership).toMatchObject({ userId: result.user.id, role: 'OWNER' });
  });

  it('rolls back all account data when a unique identity conflicts', async () => {
    const identity = { provider: 'EMAIL' as const, providerUserId: `duplicate-${randomUUID()}` };
    const service = new CreateUserWithPersonalWorkspace(new PrismaAccountUnitOfWork(client));
    await service.execute({ displayName: 'First', identity });
    const before = await client.user.count();
    await expect(service.execute({ displayName: 'Second', identity })).rejects.toThrow();
    expect(await client.user.count()).toBe(before);
  });

  it('prevents User A from reading or updating User B workspace', async () => {
    const service = new CreateUserWithPersonalWorkspace(new PrismaAccountUnitOfWork(client));
    const a = await service.execute({ displayName: 'A' });
    const b = await service.execute({ displayName: 'B' });
    const repository = new PrismaWorkspaceAccessRepository(client);
    await expect(
      requireAccessibleWorkspace(repository, {
        actorUserId: a.user.id,
        workspaceId: b.workspace.id,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(
      await repository.updateWorkspaceName({
        actorUserId: a.user.id,
        workspaceId: b.workspace.id,
        name: 'stolen',
      }),
    ).toBeNull();
    expect(
      await repository.findAccessibleWorkspace({
        actorUserId: b.user.id,
        workspaceId: b.workspace.id,
      }),
    ).not.toBeNull();
  });

  it('does not make a Workspace OWNER a Platform Admin', async () => {
    const account = await new CreateUserWithPersonalWorkspace(
      new PrismaAccountUnitOfWork(client),
    ).execute({ displayName: 'Owner only' });
    expect(
      await new PrismaPlatformAdminRepository(client).findActivePlatformAdminByUserId(
        account.user.id,
      ),
    ).toBeNull();
  });

  it('does not grant a Platform Admin automatic Workspace Membership', async () => {
    const platformUser = await client.user.create({ data: { displayName: 'Operator' } });
    await client.platformAdmin.create({ data: { userId: platformUser.id, role: 'OPERATOR' } });
    const target = await new CreateUserWithPersonalWorkspace(
      new PrismaAccountUnitOfWork(client),
    ).execute({ displayName: 'Tenant' });
    expect(
      await new PrismaPlatformAdminRepository(client).findActivePlatformAdminByUserId(
        platformUser.id,
      ),
    ).not.toBeNull();
    expect(
      await new PrismaWorkspaceAccessRepository(client).findAccessibleWorkspace({
        actorUserId: platformUser.id,
        workspaceId: target.workspace.id,
      }),
    ).toBeNull();
    const bunshinRepository = new PrismaBunshinRepository(client);
    await bunshinRepository.create({
      workspaceId: target.workspace.id,
      actorUserId: target.user.id,
      name: 'Tenant Bunshin',
      slug: `tenant-${randomUUID()}`,
      type: 'COPY',
      objectiveSummary: 'Objective',
      audienceSummary: 'Audience',
      personalitySummary: 'Personality',
    });
    expect(
      await bunshinRepository.list({
        workspaceId: target.workspace.id,
        actorUserId: platformUser.id,
      }),
    ).toEqual([]);
  });

  it('persists and reads a complete Bunshin aggregate only for active workspace members', async () => {
    const accounts = new CreateUserWithPersonalWorkspace(new PrismaAccountUnitOfWork(client));
    const owner = await accounts.execute({ displayName: 'Bunshin Owner' });
    const outsider = await accounts.execute({ displayName: 'Outsider' });
    const repository = new PrismaBunshinRepository(client);
    const sharedSlug = `expert-${randomUUID()}`;
    const created = await repository.create({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      name: 'Expert One',
      slug: sharedSlug,
      type: 'EXPERT',
      objectiveSummary: 'Help a team',
      audienceSummary: 'Small teams',
      personalitySummary: 'Calm and direct',
      objectives: [
        {
          objectiveType: 'BUSINESS',
          primaryGoal: 'Improve decisions',
          kpiName: null,
          kpiTarget: null,
          kpiPeriod: null,
          priority: 1,
        },
      ],
      audiences: [
        {
          label: 'Operators',
          ageRange: null,
          occupation: null,
          experienceLevel: null,
          painPoints: ['slow decisions'],
          desires: ['clarity'],
          excludedAudience: [],
          notes: null,
        },
      ],
      personality: {
        tone: 'calm',
        formality: 'neutral',
        energyLevel: 'medium',
        expertiseLevel: 'expert',
        sentenceStyle: 'concise',
        firstPerson: '私',
        forbiddenExpressions: [],
        preferredExpressions: ['明確に'],
        visualDirection: null,
        facePolicy: 'FULL_ANONYMOUS',
      },
    });
    expect(created).toMatchObject({ status: 'DRAFT', objectives: [{ priority: 1 }] });
    const sibling = await repository.create({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      name: 'Sibling',
      slug: `sibling-${randomUUID()}`,
      type: 'BRAND',
      objectiveSummary: 'Sibling objective',
      audienceSummary: 'Sibling audience',
      personalitySummary: 'Sibling personality',
      objectives: [
        {
          objectiveType: 'BRAND',
          primaryGoal: 'Sibling goal',
          kpiName: null,
          kpiTarget: null,
          kpiPeriod: null,
          priority: 1,
        },
      ],
    });
    expect(sibling.objectives).toMatchObject([
      { bunshinId: sibling.id, primaryGoal: 'Sibling goal' },
    ]);
    expect(created.objectives).toMatchObject([
      { bunshinId: created.id, primaryGoal: 'Improve decisions' },
    ]);
    await expect(
      repository.create({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        name: 'Duplicate',
        slug: sharedSlug,
        type: 'COPY',
        objectiveSummary: 'Objective',
        audienceSummary: 'Audience',
        personalitySummary: 'Personality',
      }),
    ).rejects.toThrow();
    await expect(
      repository.create({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        ownerUserId: outsider.user.id,
        name: 'Invalid owner',
        slug: `invalid-owner-${randomUUID()}`,
        type: 'COPY',
        objectiveSummary: 'Objective',
        audienceSummary: 'Audience',
        personalitySummary: 'Personality',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      repository.create({
        workspaceId: outsider.workspace.id,
        actorUserId: outsider.user.id,
        name: 'Same slug elsewhere',
        slug: sharedSlug,
        type: 'COPY',
        objectiveSummary: 'Objective',
        audienceSummary: 'Audience',
        personalitySummary: 'Personality',
      }),
    ).resolves.toMatchObject({ slug: sharedSlug });
    expect(
      await repository.list({
        workspaceId: owner.workspace.id,
        actorUserId: outsider.user.id,
      }),
    ).toEqual([]);
    expect(
      await repository.find({
        workspaceId: owner.workspace.id,
        actorUserId: outsider.user.id,
        bunshinId: created.id,
      }),
    ).toBeNull();
    expect(
      await repository.update({
        workspaceId: owner.workspace.id,
        actorUserId: outsider.user.id,
        bunshinId: created.id,
        name: 'stolen',
      }),
    ).toBeNull();
    expect(
      await repository.archive({
        workspaceId: owner.workspace.id,
        actorUserId: outsider.user.id,
        bunshinId: created.id,
      }),
    ).toBeNull();
    expect(
      await repository.find({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: created.id,
      }),
    ).toMatchObject({ id: created.id, personality: { facePolicy: 'FULL_ANONYMOUS' } });
  });

  it('enforces MEMBER ownership while allowing ADMIN management and hides archives', async () => {
    const accounts = new CreateUserWithPersonalWorkspace(new PrismaAccountUnitOfWork(client));
    const owner = await accounts.execute({ displayName: 'Organization Owner' });
    const member = await accounts.execute({ displayName: 'Organization Member' });
    const admin = await accounts.execute({ displayName: 'Organization Admin' });
    await client.workspaceMembership.createMany({
      data: [
        { workspaceId: owner.workspace.id, userId: member.user.id, role: 'MEMBER' },
        { workspaceId: owner.workspace.id, userId: admin.user.id, role: 'ADMIN' },
      ],
    });
    const repository = new PrismaBunshinRepository(client);
    const create = (actorUserId: string, ownerUserId: string, slug: string) =>
      repository.create({
        workspaceId: owner.workspace.id,
        actorUserId,
        ownerUserId,
        name: slug,
        slug,
        type: 'COPY',
        objectiveSummary: 'Objective',
        audienceSummary: 'Audience',
        personalitySummary: 'Personality',
      });
    const ownerBunshin = await create(owner.user.id, owner.user.id, `owner-${randomUUID()}`);
    const memberBunshin = await create(member.user.id, member.user.id, `member-${randomUUID()}`);
    expect(
      await repository.update({
        workspaceId: owner.workspace.id,
        actorUserId: member.user.id,
        bunshinId: ownerBunshin.id,
        name: 'stolen',
      }),
    ).toBeNull();
    expect(
      await repository.archive({
        workspaceId: owner.workspace.id,
        actorUserId: member.user.id,
        bunshinId: ownerBunshin.id,
      }),
    ).toBeNull();
    expect(
      await repository.update({
        workspaceId: owner.workspace.id,
        actorUserId: member.user.id,
        bunshinId: memberBunshin.id,
        name: 'member-updated',
      }),
    ).toMatchObject({ name: 'member-updated' });
    expect(
      await repository.update({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: memberBunshin.id,
        name: 'owner-managed',
      }),
    ).toMatchObject({ name: 'owner-managed' });
    await repository.archive({
      workspaceId: owner.workspace.id,
      actorUserId: admin.user.id,
      bunshinId: memberBunshin.id,
    });
    expect(
      await repository.find({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: memberBunshin.id,
      }),
    ).toBeNull();
    expect(
      (await repository.list({ workspaceId: owner.workspace.id, actorUserId: owner.user.id })).map(
        (item) => item.id,
      ),
    ).not.toContain(memberBunshin.id);
  });
});
