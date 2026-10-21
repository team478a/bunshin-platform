import { ApplicationError } from '@bunshin/shared';

export const SIDE_HUSTLE_CATALOG_VERSION = 'SIDE_HUSTLE_CATALOG_V1';

export const SIDE_HUSTLE_CATEGORIES = [
  'SKILL_SERVICE',
  'AI_ASSISTED',
  'CONTENT',
  'KNOWLEDGE',
  'PRODUCT',
  'SALES',
] as const;
export const SIDE_HUSTLE_COST_TIERS = ['NONE', 'UNDER_10K', 'UNDER_50K', 'OVER_50K'] as const;
export const SIDE_HUSTLE_INFO_BASES = ['GENERAL_ESTIMATE', 'OPERATOR_VERIFIED'] as const;
export const SIDE_HUSTLE_REQUIREMENT_LEVELS = ['REQUIRED', 'OPTIONAL', 'NONE'] as const;
export const SIDE_HUSTLE_STATUSES = ['DRAFT', 'ACTIVE', 'RETIRED'] as const;
export const SIDE_HUSTLE_REQUIREMENT_KINDS = [
  'LEGAL',
  'PLATFORM_TERMS',
  'EMPLOYMENT',
  'TAX',
] as const;
export const SIDE_HUSTLE_DEVICES = ['PC_REQUIRED', 'SMARTPHONE_OK'] as const;

export type SideHustleCategory = (typeof SIDE_HUSTLE_CATEGORIES)[number];
export type SideHustleCostTier = (typeof SIDE_HUSTLE_COST_TIERS)[number];
export type SideHustleInfoBasis = (typeof SIDE_HUSTLE_INFO_BASES)[number];
export type SideHustleRequirementLevel = (typeof SIDE_HUSTLE_REQUIREMENT_LEVELS)[number];
export type SideHustleStatus = (typeof SIDE_HUSTLE_STATUSES)[number];
export type SideHustleRequirementKind = (typeof SIDE_HUSTLE_REQUIREMENT_KINDS)[number];
export type SideHustleDevice = (typeof SIDE_HUSTLE_DEVICES)[number];

export interface SideHustleDefinition {
  readonly key: string;
  readonly revision: number;
  readonly status: SideHustleStatus;
  readonly category: SideHustleCategory;
  readonly name: string;
  readonly summary: string;
  readonly monetization: string;
  readonly initialCost: { readonly tier: SideHustleCostTier; readonly basis: SideHustleInfoBasis };
  readonly monthlyCost: { readonly tier: SideHustleCostTier; readonly basis: SideHustleInfoBasis };
  readonly weeklyHoursMin: { readonly hours: number; readonly basis: SideHustleInfoBasis };
  readonly difficulty: 1 | 2 | 3;
  readonly requiredSkills: readonly string[];
  readonly workStyle: {
    readonly faceExposure: SideHustleRequirementLevel;
    readonly snsPosting: SideHustleRequirementLevel;
    readonly clientInteraction: SideHustleRequirementLevel;
    readonly salesOutreach: SideHustleRequirementLevel;
    readonly inventory: SideHustleRequirementLevel;
    readonly device: SideHustleDevice;
  };
  readonly typicalFlow: readonly string[];
  readonly risks: readonly string[];
  readonly requirements: readonly {
    readonly kind: SideHustleRequirementKind;
    readonly text: string;
  }[];
  readonly boundaries: readonly string[];
  readonly checkedAt: string | null;
}

export interface SideHustleExcludedArea {
  readonly key: string;
  readonly label: string;
  readonly reason: string;
}

