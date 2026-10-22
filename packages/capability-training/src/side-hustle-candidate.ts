import { ApplicationError } from '@bunshin/shared';

import {
  SIDE_HUSTLE_CATEGORIES,
  SIDE_HUSTLE_COST_TIERS,
  SIDE_HUSTLE_DEVICES,
  SIDE_HUSTLE_REQUIREMENT_LEVELS,
  type SideHustleCategory,
  type SideHustleCostTier,
  type SideHustleDevice,
  type SideHustleRequirementLevel,
} from './side-hustle-types';
import {
  findSideHustleExcludedArea,
  findSideHustleGuaranteeExpression,
} from './side-hustle-safety';

export const SIDE_HUSTLE_CANDIDATE_CONTRACT_VERSION = 'SIDE_HUSTLE_CANDIDATE_V1';

export const SIDE_HUSTLE_FIT_BASES = [
  'initialBudget',
  'monthlyBudget',
  'weeklyHours',
  'faceExposure',
  'snsPosting',
  'clientInteraction',
  'salesOutreach',
  'inventory',
  'device',
  'goal',
  'experience',
  'interest',
  'constraint',
] as const;

export type SideHustleFitBasis = (typeof SIDE_HUSTLE_FIT_BASES)[number];

export interface SideHustleCandidate {
  readonly name: string;
  readonly category: SideHustleCategory;
  readonly summary: string;
  readonly monetization: string;
  readonly fitReasons: readonly {
    readonly text: string;
    readonly basedOn: readonly SideHustleFitBasis[];
  }[];
  readonly initialCost: SideHustleCostTier;
  readonly monthlyCost: SideHustleCostTier;
  readonly weeklyHoursMin: number;
  readonly difficulty: 1 | 2 | 3;
  readonly requiredSkills: readonly string[];
  readonly workStyle: {
    readonly faceExposure: SideHustleRequirementLevel;
    readonly snsPosting: SideHustleRequirementLevel;
    readonly clientInteraction: SideHustleRequirementLevel;
    readonly salesOutreach: SideHustleRequirementLevel;
    readonly inventory: SideHustleRequirementLevel;
    readonly device: SideHustleDevice;
  };
  readonly typicalFlow: readonly string[];
  readonly risks: readonly string[];
  readonly requirements: readonly {
    readonly kind: 'LEGAL' | 'PLATFORM_TERMS';
    readonly text: string;
  }[];
}

export interface SideHustleCandidateProposal {
  readonly status: 'READY' | 'NEEDS_CONTEXT' | 'NO_FIT';
  readonly reason: string;
  readonly questions: readonly string[];
  readonly candidates: readonly SideHustleCandidate[];
}

export interface ValidatedSideHustleCandidateProposal extends SideHustleCandidateProposal {
  readonly removedCandidates: readonly {
    readonly name: string;
    readonly excludedAreaKey: string;
  }[];
  readonly removedQuestionCount: number;
}

const validationError = (field: string): never => {
  throw new ApplicationError(
    'VALIDATION_ERROR',
    `invalid side hustle candidate proposal: ${field}`,
  );
};

const record = (value: unknown, field: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) validationError(field);
  return value as Record<string, unknown>;
};

const exactKeys = (value: Record<string, unknown>, keys: readonly string[], field: string) => {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)))
    validationError(field);
};

const text = (value: unknown, field: string, maximum: number): string => {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maximum ||
    value.trim() !== value
  )
    validationError(field);
  const candidateText = value as string;
  if (findSideHustleGuaranteeExpression(candidateText)) validationError(field);
  return candidateText;
};

const enumValue = <T extends string>(value: unknown, values: readonly T[], field: string): T => {
  if (typeof value !== 'string' || !values.includes(value as T)) validationError(field);
  return value as T;
};

const integer = (value: unknown, field: string, minimum: number, maximum: number): number => {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum)
    validationError(field);
  return value as number;
};

const textArray = (
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  textMaximum: number,
): readonly string[] => {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum)
    validationError(field);
  const items = value as unknown[];
  return Object.freeze(items.map((entry, index) => text(entry, `${field}[${index}]`, textMaximum)));
};

