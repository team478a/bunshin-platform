import { describe, expect, it } from 'vitest';
import {
  SOCIAL_IMAGE_HEIGHT,
  SOCIAL_IMAGE_TEMPLATE_DEFINITIONS,
  SOCIAL_IMAGE_TEMPLATE_KEYS,
  SOCIAL_IMAGE_WIDTH,
  buildSocialImageCompositionPlan,
  normalizeSocialImageLayout,
  type SocialImageLayout,
  type SocialImageRect,
} from '../src';

const base: SocialImageLayout = {
  templateKey: 'THREE_POINTS',
  headline: '今日からできる3つのこと',
  bodyLines: ['一つ目', '二つ目', '三つ目'],
  cta: '保存して試してください',
  accentColor: '#ff3b30',
};

const isInside = (inner: SocialImageRect, outer: SocialImageRect) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

describe('Social image templates', () => {
  it('provides exactly five versioned 1080 by 1350 templates', () => {
    expect(Object.keys(SOCIAL_IMAGE_TEMPLATE_DEFINITIONS)).toEqual(SOCIAL_IMAGE_TEMPLATE_KEYS);
    for (const definition of Object.values(SOCIAL_IMAGE_TEMPLATE_DEFINITIONS)) {
      expect(definition.version).toBe(1);
      expect(definition.canvas).toEqual({
        x: 0,
        y: 0,
        width: SOCIAL_IMAGE_WIDTH,
        height: SOCIAL_IMAGE_HEIGHT,
      });
      expect(isInside(definition.safeArea, definition.canvas)).toBe(true);
      expect(isInside(definition.headlineArea, definition.safeArea)).toBe(true);
      expect(isInside(definition.bodyArea, definition.safeArea)).toBe(true);
      if (definition.ctaArea) expect(isInside(definition.ctaArea, definition.safeArea)).toBe(true);
      if (definition.imageArea)
        expect(isInside(definition.imageArea, definition.canvas)).toBe(true);
      expect(definition.headline.fontSize).toBeGreaterThanOrEqual(definition.headline.minFontSize);
      expect(definition.body.fontSize).toBeGreaterThanOrEqual(definition.body.minFontSize);
    }
  });

  it('normalizes color and creates a deterministic composition plan', () => {
    const first = buildSocialImageCompositionPlan(base);
    const second = buildSocialImageCompositionPlan(base);
    expect(first).toEqual(second);
    expect(first.layout.accentColor).toBe('#FF3B30');
    expect(first.templateVersion).toBe(1);
  });

  it('enforces template-specific body line counts and required CTA', () => {
    expect(() =>
      normalizeSocialImageLayout({ ...base, bodyLines: ['一つ目', '二つ目'] }),
    ).toThrow();
    expect(() =>
      normalizeSocialImageLayout({
        ...base,
        templateKey: 'PROBLEM_CHECKLIST',
        bodyLines: ['悩み一', '悩み二', '悩み三'],
        cta: null,
      }),
    ).toThrow();
  });

  it('rejects overflow, embedded line breaks, controls, and bidi overrides', () => {
    expect(() => normalizeSocialImageLayout({ ...base, headline: 'あ'.repeat(23) })).toThrow();
    expect(() =>
      normalizeSocialImageLayout({ ...base, bodyLines: ['一つ目\n続き', '二つ目', '三つ目'] }),
    ).toThrow();
    expect(() => normalizeSocialImageLayout({ ...base, headline: '安全\u202E表示' })).toThrow();
  });
});
