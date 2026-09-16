export interface FortunePackageEntitlement {
  fortunePackageEnabled: boolean;
  suspended: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}

export function isFortunePackageLicenseActive(
  entitlement: FortunePackageEntitlement | null | undefined,
  now = new Date(),
) {
  return Boolean(
    entitlement?.fortunePackageEnabled &&
    !entitlement.suspended &&
    (!entitlement.startsAt || entitlement.startsAt <= now) &&
    (!entitlement.endsAt || entitlement.endsAt > now),
  );
}
