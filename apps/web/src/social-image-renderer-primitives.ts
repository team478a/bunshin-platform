import type { SocialImageCompositionPlan, SocialImageRect } from '@bunshin/application';
import { createElement, type CSSProperties, type ReactNode } from 'react';

export const SOCIAL_IMAGE_FONT_FAMILY = 'Noto Sans JP';

export const positioned = (rect: SocialImageRect, extra: CSSProperties = {}): CSSProperties => ({
  position: 'absolute',
  left: rect.x,
  top: rect.y,
  width: rect.width,
  height: rect.height,
  ...extra,
});

export const textBlock = (
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
        fontFamily: SOCIAL_IMAGE_FONT_FAMILY,
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

export const bodyBlock = (plan: SocialImageCompositionPlan, color: string) =>
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
            fontFamily: SOCIAL_IMAGE_FONT_FAMILY,
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

export const assetElement = (
  plan: SocialImageCompositionPlan,
  dataUri: string | null,
): ReactNode => {
  const area = plan.definition.imageArea;
  if (!area || !dataUri) return null;
  const editorial = ['EDITORIAL_COVER', 'EDITORIAL_POINT', 'EDITORIAL_SUMMARY'].includes(
    plan.templateKey,
  );
  return createElement('img', {
    src: dataUri,
    width: area.width,
    height: area.height,
    style: positioned(area, {
      objectFit: editorial ? 'cover' : 'contain',
      ...(editorial
        ? {
            objectPosition: 'center center',
            borderRadius: plan.templateKey === 'EDITORIAL_COVER' ? 54 : 42,
          }
        : {}),
    }),
  });
};
