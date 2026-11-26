import sharp from 'sharp';
import type { BrowserStepEvidence } from '@bunshin/capability-browser';

const maxFixturePixels = 10_000_000;

export async function materialImages(
  step: Pick<BrowserStepEvidence, 'beforePng' | 'afterPng' | 'target'>,
) {
  const before = sharp(step.beforePng, { limitInputPixels: maxFixturePixels });
  const afterImage = await sharp(step.afterPng, { limitInputPixels: maxFixturePixels })
    .resize({ width: 1440, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
  const { width, height } = await before.metadata();
  const target = step.target;
  const rect = target ? visiblePixels(target, width, height) : null;
  if (!rect) {
    return {
      beforeImage: await before
        .resize({ width: 1440, withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer(),
      afterImage,
      detailImage: null,
    };
  }

  const marked = await before
    .composite([
      {
        input: targetOutline(rect.width, rect.height, Math.min(5, rect.height, rect.width)),
        raw: { width: rect.width, height: rect.height, channels: 4 },
        top: rect.top,
        left: rect.left,
      },
    ])
    .png()
    .toBuffer();

  const beforeImage = await sharp(marked)
    .resize({ width: 1440, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();

  // The close-up isolates the recorded target so nearby controls never appear half cut off.
  const targetImage = await sharp(step.beforePng, { limitInputPixels: maxFixturePixels })
    .extract(rect)
    .png()
    .toBuffer();
  const padding = 20;
  const clearance = 8;
  const outlineWidth = rect.width + clearance * 2;
  const outlineHeight = rect.height + clearance * 2;
  const detailImage = await sharp({
    create: {
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
      channels: 3,
      background: 'white',
    },
  })
    .composite([
      { input: targetImage, top: padding, left: padding },
      {
        input: targetOutline(outlineWidth, outlineHeight, 3),
        raw: { width: outlineWidth, height: outlineHeight, channels: 4 },
        top: padding - clearance,
        left: padding - clearance,
      },
    ])
    .webp({ quality: 90 })
    .toBuffer();
  return { beforeImage, afterImage, detailImage };
}

function targetOutline(width: number, height: number, thickness: number) {
  const overlay = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (y >= thickness && y < height - thickness && x >= thickness && x < width - thickness)
        continue;
      const offset = (y * width + x) * 4;
      overlay[offset] = 220;
      overlay[offset + 1] = 38;
      overlay[offset + 2] = 38;
      overlay[offset + 3] = 255;
    }
  }
  return overlay;
}

function visiblePixels(
  target: NonNullable<BrowserStepEvidence['target']>,
  width: number,
  height: number,
) {
  const sx = width / target.viewportWidth;
  const sy = height / target.viewportHeight;
  const left = Math.max(0, Math.floor(target.x * sx));
  const top = Math.max(0, Math.floor(target.y * sy));
  const right = Math.min(width, Math.ceil((target.x + target.width) * sx));
  const bottom = Math.min(height, Math.ceil((target.y + target.height) * sy));
  return right > left && bottom > top
    ? { left, top, width: right - left, height: bottom - top }
    : null;
}