export const SIDE_HUSTLE_EXCLUDED_AREAS: readonly SideHustleExcludedArea[] = Object.freeze(
  [
    {
      key: 'INVESTMENT_SPECULATION',
      label: '投資・FX・暗号資産・ギャンブル',
      reason: '元本割れの危険があり、副業支援の範囲を超えるため',
    },
    {
      key: 'MLM_REFERRAL_DRIVEN',
      label: 'MLM・ネットワークビジネス・紹介報酬が主目的のもの',
      reason: '人間関係や金銭のトラブルが起きやすいため',
    },
    {
      key: 'HIGH_PRICE_SCHOOL_RECRUITING',
      label: '高額スクール・情報商材の購入や勧誘が前提のもの',
      reason: '費用回収の見込みが立たず、勧誘トラブルにつながるため',
    },
    {
      key: 'LICENSED_PROFESSIONAL_WORK',
      label: '資格や登録が必要な専門業務（士業、医療、不動産仲介など）',
      reason: '資格のない人が行えない業務を含むため',
    },
    {
      key: 'REGULATED_MANUFACTURING',
      label: '食品・化粧品・医薬品等の製造販売',
      reason: '営業許可や製造販売業の許可が必要になるため',
    },
    {
      key: 'USED_GOODS_RESALE_SOURCING',
      label: '中古品を仕入れて転売すること',
      reason: '古物商許可が必要になるため。自宅の不用品を売ることは対象に含む',
    },
    {
      key: 'ADULT_CONTENT',
      label: '成人向けコンテンツ',
      reason: '本サービスの対象外のため',
    },
    {
      key: 'PERSONAL_DATA_OR_ACCOUNT_TRADING',
      label: '個人情報・アカウント・レビューの売買や代行投稿',
      reason: '規約違反や法令違反のおそれが高いため',
    },
  ].map((area) => Object.freeze(area)),
);

const GUARANTEE_EXPRESSIONS = [
  '必ず稼げ',
  '確実に稼げ',
  '誰でも稼げ',
  '絶対',
  '保証',
  '月収',
  '万円稼',
] as const;

const validationError = (field: string): never => {
  throw new ApplicationError('VALIDATION_ERROR', `invalid side hustle catalog: ${field}`);
};

const record = (value: unknown, field: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) validationError(field);
  return value as Record<string, unknown>;
};

const text = (value: unknown, field: string, maximum: number): string => {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maximum ||
    value.trim() !== value
  )
    validationError(field);
  return value as string;
};

const enumValue = <T extends string>(value: unknown, values: readonly T[], field: string): T => {
  if (typeof value !== 'string' || !values.includes(value as T)) validationError(field);
  return value as T;
};

const integer = (value: unknown, field: string, minimum: number, maximum: number): number => {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum)
    validationError(field);
  return value as number;
};

const textArray = (
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  textMaximum: number,
): readonly string[] => {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum)
    validationError(field);
  return Object.freeze(
    (value as unknown[]).map((entry, index) => text(entry, `${field}[${index}]`, textMaximum)),
  );
};

const cost = (value: unknown, field: string) => {
  const input = record(value, field);
  return Object.freeze({
    tier: enumValue(input.tier, SIDE_HUSTLE_COST_TIERS, `${field}.tier`),
    basis: enumValue(input.basis, SIDE_HUSTLE_INFO_BASES, `${field}.basis`),
  });
};

const validDate = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) validationError(field);
  const dateValue = value as string;
  const parsed = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== dateValue)
    validationError(field);
  return dateValue;
};

const rejectsGuarantee = (value: string, field: string) => {
  if (GUARANTEE_EXPRESSIONS.some((expression) => value.includes(expression)))
    validationError(field);
};

