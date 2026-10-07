import type { LearningDefinitionReference } from '@bunshin/application';

export const GUIDED_PRACTICE_RULE_VERSION = 'AI_TRAINING_GUIDED_PRACTICE_V1';
export const PRACTICE_SUPPORT_LEVELS = ['GUIDED', 'HINTED', 'INDEPENDENT'] as const;
export type PracticeSupportLevel = (typeof PRACTICE_SUPPORT_LEVELS)[number];
export const CAPABILITY_INTERACTIONS = ['SELF_PROMPTED', 'SELF_EVALUATED', 'SELF_REVISED'] as const;
export type CapabilityInteraction = (typeof CAPABILITY_INTERACTIONS)[number];
export type CapabilityEvidence = 'GUIDED_COMPLETION' | CapabilityInteraction;
export type GuidedPracticeCommand =
  | { readonly action: 'START'; readonly supportLevel: PracticeSupportLevel }
  | { readonly action: 'INTERACT'; readonly interaction: CapabilityInteraction }
  | {
      readonly action: 'COMPLETE';
      readonly learnerConfirmedCompletion: true;
      readonly usefulResult: true;
    };
export interface GuidedPracticeReference {
  readonly goalId: string;
  readonly planId: string;
  readonly planRevision: number;
  readonly definition: LearningDefinitionReference;
  readonly assignmentId: string;
}
export interface GuidedPracticeView {
  readonly started: boolean;
  readonly completed: boolean;
  readonly supportLevel: PracticeSupportLevel | null;
  readonly interactions: readonly CapabilityInteraction[];
  readonly firstSuccess: boolean;
}

/** Bounded evidence only. Never accepts outcomes, free text, Goal candidates or generated content. */
export function validateGuidedPracticeCommand(value: unknown): GuidedPracticeCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid practice command');
  const v = value as Record<string, unknown>;
  const exact = (keys: readonly string[]) =>
    Object.keys(v).length === keys.length && Object.keys(v).every((k) => keys.includes(k));
  if (
    v.action === 'START' &&
    exact(['action', 'supportLevel']) &&
    PRACTICE_SUPPORT_LEVELS.includes(v.supportLevel as PracticeSupportLevel)
  )
    return Object.freeze({ action: 'START', supportLevel: v.supportLevel as PracticeSupportLevel });
  if (
    v.action === 'INTERACT' &&
    exact(['action', 'interaction']) &&
    CAPABILITY_INTERACTIONS.includes(v.interaction as CapabilityInteraction)
  )
    return Object.freeze({
      action: 'INTERACT',
      interaction: v.interaction as CapabilityInteraction,
    });
  if (
    v.action === 'COMPLETE' &&
    exact(['action', 'learnerConfirmedCompletion', 'usefulResult']) &&
    v.learnerConfirmedCompletion === true &&
    v.usefulResult === true
  )
    return Object.freeze({
      action: 'COMPLETE',
      learnerConfirmedCompletion: true,
      usefulResult: true,
    });
  throw new Error('invalid practice command');
}

export function effectivePracticeSupport(
  selected: PracticeSupportLevel,
  usedHint: boolean,
  requestedHelp: boolean,
): PracticeSupportLevel {
  if (!PRACTICE_SUPPORT_LEVELS.includes(selected)) throw new Error('unknown practice support');
  if (selected === 'GUIDED' || requestedHelp) return 'GUIDED';
  if (selected === 'HINTED' || usedHint) return 'HINTED';
  return 'INDEPENDENT';
}

/** Assessment validates the submitted prompt, not the external outcome or an ability Level. */
export function definePracticeCompletion(input: {
  readonly command: GuidedPracticeCommand;
  readonly started: boolean;
  readonly interactions: readonly CapabilityInteraction[];
  readonly assessmentVerified: boolean;
  readonly supportLevel: PracticeSupportLevel;
}) {
  const command = validateGuidedPracticeCommand(input.command);
  if (
    command.action !== 'COMPLETE' ||
    !input.started ||
    !input.assessmentVerified ||
    !input.interactions.includes('SELF_PROMPTED') ||
    !input.interactions.includes('SELF_EVALUATED') ||
    input.interactions.some((k) => !CAPABILITY_INTERACTIONS.includes(k))
  )
    throw new Error('practice completion evidence required');
  return Object.freeze({
    ruleVersion: GUIDED_PRACTICE_RULE_VERSION,
    operator: 'LEARNER' as const,
    learnerConfirmation: 'CONFIRMED_USEFUL_COMPLETION' as const,
    evidenceBasis: 'LEARNER_REPORT_AND_PROMPT_ASSESSMENT' as const,
    supportLevel: effectivePracticeSupport(input.supportLevel, false, false),
    capabilityEvidence: Object.freeze([
      'GUIDED_COMPLETION',
      ...new Set(input.interactions),
    ] as CapabilityEvidence[]),
    outcomeQuality: 'UNKNOWN' as const,
    capabilityLevel: 'UNKNOWN' as const,
  });
}
