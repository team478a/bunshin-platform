export type ServiceRegistrationAccess = 'PUBLIC' | 'INVITATION_ONLY' | 'CLOSED';
export type ServiceRegistrationApproval = 'AUTO' | 'MANUAL';
export type ServiceRegistrationMode =
  'PUBLIC' | 'INVITATION_ONLY' | 'INVITATION_APPROVAL_REQUIRED' | 'APPROVAL_REQUIRED' | 'CLOSED';

export function serviceRegistrationPolicyFromMode(mode: ServiceRegistrationMode): {
  access: ServiceRegistrationAccess;
  approval: ServiceRegistrationApproval;
} {
  switch (mode) {
    case 'PUBLIC':
      return { access: 'PUBLIC', approval: 'AUTO' };
    case 'APPROVAL_REQUIRED':
      return { access: 'PUBLIC', approval: 'MANUAL' };
    case 'INVITATION_ONLY':
      return { access: 'INVITATION_ONLY', approval: 'AUTO' };
    case 'INVITATION_APPROVAL_REQUIRED':
      return { access: 'INVITATION_ONLY', approval: 'MANUAL' };
    case 'CLOSED':
      return { access: 'CLOSED', approval: 'AUTO' };
  }
}

export function serviceRegistrationModeFromPolicy(
  access: ServiceRegistrationAccess,
  approval: ServiceRegistrationApproval,
): ServiceRegistrationMode {
  if (access === 'CLOSED') return 'CLOSED';
  if (access === 'INVITATION_ONLY')
    return approval === 'MANUAL' ? 'INVITATION_APPROVAL_REQUIRED' : 'INVITATION_ONLY';
  return approval === 'MANUAL' ? 'APPROVAL_REQUIRED' : 'PUBLIC';
}
