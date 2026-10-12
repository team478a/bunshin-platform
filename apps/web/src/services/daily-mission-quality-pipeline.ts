import {
  decideSocialDecisionRebriefNextStep,
  decideSocialDecisionRepair,
} from '@bunshin/capability-social';
import type {
  CheckMissionQuality,
  GenerateMissionContent,
  MissionContentGeneratorInput,
  MissionContentGeneratorResult,
  MissionQualityCheckerInput,
  SocialDecisionStage,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import type { AdmittedOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import {
  inspectDailyMissionContent,
  type RecentDailyMissionContent,
} from './daily-mission-content-quality';

type ExecuteAiStep = <
  T extends {
    model: string;
    promptVersion: string;
    inputTokens: number | null;
    outputTokens: number | null;
    latencyMs: number;
  },
>(operation: {
  suffix: string;
  taskType: string;
  promptVersion: string;
  generate: (runtime: AdmittedOpenAiRuntimeConfiguration) => Promise<T>;
}) => Promise<T>;

export async function generateQualityCheckedMissionContent(input: {
  generator: (runtime: AdmittedOpenAiRuntimeConfiguration) => GenerateMissionContent;
  checker: (runtime: AdmittedOpenAiRuntimeConfiguration) => CheckMissionQuality;
  contentPromptVersion: string;
  qualityPromptVersion: string;
  contentInput: MissionContentGeneratorInput;
  qualityInput: (content: MissionContentGeneratorResult['output']) => MissionQualityCheckerInput;
  recentMissions: RecentDailyMissionContent[];
  executeAiStep: ExecuteAiStep;
  applyTerminology: (result: MissionContentGeneratorResult) => MissionContentGeneratorResult;
  setStage: (stage: string) => void;
  decisionRepairPolicy: 'ALLOW_CONTENT_REPAIR' | 'REQUIRE_REBRIEF';
  decisionStage?: SocialDecisionStage;
  rebriefAttemptsUsed?: 0 | 1;
  operationPrefix?: string;
}) {
  const operation = (suffix: string) =>
    input.operationPrefix ? `${input.operationPrefix}:${suffix}` : suffix;
  const decisionStage = input.decisionStage ?? 'DAILY';
  const rebriefAttemptsUsed = input.rebriefAttemptsUsed ?? 0;
  input.setStage(operation('content:0'));
  let content = input.applyTerminology(
    await input.executeAiStep({
      suffix: operation('content:0'),
      taskType: 'CONTENT_GENERATOR',
      promptVersion: input.contentPromptVersion,
      generate: (runtime) => input.generator(runtime).execute(input.contentInput),
    }),
  );

  let repairCount = 0;
  const qualityIssueCodes = new Set<string>();
  let quality: Awaited<ReturnType<CheckMissionQuality['execute']>> | null = null;
  let noveltyIssue: ReturnType<typeof inspectDailyMissionContent> = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    input.setStage(operation(`quality:${attempt}`));
    const currentQuality = await input.executeAiStep({
      suffix: operation(`quality:${attempt}`),
      taskType: 'QUALITY_CHECKER',
      promptVersion: input.qualityPromptVersion,
      generate: (runtime) => input.checker(runtime).execute(input.qualityInput(content.output)),
    });
    quality = currentQuality;
    for (const issue of currentQuality.output.issues) qualityIssueCodes.add(issue.code);
    noveltyIssue =
      currentQuality.output.verdict === 'PASS'
        ? inspectDailyMissionContent({
            content: content.output,
            recentMissions: input.recentMissions,
          })
        : null;
    const decisionRepair = decideSocialDecisionRepair({
      currentDecisionStage: decisionStage,
      qualityVerdict: currentQuality.output.verdict,
      qualityIssueCodes: currentQuality.output.issues.map(({ code }) => code),
      contentInspectionIssue: noveltyIssue?.code ?? null,
    });
    if (decisionRepair.action === 'KEEP_DECISION') break;
    const rebriefNextStep =
      input.decisionRepairPolicy === 'REQUIRE_REBRIEF'
        ? decideSocialDecisionRebriefNextStep({
            decisionStage,
            rebriefAttemptsUsed,
            disposition: decisionRepair,
          })
        : null;
    if (rebriefNextStep?.action === 'RUN_REBRIEF')
      throw new ApplicationError(
        'CONTENT_REJECTED',
        'decision-aligned mission requires a new brief before semantic repair',
        {
          reason: 'DECISION_REBRIEF_REQUIRED',
          decisionRepair,
          rebriefNextStep,
          issueCodes: [...qualityIssueCodes],
          noveltyIssue,
          attempts: attempt + 1,
        },
      );
    if (rebriefNextStep?.action === 'FAIL_CLOSED')
      throw new ApplicationError(
        'CONTENT_REJECTED',
        'decision-aligned mission failed final quality validation',
        {
          reason:
            rebriefNextStep.reason === 'REBRIEF_ATTEMPT_FAILED'
              ? 'DECISION_REBRIEF_FAILED'
              : 'DECISION_CONTENT_REJECTED',
          category:
            rebriefNextStep.reason === 'REBRIEF_ATTEMPT_FAILED'
              ? 'DECISION_REBRIEF_FAILED'
              : 'DECISION_CONTENT_REJECTED',
          decisionRepair,
          rebriefNextStep,
          issueCodes: [...qualityIssueCodes],
          noveltyIssue,
          attempts: attempt + 1,
        },
      );
    if (decisionRepair.action === 'REJECT_CONTENT' || attempt === 2)
      throw new ApplicationError('CONTENT_REJECTED', 'generated mission failed quality check', {
        issueCodes: [...qualityIssueCodes],
        noveltyIssue,
        attempts: attempt + 1,
      });

    repairCount += 1;
    const semanticDuplicate =
      noveltyIssue !== null ||
      currentQuality.output.issues.some(({ code }) => code === 'RECENT_CONTENT_DUPLICATE');
    input.setStage(operation(`content:${attempt + 1}`));
    content = input.applyTerminology(
      await input.executeAiStep({
        suffix: operation(`content:${attempt + 1}`),
        taskType: semanticDuplicate ? 'CONTENT_NOVELTY_RETRY' : 'CONTENT_REPAIR',
        promptVersion: input.contentPromptVersion,
        generate: (runtime) =>
          input.generator(runtime).execute(
            semanticDuplicate
              ? {
                  ...input.contentInput,
                  variantSourceContent: content.output,
                  variantInstructions: [
                    '過去原稿の言い換えではなく、答える疑問、具体的な情報、利用場面、読者が得る価値を別の企画にする。',
                    '承認済み情報だけを使い、架空の体験、実績、イベント、サービス説明を追加しない。',
                  ],
                }
              : {
                  ...input.contentInput,
                  repairInstructions: currentQuality.output.issues.map(
                    ({ repairInstruction }) => repairInstruction,
                  ),
                },
          ),
      }),
    );
  }

  if (!quality || quality.output.verdict !== 'PASS' || noveltyIssue)
    throw new ApplicationError('CONTENT_REJECTED', 'generated mission failed quality check');

  return {
    content,
    quality,
    repairCount,
    qualityIssueCodes: [...qualityIssueCodes],
    decisionStage,
    rebriefAttemptsUsed,
  };
}
