import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildSocialImageCompositionPlan,
  type SocialImageCompositionPlan,
  type SocialImageLayout,
  type SocialImageRect,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { Resvg } from '@resvg/resvg-js';
import { createElement, type CSSProperties, type ReactNode } from 'react';
import satori from 'satori';
import sharp from 'sharp';

const FONT_FAMILY = 'Noto Sans JP';
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_SOURCE_EDGE = 8192;

export interface SocialImageRendererFonts {
  regular: Buffer;
  bold: Buffer;
}

export interface RenderSocialImageInput {
  layout: SocialImageLayout;
  sourceAsset: Buffer | null;
}

export interface RenderedSocialImage {
  completedPng: Buffer;
  thumbnailPng: Buffer;
  width: 1080;
  height: 1350;
  contentHash: string;
  templateVersion: 1;
}

export const loadBundledSocialImageFonts = async (): Promise<SocialImageRendererFonts> => {
  const directory = join(process.cwd(), 'assets/fonts/noto-sans-jp');
  const [regular, bold] = await Promise.all([
    readFile(join(directory, 'NotoSansCJKjp-Regular.otf')),
    readFile(join(directory, 'NotoSansCJKjp-Bold.otf')),
  ]);
  return { regular, bold };
};

const positioned = (rect: SocialImageRect, extra: CSSProperties = {}): CSSProperties => ({
  position: 'absolute',
  left: rect.x,
  top: rect.y,
  width: rect.width,
  height: rect.height,
  ...extra,
});

const textBlock = (
  text: string,
  rect: SocialImageRect,
  options: { fontSize: number; weight: 400 | 700; color: string; align?: 'left' | 'center' },
) =>
  createElement(
    'div',
    {
      lang: 'ja-JP',
      style: positioned(rect, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: options.align === 'center' ? 'center' : 'flex-start',
        color: options.color,
        fontFamily: FONT_FAMILY,
        fontSize: options.fontSize,
        fontWeight: options.weight,
        lineHeight: 1.35,
        textAlign: options.align ?? 'left',
        whiteSpace: 'pre-wrap',
        overflow: 'hidden',
      }),
    },
    text,
  );

const bodyBlock = (plan: SocialImageCompositionPlan, color: string) =>
  createElement(
    'div',
    {
      style: positioned(plan.definition.bodyArea, {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: plan.templateKey === 'THREE_POINTS' ? 28 : 20,
      }),
    },
    ...plan.layout.bodyLines.map((line, index) =>
      createElement(
        'div',
        {
          key: `${index}-${line}`,
          lang: 'ja-JP',
          style: {
            display: 'flex',
            alignItems: 'center',
            color,
            fontFamily: FONT_FAMILY,
            fontSize: plan.definition.body.fontSize,
            fontWeight: 400,
            lineHeight: 1.35,
          },
        },
        plan.templateKey === 'PROBLEM_CHECKLIST'
          ? createElement(
              'span',
              {
                style: {
                  display: 'flex',
                  width: 42,
                  height: 42,
                  marginRight: 20,
                  border: `4px solid ${plan.layout.accentColor}`,
                  borderRadius: 8,
                },
              },
              '',
            )
          : plan.templateKey === 'THREE_POINTS'
            ? createElement(
                'span',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 62,
                    height: 62,
                    marginRight: 24,
                    borderRadius: 31,
                    color: '#FFFFFF',
                    backgroundColor: plan.layout.accentColor,
                    fontSize: 34,
                    fontWeight: 700,
                  },
                },
                String(index + 1),
              )
            : null,
        createElement('span', { style: { display: 'flex', flex: 1 } }, line),
      ),
    ),
  );

const assetElement = (plan: SocialImageCompositionPlan, dataUri: string | null): ReactNode => {
  const area = plan.definition.imageArea;
  if (!area || !dataUri) return null;
  return createElement('img', {
    src: dataUri,
    width: area.width,
    height: area.height,
    style: positioned(area, {
      objectFit: plan.templateKey === 'EDITORIAL_COVER' ? 'cover' : 'contain',
      ...(plan.templateKey === 'EDITORIAL_COVER'
        ? { objectPosition: 'center center', borderRadius: 54 }
        : {}),
    }),
  });
};

