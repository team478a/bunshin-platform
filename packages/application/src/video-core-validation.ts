import { ApplicationError } from '@bunshin/shared';

import type { VideoAiProcessingType } from './video-core-contracts';

const validAiTypes = new Set<VideoAiProcessingType>([
  'SCRIPT_GENERATION',
  'VOICE_SYNTHESIS',
  'IMAGE_GENERATION',
  'VIDEO_GENERATION',
  'AUTOMATIC_ASSET_SELECTION',
]);
export const validateVideoId = (value: string, field: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value;
};
export const validateVideoText = (value: string, field: string, max: number) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > max)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};
export const validateVideoAiTypes = (values: VideoAiProcessingType[]) => {
  const unique = [...new Set(values)];
  if (unique.length > validAiTypes.size || unique.some((value) => !validAiTypes.has(value)))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid aiProcessingTypes');
  return unique;
};

export function isSupportedVideoComposition(input: {
  scenes: Array<{ visualType: string; aiProcessingTypes: string[] }>;
  aiProcessingTypes: string[];
}) {
  const supported = new Set(['SCRIPT_GENERATION', 'VIDEO_GENERATION', 'VOICE_SYNTHESIS']);
  return (
    input.aiProcessingTypes.every((type) => supported.has(type)) &&
    input.scenes.every(
      (scene) =>
        ['TEXT_MOTION', 'AI_VIDEO', 'USER_ASSET', 'GENERATED_IMAGE'].includes(scene.visualType) &&
        scene.aiProcessingTypes.every((type) => supported.has(type)),
    )
  );
}

export function assertSupportedVideoComposition(
  input: Parameters<typeof isSupportedVideoComposition>[0],
) {
  if (!isSupportedVideoComposition(input))
    throw new ApplicationError(
      'VALIDATION_ERROR',
      '写真・音声を含む動画は準備中です。企画を作り直し、字幕動画をご利用ください。',
    );
}
