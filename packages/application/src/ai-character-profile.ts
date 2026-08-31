import { ApplicationError } from '@bunshin/shared';

export type AiCharacterProfileScope = 'PLATFORM' | 'SERVICE' | 'PERSONAL';

export interface AiCharacterProfileRepository {
  createProfile(input: {
    workspaceId: string;
    groupId: string | null;
    ownerUserId: string | null;
    actorUserId: string;
    scope: AiCharacterProfileScope;
    name: string;
    description: string;
  }): Promise<{ id: string } | null>;
  createLicenseVersion(input: {
    workspaceId: string;
    groupId: string | null;
    actorUserId: string;
    characterProfileId: string;
    rightsHolder: string;
    commercialUseAllowed: boolean;
    derivativeUseAllowed: boolean;
    redistributionAllowed: boolean;
    terms: string;
    startsAt: Date;
    endsAt: Date | null;
    consentRecordedAt: Date;
  }): Promise<{ id: string; version: number } | null>;
  createVersion(input: {
    workspaceId: string;
    groupId: string | null;
    actorUserId: string;
    characterProfileId: string;
    licenseVersionId: string;
    appearance: string;
    worldSetting: string;
    basePrompt: string;
    negativePrompt: string;
    safetyRules: string[];
    publish: boolean;
  }): Promise<{ id: string; version: number } | null>;
  addReferenceAsset(input: {
    workspaceId: string;
    groupId: string | null;
    actorUserId: string;
    characterProfileVersionId: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    rightsConfirmedAt: Date;
  }): Promise<{ id: string; storageKey: string } | null>;
}

const required = (value: string, field: string, max: number) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

export class AiCharacterProfileService {
  constructor(private readonly repository: AiCharacterProfileRepository) {}

  async createProfile(input: Parameters<AiCharacterProfileRepository['createProfile']>[0]) {
    const ownershipValid =
      (input.scope === 'PLATFORM' && input.groupId === null && input.ownerUserId === null) ||
      (input.scope === 'SERVICE' && input.groupId !== null && input.ownerUserId === null) ||
      (input.scope === 'PERSONAL' && input.groupId !== null && input.ownerUserId !== null);
    if (!ownershipValid) throw new ApplicationError('VALIDATION_ERROR', 'invalid character owner');
    const result = await this.repository.createProfile({
      ...input,
      name: required(input.name, 'name', 160),
      description: required(input.description, 'description', 1000),
    });
    if (!result) throw new ApplicationError('FORBIDDEN', 'character profile denied');
    return result;
  }

  async createLicenseVersion(
    input: Parameters<AiCharacterProfileRepository['createLicenseVersion']>[0],
  ) {
    if (input.endsAt !== null && input.startsAt >= input.endsAt)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid license period');
    if (input.consentRecordedAt > new Date())
      throw new ApplicationError('VALIDATION_ERROR', 'invalid consent time');
    const result = await this.repository.createLicenseVersion({
      ...input,
      rightsHolder: required(input.rightsHolder, 'rightsHolder', 300),
      terms: required(input.terms, 'terms', 3000),
    });
    if (!result) throw new ApplicationError('FORBIDDEN', 'character license denied');
    return result;
  }

  async createVersion(input: Parameters<AiCharacterProfileRepository['createVersion']>[0]) {
    const rules = [...new Set(input.safetyRules.map((rule) => rule.trim()).filter(Boolean))];
    if (rules.length === 0) throw new ApplicationError('VALIDATION_ERROR', 'safety rules required');
    const result = await this.repository.createVersion({
      ...input,
      appearance: required(input.appearance, 'appearance', 2000),
      worldSetting: required(input.worldSetting, 'worldSetting', 2000),
      basePrompt: required(input.basePrompt, 'basePrompt', 5000),
      negativePrompt: required(input.negativePrompt, 'negativePrompt', 3000),
      safetyRules: rules,
    });
    if (!result) throw new ApplicationError('FORBIDDEN', 'character version denied');
    return result;
  }

  async addReferenceAsset(input: Parameters<AiCharacterProfileRepository['addReferenceAsset']>[0]) {
    const filename = required(input.originalFilename, 'originalFilename', 255);
    if (/[\\/]/.test(filename))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid originalFilename');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(input.mimeType))
      throw new ApplicationError('VALIDATION_ERROR', 'unsupported reference image');
    if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > 20_000_000)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid reference image size');
    if (!/^[0-9a-f]{64}$/.test(input.sha256))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid reference image checksum');
    const result = await this.repository.addReferenceAsset({
      ...input,
      originalFilename: filename,
    });
    if (!result) throw new ApplicationError('FORBIDDEN', 'reference image denied');
    return result;
  }
}
