import type {
  CheckMissionQuality,
  GenerateMissionContent,
  MissionContentGeneratorInput,
  MissionContentGeneratorResult,
  MissionQualityCheckerInput,
} from '@bunshin/capability-social';
import { ApplicationError } from '@bunshin/shared';
import {
  inspectDailyMissionContent,
  type RecentDailyMissionContent,
} from './daily-mission-content-quality';

type GenerateWithQuota = <T>(suffix: string, generate: () => Promise<T>) => Promise<T>;
type RecordUsage = (
  suffix: string,
  taskType: string,
  result: {
    model: string;
    promptVersion: string;
    inputTokens: number | null;
    outputTokens: number | null;
    latencyMs: number;
  },
) => Promise<void>;

export async function generateQualityCheckedMissionContent(input: {
  generator: GenerateMissionContent;
  checker: CheckMissionQuality;
  contentInput: MissionContentGeneratorInput;
  qualityInput: (content: MissionContentGeneratorResult['output']) => MissionQualityCheckerInput;
  recentMissions: RecentDailyMissionContent[];
  generateWithQuota: GenerateWithQuota;
  recordUsage: RecordUsage;
  applyTerminology: (result: MissionContentGeneratorResult) => MissionContentGeneratorResult;
  setStage: (stage: string) => void;
}) {
  input.setStage('content:0');
  let content = input.applyTerminology(
    await input.generateWithQuota('content:0', () => input.generator.execute(input.contentInput)),
  );
  await input.recordUsage('content:0', 'CONTENT_GENERATOR', content);

  let repairCount = 0;
  const qualityIssueCodes = new Set<string>();
  let quality: Awaited<ReturnType<CheckMissionQuality['execute']>> | null = null;
  let noveltyIssue: ReturnType<typeof inspectDailyMissionContent> = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    input.setStage(`quality:${attempt}`);
    const currentQuality = await input.generateWithQuota(`quality:${attempt}`, () =>
      input.checker.execute(input.qualityInput(content.output)),
    );
    quality = currentQuality;
    for (const issue of currentQuality.output.issues) qualityIssueCodes.add(issue.code);
    await input.recordUsage(`quality:${attempt}`, 'QUALITY_CHECKER', currentQuality);
    noveltyIssue =
      currentQuality.output.verdict === 'PASS'
        ? inspectDailyMissionContent({
            content: content.output,
            recentMissions: input.recentMissions,
          })
        : null;
    if (currentQuality.output.verdict === 'PASS' && !noveltyIssue) break;
    if (currentQuality.output.verdict === 'REJECT' || attempt === 2)
      throw new ApplicationError('CONTENT_REJECTED', 'generated mission failed quality check', {
        issueCodes: [...qualityIssueCodes],
        noveltyIssue,
        attempts: attempt + 1,
      });

    repairCount += 1;
    const semanticDuplicate =
      noveltyIssue !== null ||
      currentQuality.output.issues.some(({ code }) => code === 'RECENT_CONTENT_DUPLICATE');
    input.setStage(`content:${attempt + 1}`);
    content = input.applyTerminology(
      await input.generateWithQuota(`content:${attempt + 1}`, () =>
        input.generator.execute(
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
      ),
    );
    await input.recordUsage(
      `content:${attempt + 1}`,
      semanticDuplicate ? 'CONTENT_NOVELTY_RETRY' : 'CONTENT_REPAIR',
      content,
    );
  }

  if (!quality || quality.output.verdict !== 'PASS' || noveltyIssue)
    throw new ApplicationError('CONTENT_REJECTED', 'generated mission failed quality check');

  return { content, quality, repairCount, qualityIssueCodes: [...qualityIssueCodes] };
}