export const editorialHeadline = (value: string) => {
  const characters = Array.from(value);
  if (characters.length <= 11) return value;
  const midpoint = characters.length / 2;
  const minimum = Math.max(4, Math.floor(characters.length * 0.35));
  const maximum = Math.min(11, characters.length - 4);
  const naturalBreaks = new Set([
    '、',
    '。',
    '！',
    '？',
    'は',
    'が',
    'を',
    'に',
    'で',
    'と',
    'へ',
    'も',
  ]);
  const candidates = Array.from(
    { length: Math.max(0, maximum - minimum + 1) },
    (_, index) => minimum + index,
  ).filter((index) => naturalBreaks.has(characters[index - 1] ?? ''));
  const breakAt =
    candidates.sort((left, right) => Math.abs(left - midpoint) - Math.abs(right - midpoint))[0] ??
    Math.min(10, Math.max(minimum, Math.round(midpoint)));
  return `${characters.slice(0, breakAt).join('')}\n${characters.slice(breakAt).join('')}`;
};

const editorialCoverTree = (
  plan: SocialImageCompositionPlan,
  dataUri: string | null,
): ReactNode => {
  const ink = '#35251A';
  const coral = plan.layout.accentColor;
  const lavender = '#C9B5DF';
  const headline = editorialHeadline(plan.layout.headline);
  const children: ReactNode[] = [
    createElement('div', {
      style: positioned(
        { x: -82, y: -72, width: 330, height: 250 },
        {
          display: 'flex',
          borderRadius: 150,
          backgroundColor: '#F5A7A0',
          transform: 'rotate(-12deg)',
        },
      ),
    }),
    createElement('div', {
      style: positioned(
        { x: 930, y: 180, width: 250, height: 410 },
        {
          display: 'flex',
          borderRadius: 130,
          backgroundColor: lavender,
          transform: 'rotate(8deg)',
        },
      ),
    }),
    createElement('div', {
      style: positioned(
        { x: -110, y: 1050, width: 330, height: 360 },
        {
          display: 'flex',
          borderRadius: 160,
          backgroundColor: '#F18B84',
          transform: 'rotate(14deg)',
        },
      ),
    }),
    createElement('div', {
      style: positioned(
        { x: 692, y: 1120, width: 470, height: 300 },
        {
          display: 'flex',
          borderRadius: 180,
          backgroundColor: '#D9C9E8',
          transform: 'rotate(-7deg)',
        },
      ),
    }),
    createElement(
      'div',
      {
        style: positioned(
          { x: 72, y: 76, width: 264, height: 54 },
          {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 27,
            color: '#FFFFFF',
            backgroundColor: coral,
            fontFamily: FONT_FAMILY,
            fontSize: 27,
            fontWeight: 700,
            letterSpacing: 2,
          },
        ),
      },
      '今日の投稿ヒント',
    ),
    textBlock(headline, plan.definition.headlineArea, {
      fontSize: plan.definition.headline.fontSize,
      weight: 700,
      color: ink,
    }),
    createElement('div', {
      style: positioned(
        { x: 72, y: 458, width: 590, height: 6 },
        { display: 'flex', borderRadius: 3, backgroundColor: lavender },
      ),
    }),
    createElement(
      'div',
      {
        style: positioned(plan.definition.bodyArea, {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '18px 22px',
          gap: 4,
          border: `3px dashed ${coral}`,
          borderRadius: 75,
          color: coral,
          backgroundColor: 'rgba(255,255,255,0.72)',
          fontFamily: FONT_FAMILY,
          fontSize: plan.definition.body.fontSize,
          fontWeight: 700,
          lineHeight: 1.25,
          textAlign: 'center',
        }),
      },
      ...plan.layout.bodyLines.map((line, index) =>
        createElement('div', { key: `${index}-${line}`, style: { display: 'flex' } }, line),
      ),
    ),
    createElement('div', {
      style: positioned(
        { x: 374, y: 620, width: 664, height: 620 },
        {
          display: 'flex',
          borderRadius: 68,
          backgroundColor: '#FFFFFF',
          boxShadow: '0 20px 48px rgba(93,66,47,0.16)',
        },
      ),
    }),
  ];
  if (dataUri) children.push(assetElement(plan, dataUri));
  for (let index = 0; index < 12; index += 1)
    children.push(
      createElement('div', {
        key: `dot-${index}`,
        style: positioned(
          { x: 83 + (index % 4) * 23, y: 930 + Math.floor(index / 4) * 23, width: 8, height: 8 },
          { display: 'flex', borderRadius: 4, backgroundColor: lavender },
        ),
      }),
    );
  if (plan.layout.cta && plan.definition.ctaArea && plan.definition.cta)
    children.push(
      createElement(
        'div',
        {
          style: positioned(plan.definition.ctaArea, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: ink,
            fontFamily: FONT_FAMILY,
            fontSize: plan.definition.cta.fontSize,
            fontWeight: 700,
            letterSpacing: 1,
          }),
        },
        createElement('span', {
          style: {
            display: 'flex',
            width: 18,
            height: 26,
            marginRight: 14,
            borderRadius: 4,
            backgroundColor: coral,
          },
        }),
        plan.layout.cta,
      ),
    );
  return createElement(
    'div',
    {
      style: {
        position: 'relative',
        display: 'flex',
        width: plan.definition.canvas.width,
        height: plan.definition.canvas.height,
        overflow: 'hidden',
        backgroundColor: '#FFF8EF',
      },
    },
    ...children,
  );
};

