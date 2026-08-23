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
  CreateSocialAccountStrategy,
  ApproveSocialAccountStrategy,
  ListSocialAccountStrategies,
  CreateContentPillar,
  UpdateContentPillar,
  DeactivateContentPillar,
  DeleteContentPillar,
  ListContentPillars,
  CreateWeeklyPlan,
  CreateGeneratedWeeklyPlan,
  CreateWeeklyPlanItem,
  ConfirmWeeklyPlan,
  ExpireWeeklyPlan,
  CreateDailyMission,
  ListDailyMissions,
  TransitionDailyMission,
  GetMissionDecision,
  DecideMission,
  ListMissionActivities,
  RecordMissionActivity,
  GetPostRecord,
  RecordManualPost,
  GetMissionFeedback,
  RecordMissionFeedback,
  CreateCompletedTrendResearch,
  ListActiveTrendIdeas,
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
  PrismaSocialAccountStrategyRepository,
  PrismaContentPillarRepository,
  PrismaWeeklyPlanRepository,
  PrismaDailyMissionRepository,
  PrismaDailyMissionGenerationRepository,
  PrismaMissionEngagementRepository,
  PrismaMissionOutcomeRepository,
  PrismaLegalConsentRepository,
  PrismaAccountDeletionRequestRepository,
  PrismaAccountDeletionExecutionRepository,
  PrismaAccountDeletionPurgeRepository,
  PrismaAccountDeletionOrchestrationRepository,
  PrismaAccountDeletionAdminOperationsRepository,
  PrismaJobRepository,
  PrismaMissionAutomationScopeRepository,
  PrismaLineConnectionRepository,
  PrismaLineDeliveryRetryRepository,
  PrismaLineAdminFunnelRepository,
  PrismaTrendResearchRepository,
} from '../src';

const testUrl = process.env['DATABASE_URL'] ?? '';
const safe =
  /localhost|127\.0\.0\.1|test/i.test(testUrl) && process.env['APP_ENV'] !== 'production';
const integration = safe ? describe : describe.skip;

