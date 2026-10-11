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
      const hassy = await client.commercialServiceProduct.findUniqueOrThrow({
        where: { key: 'HASSY' },
        include: { policyVersions: { where: { version: 1 } } },
      });
      const hassyPolicy = hassy.policyVersions[0]!;
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
          productId: hassy.id,
          productPolicyVersionId: hassyPolicy.id,
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
        client.commercialServiceProduct
          .findUniqueOrThrow({
            where: { key: 'MANABERU_STYLE' },
            include: { policyVersions: { where: { version: 1 } } },
          })
          .then((product) =>
            client.oemOfferingPeriod.create({
              data: {
                workspaceId: workspace.id,
                groupId: group.id,
                productId: product.id,
                productPolicyVersionId: product.policyVersions[0]!.id,
                productPolicy: product.key,
                classification: 'FREE',
                startsAt: new Date('2027-01-01T00:00:00Z'),
                actorUserId: actor.id,
                reason: 'forbidden free training',
              },
            }),
          ),
      ).rejects.toThrow();
    });

    it('registers and assigns a third Watashi Works service product without product-name branching', async () => {
      const actor = await client.user.create({
        data: { displayName: 'Synthetic product reviewer' },
      });
      await client.platformAdmin.create({
        data: { userId: actor.id, role: 'SUPER_ADMIN', status: 'ACTIVE' },
      });
      const workspace = await client.workspace.create({
        data: { name: `generic-product-${randomUUID()}`, type: 'ORGANIZATION' },
      });
      const group = await client.group.create({
        data: { workspaceId: workspace.id, name: 'Third Watashi Works service' },
      });
      await client.serviceConfiguration.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          slug: `third-${randomUUID()}`,
          displayName: 'Third Watashi Works service',
          description: 'synthetic generic OEM service',
          operatorName: 'synthetic',
          createdByUserId: actor.id,
          updatedByUserId: actor.id,
        },
      });
      const key = `THIRD_${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
      const service = new PrismaOemBillingAdminService(client);
      const input = {
        key,
        displayName: '第三サービス',
        freeOfferingAllowed: true,
        requiredCapabilities: ['SOCIAL'],
        effectiveFrom: new Date('2026-10-11T00:00:00.000Z'),
        actorUserId: actor.id,
        reason: 'explicit third product registration',
      } as const;
      const product = await service.registerProductPolicy(input);
      expect((await service.registerProductPolicy(input)).id).toBe(product.id);
      const offering = await service.setOffering({
        workspaceId: workspace.id,
        groupId: group.id,
        actorUserId: actor.id,
        productPolicy: key,
        classification: 'FREE',
        expectedCurrentId: null,
        reason: 'explicit product assignment',
        now: new Date('2026-10-10T15:00:00.000Z'),
      });
      expect(offering).toMatchObject({
        productId: product.id,
        productPolicy: key,
        classification: 'FREE',
      });
      await expect(
        service.setOffering({
          workspaceId: workspace.id,
          groupId: group.id,
          actorUserId: actor.id,
          productPolicy: 'UNKNOWN_SERVICE',
          classification: 'PAID',
          expectedCurrentId: offering.id,
          reason: 'must fail closed',
        }),
      ).rejects.toThrow('REVIEW_REQUIRED');
      const paidOffering = await service.setOffering({
        workspaceId: workspace.id,
        groupId: group.id,
        actorUserId: actor.id,
        productPolicy: key,
        classification: 'PAID',
        expectedCurrentId: offering.id,
        reason: 'explicit paid classification before policy migration',
        now: new Date('2026-10-11T02:00:00.000Z'),
      });
      expect(paidOffering).toMatchObject({
        productPolicyVersionId: product.policyVersions[0]!.id,
        classification: 'PAID',
      });
      const preparation = await service.preparationDashboard({
        workspaceId: workspace.id,
        actorUserId: actor.id,
      });
      expect(preparation).toMatchObject({
        workspace: { id: workspace.id },
        readiness: {
          missingOfferingCount: 0,
          missingRegistrationCount: 0,
          contractHistoryReady: false,
          readyToSchedule: false,
        },
      });
      expect(preparation.services).toHaveLength(1);
      expect(preparation.services[0]).toMatchObject({
        groupId: group.id,
        currentOffering: { id: paidOffering.id },
      });
      expect(preparation.products.map((candidate) => candidate.key)).toContain(key);
      await expect(
        client.commercialServiceProductPolicyVersion.update({
          where: { id: product.policyVersions[0]!.id },
          data: { freeOfferingAllowed: false },
        }),
      ).rejects.toThrow('immutable');
      const revision = await service.reviseProductPolicy({
        productId: product.id,
        expectedLatestPolicyId: product.policyVersions[0]!.id,
        freeOfferingAllowed: false,
        requiredCapabilities: ['SOCIAL', 'AI_TRAINING'],
        effectiveFrom: new Date('2026-10-12T00:00:00.000Z'),
        actorUserId: actor.id,
        reason: 'schedule reviewed v2 policy',
        now: new Date('2026-10-11T00:00:00.000Z'),
      });
      expect(revision).toMatchObject({
        version: 2,
        freeOfferingAllowed: false,
        requiredCapabilities: ['SOCIAL', 'AI_TRAINING'],
      });
      await expect(
        service.migrateOfferingProductPolicy({
          workspaceId: workspace.id,
          offeringId: paidOffering.id,
          expectedCurrentPolicyVersionId: product.policyVersions[0]!.id,
          targetPolicyVersionId: revision.id,
          actorUserId: actor.id,
          reason: 'future policy must remain unavailable',
          confirmed: true,
          now: new Date('2026-10-11T01:00:00.000Z'),
        }),
      ).rejects.toThrow('OFFERING_POLICY_TARGET_NOT_EFFECTIVE');
      const migrationCandidates = await service.listOfferingPolicyMigrations(actor.id);
      expect(
        migrationCandidates.find((candidate) => candidate.id === paidOffering.id),
      ).toMatchObject({
        productPolicyVersionId: product.policyVersions[0]!.id,
        product: { id: product.id },
        targetPolicyReviews: [{ policyVersionId: revision.id, blockers: [] }],
      });
      const migrated = await service.migrateOfferingProductPolicy({
        workspaceId: workspace.id,
        offeringId: paidOffering.id,
        expectedCurrentPolicyVersionId: product.policyVersions[0]!.id,
        targetPolicyVersionId: revision.id,
        actorUserId: actor.id,
        reason: 'individually reviewed policy migration',
        confirmed: true,
        now: new Date('2026-10-12T01:00:00.000Z'),
      });
      expect(migrated).toMatchObject({
        productPolicyVersionId: revision.id,
        classification: 'PAID',
        reason: 'individually reviewed policy migration',
      });
      const filteredCandidates = await service.listOfferingPolicyMigrations(actor.id, {
        query: workspace.name,
        productKey: key,
      });
      expect(filteredCandidates.map((candidate) => candidate.id)).toContain(migrated.id);
      expect(
        await service.listOfferingPolicyMigrations(actor.id, { query: 'not-a-real-service' }),
      ).toHaveLength(0);
      const history = await service.listOfferingPolicyHistory(actor.id, {
        query: 'Third Watashi Works service',
        productKey: key,
      });
      expect(history.truncated).toBe(false);
      expect(history.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: paidOffering.id,
            productPolicyVersionId: product.policyVersions[0]!.id,
            actorDisplayName: actor.displayName,
            endsAt: new Date('2026-10-12T01:00:00.000Z'),
          }),
          expect.objectContaining({
            id: migrated.id,
            productPolicyVersionId: revision.id,
            actorDisplayName: actor.displayName,
            endsAt: null,
          }),
        ]),
      );
      expect(
        await client.oemOfferingPeriod.findUniqueOrThrow({ where: { id: paidOffering.id } }),
      ).toMatchObject({
        endsAt: new Date('2026-10-12T01:00:00.000Z'),
      });
      await expect(
        service.migrateOfferingProductPolicy({
          workspaceId: workspace.id,
          offeringId: paidOffering.id,
          expectedCurrentPolicyVersionId: product.policyVersions[0]!.id,
          targetPolicyVersionId: revision.id,
          actorUserId: actor.id,
          reason: 'stale retry must fail',
          confirmed: true,
          now: new Date('2026-10-12T02:00:00.000Z'),
        }),
      ).rejects.toThrow('STALE_OFFERING');
      await expect(
        service.reviseProductPolicy({
          productId: product.id,
          expectedLatestPolicyId: product.policyVersions[0]!.id,
          freeOfferingAllowed: true,
          requiredCapabilities: [],
          effectiveFrom: new Date('2026-10-13T00:00:00.000Z'),
          actorUserId: actor.id,
          reason: 'stale revision must fail',
          now: new Date('2026-10-11T00:00:00.000Z'),
        }),
      ).rejects.toThrow('STALE_PRODUCT_POLICY');
      const retired = await service.retireProduct({
        productId: product.id,
        expectedLatestPolicyId: revision.id,
        expectedUpdatedAt: product.updatedAt,
        actorUserId: actor.id,
        reason: 'stop future assignments only',
        confirmed: true,
        now: new Date('2026-10-11T01:00:00.000Z'),
      });
      expect(retired).toMatchObject({
        status: 'RETIRED',
        retiredByUserId: actor.id,
        retiredReason: 'stop future assignments only',
      });
      await expect(
        client.commercialServiceProduct.update({
          where: { id: product.id },
          data: {
            status: 'ACTIVE',
            retiredByUserId: null,
            retiredReason: null,
            retiredAt: null,
          },
        }),
      ).rejects.toThrow('retirement is immutable');
      const listed = await service.listProductPolicies(actor.id);
      expect(listed.find((candidate) => candidate.id === product.id)).toMatchObject({
        status: 'RETIRED',
        _count: { offeringPeriods: 1 },
      });
      await expect(
        service.setOffering({
          workspaceId: workspace.id,
          groupId: group.id,
          actorUserId: actor.id,
          productPolicy: key,
          classification: 'PAID',
          expectedCurrentId: migrated.id,
          reason: 'retired product cannot create a new offering period',
        }),
      ).rejects.toThrow('REVIEW_REQUIRED');
    });

    it('appends contract corrections, keeps the original, and blocks finalized-month changes', async () => {
      const actor = await client.user.create({
        data: { displayName: 'Synthetic contract history reviewer' },
      });
      await client.platformAdmin.create({
        data: { userId: actor.id, role: 'SUPER_ADMIN', status: 'ACTIVE' },
      });
      const workspace = await client.workspace.create({
        data: { name: `contract-correction-${randomUUID()}`, type: 'ORGANIZATION' },
      });
      await client.organizationCommercialContract.create({
        data: {
          workspaceId: workspace.id,
          status: 'ACTIVE',
          billingMode: 'MANUAL_INVOICE',
          billingName: 'Synthetic correction recipient',
          billingEmail: 'correction@example.invalid',
          updatedByUserId: actor.id,
        },
      });
      const original = await client.oemContractPeriod.create({
        data: {
          workspaceId: workspace.id,
          startsAt: new Date('2026-09-05T00:00:00.000Z'),
          endsAt: null,
          actorUserId: actor.id,
          reason: 'initial reviewed contract evidence',
        },
      });
      const service = new PrismaOemBillingAdminService(client);
      const correctionInput = {
        workspaceId: workspace.id,
        contractPeriodId: original.id,
        expectedStartsAt: original.startsAt,
        expectedEndsAt: original.endsAt,
        revisedStartsAt: new Date('2026-09-06T00:00:00.000Z'),
        revisedEndsAt: null,
        actorUserId: actor.id,
        reason: 'signed agreement confirms the corrected start',
        confirmed: true,
      } as const;
      const corrected = await service.correctContractPeriod(correctionInput);
      expect(corrected).toMatchObject({
        workspaceId: workspace.id,
        startsAt: correctionInput.revisedStartsAt,
        endsAt: null,
        supersedesId: original.id,
      });
      expect((await service.correctContractPeriod(correctionInput)).id).toBe(corrected.id);
      expect(
        await client.oemContractPeriod.findUniqueOrThrow({ where: { id: original.id } }),
      ).toMatchObject({ startsAt: original.startsAt, endsAt: null, supersedesId: null });
      const preparation = await service.preparationDashboard({
        workspaceId: workspace.id,
        actorUserId: actor.id,
      });
      expect(preparation.contractPeriods.map((period) => period.id)).toEqual([corrected.id]);
      expect(preparation.contractPeriodHistory).toHaveLength(2);
      expect(
        await client.commercialBillingAudit.count({
          where: {
            workspaceId: workspace.id,
            entityType: 'OEM_CONTRACT_PERIOD',
            entityId: corrected.id,
            action: 'CORRECTED',
          },
        }),
      ).toBe(1);

      await client.tenantMonthlyUsage.create({
        data: {
          workspaceId: workspace.id,
          periodStart: new Date('2026-09-01T00:00:00.000Z'),
          periodEnd: new Date('2026-10-01T00:00:00.000Z'),
          mau: 0,
          pricingTierKey: 'synthetic-zero',
          calculatedPriceYen: 0,
          pricingVersion: 'synthetic-contract-correction',
          status: 'FINALIZED',
          finalizedAt: new Date('2026-10-01T00:00:00.000Z'),
        },
      });
      await expect(
        service.correctContractPeriod({
          ...correctionInput,
          contractPeriodId: corrected.id,
          expectedStartsAt: corrected.startsAt,
          revisedStartsAt: new Date('2026-09-04T00:00:00.000Z'),
          reason: 'attempted correction across a finalized billing month',
        }),
      ).rejects.toThrow('FINALIZED_BILLING_PERIOD_IMMUTABLE');
      expect(await client.oemContractPeriod.count({ where: { workspaceId: workspace.id } })).toBe(
        2,
      );
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

    it('creates an idempotent setup fee invoice from reviewed agreement evidence and protects the snapshot', async () => {
      const actor = await client.user.create({
        data: { displayName: 'Synthetic setup fee reviewer' },
      });
      await client.platformAdmin.create({
        data: { userId: actor.id, role: 'SUPER_ADMIN', status: 'ACTIVE' },
      });
      const workspace = await client.workspace.create({
        data: { name: `oem-setup-fee-${randomUUID()}`, type: 'ORGANIZATION' },
      });
      const group = await client.group.create({
        data: { workspaceId: workspace.id, name: 'Synthetic setup fee service' },
      });
      const product = await client.commercialServiceProduct.findUniqueOrThrow({
        where: { key: 'HASSY' },
        include: { policyVersions: { where: { version: 1 } } },
      });
      await client.oemOfferingPeriod.create({
        data: {
          workspaceId: workspace.id,
          groupId: group.id,
          productId: product.id,
          productPolicyVersionId: product.policyVersions[0]!.id,
          productPolicy: product.key,
          classification: 'PAID',
          startsAt: new Date('2026-10-01T00:00:00.000Z'),
          actorUserId: actor.id,
          reason: 'synthetic reviewed setup fee offering',
        },
      });
      await client.organizationCommercialContract.create({
        data: {
          workspaceId: workspace.id,
          status: 'ACTIVE',
          billingMode: 'MANUAL_INVOICE',
          billingName: 'Synthetic billing recipient',
          billingEmail: 'billing@example.com',
          startsAt: new Date('2026-10-01T00:00:00.000Z'),
          updatedByUserId: actor.id,
        },
      });
      const input = {
        workspaceId: workspace.id,
        productId: product.id,
        actorUserId: actor.id,
        chargeKey: `SIGNED_${randomUUID().replaceAll('-', '').toUpperCase()}`,
        amountYen: 300_000,
        description: '合成OEM導入初期設定費用',
        agreementReference: `agreement-${randomUUID()}`,
        agreedAt: new Date('2026-10-10T00:00:00.000Z'),
        reason: '合成契約書の対象商品と税込金額を確認したため',
        now: new Date('2026-10-11T00:00:00.000Z'),
      };
      const service = new PrismaCommercialBillingService(client);
      const first = await service.prepareSetupFeeInvoice(input);
      const repeated = await service.prepareSetupFeeInvoice(input);
      expect(repeated.id).toBe(first.id);
      expect(first.kind).toBe('SETUP_FEE');
      expect(first.monthlyUsageId).toBeNull();
      expect(first.amountYen).toBe(300_000);
      const charge = await client.oemSetupFeeCharge.findFirstOrThrow({
        where: { workspaceId: workspace.id, chargeKey: input.chargeKey },
      });
      expect(await client.tenantInvoice.count({ where: { setupFeeChargeId: charge.id } })).toBe(1);
      await expect(
        client.oemSetupFeeCharge.update({
          where: { id: charge.id },
          data: { amountYen: 800_000 },
        }),
      ).rejects.toThrow('OEM setup fee charge is immutable');
    });

    it('RLS denies a non-owner role access to billing history and service product policies', async () => {
      await client.$executeRawUnsafe('CREATE ROLE test_oem_billing_public NOLOGIN');
      await client.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO test_oem_billing_public');
      await client.$executeRawUnsafe(
        'GRANT SELECT, INSERT ON oem_billing_policies, oem_registration_periods, oem_offering_periods, oem_contract_periods, oem_setup_fee_charges, commercial_pricing_audits, commercial_service_products, commercial_service_product_policy_versions TO test_oem_billing_public',
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
              products: bigint;
              productPolicies: bigint;
              setupFees: bigint;
            }>
          >`SELECT
            (SELECT count(*) FROM oem_billing_policies) AS policies,
            (SELECT count(*) FROM oem_registration_periods) AS registrations,
            (SELECT count(*) FROM oem_offering_periods) AS offerings,
            (SELECT count(*) FROM oem_contract_periods) AS contracts,
            (SELECT count(*) FROM commercial_pricing_audits) AS audits,
            (SELECT count(*) FROM commercial_service_products) AS products,
            (SELECT count(*) FROM commercial_service_product_policy_versions) AS "productPolicies",
            (SELECT count(*) FROM oem_setup_fee_charges) AS "setupFees"`;
        });
        expect(counts).toEqual([
          {
            policies: 0n,
            registrations: 0n,
            offerings: 0n,
            contracts: 0n,
            audits: 0n,
            products: 0n,
            productPolicies: 0n,
            setupFees: 0n,
          },
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
          'REVOKE ALL ON oem_billing_policies, oem_registration_periods, oem_offering_periods, oem_contract_periods, oem_setup_fee_charges, commercial_pricing_audits, commercial_service_products, commercial_service_product_policy_versions FROM test_oem_billing_public',
        );
        await client.$executeRawUnsafe(
          'REVOKE USAGE ON SCHEMA public FROM test_oem_billing_public',
        );
        await client.$executeRawUnsafe('DROP ROLE test_oem_billing_public');
      }
    });
  });
}
