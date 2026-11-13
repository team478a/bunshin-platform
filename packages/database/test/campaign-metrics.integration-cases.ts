import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { CampaignService } from '@bunshin/application';
import { PrismaCampaignRepository } from '../src';

/**
 * 企業向けの活動状況で、本人申告の投稿完了とSNS公式連携での確認済み公開を分ける。
 * Registered only inside the live disposable-database preflight in database.integration.test.ts.
 */
export function registerCampaignMetricsIntegrationCases(client: PrismaClient) {
  describe('Campaign activity metrics PostgreSQL', () => {
    const missions: string[] = [];
    afterAll(async () => {
      await client.dailyMission.deleteMany({ where: { id: { in: missions } } });
    });

    it('separates self-reported posts from posts confirmed by an official API', async () => {
      const admin = await client.user.create({ data: { displayName: 'Metrics admin' } });
      const participant = await client.user.create({ data: { displayName: 'Metrics member' } });
      const workspace = await client.workspace.create({
        data: {
          type: 'ORGANIZATION',
          name: `Metrics ${randomUUID()}`,
          memberships: {
            create: [
              { userId: admin.id, role: 'ADMIN' },
              { userId: participant.id, role: 'MEMBER' },
            ],
          },
        },
      });
      const group = await client.group.create({
        data: { workspaceId: workspace.id, name: 'Metrics service' },
      });
      const bunshin = await client.bunshin.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          ownerUserId: participant.id,
          name: 'Metrics partner',
          slug: `metrics-${randomUUID()}`,
          type: 'COPY',
          objectiveSummary: 'Company campaign',
          audienceSummary: 'Customers',
          personalitySummary: 'Helpful',
        },
      });
      const pack = await client.productPack.create({
        data: { workspaceId: workspace.id, groupId: group.id, name: 'Metrics product' },
      });
      const version = await client.productPackVersion.create({
        data: {
          productPackId: pack.id,
          version: 1,
          status: 'PUBLISHED',
          summary: '公式商品',
          providerName: 'Metrics',
          targetCustomer: '初めての人',
          facts: {},
          faq: [],
          suitableFor: [],
          unsuitableFor: [],
          publishedAt: new Date(),
          createdByUserId: admin.id,
        },
      });
      const campaign = await client.campaign.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          productPackVersionId: version.id,
          name: 'Metrics campaign',
          theme: '使い方',
          targetSummary: '初めての人',
          participationLimit: 5,
          startsAt: new Date(Date.now() - 60_000),
          endsAt: new Date(Date.now() + 86_400_000),
          status: 'OPEN',
          createdByUserId: admin.id,
        },
      });
      for (const [index, source] of (['MANUAL', 'OFFICIAL_API', null] as const).entries()) {
        const mission = await client.dailyMission.create({
          data: {
            workspaceId: workspace.id,
            bunshinId: bunshin.id,
            campaignId: campaign.id,
            classification: 'PRODUCT_RELATED',
            missionDate: new Date(Date.UTC(2026, 10, 1 + index)),
            format: 'TEXT',
            estimatedMinutes: 5,
            topic: '商品の使い方',
            angle: '初めての人向け',
            reason: 'Campaign参加中',
          },
        });
        missions.push(mission.id);
        if (source)
          await client.postRecord.create({
            data: {
              workspaceId: workspace.id,
              bunshinId: bunshin.id,
              dailyMissionId: mission.id,
              actorUserId: participant.id,
              platform: 'INSTAGRAM',
              postedAt: new Date(),
              source,
              idempotencyKey: `metrics-${index}`,
            },
          });
      }
      const [listed] = (await new CampaignService(new PrismaCampaignRepository(client)).listManaged(
        { workspaceId: workspace.id, actorUserId: admin.id },
      )) as Array<{
        metrics: Record<string, number>;
      }>;
      expect(listed!.metrics).toMatchObject({
        generated: 3,
        posted: 2,
        postedSelfReported: 1,
        postedVerified: 1,
      });
    });
  });
}
