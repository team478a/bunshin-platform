import 'server-only';
import { CheckMissionQuality, GenerateMissionContent } from '@bunshin/capability-social';
import {
  MISSION_CONTENT_GENERATOR_PROMPT_VERSION,
  OpenAIMissionContentGenerator,
} from '../providers/openai-mission-content-generator';
import {
  MISSION_QUALITY_CHECKER_PROMPT_VERSION,
  OpenAIMissionQualityChecker,
} from '../providers/openai-mission-quality-checker';
import { applyServiceContentTerminology } from './service-content-terminology';
import { generateQualityCheckedMissionContent } from './daily-mission-quality-pipeline';

type QualityPipelineInput = Parameters<typeof generateQualityCheckedMissionContent>[0];

export function runDailyMissionContentGeneration(
  input: Omit<
    QualityPipelineInput,
    'generator' | 'checker' | 'applyTerminology' | 'contentPromptVersion' | 'qualityPromptVersion'
  > & {
    terminologyPolicy: Parameters<typeof applyServiceContentTerminology>[1];
  },
) {
  const generator: QualityPipelineInput['generator'] = (runtime) =>
    new GenerateMissionContent(
      new OpenAIMissionContentGenerator({ apiKey: runtime.apiKey, model: runtime.model }),
    );
  const checker: QualityPipelineInput['checker'] = (runtime) =>
    new CheckMissionQuality(
      new OpenAIMissionQualityChecker({ apiKey: runtime.apiKey, model: runtime.model }),
    );
  const applyTerminology: QualityPipelineInput['applyTerminology'] = (value) => ({
    ...value,
    output: applyServiceContentTerminology(value.output, input.terminologyPolicy),
  });

  return generateQualityCheckedMissionContent({
    ...input,
    generator,
    checker,
    contentPromptVersion: MISSION_CONTENT_GENERATOR_PROMPT_VERSION,
    qualityPromptVersion: MISSION_QUALITY_CHECKER_PROMPT_VERSION,
    applyTerminology,
  });
}
