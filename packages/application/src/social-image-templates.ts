import { ApplicationError } from '@bunshin/shared';

export const SOCIAL_IMAGE_WIDTH = 1080 as const;
export const SOCIAL_IMAGE_HEIGHT = 1350 as const;

export const SOCIAL_IMAGE_TEMPLATE_KEYS = [
  'EDITORIAL_COVER',
  'EDITORIAL_POINT',
  'EDITORIAL_SUMMARY',
  'PERSON_HEADLINE',
  'PROBLEM_CHECKLIST',
  'THREE_POINTS',
  'EMPATHY_QUOTE',
  'CTA',
] as const;

export type SocialImageTemplateKey = (typeof SOCIAL_IMAGE_TEMPLATE_KEYS)[number];

export type SocialImagePageLayout = {
  templateKey: SocialImageTemplateKey;
  headline: string;
  bodyLines: string[];
  cta: string | null;
  accentColor: string;
};

export interface SocialImageLayout extends SocialImagePageLayout {
  carouselPages?: SocialImagePageLayout[];
}

export interface EditorialCarouselSlideInput {
  role: 'HOOK' | 'PROBLEM' | 'INSIGHT' | 'SOLUTION' | 'CTA';
  headline: string;
  body: string;
}

export interface SocialImageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SocialImageTextRule {
  maxCharactersPerLine: number;
  minLines: number;
  maxLines: number;
  fontSize: number;
  minFontSize: number;
}

export interface SocialImageTemplateDefinition {
  key: SocialImageTemplateKey;
  version: 1;
  canvas: SocialImageRect;
  safeArea: SocialImageRect;
  imageArea: SocialImageRect | null;
  headlineArea: SocialImageRect;
  bodyArea: SocialImageRect;
  ctaArea: SocialImageRect | null;
  assetPlacement: 'NONE' | 'FOREGROUND' | 'BACKGROUND';
  headline: SocialImageTextRule;
  body: SocialImageTextRule;
  cta: SocialImageTextRule | null;
}

const canvas: SocialImageRect = { x: 0, y: 0, width: 1080, height: 1350 };
const safeArea: SocialImageRect = { x: 72, y: 72, width: 936, height: 1206 };
const rule = (
  maxCharactersPerLine: number,
  minLines: number,
  maxLines: number,
  fontSize: number,
  minFontSize: number,
): SocialImageTextRule => ({
  maxCharactersPerLine,
  minLines,
  maxLines,
  fontSize,
  minFontSize,
});

export const SOCIAL_IMAGE_TEMPLATE_DEFINITIONS: Readonly<
  Record<SocialImageTemplateKey, SocialImageTemplateDefinition>
