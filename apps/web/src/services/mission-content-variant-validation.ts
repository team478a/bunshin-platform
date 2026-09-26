import {
  AdvertisingSafetyService,
  CampaignSafetyValidationService,
  simhashSimilarityBasisPoints,
  type AdvertisingSafetyRepository,
  type CampaignPlanningContext,
  type CampaignSafetyRepository,
} from '@bunshin/application';
import {
  normalizeMissionContent,
  type MissionContent,
  type SocialPreferredFormat,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import { campaignContentSignature } from './campaign-content-signature';
import {
  inspectDailyMissionContent,
  type RecentDailyMissionContent,
} from './daily-mission-content-quality';

const VARIANT_SIMILARITY_THRESHOLD_BASIS_POINTS = 8_500;
const URL_PATTERN = /https?:\/\/[^\s]+/gu;

export function missionContentSimilarityBasisPoints(left: unknown, right: unknown) {
  return simhashSimilarityBasisPoints(
    campaignContentSignature(left).simhash,
    campaignContentSignature(right).simhash,
  );
}

function assertDifferentFromSource(source: MissionContent, candidate: MissionContent) {
  const similarity = missionContentSimilarityBasisPoints(source, candidate);
  if (similarity >= VARIANT_SIMILARITY_THRESHOLD_BASIS_POINTS) {
    throw new ApplicationError('CONTENT_REJECTED', 'generated variant is too similar to source', {
      similarityBasisPoints: similarity,
      thresholdBasisPoints: VARIANT_SIMILARITY_THRESHOLD_BASIS_POINTS,
    });
  }
}

function stripUrls(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(URL_PATTERN, '').trim();
  if (Array.isArray(value)) return value.map(stripUrls);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stripUrls(item)]));
  return value;
}

export function preserveAuthorizedMissionLink(input: {
  source: MissionContent;
  candidate: MissionContent;
  insertedUrl: string;
  platform: string;
}) {
  const target = ['body', 'caption', 'description'].find((key) => {
    const value = input.source[key];
    return typeof value === 'string' && value.includes(input.insertedUrl);
  });
  if (!target)
    throw new ApplicationError('CONTENT_REJECTED', 'authorized link placement is unavailable');
  const sanitized = stripUrls(input.candidate) as MissionContent;
  const current = sanitized[target];
  if (typeof current !== 'string' || !current.trim())
    throw new ApplicationError('CONTENT_REJECTED', 'authorized link target is unavailable');
  const value = `${current.trim()}\n\n${input.insertedUrl}`;
  const maximum =
    target === 'caption'
      ? 2_200
      : target === 'description'
        ? 5_000
        : input.platform === 'X'
          ? 280
          : input.platform === 'THREADS'
            ? 500
            : 10_000;
  if (value.length > maximum)
    throw new ApplicationError('CONTENT_REJECTED', 'tracking URL exceeds platform limit');
  return { ...sanitized, [target]: value };
}

export function prepareMissionVariantContent(input: {
  format: SocialPreferredFormat;
  source: MissionContent;
  candidate: MissionContent;
  platform: string;
  insertedUrl?: string | null;
}) {
  const candidateWithoutUrls = normalizeMissionContent(input.format, stripUrls(input.candidate));
  return normalizeMissionContent(
    input.format,
    input.insertedUrl
      ? preserveAuthorizedMissionLink({
          source: input.source,
          candidate: candidateWithoutUrls,
          insertedUrl: input.insertedUrl,
          platform: input.platform,
        })
      : candidateWithoutUrls,
  );
}

interface ValidationScope {
  workspaceId: string;
  groupId?: string | null;
  bunshinId: string;
  actorUserId: string;
}

export async function validateMissionContentVariant(input: {
  scope: ValidationScope;
  source: MissionContent;
  candidate: MissionContent;
  recentMissions: RecentDailyMissionContent[];
  campaign: {
    context: CampaignPlanningContext;
    classification: 'ORGANIC' | 'PRODUCT_RELATED' | 'ADVERTISEMENT';
    campaignSafetyRepository: CampaignSafetyRepository;
    advertisingSafetyRepository: AdvertisingSafetyRepository;
  } | null;
}) {
  assertDifferentFromSource(input.source, input.candidate);
  const noveltyIssue = inspectDailyMissionContent({
    content: input.candidate,
    recentMissions: input.recentMissions,
  });
  if (noveltyIssue)
    throw new ApplicationError(
      'CONTENT_REJECTED',
      'generated variant duplicates presented content',
      noveltyIssue,
    );
  if (!input.campaign) return;

  const signature = campaignContentSignature(input.candidate);
  const similarity = await new CampaignSafetyValidationService(
    input.campaign.campaignSafetyRepository,
  ).inspect({ ...input.scope, campaignId: input.campaign.context.id, ...signature });
  if (similarity.verdict === 'POSSIBLE_DUPLICATE')
    throw new ApplicationError('CONTENT_REJECTED', 'campaign variant is too similar', {
      similarityBasisPoints: similarity.maxSimilarityBasisPoints,
    });
  const safety = await new AdvertisingSafetyService(
    input.campaign.advertisingSafetyRepository,
  ).inspect({
    ...input.scope,
    productPackVersionId: input.campaign.context.productPack.versionId,
    classification: input.campaign.classification,
    evidenceRequirement: 'NONE',
    evidenceIds: [],
    officialClaims: input.campaign.context.productPack.facts,
    content: JSON.stringify(input.candidate),
  });
  if (safety.inspected.verdict !== 'PASS')
    throw new ApplicationError('CONTENT_REJECTED', 'campaign variant failed safety gate', {
      issueCodes: safety.inspected.issueCodes,
    });
}