const editorialTextPageTree = (plan: SocialImageCompositionPlan): ReactNode => {
  const ink = '#35251A';
  const coral = plan.layout.accentColor;
  const lavender = '#C9B5DF';
  const summary = plan.templateKey === 'EDITORIAL_SUMMARY';
  const children: ReactNode[] = [
    createElement('div', {
      style: positioned(
        { x: -120, y: -105, width: 400, height: 300 },
        {
          display: 'flex',
          borderRadius: 180,
          backgroundColor: '#F5A7A0',
          transform: 'rotate(-8deg)',
        },
      ),
    }),
    createElement('div', {
      style: positioned(
        { x: 900, y: 90, width: 280, height: 460 },
        {
          display: 'flex',
          borderRadius: 150,
          backgroundColor: lavender,
          transform: 'rotate(8deg)',
        },
      ),
    }),
    createElement('div', {
      style: positioned(
        { x: 710, y: 1110, width: 500, height: 330 },
        {
          display: 'flex',
          borderRadius: 190,
          backgroundColor: '#DCCDEA',
          transform: 'rotate(-9deg)',
        },
      ),
    }),
    createElement(
      'div',
      {
        style: positioned(
          { x: 88, y: 92, width: summary ? 210 : 230, height: 72 },
          {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 36,
            color: '#FFFFFF',
            backgroundColor: coral,
            fontFamily: FONT_FAMILY,
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: 2,
          },
        ),
      },
      summary ? 'まとめ' : 'ポイント',
    ),
    textBlock(editorialHeadline(plan.layout.headline), plan.definition.headlineArea, {
      fontSize: plan.definition.headline.fontSize,
      weight: 700,
      color: ink,
    }),
    createElement(
      'div',
      {
        style: positioned(plan.definition.bodyArea, {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '54px 58px',
          gap: 22,
          borderRadius: 54,
          color: ink,
          backgroundColor: '#FFFFFF',
          boxShadow: '0 18px 50px rgba(93,66,47,0.14)',
          fontFamily: FONT_FAMILY,
          fontSize: plan.definition.body.fontSize,
          fontWeight: summary ? 700 : 400,
          lineHeight: 1.45,
        }),
      },
      ...plan.layout.bodyLines.map((line, index) =>
        createElement(
          'div',
          { key: `${index}-${line}`, style: { display: 'flex', alignItems: 'center' } },
          createElement('span', {
            style: {
              display: 'flex',
              flexShrink: 0,
              width: 18,
              height: 18,
              marginRight: 22,
              borderRadius: 9,
              backgroundColor: index % 2 === 0 ? coral : lavender,
            },
          }),
          line,
        ),
      ),
    ),
  ];
  if (plan.layout.cta && plan.definition.ctaArea && plan.definition.cta)
    children.push(
      createElement(
        'div',
        {
          style: positioned(plan.definition.ctaArea, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 45,
            color: summary ? '#FFFFFF' : ink,
            backgroundColor: summary ? coral : 'rgba(255,255,255,0.72)',
            fontFamily: FONT_FAMILY,
            fontSize: plan.definition.cta.fontSize,
            fontWeight: 700,
          }),
        },
        plan.layout.cta,
      ),
    );
  return createElement(
    'div',
    {
      style: {
        position: 'relative',
        display: 'flex',
        width: plan.definition.canvas.width,
        height: plan.definition.canvas.height,
        overflow: 'hidden',
        backgroundColor: '#FFF8EF',
      },
    },
    ...children,
  );
};

