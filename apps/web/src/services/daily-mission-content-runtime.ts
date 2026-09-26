import 'server-only';
import { CheckMissionQuality, GenerateMissionContent } from '@bunshin/capability-social';
import { OpenAIMissionContentGenerator } from '../providers/openai-mission-content-generator';
import { OpenAIMissionQualityChecker } from '../providers/openai-mission-quality-checker';
import { applyServiceContentTerminology } from './service-content-terminology';
import { generateQualityCheckedMissionContent } from './daily-mission-quality-pipeline';

type QualityPipelineInput = Parameters<typeof generateQualityCheckedMissionContent>[0];

export function runDailyMissionContentGeneration(
  input: Omit<QualityPipelineInput, 'generator' | 'checker' | 'applyTerminology'> & {
    apiKey: string;
    model: string;
    terminologyPolicy: Parameters<typeof applyServiceContentTerminology>[1];
  },
) {
  const generator = new GenerateMissionContent(
    new OpenAIMissionContentGenerator({
      apiKey: input.apiKey,
      model: input.model,
    }),
  );
  const checker = new CheckMissionQuality(
    new OpenAIMissionQualityChecker({
      apiKey: input.apiKey,
      model: input.model,
    }),
  );
  const applyTerminology: QualityPipelineInput['applyTerminology'] = (value) => ({
    ...value,
    output: applyServiceContentTerminology(value.output, input.terminologyPolicy),
  });

  return generateQualityCheckedMissionContent({
    ...input,
    generator,
    checker,
    applyTerminology,
  });
}
