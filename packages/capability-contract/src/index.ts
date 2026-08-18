export type CapabilityType =
  'SOCIAL' | 'BLOG' | 'LINE_MARKETING' | 'LP' | 'LEAD_GENERATION' | 'SALES' | 'CUSTOMER_SUPPORT';

export const CAPABILITY_ASSIGNMENT_STATUSES = ['ACTIVE', 'SUSPENDED', 'LOCKED'] as const;
export type CapabilityAssignmentStatus = (typeof CAPABILITY_ASSIGNMENT_STATUSES)[number];

export interface BunshinCapabilityAssignment {
  id: string;
  workspaceId: string;
  bunshinId: string;
  capabilityType: CapabilityType;
  status: CapabilityAssignmentStatus;
  config: unknown;
  assignedByUserId: string;
  activatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CapabilityDefinition {
  type: CapabilityType;
  version: string;
}

export interface CapabilityExecutor<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}
