import { ApplicationError } from '@bunshin/shared';

export function validateAdminReason(value: string) {
  const reason = value.trim();
  if (reason.length < 3 || reason.length > 500)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid reason');
  return reason;
}
