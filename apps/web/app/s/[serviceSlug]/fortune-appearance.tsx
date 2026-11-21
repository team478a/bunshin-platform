import type { CSSProperties, ReactNode } from 'react';
import '@fontsource-variable/noto-sans-jp';
import {
  fortuneReadableText,
  resolveFortuneAppearanceColors,
  type FortuneAppearanceBrand,
  type FortuneAppearanceSettings,
} from '../../../src/fortune/appearance';
import './fortune-appearance.css';

const ornaments = { none: '', moon: '☾', stars: '✧', both: '✧　☾　✧' } as const;

export function FortuneAppearance({
  settings,
  brand,
  children,
  showMastheadLogo = true,
}: {
  settings: FortuneAppearanceSettings | undefined;
  brand: FortuneAppearanceBrand | undefined;
  children: ReactNode;
  showMastheadLogo?: boolean;
}) {
  if (!settings?.enabled) return children;

  const colors = resolveFortuneAppearanceColors(settings, brand);
  const style = {
    '--fortune-canvas': colors.background,
    '--fortune-surface': colors.surface,
    '--fortune-canvas-text': fortuneReadableText(colors.text, colors.background),
    '--fortune-surface-text': fortuneReadableText(colors.text, colors.surface),
    '--fortune-action': colors.action,
    '--fortune-action-text': fortuneReadableText(colors.text, colors.action),
    '--fortune-accent': colors.accent,
  } as CSSProperties;
  const ornament = ornaments[settings.ornament];
  const logoUrl = settings.showLogo && showMastheadLogo ? brand?.logoUrl : null;
  return (
    <div
      className="fortune-appearance"
      data-backdrop={settings.backdrop}
      data-cards={settings.cards}
      data-corners={settings.corners}
      data-heading={settings.heading}
      style={style}
    >
      {(logoUrl || ornament) && (
        <div className="fortune-appearance__masthead" aria-hidden="true">
          {logoUrl && (
            <img
              className="fortune-appearance__logo"
              src={logoUrl}
              alt=""
              width={280}
              height={88}
              decoding="async"
              referrerPolicy="no-referrer"
            />
          )}
          {ornament && <span className="fortune-appearance__ornament">{ornament}</span>}
        </div>
      )}
      {children}
    </div>
  );
}