const composeTree = (plan: SocialImageCompositionPlan, dataUri: string | null): ReactNode => {
  if (plan.templateKey === 'EDITORIAL_COVER') return editorialCoverTree(plan, dataUri);
  if (plan.templateKey === 'EDITORIAL_POINT' || plan.templateKey === 'EDITORIAL_SUMMARY')
    return editorialTextPageTree(plan);
  const dark = '#0B2D5C';
  const isBackground = plan.definition.assetPlacement === 'BACKGROUND';
  const foreground = isBackground ? '#FFFFFF' : dark;
  const children: ReactNode[] = [];
  if (dataUri && isBackground) children.push(assetElement(plan, dataUri));
  if (isBackground)
    children.push(
      createElement('div', {
        style: positioned(plan.definition.canvas, {
          display: 'flex',
          background: 'linear-gradient(180deg, rgba(6,31,68,0.25), rgba(6,31,68,0.82))',
        }),
      }),
    );
  children.push(
    createElement('div', {
      style: positioned(
        { x: 72, y: 72, width: 86, height: 12 },
        {
          display: 'flex',
          borderRadius: 6,
          backgroundColor: plan.layout.accentColor,
        },
      ),
    }),
  );
  if (dataUri && !isBackground) children.push(assetElement(plan, dataUri));
  children.push(
    textBlock(plan.layout.headline, plan.definition.headlineArea, {
      fontSize: plan.definition.headline.fontSize,
      weight: 700,
      color: foreground,
      align: plan.templateKey === 'EMPATHY_QUOTE' ? 'center' : 'left',
    }),
    bodyBlock(plan, foreground),
  );
  if (plan.layout.cta && plan.definition.ctaArea && plan.definition.cta)
    children.push(
      createElement(
        'div',
        {
          style: positioned(plan.definition.ctaArea, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 30,
            color: '#FFFFFF',
            backgroundColor: plan.layout.accentColor,
            fontFamily: FONT_FAMILY,
            fontSize: plan.definition.cta.fontSize,
            fontWeight: 700,
          }),
        },
        plan.layout.cta,
      ),
    );
  return createElement(
    'div',
    {
      style: {
        position: 'relative',
        display: 'flex',
        width: plan.definition.canvas.width,
        height: plan.definition.canvas.height,
        overflow: 'hidden',
        backgroundColor: '#FFF9F3',
      },
    },
    ...children,
  );
};

const prepareAsset = async (plan: SocialImageCompositionPlan, sourceAsset: Buffer | null) => {
  const area = plan.definition.imageArea;
  if (plan.definition.assetPlacement === 'NONE') {
    if (sourceAsset) throw new ApplicationError('VALIDATION_ERROR', 'asset is not allowed');
    return null;
  }
  if (!sourceAsset || !area)
    throw new ApplicationError('VALIDATION_ERROR', 'source asset is required');
  if (sourceAsset.byteLength > MAX_SOURCE_BYTES)
    throw new ApplicationError('VALIDATION_ERROR', 'source asset is too large');
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    metadata = await sharp(sourceAsset, {
      limitInputPixels: MAX_SOURCE_EDGE * MAX_SOURCE_EDGE,
    }).metadata();
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', 'invalid source asset');
  }
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width > MAX_SOURCE_EDGE ||
    metadata.height > MAX_SOURCE_EDGE ||
    !['jpeg', 'png', 'webp'].includes(metadata.format ?? '')
  )
    throw new ApplicationError('VALIDATION_ERROR', 'invalid source asset');
  const prepared = await sharp(sourceAsset)
    .rotate()
    .resize(area.width, area.height, {
      fit:
        plan.definition.assetPlacement === 'BACKGROUND' || plan.templateKey === 'EDITORIAL_COVER'
          ? 'cover'
          : 'contain',
      position: 'attention',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
  return `data:image/png;base64,${prepared.toString('base64')}`;
};

export class ManagedSocialImageRenderer {
  constructor(private readonly fonts: SocialImageRendererFonts) {
    if (!fonts.regular.length || !fonts.bold.length)
      throw new ApplicationError('CONFIGURATION_ERROR', 'social image font is unavailable');
  }

  async render(input: RenderSocialImageInput): Promise<RenderedSocialImage> {
    const plan = buildSocialImageCompositionPlan(input.layout);
    const asset = await prepareAsset(plan, input.sourceAsset);
    const svg = await satori(composeTree(plan, asset), {
      width: plan.definition.canvas.width,
      height: plan.definition.canvas.height,
      fonts: [
        { name: FONT_FAMILY, data: this.fonts.regular, weight: 400, style: 'normal' },
        { name: FONT_FAMILY, data: this.fonts.bold, weight: 700, style: 'normal' },
      ],
      embedFont: true,
      pointScaleFactor: 1,
    });
    const rasterized = new Resvg(svg, {
      fitTo: { mode: 'original' },
      font: { loadSystemFonts: false },
      logLevel: 'off',
    })
      .render()
      .asPng();
    const completedPng = await sharp(rasterized)
      .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
      .toBuffer();
    const thumbnailPng = await sharp(completedPng)
      .resize({ width: 324, height: 405, fit: 'cover' })
      .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
      .toBuffer();
    return {
      completedPng,
      thumbnailPng,
      width: 1080,
      height: 1350,
      contentHash: createHash('sha256').update(completedPng).digest('hex'),
      templateVersion: plan.templateVersion,
    };
  }
}
