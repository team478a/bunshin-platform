import { badgeAppearanceFromImageKey } from '../../src/badges/badge-appearance';

export function BadgeMark({
  imageKey,
  earned = true,
  label,
}: {
  imageKey: string;
  earned?: boolean;
  label: string;
}) {
  const appearance = badgeAppearanceFromImageKey(imageKey);
  return (
    <span
      className={`badge-mark badge-mark--${appearance.key.toLowerCase()}${earned ? ' is-earned' : ''}`}
      role="img"
      aria-label={label}
      title={appearance.label}
    >
      {appearance.mark}
    </span>
  );
}
