import { ApplicationError } from '@bunshin/shared';
import { SOCIAL_PLATFORMS, type SocialPlatform } from './social-profile';

/**
 * Provider-independent publishing intent. Existing SocialProfile is an editorial
 * preference and PostRecord is a MANUAL outcome; neither is an OAuth connection.
 * Every identifier must be resolved against the authenticated owner at the Use Case boundary.
 */
export interface SocialPublicationIntent {
  workspaceId: string;
  serviceId: string;
  ownerUserId: string;
  bunshinId: string;
  socialProfileId: string;
  dailyMissionId: string;
  platform: SocialPlatform;
  connectedAccountId: string;
  contentRevision: number;
  caption: string;
  mediaAssetIds: readonly string[];
  scheduledAt: string | null;
  idempotencyKey: string;
}

/** An explicit, content- and destination-bound approval; not an OAuth consent. */
export interface SocialPublicationApproval {
  approvedByUserId: string;
  approvedAt: Date;
  expiresAt: Date;
  intent: SocialPublicationIntent;
}

export type SocialPublicationResult =
  | { status: 'PUBLISHED_VERIFIED'; externalPostId: string }
  | { status: 'PROCESSING' | 'UNKNOWN'; externalPostId: null };

export interface SocialPublishingProviderPort {
  /** Only the trusted scheduling/approval use case may call this Port. */
  publish(intent: SocialPublicationIntent, signal: AbortSignal): Promise<SocialPublicationResult>;
}

const sameKeys = [
  'workspaceId',
  'serviceId',
  'ownerUserId',
  'bunshinId',
  'socialProfileId',
  'dailyMissionId',
  'platform',
  'connectedAccountId',
  'contentRevision',
  'caption',
  'scheduledAt',
  'idempotencyKey',
] as const;

function invalid(message: string): never {
  throw new ApplicationError('VALIDATION_ERROR', message);
}

function denied(): never {
  throw new ApplicationError('FORBIDDEN', 'publication approval is missing or changed');
}

function validIntent(intent: SocialPublicationIntent) {
  const ids = [
    intent.workspaceId,
    intent.serviceId,
    intent.ownerUserId,
    intent.bunshinId,
    intent.socialProfileId,
    intent.dailyMissionId,
    intent.connectedAccountId,
    intent.idempotencyKey,
  ];
  if (
    ids.some((value) => typeof value !== 'string' || value.trim().length < 1 || value.length > 200)
  )
    invalid('invalid publishing scope');
  if (!SOCIAL_PLATFORMS.includes(intent.platform) || intent.platform === 'OTHER')
    invalid('invalid publishing platform');
  if (!Number.isSafeInteger(intent.contentRevision) || intent.contentRevision < 1)
    invalid('invalid publishing content revision');
  if (typeof intent.caption !== 'string' || [...intent.caption].length > 2200)
    invalid('invalid publishing caption');
  if (
    !Array.isArray(intent.mediaAssetIds) ||
    intent.mediaAssetIds.length < 1 ||
    intent.mediaAssetIds.length > 10 ||
    intent.mediaAssetIds.some((id) => typeof id !== 'string' || !id.trim() || id.length > 200)
  )
    invalid('invalid publishing media');
  if (
    intent.scheduledAt !== null &&
    (typeof intent.scheduledAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(intent.scheduledAt) ||
      !Number.isFinite(Date.parse(intent.scheduledAt)))
  )
    invalid('invalid publishing schedule');
}

/**
 * Pure preflight only. It cannot authenticate a user or publish anything.
 * Later Use Cases MUST reload and authorize the current owner, connected
 * account, media rights, capability and content revision before external I/O.
 */
export function assertApprovedSocialPublication(
  intent: SocialPublicationIntent,
  approval: SocialPublicationApproval | null,
  now: Date,
): SocialPublicationIntent {
  validIntent(intent);
  if (!Number.isFinite(now.getTime())) invalid('invalid publishing clock');
  if (
    !approval ||
    !(approval.approvedAt instanceof Date) ||
    !(approval.expiresAt instanceof Date) ||
    !Number.isFinite(approval.approvedAt.getTime()) ||
    !Number.isFinite(approval.expiresAt.getTime()) ||
    approval.approvedAt > now ||
    approval.expiresAt <= now ||
    approval.approvedByUserId !== intent.ownerUserId
  )
    denied();
  const approved = approval.intent;
  if (!approved || sameKeys.some((key) => approved[key] !== intent[key])) denied();
  if (
    !Array.isArray(approved.mediaAssetIds) ||
    approved.mediaAssetIds.length !== intent.mediaAssetIds.length ||
    approved.mediaAssetIds.some((id, index) => id !== intent.mediaAssetIds[index])
  )
    denied();
  return { ...intent, mediaAssetIds: [...intent.mediaAssetIds] };
}