> = Object.freeze({
  EDITORIAL_COVER: {
    key: 'EDITORIAL_COVER',
    version: 1,
    canvas,
    safeArea,
    imageArea: { x: 404, y: 650, width: 604, height: 560 },
    headlineArea: { x: 72, y: 130, width: 850, height: 330 },
    bodyArea: { x: 72, y: 490, width: 460, height: 150 },
    ctaArea: { x: 72, y: 1180, width: 936, height: 90 },
    assetPlacement: 'FOREGROUND',
    headline: rule(20, 1, 3, 76, 60),
    body: rule(12, 1, 2, 34, 30),
    cta: rule(28, 0, 1, 30, 28),
  },
  EDITORIAL_POINT: {
    key: 'EDITORIAL_POINT',
    version: 1,
    canvas,
    safeArea,
    imageArea: null,
    headlineArea: { x: 88, y: 220, width: 850, height: 300 },
    bodyArea: { x: 88, y: 580, width: 904, height: 430 },
    ctaArea: { x: 72, y: 1160, width: 936, height: 90 },
    assetPlacement: 'NONE',
    headline: rule(20, 1, 3, 70, 56),
    body: rule(26, 1, 4, 40, 34),
    cta: rule(28, 0, 1, 30, 28),
  },
  EDITORIAL_SUMMARY: {
    key: 'EDITORIAL_SUMMARY',
    version: 1,
    canvas,
    safeArea,
    imageArea: null,
    headlineArea: { x: 88, y: 230, width: 904, height: 260 },
    bodyArea: { x: 88, y: 560, width: 904, height: 440 },
    ctaArea: { x: 72, y: 1140, width: 936, height: 110 },
    assetPlacement: 'NONE',
    headline: rule(20, 1, 3, 70, 56),
    body: rule(26, 1, 4, 42, 34),
    cta: rule(28, 1, 1, 32, 28),
  },
  PERSON_HEADLINE: {
    key: 'PERSON_HEADLINE',
    version: 1,
    canvas,
    safeArea,
    imageArea: { x: 540, y: 250, width: 468, height: 850 },
    headlineArea: { x: 72, y: 120, width: 720, height: 250 },
    bodyArea: { x: 72, y: 420, width: 500, height: 430 },
    ctaArea: { x: 72, y: 1080, width: 936, height: 150 },
    assetPlacement: 'FOREGROUND',
    headline: rule(20, 1, 2, 80, 64),
    body: rule(28, 1, 3, 48, 40),
    cta: rule(30, 0, 1, 38, 34),
  },
  PROBLEM_CHECKLIST: {
    key: 'PROBLEM_CHECKLIST',
    version: 1,
    canvas,
    safeArea,
    imageArea: null,
    headlineArea: { x: 72, y: 110, width: 936, height: 190 },
    bodyArea: { x: 110, y: 350, width: 860, height: 650 },
    ctaArea: { x: 72, y: 1080, width: 936, height: 150 },
    assetPlacement: 'NONE',
    headline: rule(22, 1, 2, 70, 58),
    body: rule(32, 3, 5, 46, 38),
    cta: rule(30, 1, 1, 38, 34),
  },
  THREE_POINTS: {
    key: 'THREE_POINTS',
    version: 1,
    canvas,
    safeArea,
    imageArea: null,
    headlineArea: { x: 72, y: 110, width: 936, height: 200 },
    bodyArea: { x: 100, y: 350, width: 880, height: 650 },
    ctaArea: { x: 72, y: 1080, width: 936, height: 150 },
    assetPlacement: 'NONE',
    headline: rule(22, 1, 2, 70, 58),
    body: rule(34, 3, 3, 50, 42),
    cta: rule(30, 0, 1, 38, 34),
  },
  EMPATHY_QUOTE: {
    key: 'EMPATHY_QUOTE',
    version: 1,
    canvas,
    safeArea,
    imageArea: { x: 0, y: 0, width: 1080, height: 1350 },
    headlineArea: { x: 120, y: 250, width: 840, height: 280 },
    bodyArea: { x: 140, y: 580, width: 800, height: 390 },
    ctaArea: { x: 120, y: 1080, width: 840, height: 130 },
    assetPlacement: 'BACKGROUND',
    headline: rule(20, 1, 3, 68, 56),
    body: rule(28, 1, 3, 46, 38),
    cta: rule(28, 0, 1, 36, 32),
  },
  CTA: {
    key: 'CTA',
    version: 1,
    canvas,
    safeArea,
    imageArea: { x: 650, y: 300, width: 358, height: 500 },
    headlineArea: { x: 72, y: 150, width: 700, height: 260 },
    bodyArea: { x: 72, y: 500, width: 560, height: 350 },
    ctaArea: { x: 72, y: 1010, width: 936, height: 210 },
    assetPlacement: 'FOREGROUND',
    headline: rule(20, 1, 2, 76, 62),
    body: rule(30, 1, 3, 46, 38),
    cta: rule(26, 1, 1, 48, 42),
  },
});

const forbiddenDirectionalText = /[\u202A-\u202E\u2066-\u2069]/u;
const countCharacters = (value: string) => Array.from(value).length;
const containsControlCharacter = (value: string) =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });

