import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaCampaignPostingApprovalRepository, PrismaDailyMissionRepository } from '../src';

/**
 * 企業Serviceの確認ルール変更と、終了・中止したCampaignの確認を検証する。
 * Registered only inside the live disposable-database preflight in database.integration.test.ts.
 */
export function registerCampaignPostingApprovalRuleIntegrationCases(client: PrismaClient) {
  describe('Campaign posting approval rules PostgreSQL', () => {
    const missions: string[] = [];
    afterAll(async () => {
      await client.dailyMission.deleteMany({ where: { id: { in: missions } } });
    });
    const approvals = new PrismaCampaignPostingApprovalRepository(client);
    const missionRepository = new PrismaDailyMissionRepository(client);

    async function company(label: string) {
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
          slug: `rules-${randomUUID()}`,
          type: 'COPY',
          status: 'ACTIVE',
          objectiveSummary: 'Company campaign',
          audienceSummary: 'Customers',
          personalitySummary: 'Helpful',
        },
      });
      const pack = await client.productPack.create({
        data: { workspaceId: workspace.id, groupId: group.id, name: `${label} product` },
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
          facts: {},
          faq: [],
          suitableFor: [],
          unsuitableFor: [],
          publishedAt: new Date(),
          createdByUserId: admin.id,
        },
      });
      await client.productPackAssignment.create({
        data: {
          workspaceId: workspace.id,
          productPackId: pack.id,
          productPackVersionId: version.id,
          bunshinId: bunshin.id,
          consentedAt,
          assignedByUserId: participant.id,
        },
      });
      const campaign = await client.campaign.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          productPackVersionId: version.id,
          name: `${label} campaign`,
          theme: '正しい使い方',
          targetSummary: '初めての人',
          participationLimit: 10,
          startsAt: new Date(Date.now() - 60_000),
          endsAt: new Date(Date.now() + 7 * 86_400_000),
          status: 'OPEN',
          createdByUserId: admin.id,
          participations: {
            create: {
              participantWorkspaceId: workspace.id,
              userId: participant.id,
              bunshinId: bunshin.id,
              status: 'ACCEPTED',
              consentedAt,
            },
          },
        },
      });
      const scope = { workspaceId: workspace.id, groupId: group.id, actorUserId: admin.id };
      const participantScope = {
        workspaceId: workspace.id,
        groupId: group.id,
        actorUserId: participant.id,
        bunshinId: bunshin.id,
      };
      return { admin, participant, workspace, group, bunshin, campaign, scope, participantScope };
    }

    type Company = Awaited<ReturnType<typeof company>>;

    async function mission(target: Company, status: 'GENERATED' | 'COMPLETED' = 'GENERATED') {
      const row = await client.dailyMission.create({
        data: {
          workspaceId: target.workspace.id,
          bunshinId: target.bunshin.id,
          campaignId: target.campaign.id,
          classification: 'PRODUCT_RELATED',
          missionDate: new Date(Date.UTC(2026, 10, 1 + missions.length)),
          status,
          format: 'TEXT',
          estimatedMinutes: 5,
          topic: '商品の使い方',
          angle: '初めての人向け',
          reason: 'Campaign参加中',
          content: { create: { contentJson: { body: '確認前に作られた投稿案', hashtags: [] } } },
        },
      });
      missions.push(row.id);
      return row;
    }

    const copy = (target: Company, dailyMissionId: string) =>
      missionRepository.authorizeCopy({
        ...target.participantScope,
        dailyMissionId,
        at: new Date(),
      });

    it('requests review for existing posts when a Service turns review on', async () => {
      const a = await company('Rules company A');
      const b = await company('Rules company B');
      const open = await mission(a);
      const completed = await mission(a, 'COMPLETED');
      const other = await mission(b);
      await expect(copy(a, open.id)).resolves.toEqual({ allowed: true, reason: 'READY' });

      await expect(
        approvals.updatePolicy({ ...a.scope, required: true, now: new Date() }),
      ).resolves.toEqual({ required: true, requestedExisting: 1 });
      await expect(
        client.campaignPostingApprovalRequest.findUniqueOrThrow({
          where: { dailyMissionId: open.id },
        }),
      ).resolves.toMatchObject({
        status: 'PENDING',
        groupId: a.group.id,
        requestedByUserId: a.participant.id,
        contentSnapshot: { body: '確認前に作られた投稿案', hashtags: [] },
      });
      await expect(copy(a, open.id)).resolves.toMatchObject({
        allowed: false,
        reason: 'APPROVAL_PENDING',
      });
      // 完了済みの投稿案と、他企業の投稿案には確認依頼を作らない。
      await expect(
        client.campaignPostingApprovalRequest.count({
          where: { dailyMissionId: { in: [completed.id, other.id] } },
        }),
      ).resolves.toBe(0);
      await expect(copy(b, other.id)).resolves.toEqual({ allowed: true, reason: 'READY' });

      // 確認ありのまま保存し直しても、確認依頼を重ねて作らない。
      await expect(
        approvals.updatePolicy({ ...a.scope, required: true, now: new Date() }),
      ).resolves.toEqual({ required: true, requestedExisting: 0 });
      await expect(
        client.campaignPostingApprovalAudit.count({
          where: { groupId: a.group.id, action: 'REQUESTED' },
        }),
      ).resolves.toBe(1);
    });

    it('does not review posts after the Campaign ends or is cancelled', async () => {
      const a = await company('Review company A');
      const b = await company('Review company B');
      await approvals.updatePolicy({ ...a.scope, required: true, now: new Date() });
      const target = await mission(a);
      await approvals.updatePolicy({ ...a.scope, required: false, now: new Date() });
      await approvals.updatePolicy({ ...a.scope, required: true, now: new Date() });
      const request = await client.campaignPostingApprovalRequest.findUniqueOrThrow({
        where: { dailyMissionId: target.id },
      });
      const review = (scope: Company['scope']) =>
        approvals.review({
          ...scope,
          requestId: request.id,
          decision: 'APPROVED',
          reviewNote: null,
          now: new Date(),
        });

      // 他企業の管理者範囲からは確認できない。
      await expect(review(b.scope)).resolves.toBe('MISSING');
      await client.campaign.update({
        where: { id: a.campaign.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      await expect(review(a.scope)).resolves.toBe('CAMPAIGN_UNAVAILABLE');
      await expect(
        client.campaignPostingApprovalRequest.findUniqueOrThrow({ where: { id: request.id } }),
      ).resolves.toMatchObject({ status: 'PENDING', reviewedByUserId: null });

      await client.campaign.update({
        where: { id: a.campaign.id },
        data: { status: 'OPEN', cancelledAt: null, endsAt: new Date(Date.now() - 1_000) },
      });
      await expect(review(a.scope)).resolves.toBe('CAMPAIGN_UNAVAILABLE');

      await client.campaign.update({
        where: { id: a.campaign.id },
        data: { endsAt: new Date(Date.now() + 86_400_000) },
      });
      await expect(review(a.scope)).resolves.toBe('REVIEWED');
      await expect(review(a.scope)).resolves.toBe('MISSING');
      await expect(copy(a, target.id)).resolves.toEqual({ allowed: true, reason: 'READY' });
    });
  });
}