const validateCandidate = (value: unknown, field: string): SideHustleCandidate => {
  const input = record(value, field);
  exactKeys(
    input,
    [
      'name',
      'category',
      'summary',
      'monetization',
      'fitReasons',
      'initialCost',
      'monthlyCost',
      'weeklyHoursMin',
      'difficulty',
      'requiredSkills',
      'workStyle',
      'typicalFlow',
      'risks',
      'requirements',
    ],
    field,
  );
  if (
    !Array.isArray(input.fitReasons) ||
    input.fitReasons.length < 1 ||
    input.fitReasons.length > 3
  )
    validationError(`${field}.fitReasons`);
  const fitReasonInputs = input.fitReasons as unknown[];
  const fitReasons = Object.freeze(
    fitReasonInputs.map((value, index) => {
      const reasonField = `${field}.fitReasons[${index}]`;
      const reason = record(value, reasonField);
      exactKeys(reason, ['text', 'basedOn'], reasonField);
      if (!Array.isArray(reason.basedOn) || reason.basedOn.length < 1)
        validationError(`${reasonField}.basedOn`);
      const basisInputs = reason.basedOn as unknown[];
      const basedOn = basisInputs.map((basis, basisIndex) =>
        enumValue(basis, SIDE_HUSTLE_FIT_BASES, `${reasonField}.basedOn[${basisIndex}]`),
      );
      if (new Set(basedOn).size !== basedOn.length) validationError(`${reasonField}.basedOn`);
      return Object.freeze({
        text: text(reason.text, `${reasonField}.text`, 160),
        basedOn: Object.freeze(basedOn),
      });
    }),
  );
  const workStyle = record(input.workStyle, `${field}.workStyle`);
  exactKeys(
    workStyle,
    ['faceExposure', 'snsPosting', 'clientInteraction', 'salesOutreach', 'inventory', 'device'],
    `${field}.workStyle`,
  );
  if (!Array.isArray(input.requirements) || input.requirements.length > 4)
    validationError(`${field}.requirements`);
  const requirementInputs = input.requirements as unknown[];
  const requirements = Object.freeze(
    requirementInputs.map((value, index) => {
      const requirementField = `${field}.requirements[${index}]`;
      const requirement = record(value, requirementField);
      exactKeys(requirement, ['kind', 'text'], requirementField);
      return Object.freeze({
        kind: enumValue(
          requirement.kind,
          ['LEGAL', 'PLATFORM_TERMS'] as const,
          `${requirementField}.kind`,
        ),
        text: text(requirement.text, `${requirementField}.text`, 160),
      });
    }),
  );
  return Object.freeze({
    name: text(input.name, `${field}.name`, 40),
    category: enumValue(input.category, SIDE_HUSTLE_CATEGORIES, `${field}.category`),
    summary: text(input.summary, `${field}.summary`, 200),
    monetization: text(input.monetization, `${field}.monetization`, 200),
    fitReasons,
    initialCost: enumValue(input.initialCost, SIDE_HUSTLE_COST_TIERS, `${field}.initialCost`),
    monthlyCost: enumValue(input.monthlyCost, SIDE_HUSTLE_COST_TIERS, `${field}.monthlyCost`),
    weeklyHoursMin: integer(input.weeklyHoursMin, `${field}.weeklyHoursMin`, 1, 40),
    difficulty: integer(input.difficulty, `${field}.difficulty`, 1, 3) as 1 | 2 | 3,
    requiredSkills: textArray(input.requiredSkills, `${field}.requiredSkills`, 1, 5, 60),
    workStyle: Object.freeze({
      faceExposure: enumValue(
        workStyle.faceExposure,
        SIDE_HUSTLE_REQUIREMENT_LEVELS,
        `${field}.workStyle.faceExposure`,
      ),
      snsPosting: enumValue(
        workStyle.snsPosting,
        SIDE_HUSTLE_REQUIREMENT_LEVELS,
        `${field}.workStyle.snsPosting`,
      ),
      clientInteraction: enumValue(
        workStyle.clientInteraction,
        SIDE_HUSTLE_REQUIREMENT_LEVELS,
        `${field}.workStyle.clientInteraction`,
      ),
      salesOutreach: enumValue(
        workStyle.salesOutreach,
        SIDE_HUSTLE_REQUIREMENT_LEVELS,
        `${field}.workStyle.salesOutreach`,
      ),
      inventory: enumValue(
        workStyle.inventory,
        SIDE_HUSTLE_REQUIREMENT_LEVELS,
        `${field}.workStyle.inventory`,
      ),
      device: enumValue(workStyle.device, SIDE_HUSTLE_DEVICES, `${field}.workStyle.device`),
    }),
    typicalFlow: textArray(input.typicalFlow, `${field}.typicalFlow`, 3, 6, 80),
    risks: textArray(input.risks, `${field}.risks`, 1, 5, 120),
    requirements,
  });
};

