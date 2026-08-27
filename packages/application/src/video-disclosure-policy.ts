import { ApplicationError } from '@bunshin/shared';
import type { LineConfigurationEnvironment } from './index';
import type { VideoPlatform } from './video-core';

export type VideoDisclosurePolicyStatus = 'DRAFT' | 'ACTIVE' | 'SUPERSEDED';

export interface VideoDisclosurePolicy {
  id: string;
  environment: LineConfigurationEnvironment;
  platform: VideoPlatform;
  version: number;
  status: VideoDisclosurePolicyStatus;
  disclosureText: string;
  hashtags: string[];
  guidance: string;
  outputMetadata: Record<string, string>;
  changeReason: string;
  activationReason: string | null;
  createdAt: Date;
  activatedAt: Date | null;
  supersededAt: Date | null;
}

export interface VideoDisclosurePolicyRepository {
  createDraft(input: {
    environment: LineConfigurationEnvironment;
    platform: VideoPlatform;
    disclosureText: string;
    hashtags: string[];
    guidance: string;
    outputMetadata: Record<string, string>;
    changeReason: string;
    actorUserId: string;
    now: Date;
  }): Promise<VideoDisclosurePolicy>;
  activate(input: {
    policyId: string;
    actorUserId: string;
    activationReason: string;
    now: Date;
  }): Promise<VideoDisclosurePolicy | null>;
  findActive(input: {
    environment: LineConfigurationEnvironment;
    platform: VideoPlatform;
  }): Promise<VideoDisclosurePolicy | null>;
}

const cleanText = (value: string, field: string, maximum: number) => {
  const normalized = value.trim();
  if (
    normalized.length < 3 ||
    normalized.length > maximum ||
    [...normalized].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 0x20 && character !== '\n';
    })
  )
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

const cleanHashtags = (values: string[]) => {
  if (values.length > 10) throw new ApplicationError('VALIDATION_ERROR', 'too many hashtags');
  const normalized = values.map((value) => value.trim()).filter(Boolean);
  if (normalized.some((value) => !/^#[^\s#]{1,49}$/u.test(value)))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid hashtag');
  return [...new Set(normalized)];
};

const cleanMetadata = (value: Record<string, string>) => {
  const entries = Object.entries(value);
  if (entries.length > 20) throw new ApplicationError('VALIDATION_ERROR', 'too much metadata');
  const normalized: Record<string, string> = {};
  for (const [key, item] of entries) {
    if (!/^[a-z][a-z0-9_.-]{0,63}$/i.test(key) || item.length > 500)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid output metadata');
    normalized[key] = item.trim();
  }
  return normalized;
};

export class CreateVideoDisclosurePolicyDraft {
  constructor(private readonly repository: VideoDisclosurePolicyRepository) {}

  execute(input: {
    environment: LineConfigurationEnvironment;
    platform: VideoPlatform;
    disclosureText: string;
    hashtags: string[];
    guidance: string;
    outputMetadata: Record<string, string>;
    changeReason: string;
    actorUserId: string;
  }) {
    return this.repository.createDraft({
      ...input,
      disclosureText: cleanText(input.disclosureText, 'disclosureText', 500),
      hashtags: cleanHashtags(input.hashtags),
      guidance: cleanText(input.guidance, 'guidance', 1000),
      outputMetadata: cleanMetadata(input.outputMetadata),
      changeReason: cleanText(input.changeReason, 'changeReason', 1000),
      now: new Date(),
    });
  }
}

export class ActivateVideoDisclosurePolicy {
  constructor(private readonly repository: VideoDisclosurePolicyRepository) {}

  execute(input: { policyId: string; actorUserId: string; activationReason: string }) {
    if (!/^[0-9a-f-]{36}$/i.test(input.policyId) || !/^[0-9a-f-]{36}$/i.test(input.actorUserId))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid identifier');
    return this.repository.activate({
      ...input,
      activationReason: cleanText(input.activationReason, 'activationReason', 1000),
      now: new Date(),
    });
  }
}

export class ResolveVideoDisclosurePolicy {
  constructor(private readonly repository: VideoDisclosurePolicyRepository) {}

  async execute(input: { environment: LineConfigurationEnvironment; platform: VideoPlatform }) {
    const policy = await this.repository.findActive(input);
    if (!policy)
      throw new ApplicationError('CONFIGURATION_ERROR', 'video disclosure policy is not active');
    return {
      policyId: policy.id,
      policyVersion: policy.version,
      platform: policy.platform,
      disclosureText: policy.disclosureText,
      hashtags: [...policy.hashtags],
      guidance: policy.guidance,
      outputMetadata: { ...policy.outputMetadata },
      resolvedAt: new Date(),
    };
  }
}