const normalizeLine = (value: string, field: string, maximum: number) => {
  const normalized = value.trim();
  if (
    !normalized ||
    containsControlCharacter(normalized) ||
    forbiddenDirectionalText.test(normalized) ||
    countCharacters(normalized) > maximum
  )
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

export const getSocialImageTemplateDefinition = (key: SocialImageTemplateKey) => {
  const definition = SOCIAL_IMAGE_TEMPLATE_DEFINITIONS[key];
  if (!definition) throw new ApplicationError('VALIDATION_ERROR', 'invalid templateKey');
  return definition;
};

const normalizeSocialImagePageLayout = (input: SocialImagePageLayout): SocialImagePageLayout => {
  const definition = getSocialImageTemplateDefinition(input.templateKey);
  if (
    input.bodyLines.length < definition.body.minLines ||
    input.bodyLines.length > definition.body.maxLines
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid bodyLines');
  const cta = input.cta
    ? normalizeLine(input.cta, 'cta', definition.cta?.maxCharactersPerLine ?? 0)
    : null;
  if ((definition.cta?.minLines ?? 0) > 0 && cta === null)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid cta');
  const accentColor = input.accentColor.trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(accentColor))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid accentColor');
  return {
    templateKey: input.templateKey,
    headline: normalizeLine(input.headline, 'headline', definition.headline.maxCharactersPerLine),
    bodyLines: input.bodyLines.map((line) =>
      normalizeLine(line, 'bodyLine', definition.body.maxCharactersPerLine),
    ),
    cta,
    accentColor,
  };
};

export const normalizeSocialImageLayout = (input: SocialImageLayout): SocialImageLayout => {
  const layout = normalizeSocialImagePageLayout(input);
  if (input.carouselPages && (input.carouselPages.length < 1 || input.carouselPages.length > 6))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid carouselPages');
  const carouselPages = input.carouselPages?.map(normalizeSocialImagePageLayout);
  return { ...layout, ...(carouselPages ? { carouselPages } : {}) };
};

const compactText = (value: string) => value.replace(/\s+/gu, ' ').trim();

const fitLine = (value: string, maximum: number) => {
  const characters = Array.from(compactText(value));
  if (characters.length <= maximum) return characters.join('');
  return `${characters.slice(0, Math.max(1, maximum - 1)).join('')}…`;
};

const splitLines = (value: string, maximum: number, maxLines: number) => {
  const characters = Array.from(compactText(value));
  const lines: string[] = [];
  let line = '';
  for (const character of characters) {
    line += character;
    if (Array.from(line).length >= maximum || ['。', '！', '？'].includes(character)) {
      lines.push(line.trim());
      line = '';
      if (lines.length === maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line.trim());
  if (!lines.length) lines.push('今日からできること');
  if (lines.length === maxLines && lines.join('').length < characters.length)
    lines[maxLines - 1] = fitLine(lines[maxLines - 1] ?? '', maximum);
  return lines.filter(Boolean);
};

export const buildEditorialCarouselLayout = (input: {
  slides: EditorialCarouselSlideInput[];
  accentColor: string;
}): SocialImageLayout => {
  if (input.slides.length < 1 || input.slides.length > 7)
    throw new ApplicationError('VALIDATION_ERROR', 'invalid editorial carousel slides');
  const slides = input.slides.slice(0, 7);
  const first = slides[0]!;
  const remaining = slides.slice(1).map((slide, index, values): SocialImagePageLayout => {
    const summary = slide.role === 'CTA' || index === values.length - 1;
    return {
      templateKey: summary ? 'EDITORIAL_SUMMARY' : 'EDITORIAL_POINT',
      headline: fitLine(slide.headline, 20),
      bodyLines: splitLines(slide.body, 26, 4),
      cta: summary ? 'あとで見返せるように保存' : '次のページへ',
      accentColor: input.accentColor,
    };
  });
  return normalizeSocialImageLayout({
    templateKey: 'EDITORIAL_COVER',
    headline: fitLine(first.headline, 20),
    bodyLines: splitLines(first.body, 12, 2),
    cta: remaining.length ? 'スワイプして続きを見る' : 'あとで見返せるように保存',
    accentColor: input.accentColor,
    ...(remaining.length ? { carouselPages: remaining } : {}),
  });
};

export interface SocialImageCompositionPlan {
  templateKey: SocialImageTemplateKey;
  templateVersion: 1;
  definition: SocialImageTemplateDefinition;
  layout: SocialImageLayout;
}

export const buildSocialImageCompositionPlan = (
  input: SocialImageLayout,
): SocialImageCompositionPlan => {
  const layout = normalizeSocialImageLayout(input);
  return {
    templateKey: layout.templateKey,
    templateVersion: 1,
    definition: getSocialImageTemplateDefinition(layout.templateKey),
    layout,
  };
};