export function validateSideHustleCandidate(value: unknown): SideHustleCandidate {
  return validateCandidate(value, 'candidate');
}

const candidateTexts = (candidate: SideHustleCandidate): readonly string[] => [
  candidate.name,
  candidate.summary,
  candidate.monetization,
  ...candidate.fitReasons.map(({ text }) => text),
  ...candidate.requiredSkills,
  ...candidate.typicalFlow,
  ...candidate.risks,
  ...candidate.requirements.map(({ text }) => text),
];

export function validateSideHustleCandidateProposal(
  value: unknown,
): ValidatedSideHustleCandidateProposal {
  const input = record(value, 'proposal');
  exactKeys(input, ['status', 'reason', 'questions', 'candidates'], 'proposal');
  const status = enumValue(
    input.status,
    ['READY', 'NEEDS_CONTEXT', 'NO_FIT'] as const,
    'proposal.status',
  );
  const reason = text(input.reason, 'proposal.reason', 400);
  const questions = textArray(input.questions, 'proposal.questions', 0, 4, 200);
  if (!Array.isArray(input.candidates) || input.candidates.length > 4)
    validationError('proposal.candidates');
  const candidateInputs = input.candidates as unknown[];
  const candidates = candidateInputs.map((candidate, index) =>
    validateCandidate(candidate, `proposal.candidates[${index}]`),
  );
  if (new Set(candidates.map(({ name }) => name)).size !== candidates.length)
    validationError('proposal.candidates.name');
  if (
    status === 'READY' &&
    (candidates.length < 1 || candidates.length > 3 || questions.length > 0)
  )
    validationError('proposal.READY');
  if (status === 'NEEDS_CONTEXT' && (questions.length < 1 || candidates.length > 0))
    validationError('proposal.NEEDS_CONTEXT');
  if (status === 'NO_FIT' && (questions.length > 0 || candidates.length > 0))
    validationError('proposal.NO_FIT');
  const removedCandidates: { name: string; excludedAreaKey: string }[] = [];
  const acceptedCandidates = candidates.filter((candidate) => {
    const excludedArea = candidateTexts(candidate)
      .map(findSideHustleExcludedArea)
      .find((area) => area !== null);
    if (!excludedArea) return true;
    removedCandidates.push({ name: candidate.name, excludedAreaKey: excludedArea.key });
    return false;
  });
  const acceptedQuestions = questions.filter((question) => !findSideHustleExcludedArea(question));
  const removedQuestionCount = questions.length - acceptedQuestions.length;
  const reasonMentionsRemovedCandidate = removedCandidates.some(({ name }) =>
    reason.includes(name),
  );
  const sanitizedReason =
    findSideHustleExcludedArea(reason) || reasonMentionsRemovedCandidate
      ? '条件に合う候補を整理しました。'
      : reason;
  const noSafeCandidate = status === 'READY' && acceptedCandidates.length === 0;
  const noSafeQuestion = status === 'NEEDS_CONTEXT' && acceptedQuestions.length === 0;
  const resultStatus = noSafeCandidate || noSafeQuestion ? 'NO_FIT' : status;
  if (
    resultStatus === 'READY' &&
    (acceptedCandidates.length < 1 || acceptedCandidates.length > 3 || acceptedQuestions.length > 0)
  )
    validationError('proposal.READY');
  if (
    resultStatus === 'NEEDS_CONTEXT' &&
    (acceptedQuestions.length < 1 || acceptedCandidates.length > 0)
  )
    validationError('proposal.NEEDS_CONTEXT');
  if (resultStatus === 'NO_FIT' && (acceptedQuestions.length > 0 || acceptedCandidates.length > 0))
    validationError('proposal.NO_FIT');
  return Object.freeze({
    status: resultStatus,
    reason:
      noSafeCandidate || noSafeQuestion
        ? '条件に合う候補を安全に提案できませんでした。'
        : sanitizedReason,
    questions: Object.freeze(acceptedQuestions),
    candidates: Object.freeze(acceptedCandidates),
    removedCandidates: Object.freeze(removedCandidates.map((entry) => Object.freeze(entry))),
    removedQuestionCount,
  });
}
