import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CreateUserWithPersonalWorkspace,
  RequireActiveBunshinCapability,
  requireAccessibleWorkspace,
} from '@bunshin/application';
import {
  ActivateSocialProfile,
  CreateSocialProfile,
  DeactivateSocialProfile,
  ListSocialProfiles,
  UpdateSocialProfile,
  CreateContentPillar,
  UpdateContentPillar,
  DeactivateContentPillar,
  DeleteContentPillar,
  ListContentPillars,
} from '@bunshin/capability-social';
import { PrismaClient } from '@prisma/client/index';
import {
  PrismaAccountUnitOfWork,
  PrismaBunshinRepository,
  PrismaPlatformAdminRepository,
  PrismaWorkspaceAccessRepository,
  PrismaOwnerKnowledgeRepository,
  PrismaKnowledgeGrantRepository,
  PrismaBunshinMemoryRepository,
  PrismaBunshinCapabilityAssignmentRepository,
  PrismaSocialProfileRepository,
  PrismaContentPillarRepository,
} from '../src';

const testUrl = process.env['DATABASE_URL'] ?? '';
const safe =
  /localhost|127\.0\.0\.1|test/i.test(testUrl) && process.env['APP_ENV'] !== 'production';
const integration = safe ? describe : describe.skip;

integration('database ownership boundaries', () => {
  const client = new PrismaClient();

  beforeAll(async () => {
    await client.contentPillar.deleteMany();
    await client.socialProfile.deleteMany();
    await client.bunshinCapabilityAssignment.deleteMany();
    await client.bunshinMemory.deleteMany();
    await client.bunshinKnowledgeGrant.deleteMany();
    await client.ownerKnowledge.deleteMany();
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

  it('isolates Memory by workspace and Bunshin and excludes inactive/deleted rows', async () => {
    const accounts = new CreateUserWithPersonalWorkspace(new PrismaAccountUnitOfWork(client));
    const owner = await accounts.execute({ displayName: 'Memory Owner' });
    const outsider = await accounts.execute({ displayName: 'Memory Outsider' });
    const bunshins = new PrismaBunshinRepository(client);
    const first = await bunshins.create({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      name: 'Memory A',
      slug: `memory-a-${randomUUID()}`,
      type: 'COPY',
      objectiveSummary: 'Objective',
      audienceSummary: 'Audience',
      personalitySummary: 'Personality',
    });
    const second = await bunshins.create({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      name: 'Memory B',
      slug: `memory-b-${randomUUID()}`,
      type: 'COPY',
      objectiveSummary: 'Objective',
      audienceSummary: 'Audience',
      personalitySummary: 'Personality',
    });
    const repository = new PrismaBunshinMemoryRepository(client);
    const created = await repository.create({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      bunshinId: first.id,
      type: 'BELIEF',
      content: 'Only A',
      confidence: 0.9,
      importance: 4,
    });
    expect(created).not.toBeNull();
    if (created === null) throw new Error('memory creation failed');
    expect(
      await repository.list({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: second.id,
      }),
    ).toEqual([]);
    expect(
      await repository.list({
        workspaceId: outsider.workspace.id,
        actorUserId: outsider.user.id,
        bunshinId: first.id,
      }),
    ).toEqual([]);
    await repository.setActive({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      bunshinId: first.id,
      memoryId: created.id,
      active: false,
    });
    expect(
      await repository.list({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: first.id,
      }),
    ).toEqual([]);
    expect(
      await repository.list({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: first.id,
        includeInactive: true,
      }),
    ).toHaveLength(1);
    const deleted = await repository.softDelete({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      bunshinId: first.id,
      memoryId: created.id,
    });
    expect(deleted).toMatchObject({ active: false, deletedAt: expect.any(Date) });
    expect(
      await repository.list({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: first.id,
        includeInactive: true,
      }),
    ).toEqual([]);
  });

  it('enforces default DENY, workspace isolation, revoke, and archive for Knowledge grants', async () => {
    const accounts = new CreateUserWithPersonalWorkspace(new PrismaAccountUnitOfWork(client));
    const owner = await accounts.execute({ displayName: 'Knowledge Owner' });
    const outsider = await accounts.execute({ displayName: 'Knowledge Outsider' });
    const bunshins = new PrismaBunshinRepository(client);
    const bunshin = await bunshins.create({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      name: 'Knowledge Bunshin',
      slug: `knowledge-${randomUUID()}`,
      type: 'EXPERT',
      objectiveSummary: 'Objective',
      audienceSummary: 'Audience',
      personalitySummary: 'Personality',
    });
    const knowledgeRepository = new PrismaOwnerKnowledgeRepository(client);
    const grants = new PrismaKnowledgeGrantRepository(client);
    const item = await knowledgeRepository.create({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      type: 'SKILL',
      title: 'Skill',
      content: 'Private skill',
    });
    expect(
      await grants.listGrantedKnowledge({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: bunshin.id,
      }),
    ).toEqual([]);
    expect(
      await grants.grant({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: bunshin.id,
        knowledgeId: item.id,
      }),
    ).toMatchObject({ status: 'ACTIVE' });
    expect(
      await grants.listGrantedKnowledge({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: bunshin.id,
      }),
    ).toMatchObject([{ id: item.id }]);
    expect(
      await grants.grant({
        workspaceId: outsider.workspace.id,
        actorUserId: outsider.user.id,
        bunshinId: bunshin.id,
        knowledgeId: item.id,
      }),
    ).toBeNull();
    expect(
      await grants.revoke({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: bunshin.id,
        knowledgeId: item.id,
      }),
    ).toMatchObject({ status: 'REVOKED', revokedAt: expect.any(Date) });
    expect(
      await grants.listGrantedKnowledge({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: bunshin.id,
      }),
    ).toEqual([]);
    await grants.grant({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      bunshinId: bunshin.id,
      knowledgeId: item.id,
    });
    await knowledgeRepository.archiveOwned({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      knowledgeId: item.id,
    });
    expect(
      await grants.listGrantedKnowledge({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: bunshin.id,
      }),
    ).toEqual([]);
    expect(
      await client.bunshinKnowledgeGrant.findFirst({ where: { ownerKnowledgeId: item.id } }),
    ).toMatchObject({ status: 'REVOKED', revokedAt: expect.any(Date) });
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

  it('isolates Capability Assignment and enforces idempotent state transitions', async () => {
    const accounts = new CreateUserWithPersonalWorkspace(new PrismaAccountUnitOfWork(client));
    const owner = await accounts.execute({ displayName: 'Capability Owner' });
    const member = await accounts.execute({ displayName: 'Capability Member' });
    const admin = await accounts.execute({ displayName: 'Capability Admin' });
    const outsider = await accounts.execute({ displayName: 'Capability Outsider' });
    await client.workspaceMembership.createMany({
      data: [
        { workspaceId: owner.workspace.id, userId: member.user.id, role: 'MEMBER' },
        { workspaceId: owner.workspace.id, userId: admin.user.id, role: 'ADMIN' },
      ],
    });
    const bunshins = new PrismaBunshinRepository(client);
    const createBunshin = (name: string, ownerUserId = owner.user.id) =>
      bunshins.create({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        ownerUserId,
        name,
        slug: `${name.toLowerCase()}-${randomUUID()}`,
        type: 'COPY',
        objectiveSummary: 'Objective',
        audienceSummary: 'Audience',
        personalitySummary: 'Personality',
      });
    const first = await createBunshin('Capability First');
    const sibling = await createBunshin('Capability Sibling');
    const memberOwned = await createBunshin('Capability Member Owned', member.user.id);
    const repository = new PrismaBunshinCapabilityAssignmentRepository(client);

    const assigned = await repository.assign({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      bunshinId: first.id,
      capabilityType: 'SOCIAL',
    });
    expect(assigned).toMatchObject({ status: 'ACTIVE', config: {} });
    if (assigned === null) throw new Error('assignment was not created');
    expect(
      await repository.assign({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: first.id,
        capabilityType: 'SOCIAL',
      }),
    ).toMatchObject({ id: assigned.id, status: 'ACTIVE' });
    await expect(
      client.bunshinCapabilityAssignment.create({
        data: {
          workspaceId: owner.workspace.id,
          bunshinId: first.id,
          capabilityType: 'SOCIAL',
          assignedByUserId: owner.user.id,
          config: {},
        },
      }),
    ).rejects.toThrow();
    expect(
      await repository.list({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: sibling.id,
      }),
    ).toEqual([]);
    expect(
      await repository.list({
        workspaceId: owner.workspace.id,
        actorUserId: outsider.user.id,
        bunshinId: first.id,
      }),
    ).toBeNull();
    expect(
      await repository.assign({
        workspaceId: outsider.workspace.id,
        actorUserId: outsider.user.id,
        bunshinId: first.id,
        capabilityType: 'SOCIAL',
      }),
    ).toBeNull();
    expect(
      await repository.assign({
        workspaceId: owner.workspace.id,
        actorUserId: member.user.id,
        bunshinId: first.id,
        capabilityType: 'BLOG',
      }),
    ).toBeNull();
    await expect(
      repository.assign({
        workspaceId: owner.workspace.id,
        actorUserId: admin.user.id,
        bunshinId: first.id,
        capabilityType: 'BLOG',
      }),
    ).resolves.toMatchObject({ capabilityType: 'BLOG' });
    await expect(
      repository.assign({
        workspaceId: owner.workspace.id,
        actorUserId: member.user.id,
        bunshinId: memberOwned.id,
        capabilityType: 'SOCIAL',
      }),
    ).resolves.toMatchObject({ capabilityType: 'SOCIAL' });

    const suspended = await repository.setStatus({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      bunshinId: first.id,
      capabilityType: 'SOCIAL',
      status: 'SUSPENDED',
    });
    expect(suspended).toMatchObject({ id: assigned.id, status: 'SUSPENDED' });
    expect(
      await repository.setStatus({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: first.id,
        capabilityType: 'SOCIAL',
        status: 'SUSPENDED',
      }),
    ).toMatchObject({ id: assigned.id, status: 'SUSPENDED' });
    await expect(
      new RequireActiveBunshinCapability(repository).execute({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: first.id,
        capabilityType: 'SOCIAL',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await client.bunshinCapabilityAssignment.update({
      where: { id: assigned.id },
      data: { status: 'LOCKED' },
    });
    await expect(
      repository.setStatus({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: first.id,
        capabilityType: 'SOCIAL',
        status: 'ACTIVE',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      repository.assign({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: first.id,
        capabilityType: 'SOCIAL',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    await repository.assign({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      bunshinId: sibling.id,
      capabilityType: 'SOCIAL',
    });
    await bunshins.archive({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      bunshinId: sibling.id,
    });
    expect(
      await repository.assign({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: sibling.id,
        capabilityType: 'SOCIAL',
      }),
    ).toBeNull();
    for (const status of ['ACTIVE', 'SUSPENDED'] as const) {
      expect(
        await repository.setStatus({
          workspaceId: owner.workspace.id,
          actorUserId: owner.user.id,
          bunshinId: sibling.id,
          capabilityType: 'SOCIAL',
          status,
        }),
      ).toBeNull();
    }
  });

  it('persists manual Social Profiles with capability and tenant boundaries', async () => {
    const accounts = new CreateUserWithPersonalWorkspace(new PrismaAccountUnitOfWork(client));
    const owner = await accounts.execute({ displayName: 'Social Owner' });
    const member = await accounts.execute({ displayName: 'Social Member' });
    const admin = await accounts.execute({ displayName: 'Social Admin' });
    const outsider = await accounts.execute({ displayName: 'Social Outsider' });
    await client.workspaceMembership.createMany({
      data: [
        { workspaceId: owner.workspace.id, userId: member.user.id, role: 'MEMBER' },
        { workspaceId: owner.workspace.id, userId: admin.user.id, role: 'ADMIN' },
      ],
    });
    const bunshins = new PrismaBunshinRepository(client);
    const createBunshin = (name: string, ownerUserId = owner.user.id) =>
      bunshins.create({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        ownerUserId,
        name,
        slug: `${name.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}`,
        type: 'COPY',
        objectiveSummary: 'Objective',
        audienceSummary: 'Audience',
        personalitySummary: 'Personality',
      });
    const owned = await createBunshin('Social Owned');
    const sibling = await createBunshin('Social Sibling');
    const memberOwned = await createBunshin('Social Member Owned', member.user.id);
    const assignments = new PrismaBunshinCapabilityAssignmentRepository(client);
    for (const bunshinId of [owned.id, sibling.id, memberOwned.id]) {
      await assignments.assign({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId,
        capabilityType: 'SOCIAL',
      });
    }
    const profiles = new PrismaSocialProfileRepository(client);
    const create = new CreateSocialProfile(profiles, assignments);
    const profile = await create.execute({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      bunshinId: owned.id,
      platform: 'INSTAGRAM',
      handle: '  bunshin  ',
      profileUrl: ' https://example.com/bunshin ',
      purpose: '  manual publishing  ',
      postingFrequency: 'THREE_PER_WEEK',
      preferredFormats: ['SLIDE', 'IMAGE'],
    });
    expect(profile).toMatchObject({
      handle: 'bunshin',
      purpose: 'manual publishing',
      status: 'ACTIVE',
      preferredFormats: ['SLIDE', 'IMAGE'],
    });
    await expect(
      create.execute({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: owned.id,
        platform: 'INSTAGRAM',
        purpose: 'duplicate',
        postingFrequency: 'WEEKLY',
        preferredFormats: ['IMAGE'],
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      new ListSocialProfiles(profiles).execute({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: sibling.id,
      }),
    ).resolves.toEqual([]);
    await expect(
      new ListSocialProfiles(profiles).execute({
        workspaceId: owner.workspace.id,
        actorUserId: outsider.user.id,
        bunshinId: owned.id,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      create.execute({
        workspaceId: outsider.workspace.id,
        actorUserId: outsider.user.id,
        bunshinId: owned.id,
        platform: 'X',
        purpose: 'cross tenant',
        postingFrequency: 'WEEKLY',
        preferredFormats: ['IMAGE'],
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      new UpdateSocialProfile(profiles, assignments).execute({
        workspaceId: owner.workspace.id,
        actorUserId: member.user.id,
        bunshinId: owned.id,
        platform: 'INSTAGRAM',
        purpose: 'stolen',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      new UpdateSocialProfile(profiles, assignments).execute({
        workspaceId: owner.workspace.id,
        actorUserId: admin.user.id,
        bunshinId: owned.id,
        platform: 'INSTAGRAM',
        purpose: 'admin managed',
      }),
    ).resolves.toMatchObject({ purpose: 'admin managed' });
    await expect(
      create.execute({
        workspaceId: owner.workspace.id,
        actorUserId: member.user.id,
        bunshinId: memberOwned.id,
        platform: 'TIKTOK',
        purpose: 'member owned',
        postingFrequency: 'DAILY',
        preferredFormats: ['LIVE_ACTION'],
      }),
    ).resolves.toMatchObject({ platform: 'TIKTOK' });

    await assignments.setStatus({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      bunshinId: owned.id,
      capabilityType: 'SOCIAL',
      status: 'SUSPENDED',
    });
    await expect(
      new UpdateSocialProfile(profiles, assignments).execute({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: owned.id,
        platform: 'INSTAGRAM',
        purpose: 'blocked',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      new DeactivateSocialProfile(profiles, assignments).execute({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: owned.id,
        platform: 'INSTAGRAM',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      new ListSocialProfiles(profiles).execute({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: owned.id,
      }),
    ).resolves.toHaveLength(1);
    await assignments.setStatus({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      bunshinId: owned.id,
      capabilityType: 'SOCIAL',
      status: 'ACTIVE',
    });
    const deactivate = new DeactivateSocialProfile(profiles, assignments);
    await expect(
      deactivate.execute({ ...profile, actorUserId: owner.user.id }),
    ).resolves.toMatchObject({ status: 'INACTIVE' });
    await expect(
      deactivate.execute({ ...profile, actorUserId: owner.user.id }),
    ).resolves.toMatchObject({ status: 'INACTIVE' });
    await expect(
      new ActivateSocialProfile(profiles, assignments).execute({
        ...profile,
        actorUserId: owner.user.id,
      }),
    ).resolves.toMatchObject({ status: 'ACTIVE' });

    await expect(
      client.socialProfile.create({
        data: {
          workspaceId: owner.workspace.id,
          bunshinId: outsider.workspace.id,
          platform: 'OTHER',
          purpose: 'invalid relation',
          postingFrequency: 'FLEXIBLE',
          preferredFormats: ['IMAGE'],
        },
      }),
    ).rejects.toThrow();
    await client.socialProfile.update({
      where: { id: profile.id },
      data: { preferredFormats: [] },
    });
    await expect(
      profiles.findByPlatform({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: owned.id,
        platform: 'INSTAGRAM',
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });

    await bunshins.archive({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      bunshinId: sibling.id,
    });
    await expect(
      new ListSocialProfiles(profiles).execute({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: sibling.id,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('persists Content Pillars with scope, weight, state, and soft-delete boundaries', async () => {
    const accounts = new CreateUserWithPersonalWorkspace(new PrismaAccountUnitOfWork(client));
    const owner = await accounts.execute({ displayName: 'Pillar Owner' });
    const outsider = await accounts.execute({ displayName: 'Pillar Outsider' });
    const bunshins = new PrismaBunshinRepository(client);
    const first = await bunshins.create({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      name: 'Pillar First',
      slug: `pillar-first-${randomUUID()}`,
      type: 'COPY',
      objectiveSummary: 'Objective',
      audienceSummary: 'Audience',
      personalitySummary: 'Personality',
    });
    const sibling = await bunshins.create({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      name: 'Pillar Sibling',
      slug: `pillar-sibling-${randomUUID()}`,
      type: 'COPY',
      objectiveSummary: 'Objective',
      audienceSummary: 'Audience',
      personalitySummary: 'Personality',
    });
    const assignments = new PrismaBunshinCapabilityAssignmentRepository(client);
    for (const bunshinId of [first.id, sibling.id]) {
      await assignments.assign({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId,
        capabilityType: 'SOCIAL',
      });
    }
    const repository = new PrismaContentPillarRepository(client);
    const create = new CreateContentPillar(repository, assignments);
    const pillar = await create.execute({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      bunshinId: first.id,
      title: '  教育  ',
      description: '  基礎解説  ',
      weight: 100,
    });
    expect(pillar).toMatchObject({
      title: '教育',
      description: '基礎解説',
      weight: 100,
      active: true,
    });
    await expect(
      create.execute({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: first.id,
        title: '教育',
        weight: 10,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      create.execute({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: sibling.id,
        title: '教育',
        weight: 10,
      }),
    ).resolves.toMatchObject({ title: '教育' });
    await expect(
      new ListContentPillars(repository).execute({
        workspaceId: owner.workspace.id,
        actorUserId: outsider.user.id,
        bunshinId: first.id,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      new UpdateContentPillar(repository, assignments).execute({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: sibling.id,
        pillarId: pillar.id,
        title: '越境',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await assignments.setStatus({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      bunshinId: first.id,
      capabilityType: 'SOCIAL',
      status: 'SUSPENDED',
    });
    await expect(
      new ListContentPillars(repository).execute({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: first.id,
      }),
    ).resolves.toHaveLength(1);
    await expect(
      new DeactivateContentPillar(repository, assignments).execute({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: first.id,
        pillarId: pillar.id,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await assignments.setStatus({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      bunshinId: first.id,
      capabilityType: 'SOCIAL',
      status: 'ACTIVE',
    });
    const deleted = await new DeleteContentPillar(repository, assignments).execute({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      bunshinId: first.id,
      pillarId: pillar.id,
    });
    expect(deleted).toMatchObject({ active: false, deletedAt: expect.any(Date) });
    await expect(
      new DeleteContentPillar(repository, assignments).execute({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: first.id,
        pillarId: pillar.id,
      }),
    ).resolves.toMatchObject({ id: pillar.id, deletedAt: expect.any(Date) });
    await expect(
      new ListContentPillars(repository).execute({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: first.id,
      }),
    ).resolves.toEqual([]);
    await expect(
      client.contentPillar.create({
        data: {
          workspaceId: owner.workspace.id,
          bunshinId: first.id,
          title: 'bad weight',
          weight: 0,
        },
      }),
    ).rejects.toThrow();
    await expect(
      client.contentPillar.create({
        data: {
          workspaceId: owner.workspace.id,
          bunshinId: outsider.workspace.id,
          title: 'bad scope',
          weight: 1,
        },
      }),
    ).rejects.toThrow();
  });
});
