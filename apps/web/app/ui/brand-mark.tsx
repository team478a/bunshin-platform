import Image from 'next/image';

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand-mark" aria-label="ワタシワークス">
      <Image
        className={compact ? 'brand-mark__image brand-mark__image--compact' : 'brand-mark__image'}
        src={compact ? '/watashiworks-icon.jpg' : '/watashiworks-logo.jpg'}
        alt=""
        width={compact ? 64 : 240}
        height={compact ? 64 : 80}
        priority
      />
    </span>
  );
}
