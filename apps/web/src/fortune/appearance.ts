import { z } from 'zod';

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const fortuneAppearanceSchema = z
  .object({
    enabled: z.boolean(),
    palette: z.enum(['light', 'night']),
    useBrandColors: z.boolean(),
    background: color.optional(),
    surface: color.optional(),
    text: color.optional(),
    action: color.optional(),
    accent: color.optional(),
    backdrop: z.enum(['plain', 'glow']),
    cards: z.enum(['outline', 'shadow', 'flat']),
    corners: z.enum(['square', 'soft', 'rounded']),
    ornament: z.enum(['none', 'moon', 'stars', 'both']),
    heading: z.enum(['sans', 'serif']),
    showLogo: z.boolean(),
  })
  .strict();

const appearanceFromGuidance = z.object({ appearance: fortuneAppearanceSchema.optional() });

export const readFortuneAppearance = (guidance: unknown) =>
  appearanceFromGuidance.safeParse(guidance).data?.appearance;

export type FortuneAppearanceSettings = z.infer<typeof fortuneAppearanceSchema>;
export type FortuneAppearanceBrand = {
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
};

export const defaultFortuneAppearance: FortuneAppearanceSettings = {
  enabled: false,
  palette: 'light',
  useBrandColors: false,
  backdrop: 'glow',
  cards: 'outline',
  corners: 'rounded',
  ornament: 'both',
  heading: 'serif',
  showLogo: true,
};

const palettes = {
  light: {
    background: '#f9f5ec',
    surface: '#fffdf9',
    text: '#211d41',
    action: '#28234f',
    accent: '#a47935',
  },
  night: {
    background: '#17162b',
    surface: '#24223b',
    text: '#fff3de',
    action: '#ead5a9',
    accent: '#d2ac68',
  },
};

export function resolveFortuneAppearanceColors(
  settings: FortuneAppearanceSettings,
  brand?: FortuneAppearanceBrand,
) {
  const palette = palettes[settings.palette];
  const brandAction = settings.useBrandColors
    ? color.safeParse(brand?.primaryColor).data
    : undefined;
  const brandAccent = settings.useBrandColors
    ? color.safeParse(brand?.secondaryColor).data
    : undefined;
  return {
    background: settings.background ?? palette.background,
    surface: settings.surface ?? palette.surface,
    text: settings.text ?? palette.text,
    action: settings.action ?? brandAction ?? palette.action,
    accent: settings.accent ?? brandAccent ?? palette.accent,
  };
}

function luminance(hex: string) {
  const channels = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((pair) => {
    const channel = Number.parseInt(pair, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels.reduce(
    (value, channel, index) => value + channel * ([0.2126, 0.7152, 0.0722][index] ?? 0),
    0,
  );
}

export function fortuneContrast(first: string, second: string) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function fortuneReadableText(preferred: string, background: string) {
  if (fortuneContrast(preferred, background) >= 4.5) return preferred;
  return fortuneContrast('#ffffff', background) > fortuneContrast('#000000', background)
    ? '#ffffff'
    : '#000000';
}
