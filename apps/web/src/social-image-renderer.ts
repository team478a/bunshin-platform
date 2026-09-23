import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildSocialImageCompositionPlan,
  type SocialImageCompositionPlan,
  type SocialImageLayout,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { Resvg } from '@resvg/resvg-js';
import { createElement, type ReactNode } from 'react';
import satori from 'satori';
import sharp from 'sharp';
import { editorialCoverTree, editorialTextPageTree } from './social-image-editorial-layouts';
import {
  SOCIAL_IMAGE_FONT_FAMILY,
  assetElement,
  bodyBlock,
  positioned,
  textBlock,
} from './social-image-renderer-primitives';

export { editorialHeadline } from './social-image-editorial-layouts';

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

const composeTree = (plan: SocialImageCompositionPlan, dataUri: string | null): ReactNode => {
  if (plan.templateKey === 'EDITORIAL_COVER') return editorialCoverTree(plan, dataUri);
  if (plan.templateKey === 'EDITORIAL_POINT' || plan.templateKey === 'EDITORIAL_SUMMARY')
    return editorialTextPageTree(plan, dataUri);
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
            fontFamily: SOCIAL_IMAGE_FONT_FAMILY,
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
        { name: SOCIAL_IMAGE_FONT_FAMILY, data: this.fonts.regular, weight: 400, style: 'normal' },
        { name: SOCIAL_IMAGE_FONT_FAMILY, data: this.fonts.bold, weight: 700, style: 'normal' },
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
