import { ApplicationError } from '@bunshin/shared';

export const validateSocialImageUuid = (value: string, field: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value;
};

export const validateSocialImageText = (value: string, field: string, max: number) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

export const validateOptionalSocialImageUuid = (value: string | null, field: string) =>
  value ? validateSocialImageUuid(value, field) : null;

export const socialImageStorageScope = (input: {
  workspaceId: string;
  groupId: string;
  actorUserId: string;
  requestId: string;
  mediaId: string;
}) => ({
  workspaceId: validateSocialImageUuid(input.workspaceId, 'workspaceId'),
  groupId: validateSocialImageUuid(input.groupId, 'groupId'),
  ownerUserId: validateSocialImageUuid(input.actorUserId, 'actorUserId'),
  requestId: validateSocialImageUuid(input.requestId, 'requestId'),
  mediaId: validateSocialImageUuid(input.mediaId, 'mediaId'),
});
