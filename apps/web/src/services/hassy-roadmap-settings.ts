import { z } from 'zod';
import { ApplicationError } from '@bunshin/shared';
import {
  createHassyMemberRoadmapDefinition,
  HASSY_MEMBER_ROADMAP_POLICY,
} from './hassy-growth-policy';
import type { MemberUsageScope } from '@bunshin/application';

export const HASSY_ROADMAP_POLICY_CONFIG_KEY = 'hassyRoadmapPolicy';
export const HASSY_ROADMAP_POLICY_VERSION = 'hassy-roadmap-policy-v1';
export const hassyRoadmapSettingsSchema = z
  .object({
    generated: z.number().int().min(1).max(1000),
    decisions: z.number().int().min(1).max(1000),
    activeDays: z.number().int().min(1).max(365),
    validReferrals: z.number().int().min(0).max(1000),
  })
  .strict();
export type HassyRoadmapSettings = z.infer<typeof hassyRoadmapSettingsSchema>;
const storedSchema = z
  .object({
    version: z.literal(HASSY_ROADMAP_POLICY_VERSION),
    revision: z.number().int().min(1).max(2_147_483_646),
    headquarters: hassyRoadmapSettingsSchema,
    service: hassyRoadmapSettingsSchema.nullable(),
    lastRequest: z
      .object({ commandId: z.uuid(), fingerprint: z.string().regex(/^[0-9a-f]{64}$/) })
      .strict(),
  })
  .strict();
export interface HassyRoadmapPolicy {
  version: typeof HASSY_ROADMAP_POLICY_VERSION;
  revision: number;
  headquarters: HassyRoadmapSettings | null;
  service: HassyRoadmapSettings | null;
  lastRequest?: { commandId: string; fingerprint: string };
}
export interface HassyRoadmapPolicyView extends Omit<HassyRoadmapPolicy, 'lastRequest'> {
  effective: HassyRoadmapSettings;
  permissions: { headquarters: boolean; service: boolean };
}
export const hassyRoadmapPolicyViewSchema = z
  .object({
    version: z.literal(HASSY_ROADMAP_POLICY_VERSION),
    revision: z.number().int().min(0).max(2_147_483_646),
    headquarters: hassyRoadmapSettingsSchema.nullable(),
    service: hassyRoadmapSettingsSchema.nullable(),
    effective: hassyRoadmapSettingsSchema,
    permissions: z.object({ headquarters: z.boolean(), service: z.boolean() }).strict(),
  })
  .strict();
export function defaultHassyRoadmapSettings(): HassyRoadmapSettings {
  return { generated: 1, decisions: 1, activeDays: 3, validReferrals: 0 };
}
export function normalizeHassyRoadmapSettings(value: unknown): HassyRoadmapSettings {
  const result = hassyRoadmapSettingsSchema.safeParse(value);
  if (!result.success)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid Hassy roadmap settings');
  return result.data;
}
export function readHassyRoadmapPolicy(raw: unknown): HassyRoadmapPolicy {
  if (raw === undefined)
    return {
      version: HASSY_ROADMAP_POLICY_VERSION,
      revision: 0,
      headquarters: null,
      service: null,
    };
  const result = storedSchema.safeParse(raw);
  if (!result.success)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid Hassy roadmap policy');
  return result.data;
}
export function effectiveHassyRoadmapSettings(policy: HassyRoadmapPolicy): HassyRoadmapSettings {
  const hq = policy.headquarters ?? defaultHassyRoadmapSettings(),
    service = policy.service;
  if (!service) return { ...hq };
  return {
    generated: Math.max(hq.generated, service.generated),
    decisions: Math.max(hq.decisions, service.decisions),
    activeDays: Math.max(hq.activeDays, service.activeDays),
    validReferrals:
      hq.validReferrals === 0 || service.validReferrals === 0
        ? 0
        : Math.max(hq.validReferrals, service.validReferrals),
  };
}
export function assertServiceHassyRoadmapSettings(
  settings: HassyRoadmapSettings,
  hq: HassyRoadmapSettings | null,
) {
  if (
    !hq ||
    settings.generated < hq.generated ||
    settings.decisions < hq.decisions ||
    settings.activeDays < hq.activeDays ||
    (settings.validReferrals > 0 &&
      (hq.validReferrals === 0 || settings.validReferrals < hq.validReferrals))
  )
    throw new ApplicationError('FORBIDDEN', '本部が許可した達成条件の範囲を確認してください。');
}
/** Hassy product definition only; never an entitlement or reward grant. */
export function createConfiguredHassyRoadmapDefinition(
  policy: HassyRoadmapPolicy,
  scope: MemberUsageScope,
) {
  const definition = createHassyMemberRoadmapDefinition();
  definition.scope = { workspaceId: scope.workspaceId, serviceId: scope.serviceId };
  if (policy.revision === 0) return definition;
  const settings = effectiveHassyRoadmapSettings(policy);
  definition.version = `hassy-roadmap-managed-v1-r${policy.revision}`;
  for (const stage of definition.stages)
    for (const item of stage.milestones)
      if (item.criterion.kind === 'USAGE') item.criterion.target = settings[item.criterion.metric];
  if (settings.validReferrals > 0) {
    const last = definition.stages[4]!;
    definition.stages = definition.stages.map((stage) =>
      stage === last
        ? {
            ...stage,
            milestones: [
              ...stage.milestones,
              {
                id: 'REFERRAL_MILESTONE',
                title: '紹介の達成目標（任意）',
                criterion: { kind: 'VALID_REFERRALS' as const, target: settings.validReferrals },
              },
            ],
          }
        : stage,
    );
  }
  HASSY_MEMBER_ROADMAP_POLICY.validateDefinition(definition, scope);
  return definition;
}
