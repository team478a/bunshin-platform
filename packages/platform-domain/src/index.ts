export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'DELETED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const AUTH_PROVIDERS = ['LINE', 'EMAIL'] as const;
export type AuthProviderType = (typeof AUTH_PROVIDERS)[number];

export const WORKSPACE_TYPES = ['PERSONAL', 'ORGANIZATION'] as const;
export type WorkspaceType = (typeof WORKSPACE_TYPES)[number];

export const WORKSPACE_STATUSES = ['ACTIVE', 'SUSPENDED', 'ARCHIVED'] as const;
export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];

export const WORKSPACE_ROLES = ['OWNER', 'ADMIN', 'MEMBER'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const MEMBERSHIP_STATUSES = ['ACTIVE', 'SUSPENDED', 'REVOKED'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const PLATFORM_ROLES = ['SUPER_ADMIN', 'OPERATOR', 'SUPPORT', 'READ_ONLY'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PLATFORM_ADMIN_STATUSES = ['ACTIVE', 'REVOKED'] as const;
export type PlatformAdminStatus = (typeof PLATFORM_ADMIN_STATUSES)[number];

export interface User {
  id: string;
  status: UserStatus;
  displayName: string;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Workspace {
  id: string;
  type: WorkspaceType;
  name: string;
  status: WorkspaceStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceMembership {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  status: MembershipStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlatformAdmin {
  id: string;
  userId: string;
  role: PlatformRole;
  status: PlatformAdminStatus;
  grantedAt: Date;
  revokedAt: Date | null;
}

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return (WORKSPACE_ROLES as readonly string[]).includes(value);
}

export function isPlatformRole(value: string): value is PlatformRole {
  return (PLATFORM_ROLES as readonly string[]).includes(value);
}

export const BUNSHIN_TYPES = ['COPY', 'EXPERT', 'BRAND', 'CHARACTER'] as const;
export type BunshinType = (typeof BUNSHIN_TYPES)[number];

export const BUNSHIN_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'] as const;
export type BunshinStatus = (typeof BUNSHIN_STATUSES)[number];

export const OBJECTIVE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number];

export const FACE_POLICIES = [
  'FACE_OK',
  'FACE_NG_VOICE_OK',
  'FACE_VOICE_NG',
  'FULL_ANONYMOUS',
] as const;
export type FacePolicy = (typeof FACE_POLICIES)[number];

export interface Bunshin {
  id: string;
  workspaceId: string;
  ownerUserId: string;
  name: string;
  slug: string;
  type: BunshinType;
  status: BunshinStatus;
  objectiveSummary: string;
  audienceSummary: string;
  personalitySummary: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export interface BunshinObjective {
  id: string;
  bunshinId: string;
  objectiveType: string;
  primaryGoal: string;
  kpiName: string | null;
  kpiTarget: string | null;
  kpiPeriod: string | null;
  priority: number;
  status: ObjectiveStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface BunshinAudience {
  id: string;
  bunshinId: string;
  label: string;
  ageRange: string | null;
  occupation: string | null;
  experienceLevel: string | null;
  painPoints: string[];
  desires: string[];
  excludedAudience: string[];
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BunshinPersonality {
  id: string;
  bunshinId: string;
  tone: string;
  formality: string;
  energyLevel: string;
  expertiseLevel: string;
  sentenceStyle: string;
  firstPerson: string;
  forbiddenExpressions: string[];
  preferredExpressions: string[];
  visualDirection: string | null;
  facePolicy: FacePolicy;
  createdAt: Date;
  updatedAt: Date;
}

export interface BunshinAggregate extends Bunshin {
  objectives: BunshinObjective[];
  audiences: BunshinAudience[];
  personality: BunshinPersonality | null;
}

export function normalizeBunshinSlug(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidBunshinSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80;
}

export function canManageBunshin(
  role: WorkspaceRole,
  actorUserId: string,
  ownerUserId: string,
): boolean {
  return role === 'OWNER' || role === 'ADMIN' || actorUserId === ownerUserId;
}
