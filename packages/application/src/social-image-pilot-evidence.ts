import { ApplicationError } from '@bunshin/shared';

export const SOCIAL_IMAGE_PILOT_EVIDENCE_CHECKS = [
  'PLAN_APPROVAL',
  'STORAGE_RETENTION',
  'MOBILE_E2E',
  'SECURITY_ISOLATION',
  'TEN_THEME_VALIDATION',
  'FINAL_APPROVAL',
] as const;

export type SocialImagePilotEvidenceCheckKey = (typeof SOCIAL_IMAGE_PILOT_EVIDENCE_CHECKS)[number];

export interface SocialImagePilotEvidenceRecord {
  id: string;
  workspaceId: string;
  groupId: string;
  pilotId: string;
  checkKey: SocialImagePilotEvidenceCheckKey;
  action: 'RECORDED' | 'REVOKED';
  reason: string;
  evidenceUrl: string | null;
  actorUserId: string;
  occurredAt: Date;
}

export interface SocialImagePilotEvidenceRepository {
  list(input: {
    workspaceId: string;
    groupId: string;
    pilotId: string;
    actorUserId: string;
  }): Promise<SocialImagePilotEvidenceRecord[] | null>;
  append(
    input: Omit<SocialImagePilotEvidenceRecord, 'id' | 'occurredAt'>,
  ): Promise<SocialImagePilotEvidenceRecord | null>;
}

function evidenceUrl(value: string | null | undefined) {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid evidence URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid evidence URL');
  if (
    !['github.com', 'vercel.com', 'supabase.com'].some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    )
  )
    throw new ApplicationError('VALIDATION_ERROR', 'evidence URL is not allowed');
  return url.toString();
}

export class ListSocialImagePilotEvidence {
  constructor(private readonly repository: SocialImagePilotEvidenceRepository) {}

  async execute(input: {
    workspaceId: string;
    groupId: string;
    pilotId: string;
    actorUserId: string;
  }) {
    const records = await this.repository.list(input);
    if (!records) throw new ApplicationError('NOT_FOUND', 'image pilot not found');
    return records;
  }
}

export class RecordSocialImagePilotEvidence {
  constructor(private readonly repository: SocialImagePilotEvidenceRepository) {}

  async execute(input: {
    workspaceId: string;
    groupId: string;
    pilotId: string;
    actorUserId: string;
    checkKey: SocialImagePilotEvidenceCheckKey;
    action: 'RECORDED' | 'REVOKED';
    reason: string;
    evidenceUrl?: string | null;
  }) {
    const reason = input.reason.trim();
    if (!SOCIAL_IMAGE_PILOT_EVIDENCE_CHECKS.includes(input.checkKey))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid image pilot evidence');
    if (reason.length < 10 || reason.length > 1000)
      throw new ApplicationError('VALIDATION_ERROR', 'reason must be 10 to 1000 characters');
    const record = await this.repository.append({
      ...input,
      reason,
      evidenceUrl: evidenceUrl(input.evidenceUrl),
    });
    if (!record)
      throw new ApplicationError(
        input.checkKey === 'FINAL_APPROVAL' ? 'CONFLICT' : 'NOT_FOUND',
        input.checkKey === 'FINAL_APPROVAL'
          ? 'all image pilot checks must be current before final approval'
          : 'image pilot not found',
      );
    return record;
  }
}
