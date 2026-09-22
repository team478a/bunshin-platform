import { ApplicationError } from '@bunshin/shared';

import {
  SOCIAL_PREFERRED_FORMATS,
  type SocialPlatform,
  type SocialPreferredFormat,
} from './social-profile';

export type MissionContent = Record<string, unknown>;
export const missionString = (value: unknown, maximum: number, field: string) => {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > maximum)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value.trim();
};
export const missionInteger = (value: unknown, minimum: number, maximum: number, field: string) => {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value as number;
};
export const PLATFORM_FORMATS: Record<SocialPlatform, readonly SocialPreferredFormat[]> = {
  INSTAGRAM: ['TEXT', 'SLIDE', 'IMAGE', 'LIVE_ACTION', 'AI_VIDEO_PROMPT'],
  TIKTOK: ['LIVE_ACTION', 'AI_VIDEO_PROMPT', 'IMAGE'],
  X: ['TEXT', 'IMAGE'],
  THREADS: ['TEXT', 'IMAGE'],
  YOUTUBE_SHORTS: ['LIVE_ACTION', 'AI_VIDEO_PROMPT'],
  OTHER: SOCIAL_PREFERRED_FORMATS,
};
export function assertPlatformFormat(platform: SocialPlatform, format: SocialPreferredFormat) {
  if (!PLATFORM_FORMATS[platform].includes(format))
    throw new ApplicationError('VALIDATION_ERROR', 'format is not supported for platform');
}
export function validatePlatformContent(
  platform: SocialPlatform,
  brief: { format: SocialPreferredFormat; estimatedMinutes: number },
  content: MissionContent,
) {
  const estimated = content['estimatedMinutes'];
  if (typeof estimated === 'number' && estimated > brief.estimatedMinutes)
    throw new ApplicationError('VALIDATION_ERROR', 'content exceeds estimated minutes');
  const hashtags = content['hashtags'];
  const hashtagLimit = platform === 'INSTAGRAM' ? 30 : 5;
  if (Array.isArray(hashtags) && hashtags.length > hashtagLimit)
    throw new ApplicationError('VALIDATION_ERROR', 'too many hashtags for platform');
  if (brief.format === 'TEXT') {
    const limit = platform === 'X' ? 280 : platform === 'THREADS' ? 500 : 2200;
    if (typeof content['body'] === 'string' && content['body'].length > limit)
      throw new ApplicationError('VALIDATION_ERROR', 'text exceeds platform limit');
    if (
      Array.isArray(content['threadParts']) &&
      content['threadParts'].some((value) => typeof value === 'string' && value.length > limit)
    )
      throw new ApplicationError('VALIDATION_ERROR', 'thread part exceeds platform limit');
  }
  if (brief.format === 'AI_VIDEO_PROMPT') {
    const settings = content['videoSettings'];
    if (
      settings &&
      typeof settings === 'object' &&
      'durationSeconds' in settings &&
      typeof settings.durationSeconds === 'number' &&
      settings.durationSeconds > 60
    )
      throw new ApplicationError('VALIDATION_ERROR', 'video duration exceeds platform limit');
  }
}
export function strict(value: unknown, keys: readonly string[], field: string) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value as Record<string, unknown>;
}
function strings(value: unknown, maximumItems: number, maximumLength: number, field: string) {
  if (!Array.isArray(value) || value.length > maximumItems)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return value.map((item) => missionString(item, maximumLength, field));
}
function missionNullableString(value: unknown, maximum: number, field: string) {
  return value === null || value === undefined ? null : missionString(value, maximum, field);
}
export function normalizeMissionContent(
  format: SocialPreferredFormat,
  value: unknown,
): MissionContent {
  if (format === 'TEXT') {
    const v = strict(
      value,
      ['body', 'threadParts', 'cta', 'caption', 'hashtags', 'photoInstruction'],
      'text content',
    );
    return {
      body: missionString(v['body'], 10000, 'body'),
      threadParts: strings(v['threadParts'], 25, 2000, 'thread parts'),
      cta: missionNullableString(v['cta'], 1000, 'cta'),
      caption: missionNullableString(v['caption'], 2200, 'caption'),
      hashtags: strings(v['hashtags'], 30, 100, 'hashtags'),
      photoInstruction: missionNullableString(v['photoInstruction'], 2000, 'photo instruction'),
    };
  }
  if (format === 'SLIDE') {
    const v = strict(
      value,
      ['topic', 'angle', 'reason', 'estimatedMinutes', 'slides', 'caption', 'hashtags'],
      'slide content',
    );
    if (!Array.isArray(v['slides']) || v['slides'].length < 1 || v['slides'].length > 7)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid slides');
    const slides = v['slides'].map((entry, index) => {
      const slide = strict(entry, ['index', 'role', 'headline', 'body', 'visualScene'], 'slide');
      const role = missionString(slide['role'], 20, 'slide role');
      if (!['HOOK', 'PROBLEM', 'INSIGHT', 'SOLUTION', 'CTA'].includes(role))
        throw new ApplicationError('VALIDATION_ERROR', 'invalid slide role');
      if (slide['index'] !== index + 1)
        throw new ApplicationError('VALIDATION_ERROR', 'slide index must be sequential');
      const visualScene = missionNullableString(slide['visualScene'], 1000, 'visual scene');
      return {
        index: index + 1,
        role,
        headline: missionString(slide['headline'], 200, 'headline'),
        body: missionString(slide['body'], 2000, 'body'),
        ...(visualScene ? { visualScene } : {}),
      };
    });
    if (slides[0]?.role !== 'HOOK' || slides.at(-1)?.role !== 'CTA')
      throw new ApplicationError('VALIDATION_ERROR', 'slides require HOOK and CTA');
    return {
      topic: missionString(v['topic'], 200, 'topic'),
      angle: missionString(v['angle'], 500, 'angle'),
      reason: missionString(v['reason'], 1000, 'reason'),
      estimatedMinutes: missionInteger(v['estimatedMinutes'], 1, 120, 'estimated minutes'),
      slides,
      caption: missionString(v['caption'], 2200, 'caption'),
      hashtags: strings(v['hashtags'], 30, 100, 'hashtags'),
    };
  }
  if (format === 'LIVE_ACTION') {
    const v = strict(
      value,
      ['topic', 'estimatedMinutes', 'shootingInstruction', 'script', 'caption'],
      'live action content',
    );
    if (!Array.isArray(v['script']) || v['script'].length < 1 || v['script'].length > 20)
      throw new ApplicationError('VALIDATION_ERROR', 'invalid script');
    const script = v['script'].map((entry) => {
      const part = strict(entry, ['seconds', 'role', 'text'], 'script part');
      const role = missionString(part['role'], 10, 'script role');
      if (!['HOOK', 'BODY', 'CTA'].includes(role))
        throw new ApplicationError('VALIDATION_ERROR', 'invalid script role');
      return {
        seconds: missionString(part['seconds'], 30, 'seconds'),
        role,
        text: missionString(part['text'], 2000, 'script text'),
      };
    });
    if (script[0]?.role !== 'HOOK' || script.at(-1)?.role !== 'CTA')
      throw new ApplicationError('VALIDATION_ERROR', 'script requires HOOK and CTA');
    return {
      topic: missionString(v['topic'], 200, 'topic'),
      estimatedMinutes: missionInteger(v['estimatedMinutes'], 1, 120, 'estimated minutes'),
      shootingInstruction: missionString(v['shootingInstruction'], 2000, 'shooting instruction'),
      script,
      caption: missionString(v['caption'], 2200, 'caption'),
    };
  }
  if (format === 'AI_VIDEO_PROMPT') {
    const v = strict(
      value,
      [
        'topic',
        'estimatedMinutes',
        'toolSuggestion',
        'videoSettings',
        'prompt',
        'overlayText',
        'caption',
      ],
      'video content',
    );
    const settings = strict(
      v['videoSettings'],
      ['aspectRatio', 'durationSeconds', 'style'],
      'video settings',
    );
    return {
      topic: missionString(v['topic'], 200, 'topic'),
      estimatedMinutes: missionInteger(v['estimatedMinutes'], 1, 120, 'estimated minutes'),
      toolSuggestion:
        v['toolSuggestion'] === null
          ? null
          : missionString(v['toolSuggestion'], 100, 'tool suggestion'),
      videoSettings: {
        aspectRatio: missionString(settings['aspectRatio'], 20, 'aspect ratio'),
        durationSeconds: missionInteger(settings['durationSeconds'], 1, 120, 'duration seconds'),
        style: missionString(settings['style'], 500, 'style'),
      },
      prompt: missionString(v['prompt'], 10000, 'prompt'),
      overlayText: strings(v['overlayText'], 20, 200, 'overlay text'),
      caption: missionString(v['caption'], 2200, 'caption'),
    };
  }
  const v = strict(
    value,
    [
      'topic',
      'angle',
      'reason',
      'estimatedMinutes',
      'imageInstruction',
      'overlayText',
      'slides',
      'caption',
      'hashtags',
    ],
    'image content',
  );
  const expectedRoles = ['HOOK', 'PROBLEM', 'INSIGHT', 'SOLUTION', 'CTA'] as const;
  const imageSlides =
    v['slides'] === undefined
      ? null
      : (() => {
          if (!Array.isArray(v['slides']) || v['slides'].length !== 5)
            throw new ApplicationError('VALIDATION_ERROR', 'image content requires five slides');
          return v['slides'].map((entry, index) => {
            const slide = strict(
              entry,
              ['index', 'role', 'headline', 'body', 'visualScene'],
              'image slide',
            );
            if (slide['index'] !== index + 1 || slide['role'] !== expectedRoles[index])
              throw new ApplicationError(
                'VALIDATION_ERROR',
                'image slides require sequential roles',
              );
            const visualScene = missionNullableString(slide['visualScene'], 1000, 'visual scene');
            return {
              index: index + 1,
              role: expectedRoles[index],
              headline: missionString(slide['headline'], 200, 'headline'),
              body: missionString(slide['body'], 2000, 'body'),
              ...(visualScene ? { visualScene } : {}),
            };
          });
        })();
  return {
    topic: missionString(v['topic'], 200, 'topic'),
    angle: missionString(v['angle'], 500, 'angle'),
    reason: missionString(v['reason'], 1000, 'reason'),
    estimatedMinutes: missionInteger(v['estimatedMinutes'], 1, 120, 'estimated minutes'),
    imageInstruction: missionString(v['imageInstruction'], 5000, 'image instruction'),
    overlayText:
      v['overlayText'] === null ? null : missionString(v['overlayText'], 500, 'overlay text'),
    ...(imageSlides ? { slides: imageSlides } : {}),
    caption: missionString(v['caption'], 2200, 'caption'),
    hashtags: strings(v['hashtags'], 30, 100, 'hashtags'),
  };
}
