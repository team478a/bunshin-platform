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

  const overlay = Buffer.alloc(rect.width * rect.height * 4);
  const thickness = Math.min(5, rect.height, rect.width);
  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      if (
        y >= thickness &&
        y < rect.height - thickness &&
        x >= thickness &&
        x < rect.width - thickness
      )
        continue;
      const offset = (y * rect.width + x) * 4;
      overlay[offset] = 220;
      overlay[offset + 1] = 38;
      overlay[offset + 2] = 38;
      overlay[offset + 3] = 255;
    }
  }

  const marked = await before
    .composite([
      {
        input: overlay,
        raw: { width: rect.width, height: rect.height, channels: 4 },
        top: rect.top,
        left: rect.left,
      },
    ])
    .png()
    .toBuffer();
  const padding = 40;
  const detailWidth = Math.min(width, rect.width + 2 * padding);
  const detailHeight = Math.min(height, rect.height + 2 * padding);
  // Keep the crop centred on the target, and move the entire crop inside the frame.
  const left = Math.max(0, Math.min(width - detailWidth, rect.left - padding));
  const top = Math.max(0, Math.min(height - detailHeight, rect.top - padding));
  const detailImage = await sharp(marked)
    .extract({ left, top, width: detailWidth, height: detailHeight })
    .webp({ quality: 90 })
    .toBuffer();
  const beforeImage = await sharp(marked)
    .resize({ width: 1440, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
  return { beforeImage, afterImage, detailImage };
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
