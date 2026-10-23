export const SIDE_HUSTLE_CATEGORIES = [
  'SKILL_SERVICE',
  'AI_ASSISTED',
  'CONTENT',
  'KNOWLEDGE',
  'PRODUCT',
  'SALES',
  'OTHER',
] as const;
export const SIDE_HUSTLE_COST_TIERS = ['NONE', 'UNDER_10K', 'UNDER_50K', 'OVER_50K'] as const;
export const SIDE_HUSTLE_REQUIREMENT_LEVELS = ['REQUIRED', 'OPTIONAL', 'NONE'] as const;
export const SIDE_HUSTLE_REQUIREMENT_KINDS = [
  'LEGAL',
  'PLATFORM_TERMS',
  'EMPLOYMENT',
  'TAX',
] as const;
export const SIDE_HUSTLE_DEVICES = ['PC_REQUIRED', 'SMARTPHONE_OK'] as const;

export type SideHustleCategory = (typeof SIDE_HUSTLE_CATEGORIES)[number];
export type SideHustleCostTier = (typeof SIDE_HUSTLE_COST_TIERS)[number];
export type SideHustleRequirementLevel = (typeof SIDE_HUSTLE_REQUIREMENT_LEVELS)[number];
export type SideHustleRequirementKind = (typeof SIDE_HUSTLE_REQUIREMENT_KINDS)[number];
export type SideHustleDevice = (typeof SIDE_HUSTLE_DEVICES)[number];
