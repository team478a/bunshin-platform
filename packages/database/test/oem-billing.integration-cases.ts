import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { OEM_REGISTRATION_BILLING_RULE_VERSION } from '@bunshin/application';
import { PrismaCommercialUsageService } from '../src/commercial-usage';
import { PrismaCommercialPricingAdminService } from '../src/commercial-pricing-admin';
import { PrismaCommercialBillingService } from '../src/commercial-billing-service';
import { PrismaOemBillingAdminService } from '../src/oem-billing-admin';
import { recordOemRegistration, endOemRegistration } from '../src/oem-billing-history';

/** Called only after the enclosing integration suite's live disposable PostgreSQL preflight. */
export function registerOemBillingIntegrationCases(client: PrismaClient) {
  describe('OEM V2 real PostgreSQL write→history→monthly snapshot→invoice', () => {
    it('preserves registrations through suspension, union-deduplicates, atomically freezes snapshots and invoice amounts', async () => {
      const actor = await client.user.create({ data: { displayName: 'Synthetic OEM reviewer' } });
      await client.platformAdmin.create({
        data: { userId: actor.id, role: 'SUPER_ADMIN', status: 'ACTIVE' },
      });
      const user = await client.user.create({
        data: { displayName: 'Synthetic registered learner' },
      });
      const workspace = await client.workspace.create({
        data: { name: `oem-billing-${randomUUID()}`, type: 'ORGANIZATION' },
      });
      const group = await client.group.create({
        data: { workspaceId: workspace.id, name: 'Synthetic paid service' },
      });
      await client.serviceConfiguration.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          slug: `oem-${randomUUID()}`,
          displayName: 'Synthetic OEM service',
          description: 'synthetic',
          operatorName: 'synthetic',
          createdByUserId: actor.id,
          updatedByUserId: actor.id,
        },
      });
      const membership = await client.groupMembership.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          userId: user.id,
          status: 'ACTIVE',
          consentedAt: new Date('2026-11-01T00:00:00Z'),
        },
      });
      await client.oemOfferingPeriod.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          productPolicy: 'HASSY',
          classification: 'PAID',
          startsAt: new Date('2026-10-31T15:00:00Z'),
          actorUserId: actor.id,
          reason: 'synthetic offering reviewed',
        },
      });
      await client.oemContractPeriod.create({
        data: {
          workspaceId: workspace.id,
          startsAt: new Date('2026-10-31T15:00:00Z'),
          actorUserId: actor.id,
          reason: 'synthetic contract reviewed',
        },
      });
      await client.oemBillingPolicy.create({
        data: {
          workspaceId: workspace.id,
          ruleVersion: OEM_REGISTRATION_BILLING_RULE_VERSION,
          effectiveFrom: new Date('2026-11-01T00:00:00Z'),
          historyReadyAt: new Date('2026-10-07T00:00:00Z'),
          actorUserId: actor.id,
          reason: 'synthetic future-month cutover',
        },
      });
      const registeredAt = new Date('2026-11-01T00:00:00Z');
      await Promise.all(
        [1, 2].map(() =>
          client.$transaction((tx) =>
            recordOemRegistration(
              tx,
              membership,
              actor.id,
              registeredAt,
              'synthetic formal registration',
            ),
          ),
        ),
      );
      expect(
        await client.oemRegistrationPeriod.count({ where: { workspaceId: workspace.id } }),
      ).toBe(1);
      const registered = await client.oemRegistrationPeriod.findFirstOrThrow({
        where: { workspaceId: workspace.id },
      });
      const otherWorkspace = await client.workspace.create({
        data: { name: 'Synthetic isolated tenant', type: 'ORGANIZATION' },
      });
      await expect(
        client.oemRegistrationPeriod.create({
          data: { ...registered, id: randomUUID(), workspaceId: otherWorkspace.id },
        }),
      ).rejects.toThrow();
      await client.groupMembership.update({
        where: { id: membership.id },
        data: { status: 'SUSPENDED', role: 'MANAGER' },
      });
      const closingAt = new Date('2026-12-01T00:00:00Z');
      const service = new PrismaCommercialUsageService(client);
      const shadow = await new PrismaOemBillingAdminService(client).shadow({
        workspaceId: workspace.id,
        actorUserId: actor.id,
        month: new Date('2026-11-15Z'),
      });
      expect(shadow).toMatchObject({ mau: 0, billableUserCount: 1 });
      expect(await client.tenantMonthlyUsage.count({ where: { workspaceId: workspace.id } })).toBe(
        0,
      );
      expect(await client.tenantInvoice.count({ where: { workspaceId: workspace.id } })).toBe(0);
      const snapshots = await Promise.all([
        service.finalizePreviousMonth(workspace.id, closingAt),
        service.finalizePreviousMonth(workspace.id, closingAt),
      ]);
      expect(snapshots[0].id).toBe(snapshots[1].id);
      expect(snapshots[0]).toMatchObject({ mau: 0, billableUserCount: 1, registeredUserCount: 1 });
      await expect(
        client.tenantMonthlyUsage.update({
          where: { id: snapshots[0].id },
          data: { billableUserCount: 0 },
        }),
      ).rejects.toThrow();
      await client.organizationCommercialContract.create({
        data: {
          workspaceId: workspace.id,
          status: 'ACTIVE',
          billingMode: 'MANUAL_INVOICE',
          billingName: 'Synthetic OEM',
          billingEmail: 'synthetic@example.invalid',
          updatedByUserId: actor.id,
        },
      });
      const billing = new PrismaCommercialBillingService(client);
      await Promise.all([
        billing.prepareWorkspaceInvoices(workspace.id, closingAt),
        billing.prepareWorkspaceInvoices(workspace.id, closingAt),
      ]);
      const invoices = await client.tenantInvoice.findMany({
        where: { workspaceId: workspace.id },
      });
      expect(invoices).toHaveLength(1);
      expect(invoices[0]).toMatchObject({
        status: 'DRAFT',
        mau: 0,
        billableUserCount: 1,
        amountYen: snapshots[0].calculatedPriceYen,
      });
      await client.$transaction((tx) =>
        endOemRegistration(
          tx,
          membership,
          actor.id,
          new Date('2026-11-30T15:00:00Z'),
          'explicit end at JST December boundary',
        ),
      );
      const next = await service.finalizePreviousMonth(
        workspace.id,
        new Date('2027-01-01T00:00:00Z'),
      );
      expect(next.billableUserCount).toBe(0);
      expect(snapshots[0].billableUserCount).toBe(1);
      await billing.saveContract({
        workspaceId: workspace.id,
        actorUserId: actor.id,
        status: 'ENDED',
        billingMode: 'MANUAL_INVOICE',
        billingName: 'Synthetic OEM',
        billingEmail: 'synthetic@example.invalid',
        paymentTermsDays: 30,
        automaticRemindersEnabled: false,
        reminderLeadDays: 3,
        overdueReminderIntervalDays: 7,
        automaticCollectionEnabled: false,
        startsAt: new Date('2026-10-31T15:00:00Z'),
        endsAt: new Date('2026-12-31T15:00:00Z'),
      });
      expect(
        (await billing.prepareWorkspaceInvoices(workspace.id, new Date('2027-01-02Z'))).prepared,
      ).toBe(1);
      const finalInvoice = await client.tenantInvoice.findFirstOrThrow({
        where: { monthlyUsageId: next.id },
      });
      expect(finalInvoice.billableUserCount).toBe(0);
      expect(
        (
          await client.organizationCommercialContract.findUniqueOrThrow({
            where: { workspaceId: workspace.id },
          })
        ).status,
      ).toBe('ENDED');
      await expect(
        service.finalizePreviousMonth(workspace.id, new Date('2027-02-01Z')),
      ).rejects.toThrow('REVIEW_REQUIRED');
      await expect(
        client.oemOfferingPeriod.create({
          data: {
            workspaceId: workspace.id,
            groupId: group.id,
            productPolicy: 'MANABERU_STYLE',
            classification: 'FREE',
            startsAt: new Date('2027-01-01T00:00:00Z'),
            actorUserId: actor.id,
            reason: 'forbidden free training',
          },
        }),
      ).rejects.toThrow();
    });

    it('pricing edits use CAS, publish conflicts serialize, cancellation permits replacement but not historical mutation', async () => {
      const actor = await client.user.create({
        data: { displayName: 'Synthetic pricing SUPER_ADMIN' },
      });
      await client.platformAdmin.create({
        data: { userId: actor.id, role: 'SUPER_ADMIN', status: 'ACTIVE' },
      });
      const service = new PrismaCommercialPricingAdminService(client);
      const input = {
        name: 'Synthetic shared pricing',
        version: `test-${randomUUID()}`,
        effectiveFrom: new Date('2099-01-01T00:00:00Z'),
        tiers: [
          { tierKey: 'stable-zero', upperLimit: 0, priceYen: 0 },
          { tierKey: 'stable-paid', upperLimit: 5000, priceYen: 12300 },
        ],
        actorUserId: actor.id,
        reason: 'synthetic human pricing review',
        acknowledgeDescendingPrices: false,
      };
      const draft = await service.saveDraft(input);
      expect((await service.saveDraft(input)).id).toBe(draft.id);
      await expect(
        service.saveDraft({
          ...input,
          version: `decreasing-${randomUUID()}`,
          tiers: [
            { tierKey: 'a', upperLimit: 100, priceYen: 2000 },
            { tierKey: 'b', upperLimit: 500, priceYen: 1000 },
          ],
        }),
      ).rejects.toThrow('DESCENDING_PRICE_CONFIRMATION_REQUIRED');
      const updated = await service.saveDraft({
        ...input,
        id: draft.id,
        expectedRevision: draft.revision,
      });
      await expect(
        service.saveDraft({ ...input, id: draft.id, expectedRevision: draft.revision }),
      ).rejects.toThrow('STALE');
      const second = await service.saveDraft({ ...input, version: `test-${randomUUID()}` });
      const attempts = await Promise.allSettled(
        [updated, second].map((s) =>
          service.transition({
            id: s.id,
            expectedRevision: s.revision,
            action: 'PUBLISH',
            actorUserId: actor.id,
            reason: 'publish synthetic schedule',
            now: new Date('2026-10-07T00:00:00Z'),
          }),
        ),
      );
      expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
      const published = await client.commercialPricingSchedule.findFirstOrThrow({
        where: { effectiveFrom: input.effectiveFrom, status: 'PUBLISHED' },
      });
      await expect(
        client.commercialPricingSchedule.update({
          where: { id: published.id },
          data: { tiers: [] },
        }),
      ).rejects.toThrow();
      const cancelled = await service.transition({
        id: published.id,
        expectedRevision: published.revision,
        action: 'CANCEL',
        actorUserId: actor.id,
        reason: 'cancel synthetic schedule',
        now: new Date('2026-10-07T00:00:00Z'),
      });
      expect(cancelled.status).toBe('CANCELLED');
      const replacementDraft = [updated, second].find((s) => s.id !== published.id)!;
      const replacement = await service.transition({
        id: replacementDraft.id,
        expectedRevision: replacementDraft.revision,
        action: 'PUBLISH',
        actorUserId: actor.id,
        reason: 'explicit replacement after cancel',
        now: new Date('2026-10-07Z'),
      });
      expect(replacement.status).toBe('PUBLISHED');
      expect(
        (
          await service.transition({
            id: replacementDraft.id,
            expectedRevision: replacementDraft.revision,
            action: 'PUBLISH',
            actorUserId: actor.id,
            reason: 'explicit replacement after cancel',
            now: new Date('2026-10-07Z'),
          })
        ).id,
      ).toBe(replacement.id);
      expect(
        await client.commercialPricingAudit.count({ where: { scheduleId: cancelled.id } }),
      ).toBeGreaterThanOrEqual(3);
      const other = await client.user.create({
        data: { displayName: 'Synthetic unauthorized OEM operator' },
      });
      await expect(
        service.saveDraft({ ...input, actorUserId: other.id, version: `test-${randomUUID()}` }),
      ).rejects.toThrow('SUPER_ADMIN_REQUIRED');
    });

    it('RLS denies a non-owner role access to the five new billing history/audit tables', async () => {
      await client.$executeRawUnsafe('CREATE ROLE test_oem_billing_public NOLOGIN');
      await client.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO test_oem_billing_public');
      await client.$executeRawUnsafe(
        'GRANT SELECT, INSERT ON oem_billing_policies, oem_registration_periods, oem_offering_periods, oem_contract_periods, commercial_pricing_audits TO test_oem_billing_public',
      );
      try {
        const counts = await client.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('SET LOCAL ROLE test_oem_billing_public');
          return tx.$queryRaw<
            Array<{
              policies: bigint;
              registrations: bigint;
              offerings: bigint;
              contracts: bigint;
              audits: bigint;
            }>
          >`SELECT
            (SELECT count(*) FROM oem_billing_policies) AS policies,
            (SELECT count(*) FROM oem_registration_periods) AS registrations,
            (SELECT count(*) FROM oem_offering_periods) AS offerings,
            (SELECT count(*) FROM oem_contract_periods) AS contracts,
            (SELECT count(*) FROM commercial_pricing_audits) AS audits`;
        });
        expect(counts).toEqual([
          { policies: 0n, registrations: 0n, offerings: 0n, contracts: 0n, audits: 0n },
        ]);
        const policy = await client.oemBillingPolicy.findFirstOrThrow();
        await expect(
          client.$transaction(async (tx) => {
            await tx.$executeRawUnsafe('SET LOCAL ROLE test_oem_billing_public');
            return tx.oemBillingPolicy.create({ data: { ...policy, workspaceId: randomUUID() } });
          }),
        ).rejects.toThrow('row-level security');
      } finally {
        await client.$executeRawUnsafe(
          'REVOKE ALL ON oem_billing_policies, oem_registration_periods, oem_offering_periods, oem_contract_periods, commercial_pricing_audits FROM test_oem_billing_public',
        );
        await client.$executeRawUnsafe(
          'REVOKE USAGE ON SCHEMA public FROM test_oem_billing_public',
        );
        await client.$executeRawUnsafe('DROP ROLE test_oem_billing_public');
      }
    });
  });
}
