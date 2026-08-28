import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  ManagedSocialImageRenderer,
  loadBundledSocialImageFonts,
  type SocialImageRendererFonts,
} from '../src/social-image-renderer';
import type { SocialImageLayout, SocialImageTemplateKey } from '@bunshin/application';

const layouts: Record<SocialImageTemplateKey, SocialImageLayout> = {
  PERSON_HEADLINE: {
    templateKey: 'PERSON_HEADLINE',
    headline: '今日の一歩を始めよう',
    bodyLines: ['小さく始める', '続けられる形にする'],
    cta: '保存して試す',
    accentColor: '#FF3B30',
  },
  PROBLEM_CHECKLIST: {
    templateKey: 'PROBLEM_CHECKLIST',
    headline: 'こんな悩みはありませんか',
    bodyLines: ['何から始めるか迷う', '時間が足りない', '続けられるか心配'],
    cta: '一つずつ解決しましょう',
    accentColor: '#FF3B30',
  },
  THREE_POINTS: {
    templateKey: 'THREE_POINTS',
    headline: '今日からできる3つのこと',
    bodyLines: ['一つ目を決める', '五分だけ取り組む', 'できたことを残す'],
    cta: '保存して試す',
    accentColor: '#FF3B30',
  },
  EMPATHY_QUOTE: {
    templateKey: 'EMPATHY_QUOTE',
    headline: 'うまくできない日も大丈夫',
    bodyLines: ['止まらずに休むことも', '大切な前進です'],
    cta: null,
    accentColor: '#FF3B30',
  },
  CTA: {
    templateKey: 'CTA',
    headline: '今日から一緒に始めませんか',
    bodyLines: ['迷ったら最初の一歩だけ'],
    cta: '詳しく見る',
    accentColor: '#FF3B30',
  },
};

let fonts: SocialImageRendererFonts;
let asset: Buffer;

beforeAll(async () => {
  fonts = await loadBundledSocialImageFonts();
  asset = await sharp({
    create: { width: 800, height: 800, channels: 4, background: '#E9DCCF' },
  })
    .png()
    .toBuffer();
});

describe('Managed social image renderer', () => {
  it.each(Object.keys(layouts) as SocialImageTemplateKey[])(
    'renders %s as fixed PNG and thumbnail',
    async (key) => {
      const renderer = new ManagedSocialImageRenderer(fonts);
      const result = await renderer.render({
        layout: layouts[key],
        sourceAsset: ['PERSON_HEADLINE', 'EMPATHY_QUOTE', 'CTA'].includes(key) ? asset : null,
      });
      await expect(sharp(result.completedPng).metadata()).resolves.toMatchObject({
        format: 'png',
        width: 1080,
        height: 1350,
      });
      await expect(sharp(result.thumbnailPng).metadata()).resolves.toMatchObject({
        format: 'png',
        width: 324,
        height: 405,
      });
      expect(result.contentHash).toBe(
        createHash('sha256').update(result.completedPng).digest('hex'),
      );
    },
    30_000,
  );

  it('produces identical bytes from identical input', async () => {
    const renderer = new ManagedSocialImageRenderer(fonts);
    const input = { layout: layouts.THREE_POINTS, sourceAsset: null };
    const first = await renderer.render(input);
    const second = await renderer.render(input);
    expect(second.contentHash).toBe(first.contentHash);
    expect(second.completedPng.equals(first.completedPng)).toBe(true);
  }, 30_000);

  it('rejects missing, extra, oversized, and unsupported assets', async () => {
    const renderer = new ManagedSocialImageRenderer(fonts);
    await expect(renderer.render({ layout: layouts.CTA, sourceAsset: null })).rejects.toMatchObject(
      { code: 'VALIDATION_ERROR' },
    );
    await expect(
      renderer.render({ layout: layouts.THREE_POINTS, sourceAsset: asset }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      renderer.render({ layout: layouts.CTA, sourceAsset: Buffer.alloc(15 * 1024 * 1024 + 1) }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      renderer.render({ layout: layouts.CTA, sourceAsset: Buffer.from('<svg/>') }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
