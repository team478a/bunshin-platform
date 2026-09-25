export interface ServiceGenerationKnowledgeScope {
  workspaceId: string;
  groupId: string;
  actorUserId: string;
  bunshinId?: string;
}

export const MISSION_EXECUTION_RESULT_TYPES = [
  'EXECUTION_COMPLETED',
  'EXECUTION_PARTIAL',
  'EXECUTION_NOT_COMPLETED',
  'EXECUTION_HELP_NEEDED',
] as const;

export type MissionExecutionResultType = (typeof MISSION_EXECUTION_RESULT_TYPES)[number];

export interface ServiceBusinessProfileForGeneration {
  industryKey: string;
  industryName: string;
  otherIndustryText: string | null;
  businessName: string;
  region: string | null;
  productService: string;
  primaryPurpose: string;
  targetAudience: string;
  websiteUrl: string | null;
  businessFeatures: string | null;
  priceInformation: string | null;
  preferredTone: string | null;
  requiredContent: string | null;
  forbiddenContent: string | null;
}
