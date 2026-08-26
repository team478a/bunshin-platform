import Image from 'next/image';

export const BRAND_NAME = 'ワタシワークス';
export const BRAND_LOGO_PATH = '/watashiworks-logo.jpg';
export const BRAND_ICON_PATH = '/watashiworks-icon.jpg';

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand-mark" aria-label={BRAND_NAME}>
      <Image
        className={compact ? 'brand-mark__image brand-mark__image--compact' : 'brand-mark__image'}
        src={compact ? BRAND_ICON_PATH : BRAND_LOGO_PATH}
        alt=""
        width={compact ? 64 : 240}
        height={compact ? 64 : 80}
        priority
      />
    </span>
  );
}