integration('database ownership boundaries', () => {
  const client = new PrismaClient();

  beforeAll(async () => {
    await client.trendIdeaCandidateEvidence.deleteMany();
    await client.trendIdeaCandidate.deleteMany();
    await client.trendEvidence.deleteMany();
    await client.trendResearchRun.deleteMany();
    await client.lineWebhookEvent.deleteMany();
    await client.lineConnection.deleteMany();
    await client.lineDeliveryRetryRequest.deleteMany();
    await client.lineMessageDeliveryAttempt.deleteMany();
    await client.lineMessageDelivery.deleteMany();
    await client.missionDeepLinkState.deleteMany();
    await client.lineNotificationPreference.deleteMany();
    await client.job.deleteMany();
    await client.accountDeletionOperationAudit.deleteMany();
    await client.accountDeletionRequest.deleteMany();
    await client.userLegalConsent.deleteMany();
    await client.legalDocument.deleteMany();
    await client.aiUsageEvent.deleteMany();
    await client.dailyMissionGeneration.deleteMany();
    await client.missionFeedback.deleteMany();
    await client.postRecord.deleteMany();
    await client.missionActivity.deleteMany();
    await client.missionDecision.deleteMany();
    await client.socialAccountStrategy.deleteMany();
    await client.missionContent.deleteMany();
    await client.dailyMission.deleteMany();
    await client.weeklyPlanItem.deleteMany();
    await client.weeklyPlan.deleteMany();
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

  it('isolates LINE connections by actor, workspace, environment, friendship and consent', async () => {
    const accounts = new CreateUserWithPersonalWorkspace(new PrismaAccountUnitOfWork(client));
    const owner = await accounts.execute({ displayName: 'LINE Owner' });
    const outsider = await accounts.execute({ displayName: 'LINE Outsider' });
    const providerUserId = `U${randomUUID()}`;
    await client.authIdentity.create({
      data: { userId: owner.user.id, provider: 'LINE', providerUserId },
    });
    const bunshin = await new PrismaBunshinRepository(client).create({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      name: 'LINE Bunshin',
      slug: `line-${randomUUID()}`,
      type: 'COPY',
      objectiveSummary: 'Objective',
      audienceSummary: 'Audience',
      personalitySummary: 'Personality',
    });
    await client.lineNotificationPreference.create({
      data: {
        workspaceId: owner.workspace.id,
        userId: owner.user.id,
        bunshinId: bunshin.id,
        enabled: true,
        notificationConsentAt: new Date('2026-08-22T06:00:00Z'),
      },
    });
    const repository = new PrismaLineConnectionRepository(client);
    await expect(
      repository.connect({
        environment: 'PRODUCTION',
        workspaceId: owner.workspace.id,
        actorUserId: outsider.user.id,
        providerUserId,
        consentGranted: true,
      }),
    ).resolves.toBeNull();
    await expect(
      repository.connect({
        environment: 'PRODUCTION',
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        providerUserId,
        consentGranted: true,
      }),
    ).resolves.toMatchObject({ friendshipStatus: 'UNKNOWN' });
    await expect(
      repository.resolve({
        environment: 'PRODUCTION',
        workspaceId: owner.workspace.id,
        bunshinId: bunshin.id,
        userId: owner.user.id,
      }),
    ).resolves.toBeNull();
    await expect(
      repository.applyWebhook({
        environment: 'PRODUCTION',
        providerEventId: `evt-${randomUUID()}`,
        providerUserId,
        type: 'FOLLOW',
        occurredAt: new Date('2026-08-22T06:01:00Z'),
        processedAt: new Date('2026-08-22T06:01:01Z'),
      }),
    ).resolves.toBe('APPLIED');
    await expect(
      repository.resolve({
        environment: 'PRODUCTION',
        workspaceId: owner.workspace.id,
        bunshinId: bunshin.id,
        userId: owner.user.id,
      }),
    ).resolves.toBe(providerUserId);
    await expect(
      repository.resolve({
        environment: 'STAGING',
        workspaceId: owner.workspace.id,
        bunshinId: bunshin.id,
        userId: owner.user.id,
      }),
    ).resolves.toBeNull();
    await expect(
      repository.resolve({
        environment: 'PRODUCTION',
        workspaceId: outsider.workspace.id,
        bunshinId: bunshin.id,
        userId: outsider.user.id,
      }),
    ).resolves.toBeNull();
  });

  it('enqueues idempotently, isolates environments, and enforces lease ownership', async () => {
    const owner = await new CreateUserWithPersonalWorkspace(
      new PrismaAccountUnitOfWork(client),
    ).execute({ displayName: 'Job Owner' });
    const bunshin = await new PrismaBunshinRepository(client).create({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      name: 'Job Bunshin',
      slug: `job-${randomUUID()}`,
      type: 'COPY',
      objectiveSummary: 'Objective',
      audienceSummary: 'Audience',
      personalitySummary: 'Personality',
    });
    const repository = new PrismaJobRepository(client);
    const base = {
      workspaceId: owner.workspace.id,
      bunshinId: bunshin.id,
      capabilityType: 'SOCIAL' as const,
      correlationId: randomUUID(),
      requestedBy: owner.user.id,
      jobType: 'DAILY_MISSION_GENERATE',
      payloadReference: 'mission:2026-08-22',
      idempotencyKey: `job-${randomUUID()}`,
      scheduledAt: new Date('2026-08-22T00:00:00Z'),
    };
    const production = await repository.enqueue({ ...base, environment: 'PRODUCTION' });
    expect((await repository.enqueue({ ...base, environment: 'PRODUCTION' })).id).toBe(
      production.id,
    );
    const staging = await repository.enqueue({ ...base, environment: 'STAGING' });
    expect(staging.id).not.toBe(production.id);

    const now = new Date('2026-08-22T01:00:00Z');
    const claimed = await repository.claim({
      environment: 'PRODUCTION',
      workerId: 'worker-a',
      now,
      leaseExpiresAt: new Date(now.getTime() + 60_000),
    });
    expect(claimed).toMatchObject({ id: production.id, attemptCount: 1, status: 'LEASED' });
    await expect(
      repository.complete({ jobId: production.id, workerId: 'worker-b', now }),
    ).resolves.toBeNull();
    await expect(
      repository.complete({ jobId: production.id, workerId: 'worker-a', now }),
    ).resolves.toMatchObject({ status: 'SUCCEEDED' });
  });

  it('revalidates SOCIAL strategy and confirmed plan without crossing user scope', async () => {
    const accounts = new CreateUserWithPersonalWorkspace(new PrismaAccountUnitOfWork(client));
    const owner = await accounts.execute({ displayName: 'Automation Owner' });
    const outsider = await accounts.execute({ displayName: 'Automation Outsider' });
    const bunshin = await new PrismaBunshinRepository(client).create({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      name: 'Automation Bunshin',
      slug: `automation-${randomUUID()}`,
      type: 'COPY',
      objectiveSummary: 'Objective',
      audienceSummary: 'Audience',
      personalitySummary: 'Personality',
    });
    await client.bunshinCapabilityAssignment.create({
      data: {
        workspaceId: owner.workspace.id,
        bunshinId: bunshin.id,
        capabilityType: 'SOCIAL',
        assignedByUserId: owner.user.id,
      },
    });
    const profile = await client.socialProfile.create({
      data: {
        workspaceId: owner.workspace.id,
        bunshinId: bunshin.id,
        platform: 'X',
        purpose: '教育',
        postingFrequency: 'DAILY',
        preferredFormats: ['TEXT'],
      },
    });
    await client.socialAccountStrategy.create({
      data: {
        workspaceId: owner.workspace.id,
        bunshinId: bunshin.id,
        socialProfileId: profile.id,
        platform: 'X',
        goal: 'FOLLOWERS',
        availableMinutes: 5,
        destinationType: 'PROFILE',
        concept: 'concept',
        positioning: 'positioning',
        targetSummary: 'target',
        profileDraft: 'profile',
        ctaStrategy: 'cta',
        postingPolicy: 'policy',
        version: 1,
        status: 'APPROVED',
        approvedAt: new Date(),
      },
    });
    const pillar = await client.contentPillar.create({
      data: {
        workspaceId: owner.workspace.id,
        bunshinId: bunshin.id,
        title: '教育',
        weight: 100,
      },
    });
    const plan = await client.weeklyPlan.create({
      data: {
        workspaceId: owner.workspace.id,
        bunshinId: bunshin.id,
        weekStartDate: new Date('2026-08-24T00:00:00Z'),
        timezone: 'Asia/Tokyo',
        status: 'CONFIRMED',
        confirmedAt: new Date(),
      },
    });
    await client.weeklyPlanItem.create({
      data: {
        workspaceId: owner.workspace.id,
        bunshinId: bunshin.id,
        weeklyPlanId: plan.id,
        scheduledDate: new Date('2026-08-25T00:00:00Z'),
        contentPillarId: pillar.id,
        goal: '学び',
        angle: '初心者向け',
        recommendedFormat: 'TEXT',
      },
    });
    const scopes = new PrismaMissionAutomationScopeRepository(client);
    await expect(
      scopes.validateWeekly({
        ...ownerScope(owner, bunshin.id),
        actorUserId: owner.user.id,
        weekStartDate: '2026-08-24',
      }),
    ).resolves.toBe(true);
    await expect(
      scopes.validateDaily({
        ...ownerScope(owner, bunshin.id),
        actorUserId: owner.user.id,
        missionDate: '2026-08-25',
      }),
    ).resolves.toBe(true);
    await expect(
      scopes.validateDaily({
        workspaceId: owner.workspace.id,
        bunshinId: bunshin.id,
        actorUserId: outsider.user.id,
        missionDate: '2026-08-25',
      }),
    ).resolves.toBe(false);
    await client.bunshinCapabilityAssignment.updateMany({
      where: { workspaceId: owner.workspace.id, bunshinId: bunshin.id },
      data: { status: 'SUSPENDED' },
    });
    await expect(
      scopes.validateDaily({
        ...ownerScope(owner, bunshin.id),
        actorUserId: owner.user.id,
        missionDate: '2026-08-25',
      }),
    ).resolves.toBe(false);
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

  it('isolates legal consent by User and requires a new published version', async () => {
    const accounts = new CreateUserWithPersonalWorkspace(new PrismaAccountUnitOfWork(client));
    const a = await accounts.execute({ displayName: 'Consent A' });
    const b = await accounts.execute({ displayName: 'Consent B' });
    const termsV1 = await client.legalDocument.create({
      data: {
        type: 'TERMS',
        version: 1,
        title: 'Terms v1',
        content: 'v1',
        status: 'PUBLISHED',
        effectiveAt: new Date(0),
        publishedAt: new Date(0),
        createdByUserId: a.user.id,
      },
    });
    const repository = new PrismaLegalConsentRepository(client);
    expect(await repository.acceptRequired({ userId: a.user.id, documentIds: [termsV1.id] })).toBe(
      true,
    );
    expect((await repository.findRequiredForUser(a.user.id))[0]?.consentedAt).not.toBeNull();
    expect((await repository.findRequiredForUser(b.user.id))[0]?.consentedAt).toBeNull();
    await client.legalDocument.update({ where: { id: termsV1.id }, data: { status: 'RETIRED' } });
    await client.legalDocument.create({
      data: {
        type: 'TERMS',
        version: 2,
        title: 'Terms v2',
        content: 'v2',
        status: 'PUBLISHED',
        effectiveAt: new Date(0),
        publishedAt: new Date(),
        createdByUserId: a.user.id,
      },
    });
    expect((await repository.findRequiredForUser(a.user.id))[0]?.consentedAt).toBeNull();
  });

  it('isolates account deletion requests by User and preserves cancelled history', async () => {
    const accounts = new CreateUserWithPersonalWorkspace(new PrismaAccountUnitOfWork(client));
    const a = await accounts.execute({ displayName: 'Deletion A' });
    const b = await accounts.execute({ displayName: 'Deletion B' });
    const repository = new PrismaAccountDeletionRequestRepository(client);
    const scheduledFor = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    expect(await repository.request(a.user.id, scheduledFor)).toMatchObject({
      userId: a.user.id,
      status: 'REQUESTED',
    });
    expect(await repository.findCurrent(b.user.id)).toBeNull();
    expect(await repository.cancel(b.user.id)).toBeNull();
    expect(await repository.cancel(a.user.id)).toMatchObject({ status: 'CANCELLED' });
    expect(await client.accountDeletionRequest.count({ where: { userId: a.user.id } })).toBe(1);
  });

  it('atomically suspends a due account and stops pending jobs, LINE delivery and deep links', async () => {
    const accounts = new CreateUserWithPersonalWorkspace(new PrismaAccountUnitOfWork(client));
    const account = await accounts.execute({ displayName: 'Deletion Execution' });
    const bunshin = await new PrismaBunshinRepository(client).create({
      workspaceId: account.workspace.id,
      actorUserId: account.user.id,
      name: 'Deletion Bunshin',
      slug: `deletion-${randomUUID()}`,
      type: 'COPY',
      objectiveSummary: 'Objective',
      audienceSummary: 'Audience',
      personalitySummary: 'Personality',
    });
    const mission = await client.dailyMission.create({
      data: {
        workspaceId: account.workspace.id,
        bunshinId: bunshin.id,
        missionDate: new Date('2026-08-22T00:00:00Z'),
        format: 'TEXT',
        estimatedMinutes: 5,
        topic: 'Deletion test',
        angle: 'Safety',
        reason: 'Verify account suspension',
      },
    });
    await Promise.all([
      client.lineNotificationPreference.create({
        data: {
          workspaceId: account.workspace.id,
          userId: account.user.id,
          bunshinId: bunshin.id,
          enabled: true,
          notificationConsentAt: new Date('2026-08-01T00:00:00Z'),
        },
      }),
      client.lineConnection.create({
        data: {
          environment: 'PRODUCTION',
          workspaceId: account.workspace.id,
          userId: account.user.id,
          providerUserId: `U${randomUUID()}`,
          notificationConsentAt: new Date('2026-08-01T00:00:00Z'),
        },
      }),
      client.job.create({
        data: {
          environment: 'PRODUCTION',
          workspaceId: account.workspace.id,
          bunshinId: bunshin.id,
          jobType: 'DAILY_MISSION_GENERATE',
          payloadReference: 'opaque',
          idempotencyKey: `deletion-job-${randomUUID()}`,
          correlationId: `deletion-${randomUUID()}`,
          requestedBy: account.user.id,
        },
      }),
      client.lineMessageDelivery.create({
        data: {
          environment: 'PRODUCTION',
          workspaceId: account.workspace.id,
          bunshinId: bunshin.id,
          userId: account.user.id,
          dailyMissionId: mission.id,
          idempotencyKey: `deletion-delivery-${randomUUID()}`,
        },
      }),
      client.missionDeepLinkState.create({
        data: {
          id: randomUUID(),
          environment: 'PRODUCTION',
          workspaceId: account.workspace.id,
          bunshinId: bunshin.id,
          userId: account.user.id,
          dailyMissionId: mission.id,
          keyVersion: 1,
          expiresAt: new Date('2026-08-23T00:00:00Z'),
        },
      }),
    ]);
    await new PrismaAccountDeletionRequestRepository(client).request(
      account.user.id,
      new Date('2026-08-21T00:00:00Z'),
    );
    const result = await new PrismaAccountDeletionExecutionRepository(client).claimAndSuspendNext({
      workerId: 'integration-worker',
      now: new Date('2026-08-22T09:00:00Z'),
      leaseExpiresAt: new Date('2026-08-22T09:05:00Z'),
      executionVersion: 1,
    });

    expect(result).toMatchObject({ userId: account.user.id, status: 'PROCESSING' });
    await expect(
      client.user.findUniqueOrThrow({ where: { id: account.user.id } }),
    ).resolves.toMatchObject({
      status: 'SUSPENDED',
    });
    expect(
      await client.workspaceMembership.count({
        where: { userId: account.user.id, status: 'ACTIVE' },
      }),
    ).toBe(0);
    await expect(
      client.lineNotificationPreference.findFirstOrThrow({ where: { userId: account.user.id } }),
    ).resolves.toMatchObject({ enabled: false, notificationConsentAt: null });
    await expect(
      client.lineConnection.findFirstOrThrow({ where: { userId: account.user.id } }),
    ).resolves.toMatchObject({ status: 'DISCONNECTED', notificationConsentAt: null });
    await expect(
      client.job.findFirstOrThrow({ where: { requestedBy: account.user.id } }),
    ).resolves.toMatchObject({
      status: 'CANCELLED',
      lastErrorCategory: 'ACCOUNT_DELETION_REQUESTED',
    });
    await expect(
      client.lineMessageDelivery.findFirstOrThrow({ where: { userId: account.user.id } }),
    ).resolves.toMatchObject({
      status: 'CANCELLED',
      lastErrorCategory: 'ACCOUNT_DELETION_REQUESTED',
    });
    expect(
      await client.missionDeepLinkState.count({
        where: { userId: account.user.id, consumedAt: null },
      }),
    ).toBe(0);
  });

  it('blocks the sole active owner of an organization without suspending the user', async () => {
    const account = await new CreateUserWithPersonalWorkspace(
      new PrismaAccountUnitOfWork(client),
    ).execute({ displayName: 'Organization Owner' });
    const organization = await client.workspace.create({
      data: { type: 'ORGANIZATION', name: 'Deletion Organization' },
    });
    await client.workspaceMembership.create({
      data: { workspaceId: organization.id, userId: account.user.id, role: 'OWNER' },
    });
    await new PrismaAccountDeletionRequestRepository(client).request(
      account.user.id,
      new Date('2026-08-21T00:00:00Z'),
    );

    await expect(
      new PrismaAccountDeletionExecutionRepository(client).claimAndSuspendNext({
        workerId: 'integration-worker',
        now: new Date('2026-08-22T09:00:00Z'),
        leaseExpiresAt: new Date('2026-08-22T09:05:00Z'),
        executionVersion: 1,
      }),
    ).resolves.toMatchObject({
      userId: account.user.id,
      status: 'BLOCKED',
      blockedReason: 'SOLE_ORGANIZATION_OWNER',
    });
    await expect(
      client.user.findUniqueOrThrow({ where: { id: account.user.id } }),
    ).resolves.toMatchObject({
      status: 'ACTIVE',
    });
  });

  it('does not claim requests in the grace period and allows only one concurrent claim', async () => {
    const accounts = new CreateUserWithPersonalWorkspace(new PrismaAccountUnitOfWork(client));
    const future = await accounts.execute({ displayName: 'Future Deletion' });
    const due = await accounts.execute({ displayName: 'Concurrent Deletion' });
    const requests = new PrismaAccountDeletionRequestRepository(client);
    await requests.request(future.user.id, new Date('2026-08-23T00:00:00Z'));
    const executor = new PrismaAccountDeletionExecutionRepository(client);
    await expect(
      executor.claimAndSuspendNext({
        workerId: 'before-grace-worker',
        now: new Date('2026-08-22T09:00:00Z'),
        leaseExpiresAt: new Date('2026-08-22T09:05:00Z'),
        executionVersion: 1,
      }),
    ).resolves.toBeNull();
    await requests.request(due.user.id, new Date('2026-08-21T00:00:00Z'));

    const results = await Promise.all([
      executor.claimAndSuspendNext({
        workerId: 'concurrent-worker-a',
        now: new Date('2026-08-22T09:00:00Z'),
        leaseExpiresAt: new Date('2026-08-22T09:05:00Z'),
        executionVersion: 1,
      }),
      executor.claimAndSuspendNext({
        workerId: 'concurrent-worker-b',
        now: new Date('2026-08-22T09:00:00Z'),
        leaseExpiresAt: new Date('2026-08-22T09:05:00Z'),
        executionVersion: 1,
      }),
    ]);
    expect(results.filter((value) => value?.userId === due.user.id)).toHaveLength(1);
    await expect(
      client.user.findUniqueOrThrow({ where: { id: future.user.id } }),
    ).resolves.toMatchObject({
      status: 'ACTIVE',
    });
  });

  it('blocks an active Platform Admin without suspending the account', async () => {
    const account = await new CreateUserWithPersonalWorkspace(
      new PrismaAccountUnitOfWork(client),
    ).execute({ displayName: 'Deletion Admin' });
    await client.platformAdmin.create({
      data: { userId: account.user.id, role: 'OPERATOR' },
    });
    await new PrismaAccountDeletionRequestRepository(client).request(
      account.user.id,
      new Date('2026-08-21T00:00:00Z'),
    );

    await expect(
      new PrismaAccountDeletionExecutionRepository(client).claimAndSuspendNext({
        workerId: 'admin-gate-worker',
        now: new Date('2026-08-22T09:00:00Z'),
        leaseExpiresAt: new Date('2026-08-22T09:05:00Z'),
        executionVersion: 1,
      }),
    ).resolves.toMatchObject({
      userId: account.user.id,
      status: 'BLOCKED',
      blockedReason: 'ACTIVE_PLATFORM_ADMIN',
    });
    await expect(
      client.user.findUniqueOrThrow({ where: { id: account.user.id } }),
    ).resolves.toMatchObject({
      status: 'ACTIVE',
    });
  });

  it('purges personal data and completes a suspended account without changing organization assets', async () => {
    const accounts = new CreateUserWithPersonalWorkspace(new PrismaAccountUnitOfWork(client));
    const account = await accounts.execute({
      displayName: 'Purge User',
      email: 'purge@example.com',
    });
    const other = await accounts.execute({ displayName: 'Organization Owner' });
    const personalBunshin = await new PrismaBunshinRepository(client).create({
      workspaceId: account.workspace.id,
      actorUserId: account.user.id,
      name: 'Private Bunshin',
      slug: `private-${randomUUID()}`,
      type: 'COPY',
      objectiveSummary: 'Private objective',
      audienceSummary: 'Private audience',
      personalitySummary: 'Private personality',
    });
    const organization = await client.workspace.create({
      data: { type: 'ORGANIZATION', name: 'Preserved Organization' },
    });
    await Promise.all([
      client.workspaceMembership.create({
        data: { workspaceId: organization.id, userId: other.user.id, role: 'OWNER' },
      }),
      client.workspaceMembership.create({
        data: { workspaceId: organization.id, userId: account.user.id, role: 'MEMBER' },
      }),
      client.authIdentity.create({
        data: { userId: account.user.id, provider: 'EMAIL', providerUserId: randomUUID() },
      }),
      client.ownerKnowledge.create({
        data: {
          workspaceId: account.workspace.id,
          ownerUserId: account.user.id,
          type: 'PROFILE',
          title: 'Private title',
          content: 'Private knowledge',
        },
      }),
      client.bunshinMemory.create({
        data: {
          workspaceId: account.workspace.id,
          bunshinId: personalBunshin.id,
          type: 'PREFERENCE',
          content: 'Private memory',
          summary: 'Private summary',
          sourceId: 'private-source',
          confidence: 0.9,
          importance: 5,
        },
      }),
    ]);
    const mission = await client.dailyMission.create({
      data: {
        workspaceId: account.workspace.id,
        bunshinId: personalBunshin.id,
        missionDate: new Date('2026-08-22T00:00:00Z'),
        format: 'TEXT',
        estimatedMinutes: 5,
        topic: 'Private topic',
        angle: 'Private angle',
        reason: 'Private reason',
      },
    });
    await Promise.all([
      client.bunshinObjective.create({
        data: {
          bunshinId: personalBunshin.id,
          objectiveType: 'PRIVATE',
          primaryGoal: 'Private goal',
          kpiName: 'Private KPI',
          priority: 1,
        },
      }),
      client.bunshinAudience.create({
        data: {
          bunshinId: personalBunshin.id,
          label: 'Private audience',
          painPoints: ['Private pain'],
          desires: ['Private desire'],
          excludedAudience: [],
        },
      }),
      client.missionContent.create({
        data: {
          workspaceId: account.workspace.id,
          bunshinId: personalBunshin.id,
          dailyMissionId: mission.id,
          format: 'TEXT',
          contentJson: { text: 'Private mission content' },
        },
      }),
      client.missionActivity.create({
        data: {
          workspaceId: account.workspace.id,
          bunshinId: personalBunshin.id,
          dailyMissionId: mission.id,
          actorUserId: account.user.id,
          type: 'VIEWED',
          idempotencyKey: `purge-activity-${randomUUID()}`,
          metadata: { private: 'value' },
        },
      }),
      client.postRecord.create({
        data: {
          workspaceId: account.workspace.id,
          bunshinId: personalBunshin.id,
          dailyMissionId: mission.id,
          actorUserId: account.user.id,
          platform: 'X',
          postedAt: new Date(),
          postUrl: 'https://example.com/private',
          externalPostId: 'private-id',
          manualMetrics: { views: 10 },
          idempotencyKey: `purge-post-${randomUUID()}`,
        },
      }),
    ]);
    const deletionRequest = await new PrismaAccountDeletionRequestRepository(client).request(
      account.user.id,
      new Date('2026-08-21T00:00:00Z'),
    );
    const preparation = await new PrismaAccountDeletionExecutionRepository(
      client,
    ).claimAndSuspendNext({
      workerId: 'purge-worker',
      now: new Date('2026-08-22T09:00:00Z'),
      leaseExpiresAt: new Date('2026-08-22T09:05:00Z'),
      executionVersion: 1,
    });
    expect(preparation).toMatchObject({ status: 'PROCESSING' });

    await expect(
      new PrismaAccountDeletionPurgeRepository(client).completeAfterAuthDeletion({
        requestId: deletionRequest!.id,
        userId: account.user.id,
        workerId: 'purge-worker',
        now: new Date('2026-08-22T09:01:00Z'),
      }),
    ).resolves.toMatchObject({ status: 'COMPLETED', userId: account.user.id });

    await expect(
      client.user.findUniqueOrThrow({ where: { id: account.user.id } }),
    ).resolves.toMatchObject({
      status: 'DELETED',
      email: null,
      displayName: '退会済みユーザー',
    });
    expect(await client.authIdentity.count({ where: { userId: account.user.id } })).toBe(0);
    await expect(
      client.workspace.findUniqueOrThrow({ where: { id: account.workspace.id } }),
    ).resolves.toMatchObject({
      status: 'ARCHIVED',
      name: '退会済みワークスペース',
    });
    await expect(
      client.bunshin.findUniqueOrThrow({ where: { id: personalBunshin.id } }),
    ).resolves.toMatchObject({
      status: 'ARCHIVED',
      slug: `deleted-${personalBunshin.id}`,
      objectiveSummary: '',
      avatarUrl: null,
    });
    await expect(
      client.bunshinObjective.findFirstOrThrow({ where: { bunshinId: personalBunshin.id } }),
    ).resolves.toMatchObject({ primaryGoal: '', kpiName: null, status: 'INACTIVE' });
    await expect(
      client.bunshinAudience.findFirstOrThrow({ where: { bunshinId: personalBunshin.id } }),
    ).resolves.toMatchObject({ label: '', painPoints: [], desires: [] });
    await expect(
      client.ownerKnowledge.findFirstOrThrow({ where: { workspaceId: account.workspace.id } }),
    ).resolves.toMatchObject({
      content: '',
      status: 'ARCHIVED',
    });
    await expect(
      client.bunshinMemory.findFirstOrThrow({ where: { workspaceId: account.workspace.id } }),
    ).resolves.toMatchObject({
      content: '',
      summary: null,
      sourceId: null,
      active: false,
    });
    await expect(
      client.missionContent.findUniqueOrThrow({ where: { dailyMissionId: mission.id } }),
    ).resolves.toMatchObject({
      contentJson: {},
    });
    await expect(
      client.postRecord.findUniqueOrThrow({ where: { dailyMissionId: mission.id } }),
    ).resolves.toMatchObject({
      postUrl: null,
      externalPostId: null,
      manualMetrics: null,
    });
    await expect(
      client.workspace.findUniqueOrThrow({ where: { id: organization.id } }),
    ).resolves.toMatchObject({
      status: 'ACTIVE',
      name: 'Preserved Organization',
    });
    expect(
      await client.workspaceMembership.count({
        where: { workspaceId: organization.id, userId: other.user.id, status: 'ACTIVE' },
      }),
    ).toBe(1);
  });

  it('requires the matching active lease before purge and preserves all data otherwise', async () => {
    const account = await new CreateUserWithPersonalWorkspace(
      new PrismaAccountUnitOfWork(client),
    ).execute({ displayName: 'Lease Protected', email: 'lease@example.com' });
    const request = await client.accountDeletionRequest.create({
      data: {
        userId: account.user.id,
        status: 'PROCESSING',
        scheduledFor: new Date('2026-08-21T00:00:00Z'),
        leaseOwner: 'correct-worker',
        leaseExpiresAt: new Date('2026-08-22T09:05:00Z'),
      },
    });
    await client.user.update({ where: { id: account.user.id }, data: { status: 'SUSPENDED' } });

    await expect(
      new PrismaAccountDeletionPurgeRepository(client).completeAfterAuthDeletion({
        requestId: request.id,
        userId: account.user.id,
        workerId: 'wrong-worker',
        now: new Date('2026-08-22T09:01:00Z'),
      }),
    ).resolves.toBeNull();
    await expect(
      client.user.findUniqueOrThrow({ where: { id: account.user.id } }),
    ).resolves.toMatchObject({
      email: 'lease@example.com',
      status: 'SUSPENDED',
    });
  });

  it('resolves Auth identity only inside the active deletion lease and records retryable failures', async () => {
    const account = await new CreateUserWithPersonalWorkspace(
      new PrismaAccountUnitOfWork(client),
    ).execute({ displayName: 'Auth Orchestration' });
    const identity = await client.authIdentity.create({
      data: { userId: account.user.id, provider: 'EMAIL', providerUserId: randomUUID() },
    });
    const request = await client.accountDeletionRequest.create({
      data: {
        userId: account.user.id,
        status: 'PROCESSING',
        scheduledFor: new Date('2026-08-21T00:00:00Z'),
        leaseOwner: 'auth-worker',
        leaseExpiresAt: new Date('2026-08-22T09:05:00Z'),
      },
    });
    await client.user.update({ where: { id: account.user.id }, data: { status: 'SUSPENDED' } });
    const repository = new PrismaAccountDeletionOrchestrationRepository(client);
    await expect(
      repository.findEmailIdentity({
        requestId: request.id,
        userId: account.user.id,
        workerId: 'auth-worker',
        now: new Date('2026-08-22T09:01:00Z'),
      }),
    ).resolves.toEqual({ providerUserId: identity.providerUserId });
    await expect(
      repository.findEmailIdentity({
        requestId: request.id,
        userId: account.user.id,
        workerId: 'wrong-worker',
        now: new Date('2026-08-22T09:01:00Z'),
      }),
    ).resolves.toBeNull();
    await expect(
      repository.recordAuthFailure({
        requestId: request.id,
        userId: account.user.id,
        workerId: 'auth-worker',
        now: new Date('2026-08-22T09:01:00Z'),
        category: 'AUTH_RATE_LIMITED',
        retryable: true,
      }),
    ).resolves.toBe(true);
    await expect(
      client.accountDeletionRequest.findUniqueOrThrow({ where: { id: request.id } }),
    ).resolves.toMatchObject({
      status: 'PROCESSING',
      lastErrorCategory: 'AUTH_RATE_LIMITED',
      leaseOwner: 'auth-worker',
      leaseExpiresAt: new Date('2026-08-22T09:06:00Z'),
    });
    await expect(
      repository.recordAuthFailure({
        requestId: request.id,
        userId: account.user.id,
        workerId: 'auth-worker',
        now: new Date('2026-08-22T09:02:00Z'),
        category: 'AUTH_CREDENTIAL_INVALID',
        retryable: false,
      }),
    ).resolves.toBe(true);
    await expect(
      client.accountDeletionRequest.findUniqueOrThrow({ where: { id: request.id } }),
    ).resolves.toMatchObject({
      status: 'BLOCKED',
      blockedReason: 'AUTH_CONFIGURATION_UNAVAILABLE',
      lastErrorCategory: 'AUTH_CREDENTIAL_INVALID',
      leaseOwner: null,
      leaseExpiresAt: null,
    });
  });

  it('allows only SUPER_ADMIN to retry BLOCKED deletion and records the reason in Audit', async () => {
    const account = await new CreateUserWithPersonalWorkspace(
      new PrismaAccountUnitOfWork(client),
    ).execute({ displayName: 'Blocked Deletion' });
    const superAdmin = await new CreateUserWithPersonalWorkspace(
      new PrismaAccountUnitOfWork(client),
    ).execute({ displayName: 'Deletion Super Admin' });
    const operator = await new CreateUserWithPersonalWorkspace(
      new PrismaAccountUnitOfWork(client),
    ).execute({ displayName: 'Deletion Operator' });
    await Promise.all([
      client.platformAdmin.create({ data: { userId: superAdmin.user.id, role: 'SUPER_ADMIN' } }),
      client.platformAdmin.create({ data: { userId: operator.user.id, role: 'OPERATOR' } }),
    ]);
    const request = await client.accountDeletionRequest.create({
      data: {
        userId: account.user.id,
        status: 'BLOCKED',
        scheduledFor: new Date('2026-08-21T00:00:00Z'),
        blockedReason: 'MANUAL_REVIEW_REQUIRED',
      },
    });
    const repository = new PrismaAccountDeletionAdminOperationsRepository(client);
    await expect(
      repository.retryBlocked({
        requestId: request.id,
        actorUserId: operator.user.id,
        reason: 'Operator must not retry this request',
        now: new Date('2026-08-22T10:00:00Z'),
      }),
    ).resolves.toBeNull();
    await expect(
      repository.retryBlocked({
        requestId: request.id,
        actorUserId: superAdmin.user.id,
        reason: 'Organization ownership has been safely transferred',
        now: new Date('2026-08-22T10:00:00Z'),
      }),
    ).resolves.toBe(true);
    await expect(
      client.accountDeletionRequest.findUniqueOrThrow({ where: { id: request.id } }),
    ).resolves.toMatchObject({
      status: 'REQUESTED',
      blockedReason: null,
      scheduledFor: new Date('2026-08-22T10:00:00Z'),
    });
    await expect(
      client.accountDeletionOperationAudit.findFirstOrThrow({ where: { requestId: request.id } }),
    ).resolves.toMatchObject({
      actorUserId: superAdmin.user.id,
      action: 'RETRY_BLOCKED',
      previousStatus: 'BLOCKED',
      nextStatus: 'REQUESTED',
      reason: 'Organization ownership has been safely transferred',
    });
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

  it('creates one audited retry Job per failed delivery attempt in the exact environment', async () => {
    const accounts = new CreateUserWithPersonalWorkspace(new PrismaAccountUnitOfWork(client));
    const owner = await accounts.execute({ displayName: 'Retry Recipient' });
    const admin = await client.user.create({ data: { displayName: 'Retry Operator' } });
    await client.platformAdmin.create({ data: { userId: admin.id, role: 'OPERATOR' } });
    const bunshin = await new PrismaBunshinRepository(client).create({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      name: 'Retry Bunshin',
      slug: `retry-${randomUUID()}`,
      type: 'COPY',
      objectiveSummary: 'Objective',
      audienceSummary: 'Audience',
      personalitySummary: 'Personality',
    });
    const mission = await client.dailyMission.create({
      data: {
        workspaceId: owner.workspace.id,
        bunshinId: bunshin.id,
        missionDate: new Date('2026-08-22T00:00:00Z'),
        format: 'TEXT',
        estimatedMinutes: 5,
        topic: 'Retry test',
        angle: 'Isolation',
        reason: 'Integration test',
      },
    });
    const delivery = await client.lineMessageDelivery.create({
      data: {
        environment: 'PRODUCTION',
        workspaceId: owner.workspace.id,
        bunshinId: bunshin.id,
        userId: owner.user.id,
        dailyMissionId: mission.id,
        status: 'FAILED',
        idempotencyKey: `retry-test:${randomUUID()}`,
        attemptCount: 1,
        lastErrorCategory: 'RATE_LIMITED',
      },
    });
    const repository = new PrismaLineDeliveryRetryRepository(client);
    const base = {
      actorUserId: admin.id,
      deliveryId: delivery.id,
      reason: 'rate limit復旧後の再送',
    };
    await expect(
      repository.request({ ...base, requestId: randomUUID(), environment: 'STAGING' }),
    ).resolves.toBeNull();
    const retry = await repository.request({
      ...base,
      requestId: randomUUID(),
      environment: 'PRODUCTION',
    });
    expect(retry).toMatchObject({
      environment: 'PRODUCTION',
      deliveryId: delivery.id,
      deliveryAttemptCount: 1,
      actorUserId: admin.id,
    });
    expect(await client.job.findUnique({ where: { id: retry!.jobId } })).toMatchObject({
      environment: 'PRODUCTION',
      requestedBy: owner.user.id,
      payloadReference: `line-delivery:${delivery.id}`,
      status: 'PENDING',
    });
    await expect(
      repository.request({ ...base, requestId: randomUUID(), environment: 'PRODUCTION' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('aggregates a sequential LINE funnel only through a consumed state in the exact environment', async () => {
    const accounts = new CreateUserWithPersonalWorkspace(new PrismaAccountUnitOfWork(client));
    const owner = await accounts.execute({ displayName: 'Funnel Recipient' });
    const admin = await client.user.create({ data: { displayName: 'Funnel Admin' } });
    await client.platformAdmin.create({ data: { userId: admin.id, role: 'READ_ONLY' } });
    const bunshin = await new PrismaBunshinRepository(client).create({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      name: 'Funnel Bunshin',
      slug: `funnel-${randomUUID()}`,
      type: 'COPY',
      objectiveSummary: 'Objective',
      audienceSummary: 'Audience',
      personalitySummary: 'Personality',
    });
    const sentAt = new Date('2026-08-10T01:00:00Z');
    const mission = await client.dailyMission.create({
      data: {
        workspaceId: owner.workspace.id,
        bunshinId: bunshin.id,
        missionDate: new Date('2026-08-10T00:00:00Z'),
        format: 'TEXT',
        estimatedMinutes: 5,
        topic: 'Funnel test',
        angle: 'Environment isolation',
        reason: 'Integration test',
      },
    });
    await client.lineConnection.create({
      data: {
        environment: 'PRODUCTION',
        workspaceId: owner.workspace.id,
        userId: owner.user.id,
        providerUserId: `U${randomUUID()}`,
        friendshipStatus: 'FOLLOWING',
        followedAt: new Date('2026-08-09T01:00:00Z'),
      },
    });
    await client.lineMessageDelivery.createMany({
      data: [
        {
          environment: 'PRODUCTION',
          workspaceId: owner.workspace.id,
          bunshinId: bunshin.id,
          userId: owner.user.id,
          dailyMissionId: mission.id,
          status: 'SENT',
          sentAt,
          idempotencyKey: `funnel-production:${randomUUID()}`,
          attemptCount: 1,
        },
        {
          environment: 'STAGING',
          workspaceId: owner.workspace.id,
          bunshinId: bunshin.id,
          userId: owner.user.id,
          dailyMissionId: mission.id,
          status: 'SENT',
          sentAt,
          idempotencyKey: `funnel-staging:${randomUUID()}`,
          attemptCount: 1,
        },
      ],
    });
    await client.missionDeepLinkState.create({
      data: {
        id: randomUUID(),
        environment: 'PRODUCTION',
        workspaceId: owner.workspace.id,
        bunshinId: bunshin.id,
        userId: owner.user.id,
        dailyMissionId: mission.id,
        keyVersion: 1,
        expiresAt: new Date('2026-08-10T01:10:00Z'),
        consumedAt: new Date('2026-08-10T01:02:00Z'),
      },
    });
    await client.missionDecision.create({
      data: {
        workspaceId: owner.workspace.id,
        bunshinId: bunshin.id,
        dailyMissionId: mission.id,
        decision: 'ACCEPTED',
        decidedAt: new Date('2026-08-10T01:03:00Z'),
      },
    });
    await client.missionActivity.create({
      data: {
        workspaceId: owner.workspace.id,
        bunshinId: bunshin.id,
        dailyMissionId: mission.id,
        actorUserId: owner.user.id,
        type: 'COPIED_TEXT',
        occurredAt: new Date('2026-08-10T01:04:00Z'),
        idempotencyKey: `funnel-copy:${randomUUID()}`,
      },
    });
    await client.postRecord.create({
      data: {
        workspaceId: owner.workspace.id,
        bunshinId: bunshin.id,
        dailyMissionId: mission.id,
        actorUserId: owner.user.id,
        platform: 'X',
        postedAt: new Date('2026-08-10T01:05:00Z'),
        idempotencyKey: `funnel-post:${randomUUID()}`,
      },
    });
    const repository = new PrismaLineAdminFunnelRepository(client);
    const period = {
      actorUserId: admin.id,
      from: new Date('2026-08-01T00:00:00Z'),
      to: new Date('2026-09-01T00:00:00Z'),
      cohortLimit: 100,
    };
    await expect(
      repository.summarize({ ...period, environment: 'PRODUCTION' }),
    ).resolves.toMatchObject({
      cohort: { sentMessages: 1, sentUsers: 1, truncated: false },
      stages: { openedUsers: 1, acceptedUsers: 1, copiedUsers: 1, postedUsers: 1 },
      messages: { opened: 1, posted: 1 },
      rates: { openRate: 1, notificationToPostRate: 1 },
    });
    await expect(
      repository.summarize({ ...period, environment: 'STAGING' }),
    ).resolves.toMatchObject({
      cohort: { sentMessages: 1, sentUsers: 1 },
      stages: { openedUsers: 0, acceptedUsers: 0, copiedUsers: 0, postedUsers: 0 },
    });
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
      defaultAssistanceLevel: 'IDEA_ONLY',
    });
    expect(profile).toMatchObject({
      handle: 'bunshin',
      purpose: 'manual publishing',
      status: 'ACTIVE',
      preferredFormats: ['SLIDE', 'IMAGE'],
      defaultAssistanceLevel: 'IDEA_ONLY',
    });
    const strategies = new PrismaSocialAccountStrategyRepository(client);
    const createStrategy = new CreateSocialAccountStrategy(strategies, assignments);
    const strategyInput = {
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      bunshinId: owned.id,
      socialProfileId: profile.id,
      platform: 'INSTAGRAM' as const,
      goal: 'FOLLOWERS' as const,
      availableMinutes: 5 as const,
      destinationType: 'PROFILE' as const,
      concept: 'expert',
      positioning: 'guide',
      targetSummary: 'beginners',
      profileDraft: 'profile',
      ctaStrategy: 'follow',
      postingPolicy: 'daily',
    };
    const strategy1 = await createStrategy.execute(strategyInput);
    const strategy2 = await createStrategy.execute({ ...strategyInput, concept: 'expert v2' });
    expect([strategy1.version, strategy2.version]).toEqual([1, 2]);
    const approveStrategy = new ApproveSocialAccountStrategy(strategies, assignments);
    await approveStrategy.execute({ ...ownerScope(owner, owned.id), strategyId: strategy1.id });
    await approveStrategy.execute({ ...ownerScope(owner, owned.id), strategyId: strategy2.id });
    await expect(
      new ListSocialAccountStrategies(strategies).execute({
        ...ownerScope(owner, owned.id),
        socialProfileId: profile.id,
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: strategy1.id, status: 'SUPERSEDED' }),
        expect.objectContaining({ id: strategy2.id, status: 'APPROVED' }),
      ]),
    );
    await expect(
      new ListSocialAccountStrategies(strategies).execute({
        workspaceId: outsider.workspace.id,
        actorUserId: outsider.user.id,
        bunshinId: owned.id,
        socialProfileId: profile.id,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      create.execute({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: owned.id,
        platform: 'THREADS',
        purpose: 'text publishing',
        postingFrequency: 'DAILY',
        preferredFormats: ['TEXT'],
      }),
    ).resolves.toMatchObject({ platform: 'THREADS', preferredFormats: ['TEXT'] });
    await expect(
      create.execute({
        workspaceId: owner.workspace.id,
        actorUserId: owner.user.id,
        bunshinId: owned.id,
        platform: 'YOUTUBE_SHORTS',
        purpose: 'short video publishing',
        postingFrequency: 'WEEKLY',
        preferredFormats: ['AI_VIDEO_PROMPT'],
      }),
    ).resolves.toMatchObject({ platform: 'YOUTUBE_SHORTS' });
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
        defaultAssistanceLevel: 'GUIDED',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      new UpdateSocialProfile(profiles, assignments).execute({
        workspaceId: owner.workspace.id,
        actorUserId: admin.user.id,
        bunshinId: owned.id,
        platform: 'INSTAGRAM',
        purpose: 'admin managed',
        defaultAssistanceLevel: 'GUIDED',
      }),
    ).resolves.toMatchObject({
      purpose: 'admin managed',
      defaultAssistanceLevel: 'GUIDED',
    });
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
    ).resolves.toHaveLength(3);
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

  it('persists scoped Weekly Plans with local dates, pillars, and immutable transitions', async () => {
    const accounts = new CreateUserWithPersonalWorkspace(new PrismaAccountUnitOfWork(client));
    const owner = await accounts.execute({ displayName: 'Plan Owner' });
    const bunshin = await new PrismaBunshinRepository(client).create({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      name: 'Planner',
      slug: `planner-${randomUUID()}`,
      type: 'COPY',
      objectiveSummary: 'Objective',
      audienceSummary: 'Audience',
      personalitySummary: 'Personality',
    });
    const assignments = new PrismaBunshinCapabilityAssignmentRepository(client);
    await assignments.assign({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      bunshinId: bunshin.id,
      capabilityType: 'SOCIAL',
    });
    const pillar = await new CreateContentPillar(
      new PrismaContentPillarRepository(client),
      assignments,
    ).execute({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      bunshinId: bunshin.id,
      title: '教育',
      weight: 50,
    });
    const repository = new PrismaWeeklyPlanRepository(client);
    const generated = await new CreateGeneratedWeeklyPlan(repository, assignments).execute({
      ...ownerScope(owner, bunshin.id),
      weekStartDate: '2026-08-10',
      timezone: 'Asia/Tokyo',
      strategySummary: 'AI生成戦略',
      items: [
        {
          scheduledDate: '2026-08-11',
          contentPillarId: pillar.id,
          goal: '学び',
          angle: '失敗から学ぶ',
          recommendedFormat: 'TEXT',
          notes: null,
        },
      ],
    });
    expect(generated).toMatchObject({
      status: 'DRAFT',
      strategySummary: 'AI生成戦略',
      items: [{ scheduledDate: '2026-08-11', contentPillarId: pillar.id }],
    });
    const outsider = await accounts.execute({ displayName: 'Plan Outsider' });
    await expect(
      repository.createGeneratedPlan({
        workspaceId: owner.workspace.id,
        actorUserId: outsider.user.id,
        bunshinId: bunshin.id,
        weekStartDate: '2026-08-03',
        timezone: 'Asia/Tokyo',
        strategySummary: 'scope外',
        items: [
          {
            scheduledDate: '2026-08-04',
            contentPillarId: pillar.id,
            goal: 'scope外',
            angle: 'scope外',
            recommendedFormat: 'TEXT',
            notes: null,
          },
        ],
      }),
    ).resolves.toBeNull();
    expect(
      await client.weeklyPlan.count({
        where: { bunshinId: bunshin.id, weekStartDate: new Date('2026-08-03T00:00:00.000Z') },
      }),
    ).toBe(0);
    const plan = await new CreateWeeklyPlan(repository, assignments).execute({
      ...ownerScope(owner, bunshin.id),
      weekStartDate: '2026-08-17',
      timezone: 'Asia/Tokyo',
    });
    await expect(
      new CreateWeeklyPlan(repository, assignments).execute({
        ...ownerScope(owner, bunshin.id),
        weekStartDate: '2026-08-17',
        timezone: 'Asia/Tokyo',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      new CreateWeeklyPlanItem(repository, assignments).execute({
        ...ownerScope(owner, bunshin.id),
        weeklyPlanId: plan.id,
        scheduledDate: '2026-08-24',
        contentPillarId: pillar.id,
        goal: '範囲外',
        angle: '範囲外',
        recommendedFormat: 'SLIDE',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const withItem = await new CreateWeeklyPlanItem(repository, assignments).execute({
      ...ownerScope(owner, bunshin.id),
      weeklyPlanId: plan.id,
      scheduledDate: '2026-08-18',
      contentPillarId: pillar.id,
      goal: '教育',
      angle: '初心者',
      recommendedFormat: 'TEXT',
    });
    expect(withItem.items[0]).toMatchObject({
      scheduledDate: '2026-08-18',
      contentPillarId: pillar.id,
      recommendedFormat: 'TEXT',
    });
    const confirmed = await new ConfirmWeeklyPlan(repository, assignments).execute({
      ...ownerScope(owner, bunshin.id),
      weeklyPlanId: plan.id,
    });
    expect(confirmed.status).toBe('CONFIRMED');
    await expect(
      new ConfirmWeeklyPlan(repository, assignments).execute({
        ...ownerScope(owner, bunshin.id),
        weeklyPlanId: plan.id,
      }),
    ).resolves.toMatchObject({ status: 'CONFIRMED' });
    await expect(
      repository.updatePlan({
        ...ownerScope(owner, bunshin.id),
        weeklyPlanId: plan.id,
        strategySummary: '変更',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      new ExpireWeeklyPlan(repository, assignments).execute({
        ...ownerScope(owner, bunshin.id),
        weeklyPlanId: plan.id,
      }),
    ).resolves.toMatchObject({ status: 'EXPIRED' });
  });

  it('persists Daily Mission and content atomically with date uniqueness and transitions', async () => {
    const accounts = new CreateUserWithPersonalWorkspace(new PrismaAccountUnitOfWork(client));
    const owner = await accounts.execute({ displayName: 'Mission Owner' });
    const bunshin = await new PrismaBunshinRepository(client).create({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      name: 'Mission Bunshin',
      slug: `mission-${randomUUID()}`,
      type: 'COPY',
      objectiveSummary: 'Objective',
      audienceSummary: 'Audience',
      personalitySummary: 'Personality',
    });
    const assignments = new PrismaBunshinCapabilityAssignmentRepository(client);
    await assignments.assign({
      ...ownerScope(owner, bunshin.id),
      capabilityType: 'SOCIAL',
    });
    const generations = new PrismaDailyMissionGenerationRepository(client);
    const generationInput = {
      ...ownerScope(owner, bunshin.id),
      missionDate: '2026-08-18',
      idempotencyKey: randomUUID(),
    };
    const claimed = await generations.claim(generationInput);
    expect(claimed.acquired).toBe(true);
    await expect(generations.claim(generationInput)).resolves.toMatchObject({ acquired: false });
    await expect(
      generations.claim({ ...generationInput, idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await generations.fail({
      ...ownerScope(owner, bunshin.id),
      id: claimed.record.id,
      errorCategory: 'RATE_LIMIT',
    });
    await expect(
      generations.claim({ ...generationInput, idempotencyKey: randomUUID() }),
    ).resolves.toMatchObject({ acquired: true });
    const repository = new PrismaDailyMissionRepository(client);
    const create = new CreateDailyMission(repository, assignments);
    const input = {
      ...ownerScope(owner, bunshin.id),
      missionDate: '2026-08-19',
      format: 'SLIDE' as const,
      estimatedMinutes: 5,
      topic: '基礎',
      angle: '3手',
      reason: '初心者向け',
      assistanceLevel: 'GUIDED' as const,
      content: {
        topic: '基礎',
        angle: '3手',
        reason: '初心者向け',
        estimatedMinutes: 5,
        slides: [
          { index: 1, role: 'HOOK', headline: '開始', body: '本文' },
          { index: 2, role: 'CTA', headline: '行動', body: '本文' },
        ],
        caption: 'caption',
        hashtags: [],
      },
    };
    const created = await create.execute(input);
    expect(created).toMatchObject({
      missionDate: '2026-08-19',
      status: 'GENERATED',
      assistanceLevel: 'GUIDED',
      content: expect.objectContaining({ topic: '基礎' }),
    });
    const engagement = new PrismaMissionEngagementRepository(client);
    await expect(
      new GetMissionDecision(engagement).execute({
        ...ownerScope(owner, bunshin.id),
        dailyMissionId: created.id,
      }),
    ).resolves.toMatchObject({ decision: 'PENDING', decidedAt: null });
    const decide = new DecideMission(repository, assignments, engagement);
    const accepted = await decide.execute({
      ...ownerScope(owner, bunshin.id),
      dailyMissionId: created.id,
      decision: 'ACCEPTED',
      idempotencyKey: 'accept-once',
    });
    expect(accepted.decision).toMatchObject({ decision: 'ACCEPTED', decidedAt: expect.any(Date) });
    await decide.execute({
      ...ownerScope(owner, bunshin.id),
      dailyMissionId: created.id,
      decision: 'ACCEPTED',
      idempotencyKey: 'accept-once',
    });
    const record = new RecordMissionActivity(repository, assignments, engagement);
    await record.execute({
      ...ownerScope(owner, bunshin.id),
      dailyMissionId: created.id,
      type: 'COPIED_SLIDE',
      idempotencyKey: 'copy-slide-once',
      metadata: { slideIndex: 1 },
    });
    await record.execute({
      ...ownerScope(owner, bunshin.id),
      dailyMissionId: created.id,
      type: 'COPIED_SLIDE',
      idempotencyKey: 'copy-slide-once',
      metadata: { slideIndex: 1 },
    });
    await expect(
      new ListMissionActivities(engagement).execute({
        ...ownerScope(owner, bunshin.id),
        dailyMissionId: created.id,
      }),
    ).resolves.toHaveLength(2);
    await expect(
      record.execute({
        ...ownerScope(owner, bunshin.id),
        dailyMissionId: created.id,
        type: 'COPIED_SLIDE',
        idempotencyKey: 'copy-slide-once',
        metadata: { slideIndex: 2 },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const outcomes = new PrismaMissionOutcomeRepository(client);
    const manualPost = new RecordManualPost(repository, assignments, outcomes);
    await manualPost.execute({
      ...ownerScope(owner, bunshin.id),
      dailyMissionId: created.id,
      platform: 'X',
      postedAt: new Date('2026-08-20T01:00:00Z'),
      idempotencyKey: 'posted-once',
    });
    await manualPost.execute({
      ...ownerScope(owner, bunshin.id),
      dailyMissionId: created.id,
      platform: 'X',
      postedAt: new Date('2026-08-20T01:00:00Z'),
      idempotencyKey: 'posted-once',
    });
    await expect(
      new GetPostRecord(outcomes).execute({
        ...ownerScope(owner, bunshin.id),
        dailyMissionId: created.id,
      }),
    ).resolves.toMatchObject({ source: 'MANUAL', externalPostId: null });
    const missionFeedback = new RecordMissionFeedback(repository, assignments, outcomes);
    await missionFeedback.execute({
      ...ownerScope(owner, bunshin.id),
      dailyMissionId: created.id,
      rating: 'GOOD',
      idempotencyKey: 'feedback-good-once',
    });
    await missionFeedback.execute({
      ...ownerScope(owner, bunshin.id),
      dailyMissionId: created.id,
      rating: 'BAD',
      idempotencyKey: 'feedback-bad-once',
    });
    await expect(
      new GetMissionFeedback(outcomes).execute({
        ...ownerScope(owner, bunshin.id),
        dailyMissionId: created.id,
      }),
    ).resolves.toMatchObject({ rating: 'BAD' });
    const outsider = await accounts.execute({ displayName: 'Mission Outsider' });
    await expect(
      generations.claim({
        workspaceId: owner.workspace.id,
        bunshinId: bunshin.id,
        actorUserId: outsider.user.id,
        missionDate: '2026-08-20',
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      new GetMissionDecision(engagement).execute({
        workspaceId: owner.workspace.id,
        actorUserId: outsider.user.id,
        bunshinId: bunshin.id,
        dailyMissionId: created.id,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      new GetPostRecord(outcomes).execute({
        workspaceId: owner.workspace.id,
        actorUserId: outsider.user.id,
        bunshinId: bunshin.id,
        dailyMissionId: created.id,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const otherBunshin = await new PrismaBunshinRepository(client).create({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      name: 'Other Mission Bunshin',
      slug: `other-mission-${randomUUID()}`,
      type: 'COPY',
      objectiveSummary: 'Objective',
      audienceSummary: 'Audience',
      personalitySummary: 'Personality',
    });
    await expect(
      new GetMissionDecision(engagement).execute({
        ...ownerScope(owner, otherBunshin.id),
        dailyMissionId: created.id,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(create.execute(input)).rejects.toMatchObject({ code: 'CONFLICT' });
    const completed = await new TransitionDailyMission(repository, assignments).execute({
      ...ownerScope(owner, bunshin.id),
      dailyMissionId: created.id,
      status: 'COMPLETED',
    });
    expect(completed.completedAt).toBeInstanceOf(Date);
    await expect(
      new TransitionDailyMission(repository, assignments).execute({
        ...ownerScope(owner, bunshin.id),
        dailyMissionId: created.id,
        status: 'VIEWED',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await assignments.setStatus({
      ...ownerScope(owner, bunshin.id),
      capabilityType: 'SOCIAL',
      status: 'SUSPENDED',
    });
    await expect(
      new ListDailyMissions(repository).execute(ownerScope(owner, bunshin.id)),
    ).resolves.toHaveLength(1);
  });

  it('persists trend evidence and candidates within Workspace and Bunshin boundaries', async () => {
    const accounts = new CreateUserWithPersonalWorkspace(new PrismaAccountUnitOfWork(client));
    const owner = await accounts.execute({ displayName: 'Trend Owner' });
    const outsider = await accounts.execute({ displayName: 'Trend Outsider' });
    const bunshins = new PrismaBunshinRepository(client);
    const bunshin = await bunshins.create({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      name: 'Trend Bunshin',
      slug: `trend-${randomUUID()}`,
      type: 'COPY',
      objectiveSummary: 'Objective',
      audienceSummary: 'Audience',
      personalitySummary: 'Personality',
    });
    const assignments = new PrismaBunshinCapabilityAssignmentRepository(client);
    await assignments.assign({ ...ownerScope(owner, bunshin.id), capabilityType: 'SOCIAL' });
    const profile = await new CreateSocialProfile(
      new PrismaSocialProfileRepository(client),
      assignments,
    ).execute({
      ...ownerScope(owner, bunshin.id),
      platform: 'YOUTUBE_SHORTS',
      purpose: 'Trend videos',
      postingFrequency: 'WEEKLY',
      preferredFormats: ['LIVE_ACTION'],
    });
    const repository = new PrismaTrendResearchRepository(client);
    const completedAt = new Date('2026-08-24T00:00:00.000Z');
    const expiresAt = new Date('2026-08-31T00:00:00.000Z');
    const created = await new CreateCompletedTrendResearch(repository, assignments).execute({
      ...ownerScope(owner, bunshin.id),
      socialProfileId: profile.id,
      platform: 'YOUTUBE_SHORTS',
      periodStart: '2026-08-24',
      periodEnd: '2026-08-30',
      queryVersion: 'weekly-v1',
      providerKey: 'test',
      completedAt,
      expiresAt,
      evidence: [
        {
          key: 'e1',
          sourceType: 'OFFICIAL_API',
          sourceUrl: 'https://example.com/video',
          sourceTitle: 'Source',
          retrievedAt: completedAt,
          summary: 'Summary',
          evidenceHash: 'a'.repeat(64),
          expiresAt,
        },
      ],
      candidates: [
        {
          platform: 'YOUTUBE_SHORTS',
          topic: 'Idea',
          hook: 'Hook',
          whyNow: 'Now',
          fitReason: 'Fit',
          suggestedFormat: 'LIVE_ACTION',
          estimatedMinutes: 10,
          freshnessScore: 90,
          fitScore: 80,
          feasibilityScore: 70,
          safetyStatus: 'SAFE',
          expiresAt,
          evidenceKeys: ['e1'],
        },
      ],
    });
    expect(created.candidates[0]?.evidenceIds).toEqual([created.evidence[0]?.id]);
    await expect(
      new ListActiveTrendIdeas(repository).execute({
        ...ownerScope(owner, bunshin.id),
        socialProfileId: profile.id,
        at: completedAt,
      }),
    ).resolves.toHaveLength(1);
    await expect(
      new ListActiveTrendIdeas(repository).execute({
        workspaceId: outsider.workspace.id,
        actorUserId: outsider.user.id,
        bunshinId: bunshin.id,
        socialProfileId: profile.id,
        at: completedAt,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const sibling = await bunshins.create({
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      name: 'Sibling Trend',
      slug: `sibling-trend-${randomUUID()}`,
      type: 'COPY',
      objectiveSummary: 'O',
      audienceSummary: 'A',
      personalitySummary: 'P',
    });
    await expect(
      new ListActiveTrendIdeas(repository).execute({
        ...ownerScope(owner, sibling.id),
        socialProfileId: profile.id,
        at: completedAt,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      new CreateCompletedTrendResearch(repository, assignments).execute({
        ...ownerScope(owner, bunshin.id),
        socialProfileId: profile.id,
        platform: 'YOUTUBE_SHORTS',
        periodStart: '2026-08-24',
        periodEnd: '2026-08-30',
        queryVersion: 'weekly-v1',
        providerKey: 'test',
        completedAt,
        expiresAt,
        evidence: [
          {
            key: 'e1',
            sourceType: 'OFFICIAL_API',
            sourceUrl: 'https://example.com/video',
            sourceTitle: 'Source',
            retrievedAt: completedAt,
            summary: 'Summary',
            evidenceHash: 'a'.repeat(64),
            expiresAt,
          },
        ],
        candidates: [
          {
            platform: 'YOUTUBE_SHORTS',
            topic: 'Idea',
            hook: 'Hook',
            whyNow: 'Now',
            fitReason: 'Fit',
            suggestedFormat: 'LIVE_ACTION',
            estimatedMinutes: 10,
            freshnessScore: 90,
            fitScore: 80,
            feasibilityScore: 70,
            safetyStatus: 'SAFE',
            expiresAt,
            evidenceKeys: ['e1'],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

function ownerScope(owner: { workspace: { id: string }; user: { id: string } }, bunshinId: string) {
  return { workspaceId: owner.workspace.id, actorUserId: owner.user.id, bunshinId };
}
