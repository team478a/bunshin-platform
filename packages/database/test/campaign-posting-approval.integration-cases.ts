import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { CampaignService } from '@bunshin/application';
import {
  PrismaCampaignRepository,
  PrismaDailyMissionRepository,
  PrismaMissionContentVariantRepository,
} from '../src';

/**
 * 企業A/Bの独立Serviceで、Campaign投稿案のコピー可否と企業確認を検証する。
 * Registered only inside the live disposable-database preflight in database.integration.test.ts.
 */
export function registerCampaignPostingApprovalIntegrationCases(client: PrismaClient) {
  describe('Campaign posting approval and copy eligibility PostgreSQL', () => {
    const missions: string[] = [];
    afterAll(async () => {
      // DailyMissionはWorkspace削除をRestrictするため、このケースで作った投稿案だけを片付ける。
      await client.dailyMission.deleteMany({ where: { id: { in: missions } } });
    });

    const campaigns = new CampaignService(new PrismaCampaignRepository(client));
    const missionRepository = new PrismaDailyMissionRepository(client);
    const variants = new PrismaMissionContentVariantRepository(client);

    async function company(label: string, approvalRequired: boolean) {
      const admin = await client.user.create({ data: { displayName: `${label} admin` } });
      const participant = await client.user.create({
        data: { displayName: `${label} participant` },
      });
      const workspace = await client.workspace.create({
        data: {
          type: 'ORGANIZATION',
          name: `${label} ${randomUUID()}`,
          memberships: {
            create: [
              { userId: admin.id, role: 'ADMIN' },
              { userId: participant.id, role: 'MEMBER' },
            ],
          },
        },
      });
      const group = await client.group.create({
        data: { workspaceId: workspace.id, name: `${label} service` },
      });
      await client.serviceConfiguration.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          slug: `approval-${randomUUID()}`,
          displayName: `${label} service`,
          description: 'Synthetic company service',
          operatorName: label,
          createdByUserId: admin.id,
          updatedByUserId: admin.id,
        },
      });
      const consentedAt = new Date();
      await client.groupMembership.createMany({
        data: [
          {
            workspaceId: workspace.id,
            groupId: group.id,
            userId: admin.id,
            serviceRole: 'SERVICE_ADMIN',
            status: 'ACTIVE',
            consentedAt,
          },
          {
            workspaceId: workspace.id,
            groupId: group.id,
            userId: participant.id,
            serviceRole: 'PARTICIPANT',
            status: 'ACTIVE',
            consentedAt,
          },
        ],
      });
      const bunshin = await client.bunshin.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          ownerUserId: participant.id,
          name: `${label} partner`,
          slug: `approval-${randomUUID()}`,
          type: 'COPY',
          status: 'ACTIVE',
          objectiveSummary: 'Company campaign',
          audienceSummary: 'Customers',
          personalitySummary: 'Helpful',
        },
      });
      const pack = await client.productPack.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          name: `${label} product`,
          status: 'ACTIVE',
        },
      });
      const version = await client.productPackVersion.create({
        data: {
          productPackId: pack.id,
          version: 1,
          status: 'PUBLISHED',
          allowLinklessPosts: true,
          summary: `${label}の公式商品`,
          providerName: label,
          targetCustomer: '初めての人',
          facts: { price: '1000円' },
          faq: [],
          suitableFor: [],
          unsuitableFor: [],
          publishedAt: new Date(),
          createdByUserId: admin.id,
        },
      });
      const assignment = await client.productPackAssignment.create({
        data: {
          workspaceId: workspace.id,
          productPackId: pack.id,
          productPackVersionId: version.id,
          bunshinId: bunshin.id,
          consentedAt,
          assignedByUserId: admin.id,
        },
      });
      const draft = (await campaigns.createDraft({
        workspaceId: workspace.id,
        actorUserId: admin.id,
        groupId: group.id,
        productPackVersionId: version.id,
        name: `${label} campaign`,
        theme: '正しい使い方',
        targetSummary: '初めての人',
        participationLimit: 10,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 7 * 86_400_000),
      })) as { id: string };
      await campaigns.transition({
        workspaceId: workspace.id,
        actorUserId: admin.id,
        groupId: group.id,
        campaignId: draft.id,
        from: 'DRAFT',
        to: 'OPEN',
      });
      // Service分身の参加UI/APIはPR-2で整備する。ここでは計画側と同じ参加レコードを直接用意する。
      const participation = await client.campaignParticipation.create({
        data: {
          campaignId: draft.id,
          participantWorkspaceId: workspace.id,
          userId: participant.id,
          bunshinId: bunshin.id,
          status: 'ACCEPTED',
          consentedAt,
        },
      });
      if (approvalRequired)
        await client.campaignPostingApprovalPolicy.create({
          data: {
            workspaceId: workspace.id,
            groupId: group.id,
            required: true,
            updatedByUserId: admin.id,
          },
        });
      const scope = {
        workspaceId: workspace.id,
        groupId: group.id,
        actorUserId: participant.id,
        bunshinId: bunshin.id,
      };
      return {
        admin,
        participant,
        workspace,
        group,
        bunshin,
        version,
        assignment,
        participation,
        campaignId: draft.id,
        scope,
        approvalRequired,
      };
    }

    type Company = Awaited<ReturnType<typeof company>>;

    async function campaignMission(target: Company) {
      const content = { text: `${target.workspace.name}の投稿案`, hashtags: [] };
      const mission = await client.dailyMission.create({
        data: {
          workspaceId: target.workspace.id,
          bunshinId: target.bunshin.id,
          campaignId: target.campaignId,
          classification: 'PRODUCT_RELATED',
          missionDate: new Date(Date.UTC(2026, 10, 12 + missions.length)),
          format: 'TEXT',
          estimatedMinutes: 5,
          topic: '商品の使い方',
          angle: '初めての人向け',
          reason: 'Campaign参加中',
          content: {
            create: { contentJson: content },
          },
        },
      });
      missions.push(mission.id);
      const approval = target.approvalRequired
        ? await client.campaignPostingApprovalRequest.create({
            data: {
              workspaceId: target.workspace.id,
              groupId: target.group.id,
              campaignId: target.campaignId,
              bunshinId: target.bunshin.id,
              dailyMissionId: mission.id,
              contentSnapshot: content,
              requestedByUserId: target.participant.id,
            },
          })
        : null;
      return { mission, approval };
    }

    async function variant(target: Company, dailyMissionId: string, text: string) {
      return client.missionContentVariant.create({
        data: {
          workspaceId: target.workspace.id,
          bunshinId: target.bunshin.id,
          dailyMissionId,
          actorUserId: target.participant.id,
          sequence: 1,
          format: 'TEXT',
          contentJson: { text, hashtags: [] },
          qualityScore: 80,
          model: 'synthetic-model',
          promptVersion: 'synthetic-v1',
          latencyMs: 1,
        },
      });
    }

    const copy = (target: Company, dailyMissionId: string) =>
      missionRepository.authorizeCopy({ ...target.scope, dailyMissionId, at: new Date() });

    const approve = (requestId: string, reviewer: string) =>
      client.campaignPostingApprovalRequest.update({
        where: { id: requestId },
        data: { status: 'APPROVED', reviewedByUserId: reviewer, reviewedAt: new Date() },
      });

    it('keeps company review separate, isolated by Service, and bound to the reviewed text', async () => {
      const a = await company('Company A', true);
      const b = await company('Company B', true);
      const { mission, approval } = await campaignMission(a);

      await expect(copy(a, mission.id)).resolves.toMatchObject({
        allowed: false,
        reason: 'APPROVAL_PENDING',
      });
      await client.campaignPostingApprovalRequest.update({
        where: { id: approval!.id },
        data: { status: 'CHANGES_REQUESTED', reviewNote: '価格表記を確認してください' },
      });
      await expect(copy(a, mission.id)).resolves.toMatchObject({
        allowed: false,
        reason: 'APPROVAL_CHANGES_REQUESTED',
        reviewNote: '価格表記を確認してください',
      });
      await approve(approval!.id, a.admin.id);
      await expect(copy(a, mission.id)).resolves.toEqual({ allowed: true, reason: 'READY' });

      // 企業Bの管理者・参加者は企業AのCampaignも投稿案も扱えない。
      await expect(
        campaigns.listManaged({ workspaceId: a.workspace.id, actorUserId: b.admin.id }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        campaigns.listManaged({
          workspaceId: b.workspace.id,
          actorUserId: b.admin.id,
          groupId: b.group.id,
        }),
      ).resolves.toEqual([expect.objectContaining({ id: b.campaignId })]);
      await expect(
        missionRepository.authorizeCopy({
          ...a.scope,
          actorUserId: b.participant.id,
          dailyMissionId: mission.id,
          at: new Date(),
        }),
      ).resolves.toBeNull();
      await expect(
        missionRepository.authorizeCopy({
          ...b.scope,
          dailyMissionId: mission.id,
          at: new Date(),
        }),
      ).resolves.toBeNull();

      // 承認後に別案を初めて選ぶと、同じTransactionで確認依頼が別案本文に戻る。
      const alternative = await variant(a, mission.id, '企業がまだ見ていない別案');
      await variants.select({
        ...a.scope,
        dailyMissionId: mission.id,
        variantId: alternative.id,
        idempotencyKey: 'select-variant-first',
        selectedAt: new Date(),
      });
      await expect(
        client.campaignPostingApprovalRequest.findUniqueOrThrow({ where: { id: approval!.id } }),
      ).resolves.toMatchObject({
        status: 'PENDING',
        contentSnapshot: { text: '企業がまだ見ていない別案', hashtags: [] },
        reviewNote: null,
        reviewedByUserId: null,
        reviewedAt: null,
      });
      await expect(
        client.campaignPostingApprovalAudit.findFirst({
          where: { requestId: approval!.id, action: 'RESUBMITTED' },
        }),
      ).resolves.toMatchObject({
        performedByUserId: a.participant.id,
        beforeData: { status: 'APPROVED' },
        afterData: { status: 'PENDING', variantId: alternative.id },
      });
      await expect(copy(a, mission.id)).resolves.toMatchObject({
        allowed: false,
        reason: 'APPROVAL_PENDING',
      });

      // 再確認後に同じ別案を選び直しても、承認は取り消さない。
      await approve(approval!.id, a.admin.id);
      for (const idempotencyKey of ['select-variant-first', 'select-variant-again'])
        await variants.select({
          ...a.scope,
          dailyMissionId: mission.id,
          variantId: alternative.id,
          idempotencyKey,
          selectedAt: new Date(),
        });
      await expect(
        client.campaignPostingApprovalRequest.findUniqueOrThrow({ where: { id: approval!.id } }),
      ).resolves.toMatchObject({ status: 'APPROVED' });
      await expect(
        client.campaignPostingApprovalAudit.count({
          where: { requestId: approval!.id, action: 'RESUBMITTED' },
        }),
      ).resolves.toBe(1);
      await expect(copy(a, mission.id)).resolves.toEqual({ allowed: true, reason: 'READY' });

      // 企業Bの確認依頼はAの操作で変化しない。
      const other = await campaignMission(b);
      await expect(copy(b, other.mission.id)).resolves.toMatchObject({
        reason: 'APPROVAL_PENDING',
      });
    });

    it('does not create review work when the Service does not require company review', async () => {
      const target = await company('No review company', false);
      const { mission } = await campaignMission(target);
      const alternative = await variant(target, mission.id, '確認不要サービスの別案');
      await variants.select({
        ...target.scope,
        dailyMissionId: mission.id,
        variantId: alternative.id,
        idempotencyKey: 'select-without-review',
        selectedAt: new Date(),
      });
      await expect(
        client.campaignPostingApprovalRequest.count({ where: { dailyMissionId: mission.id } }),
      ).resolves.toBe(0);
      await expect(copy(target, mission.id)).resolves.toEqual({ allowed: true, reason: 'READY' });
    });

    it('rechecks Campaign participation conditions when copying an approved post', async () => {
      const a = await company('Copy company A', true);
      const b = await company('Copy company B', true);
      const first = await campaignMission(a);
      const second = await campaignMission(b);
      await approve(first.approval!.id, a.admin.id);
      await approve(second.approval!.id, b.admin.id);
      const ready = { allowed: true, reason: 'READY' };
      const unavailable = { allowed: false, reason: 'CAMPAIGN_UNAVAILABLE' };
      await expect(copy(a, first.mission.id)).resolves.toEqual(ready);

      const changes: Array<{ apply: () => Promise<unknown>; restore: () => Promise<unknown> }> = [
        {
          apply: () =>
            client.campaignParticipation.update({
              where: { id: a.participation.id },
              data: { status: 'WITHDRAWN', withdrawnAt: new Date() },
            }),
          restore: () =>
            client.campaignParticipation.update({
              where: { id: a.participation.id },
              data: { status: 'ACCEPTED', withdrawnAt: null },
            }),
        },
        {
          apply: () =>
            client.productPackVersion.update({
              where: { id: a.version.id },
              data: { status: 'SUPERSEDED' },
            }),
          restore: () =>
            client.productPackVersion.update({
              where: { id: a.version.id },
              data: { status: 'PUBLISHED' },
            }),
        },
        {
          apply: () =>
            client.productPackAssignment.update({
              where: { id: a.assignment.id },
              data: { status: 'REVOKED', revokedAt: new Date() },
            }),
          restore: () =>
            client.productPackAssignment.update({
              where: { id: a.assignment.id },
              data: { status: 'ACTIVE', revokedAt: null },
            }),
        },
        {
          apply: () =>
            client.groupMembership.updateMany({
              where: { groupId: a.group.id, userId: a.participant.id },
              data: { status: 'REVOKED', revokedAt: new Date() },
            }),
          restore: () =>
            client.groupMembership.updateMany({
              where: { groupId: a.group.id, userId: a.participant.id },
              data: { status: 'ACTIVE', revokedAt: null },
            }),
        },
        {
          apply: () =>
            client.campaign.update({
              where: { id: a.campaignId },
              data: { endsAt: new Date(Date.now() - 1_000) },
            }),
          restore: () =>
            client.campaign.update({
              where: { id: a.campaignId },
              data: { endsAt: new Date(Date.now() + 7 * 86_400_000) },
            }),
        },
      ];
      for (const change of changes) {
        await change.apply();
        await expect(copy(a, first.mission.id)).resolves.toEqual(unavailable);
        await change.restore();
        await expect(copy(a, first.mission.id)).resolves.toEqual(ready);
      }

      await campaigns.transition({
        workspaceId: a.workspace.id,
        actorUserId: a.admin.id,
        groupId: a.group.id,
        campaignId: a.campaignId,
        from: 'OPEN',
        to: 'CANCELLED',
        reason: '販売終了',
      });
      await expect(copy(a, first.mission.id)).resolves.toEqual(unavailable);
      // 企業Aの中止は企業Bのキャンペーンへ影響しない。
      await expect(copy(b, second.mission.id)).resolves.toEqual(ready);
    });
  });
}
