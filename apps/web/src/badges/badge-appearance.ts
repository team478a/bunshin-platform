export const BADGE_APPEARANCES = [
  { key: 'STAR', label: '星', mark: '★' },
  { key: 'TROPHY', label: 'トロフィー', mark: '🏆' },
  { key: 'HEART', label: 'ハート', mark: '♥' },
  { key: 'SPARK', label: 'きらめき', mark: '✦' },
  { key: 'CROWN', label: '王冠', mark: '👑' },
  { key: 'FLAG', label: '旗', mark: '🚩' },
] as const;

export const BADGE_APPEARANCE_KEYS = BADGE_APPEARANCES.map((item) => item.key) as [
  (typeof BADGE_APPEARANCES)[number]['key'],
  ...(typeof BADGE_APPEARANCES)[number]['key'][],
];

export type BadgeAppearanceKey = (typeof BADGE_APPEARANCES)[number]['key'];

export const badgeAppearanceImageKey = (key: BadgeAppearanceKey) =>
  `badges/presets/${key.toLowerCase()}.svg`;

export function badgeAppearanceFromImageKey(imageKey: string) {
  const normalized = imageKey.toLowerCase();
  const selected = BADGE_APPEARANCES.find((item) =>
    normalized.endsWith(`/${item.key.toLowerCase()}.svg`),
  );
  if (selected) return selected;
  if (normalized.includes('post')) return BADGE_APPEARANCES[5];
  if (normalized.includes('streak')) return BADGE_APPEARANCES[1];
  if (normalized.includes('feedback')) return BADGE_APPEARANCES[2];
  if (normalized.includes('image')) return BADGE_APPEARANCES[3];
  return BADGE_APPEARANCES[0];
}
