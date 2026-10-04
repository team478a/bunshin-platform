import 'server-only';

import type { GenerationDecisionRevisionMetadata } from '@bunshin/application';
import type {
  SocialDecisionBoundary,
  SocialDecisionRepairDisposition,
  SocialDecisionStage,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';

import type { runDailyMissionBriefGeneration } from './daily-mission-brief-runtime';
import type { runDailyMissionContentGeneration } from './daily-mission-content-runtime';
import type { DailyMissionDecisionRevisionDraft } from './daily-mission-rebrief-runtime';

type BriefResult = Awaited<ReturnType<typeof runDailyMissionBriefGeneration>>;
type ContentResult = Awaited<ReturnType<typeof runDailyMissionContentGeneration>>;

export interface DailyMissionDecisionContentAttempt {
  decisionStage: SocialDecisionStage;
  rebriefAttemptsUsed: 0 | 1;
  operationPrefix: string | undefined;
}

function rebriefDispositionFromError(
  error: unknown,
): (SocialDecisionRepairDisposition & { action: 'REBRIEF_REQUIRED' }) | null {
  if (!(error instanceof ApplicationError) || error.code !== 'CONTENT_REJECTED') return null;
  const cause = error.cause;
  if (!cause || typeof cause !== 'object') return null;
  const value = cause as { reason?: unknown; decisionRepair?: unknown; rebriefNextStep?: unknown };
  const repair = value.decisionRepair as
    { action?: unknown; currentDecisionStage?: unknown; nextDecisionStage?: unknown } | undefined;
  const nextStep = value.rebriefNextStep as
    { action?: unknown; nextDecisionStage?: unknown; rebriefAttempt?: unknown } | undefined;
  if (
    value.reason !== 'DECISION_REBRIEF_REQUIRED' ||
    !repair ||
    repair.action !== 'REBRIEF_REQUIRED' ||
    repair.currentDecisionStage !== 'DAILY' ||
    repair.nextDecisionStage !== 'REVISED_BRIEF' ||
    !nextStep ||
    nextStep.action !== 'RUN_REBRIEF' ||
    nextStep.nextDecisionStage !== 'REVISED_BRIEF' ||
    nextStep.rebriefAttempt !== 1
  )
    return null;
  return value.decisionRepair as SocialDecisionRepairDisposition & {
    action: 'REBRIEF_REQUIRED';
  };
}

export async function runDailyMissionDecisionContentOrchestration<TPrepared>(input: {
  initialBrief: BriefResult;
  decisionBoundary: SocialDecisionBoundary | null;
  prepareContent: (brief: BriefResult) => Promise<TPrepared>;
  generateContent: (
    prepared: TPrepared,
    attempt: DailyMissionDecisionContentAttempt,
  ) => Promise<ContentResult>;
  reviseBrief: (input: {
    initialBrief: BriefResult;
    disposition: SocialDecisionRepairDisposition & { action: 'REBRIEF_REQUIRED' };
    boundary: SocialDecisionBoundary;
  }) => Promise<{ brief: BriefResult; revision: DailyMissionDecisionRevisionDraft }>;
}) {
  const initialPrepared = await input.prepareContent(input.initialBrief);
  try {
    const contentResult = await input.generateContent(initialPrepared, {
      decisionStage: 'DAILY',
      rebriefAttemptsUsed: 0,
      operationPrefix: undefined,
    });
    return {
      brief: input.initialBrief,
      prepared: initialPrepared,
      contentResult,
      revision: null,
    };
  } catch (error) {
    const disposition = rebriefDispositionFromError(error);
    if (!disposition || !input.decisionBoundary) throw error;
    const revised = await input.reviseBrief({
      initialBrief: input.initialBrief,
      disposition,
      boundary: input.decisionBoundary,
    });
    const revisedPrepared = await input.prepareContent(revised.brief);
    const contentResult = await input.generateContent(revisedPrepared, {
      decisionStage: 'REVISED_BRIEF',
      rebriefAttemptsUsed: 1,
      operationPrefix: 'rebrief:1',
    });
    const revision: GenerationDecisionRevisionMetadata = {
      ...revised.revision,
      finalQuality: {
        verdict: 'PASS',
        issueCodes: [...new Set(contentResult.quality.output.issues.map(({ code }) => code))],
      },
    };
    return {
      brief: revised.brief,
      prepared: revisedPrepared,
      contentResult,
      revision,
    };
  }
}
