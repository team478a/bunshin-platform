import type { SocialImageCompositionPlan } from '@bunshin/application';
import { createElement, type ReactNode } from 'react';
import {
  SOCIAL_IMAGE_FONT_FAMILY,
  assetElement,
  positioned,
  textBlock,
} from './social-image-renderer-primitives';

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

export const editorialCoverTree = (
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
            fontFamily: SOCIAL_IMAGE_FONT_FAMILY,
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
          fontFamily: SOCIAL_IMAGE_FONT_FAMILY,
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
        { x: 374, y: 620, width: 664, height: 560 },
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
            borderRadius: 45,
            color: ink,
            backgroundColor: 'rgba(255,255,255,0.92)',
            boxShadow: '0 10px 30px rgba(93,66,47,0.12)',
            fontFamily: SOCIAL_IMAGE_FONT_FAMILY,
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

export const editorialTextPageTree = (
  plan: SocialImageCompositionPlan,
  dataUri: string | null,
): ReactNode => {
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
            fontFamily: SOCIAL_IMAGE_FONT_FAMILY,
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
          padding: '26px 42px',
          gap: 14,
          borderRadius: 54,
          color: ink,
          backgroundColor: '#FFFFFF',
          boxShadow: '0 18px 50px rgba(93,66,47,0.14)',
          fontFamily: SOCIAL_IMAGE_FONT_FAMILY,
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
  if (dataUri) {
    const imageArea = plan.definition.imageArea!;
    children.push(
      createElement('div', {
        style: positioned(
          {
            x: imageArea.x - 10,
            y: imageArea.y - 10,
            width: imageArea.width + 20,
            height: imageArea.height + 20,
          },
          {
            display: 'flex',
            borderRadius: 50,
            backgroundColor: '#FFFFFF',
            boxShadow: '0 16px 44px rgba(93,66,47,0.16)',
          },
        ),
      }),
      assetElement(plan, dataUri),
    );
  }
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
        backgroundColor: '#FFF8EF',
      },
    },
    ...children,
  );
};
