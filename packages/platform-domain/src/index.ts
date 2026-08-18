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