export function validateSideHustleCatalog(definitions: unknown): SideHustleDefinition[] {
  if (!Array.isArray(definitions)) validationError('definitions');
  const keys = new Set<string>();
  const validated = (definitions as unknown[]).map((definition, index): SideHustleDefinition => {
    const field = `definitions[${index}]`;
    const input = record(definition, field);
    const key = text(input.key, `${field}.key`, 80);
    if (!/^[A-Z][A-Z0-9_]{0,79}$/.test(key) || keys.has(key)) validationError(`${field}.key`);
    keys.add(key);
    const status = enumValue(input.status, SIDE_HUSTLE_STATUSES, `${field}.status`);
    const summary = text(input.summary, `${field}.summary`, 200);
    const monetization = text(input.monetization, `${field}.monetization`, 200);
    const typicalFlow = textArray(input.typicalFlow, `${field}.typicalFlow`, 3, 6, 80);
    const risks = textArray(input.risks, `${field}.risks`, 1, 5, 120);
    rejectsGuarantee(summary, `${field}.summary`);
    rejectsGuarantee(monetization, `${field}.monetization`);
    typicalFlow.forEach((entry, entryIndex) =>
      rejectsGuarantee(entry, `${field}.typicalFlow[${entryIndex}]`),
    );
    risks.forEach((entry, entryIndex) => rejectsGuarantee(entry, `${field}.risks[${entryIndex}]`));

    const weeklyHours = record(input.weeklyHoursMin, `${field}.weeklyHoursMin`);
    const workStyle = record(input.workStyle, `${field}.workStyle`);
    if (!Array.isArray(input.requirements) || input.requirements.length > 5)
      validationError(`${field}.requirements`);
    const requirements = Object.freeze(
      (input.requirements as unknown[]).map((requirement, requirementIndex) => {
        const requirementField = `${field}.requirements[${requirementIndex}]`;
        const entry = record(requirement, requirementField);
        return Object.freeze({
          kind: enumValue(entry.kind, SIDE_HUSTLE_REQUIREMENT_KINDS, `${requirementField}.kind`),
          text: text(entry.text, `${requirementField}.text`, 160),
        });
      }),
    );
    const checkedAt =
      input.checkedAt === null ? null : validDate(input.checkedAt, `${field}.checkedAt`);
    if (status === 'ACTIVE' && checkedAt === null) validationError(`${field}.checkedAt`);

    return Object.freeze({
      key,
      revision: integer(input.revision, `${field}.revision`, 1, Number.MAX_SAFE_INTEGER),
      status,
      category: enumValue(input.category, SIDE_HUSTLE_CATEGORIES, `${field}.category`),
      name: text(input.name, `${field}.name`, 40),
      summary,
      monetization,
      initialCost: cost(input.initialCost, `${field}.initialCost`),
      monthlyCost: cost(input.monthlyCost, `${field}.monthlyCost`),
      weeklyHoursMin: Object.freeze({
        hours: integer(weeklyHours.hours, `${field}.weeklyHoursMin.hours`, 1, 40),
        basis: enumValue(
          weeklyHours.basis,
          SIDE_HUSTLE_INFO_BASES,
          `${field}.weeklyHoursMin.basis`,
        ),
      }),
      difficulty: integer(input.difficulty, `${field}.difficulty`, 1, 3) as 1 | 2 | 3,
      requiredSkills: textArray(input.requiredSkills, `${field}.requiredSkills`, 1, 5, 60),
      workStyle: Object.freeze({
        faceExposure: enumValue(
          workStyle.faceExposure,
          SIDE_HUSTLE_REQUIREMENT_LEVELS,
          `${field}.workStyle.faceExposure`,
        ),
        snsPosting: enumValue(
          workStyle.snsPosting,
          SIDE_HUSTLE_REQUIREMENT_LEVELS,
          `${field}.workStyle.snsPosting`,
        ),
        clientInteraction: enumValue(
          workStyle.clientInteraction,
          SIDE_HUSTLE_REQUIREMENT_LEVELS,
          `${field}.workStyle.clientInteraction`,
        ),
        salesOutreach: enumValue(
          workStyle.salesOutreach,
          SIDE_HUSTLE_REQUIREMENT_LEVELS,
          `${field}.workStyle.salesOutreach`,
        ),
        inventory: enumValue(
          workStyle.inventory,
          SIDE_HUSTLE_REQUIREMENT_LEVELS,
          `${field}.workStyle.inventory`,
        ),
        device: enumValue(workStyle.device, SIDE_HUSTLE_DEVICES, `${field}.workStyle.device`),
      }),
      typicalFlow,
      risks,
      requirements,
      boundaries: textArray(input.boundaries, `${field}.boundaries`, 0, 3, 120),
      checkedAt,
    });
  });
  return Object.freeze(validated) as unknown as SideHustleDefinition[];
}
