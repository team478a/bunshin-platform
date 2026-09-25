export const socialImagePagePrompt = (
  layout: {
    templateKey: string;
    headline: string;
    bodyLines: string[];
    accentColor?: string | null | undefined;
    visualScene?: string | null | undefined;
  },
  hasReference: boolean,
  pageIndex: number,
  pageCount: number,
  carousel?: ReadonlyArray<{
    headline: string;
    visualScene?: string | null | undefined;
  }>,
) => {
  const carouselRoles = [
    'cover: establish the one concrete topic and reader benefit',
    'problem: show the reader struggling in a recognizable situation',
    'insight: visualize the cause or key realization',
    'solution: show the practical action being performed',
    'call to action: show the improved result and a clear next step',
  ];
  const pageRole = pageCount === 5 ? carouselRoles[pageIndex] : undefined;
  const carouselStory = carousel
    ?.map(
      (page, index) =>
        `${index + 1}. ${page.headline}${page.visualScene ? ` — ${page.visualScene}` : ''}`,
    )
    .join(' / ');
  return [
    `Create page ${pageIndex + 1} of ${pageCount} for one premium Japanese social-media carousel.`,
    pageRole ? `Narrative role for this page: ${pageRole}.` : '',
    carouselStory ? `Full carousel story for continuity and variation: ${carouselStory}.` : '',
    'Create a realistic editorial lifestyle photograph with commercial-quality lighting, natural hands and skin texture, and a clear subject.',
    layout.accentColor
      ? `Use ${layout.accentColor} only as a subtle accent and choose materials, lighting, location and supporting colors that feel credible for this specific topic or industry.`
      : 'Choose materials, lighting, location and colors that feel credible for this specific topic or industry.',
    'This photograph will be placed inside a separate deterministic Japanese text layout. Do not render text, letters, numbers, logos, watermarks, interface elements, cards, icons, borders or decorative typography.',
    'Leave useful uncluttered negative space and keep important faces, hands, products and tools away from the outer edges.',
    'Let the required scene decide the main subject. Prefer the actual product, service setting, customer situation, craft, tool or result that explains the page.',
    'Do not default to a home-office desk, coffee cup, notebook, smartphone, generic businesswoman or person pointing at cards unless the required scene specifically needs it.',
    hasReference
      ? 'Use the supplied image only to preserve recurring identity, product appearance and art direction where they are relevant. The required page scene takes priority: create its new action, camera angle, props and background, and do not copy the reference pose or composition. Do not change product labeling or invent product claims.'
      : 'Create fictional people, products and places that naturally fit the required scene and topic. Keep recurring people or products visually consistent across pages, but do not add a person when the product, venue, tool or result is the clearer subject. Do not imitate a real person, business or celebrity.',
    layout.visualScene
      ? `Required scene, action and composition: ${layout.visualScene}.`
      : `Create a concrete scene that directly explains: ${layout.headline}.`,
    `Communication theme only: ${layout.headline}.`,
    `Supporting concepts only: ${layout.bodyLines.join(', ')}.`,
    pageIndex > 0
      ? 'This page must visibly differ from the cover and the other pages in action, camera angle, props and background while keeping the same referenced subject or visual identity and art direction.'
      : 'Make this an inviting cover scene that immediately establishes the topic.',
  ]
    .filter(Boolean)
    .join(' ');
};
