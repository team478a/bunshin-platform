import type { ServiceFoundationRecord } from '@bunshin/application';

export function fortuneReferralAvailable(
  configuration: Pick<ServiceFoundationRecord, 'visibility' | 'registration'>,
) {
  return (
    configuration.visibility === 'PUBLIC' &&
    configuration.registration.referralEnabled &&
    ['PUBLIC', 'APPROVAL_REQUIRED'].includes(configuration.registration.mode)
  );
}
